import * as THREE from 'three';
import { CharacterController } from './Controller.js';
import { createBall } from './Bat.js';
import { RIG } from './rig.js';

// バット用のコントローラ。移動・ジャンプ・被弾などの共通部分は CharacterController を使い、
// 通常攻撃のテーブルと、スキル・必殺技をバット用に差し替える。
// ジャンプ中の攻撃（叩きつけ）はない。

// 通常攻撃（3段）: 横殴り → 一回転振り回し → ボールを打って遠距離から当てる
//   anim    : 使うモーション（poses.js）
//   active  : 当たる区間（ボールの3段目は近接判定なし。この区間の頭でボールが飛ぶ）
//   ranged  : true なら、近接の当たり判定を使わず、ボールを飛ばす
export const BAT_ATTACKS = [
  { anim: 'attack2', duration: 0.46, active: [0.34, 0.62], chain: 0.72, lunge: [0.26, 0.5, 8], power: 1 },
  { anim: 'attackB2', duration: 0.66, active: [0.34, 0.78], chain: 0.84, lunge: [0.2, 0.6, 7], power: 1 },
  { anim: 'attackB3', duration: 0.7, active: [0.5, 0.56], chain: 0.88, lunge: [0, 0, 0], power: 2, ranged: true, tossAt: 0.16 },
];

// スキル1: バットを金属化して打つ強いボール → バットは木に戻る
export const BSKILL1 = {
  cooldown: 6,
  metal: 0.6,       // 金属になるまで（構えの時間）
  swing: 0.62,      // ボールを放り上げて打つまで
  revert: 0.5,      // 木に戻る時間
  range: 220,
};
// スキル3: ボールを何度も打つ（スキル1を使ったあと、同じボタンが変わる）
export const BSKILL3 = {
  shots: 5,         // 打つ回数
  interval: 0.3,    // 1発ごとの間隔
  range: 220,
};
// スキル2: バットを近くの敵へ投げつけ、ダッシュして殴りながら吹き飛ばす
export const BSKILL2 = {
  cooldown: 8,
  range: 55,        // 「近くの敵」: この距離以内
  aim: 0.3,         // 投げる動作の長さ
  release: 0.5,     // そのうち、手を離す瞬間
  flight: 0.2,      // バットが届くまで
  dash: 0.1,        // 敵へダッシュする時間
  holdDist: 2.6,    // 殴る間隔
  punches: 7,       // パンチの回数（最後の1発で吹き飛ばす）
  punchRate: 3.8,   // 毎秒の往復
  finish: 0.4,      // 最後の一撃の動作
  launchSpeed: 70, launchUp: 15,
};
// スキル4: バットを空中で回転させ、敵にパンチし、バットを回収して攻撃（スキル2を使ったあと、同じボタンが変わる）
export const BSKILL4 = {
  toss: 0.3,        // 投げ上げる動作
  fly: 0.4,         // バットが敵の頭上へ飛ぶ
  height: 11,       // 空中で回るバットの高さ
  dash: 0.1,
  holdDist: 2.5,
  punches: 5,
  punchRate: 4.2,
  leap: 0.28,       // 跳び上がってバットをつかむ
  smash: 0.14,      // 叩きつけ
  land: 0.5,
  range: 70,
  launchSpeed: 55, launchUp: 13,
};

// 必殺技（バッティングセンター）: 鉄球を懐から出して当てる → ムービー → 飛んできたボールを打ちまくる
export const ULTB = {
  range: 220,          // 鉄球が届く距離（リグ単位）
  draw: 0.6,           // 懐から鉄球を取り出す
  throwTime: 0.3, release: 0.5, flight: 0.24,
  freeze: 0.34,        // 命中して、画面が切り替わるまで
  // ムービー（ゲーム内の秒数）
  tIntro: 1.9,         // 導入（舞台の紹介・技名）
  hits: 8,             // 打つ回数
  period: 0.62,        // 1球ごとの間隔
  pitchFlight: 0.36,   // マシンから飛び出して、バットに当たるまで
  hitFlight: 0.26,     // 打ち返したボールが敵に届くまで
  swingBefore: 0.16, swingAfter: 0.2,   // 打つ動作: 当たる瞬間の前後
  slowmo: 0.32,        // 最後の一球の時間の流れ
  tail: 1.1,           // 最後の一撃のあと、ムービーが終わるまで
  // 舞台の配置（ワールド単位）
  center: { x: 0, z: 0 },
  batter: { x: -4.6, z: 0 },   // 打つ位置（ホームベース）。+X 方向（マシンのほう）を向く
  machine: { x: 5.6, z: 0 },   // ピッチングマシン
  foe: { x: 2.4, z: 1.25 },    // フラフラしている敵の位置
  contact: { x: -3.1, y: 0.5, z: 0 }, // バットがボールを捉える点
};
export const ULTB_END = ULTB.tIntro + (ULTB.hits - 1) * ULTB.period + ULTB.pitchFlight + ULTB.hitFlight + ULTB.tail;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const angleDiff = (a, b) => { const d = a - b; return d - Math.PI * 2 * Math.round(d / (Math.PI * 2)); };

export class BatController extends CharacterController {
  constructor(character, opts) {
    super(character, opts);
    this.attacks = BAT_ATTACKS;
    this.weaponId = 'bat';
    this.bs = null; // バットのスキルの進行状況
    this.bo = null; // 手を離れたバットの動き
  }

  get bat() { return this.c.bat; }

  update(dt, cmd) {
    // バットのスキル中: 共通の移動処理は使わず、専用の進行だけ動かす
    if (this.state.startsWith('bskill')) {
      this.status.update(dt);
      this.skillCooldown = Math.max(0, this.skillCooldown - dt);
      this.skill2Cooldown = Math.max(0, this.skill2Cooldown - dt);
      this.updateBatSkill(dt);
      return;
    }
    // ジャンプ中の攻撃はない
    if (this.state === 'air' && cmd.attack) cmd = { ...cmd, attack: false };

    // 地上でスキルボタンが押されたら、バット用のスキルを始める（共通側のスキルは使わない）
    if (this.state === 'ground' && !this.status.has('stun') && this.jumpBuffer <= 0) {
      const can = this.c.sword && !(cmd.ult && this.canUlt());
      if (can && cmd.skill && this.skill3Ready) { this.startBatSkill(3); this.tickBase(dt); return; }
      if (can && cmd.skill && this.skillCooldown <= 0) { this.startBatSkill(1); this.tickBase(dt); return; }
      if (can && cmd.skill2 && this.skill4Ready) { this.startBatSkill(4); this.tickBase(dt); return; }
      if (can && cmd.skill2 && this.skill2Cooldown <= 0) { this.startBatSkill(2); this.tickBase(dt); return; }
    }
    if (cmd.skill || cmd.skill2) cmd = { ...cmd, skill: false, skill2: false };
    super.update(dt, cmd);
  }

  tickBase(dt) { this.status.update(dt); }

  // 今のスキルが敵を狙える向き（相手がいれば相手へ。いなければ今の向き）
  aimAtFoe(range) {
    const v = this.victim;
    const g = this.c.group;
    if (v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
      const dx = v.c.group.position.x - g.position.x;
      const dz = v.c.group.position.z - g.position.z;
      if (Math.hypot(dx, dz) < range * this.c.scale) return Math.atan2(dx, dz);
    }
    return g.rotation.y;
  }

  startBatSkill(n) {
    const { animator } = this.c;
    this.bs = { n, phase: 'init', t: 0, shot: 0, fired: false, tossed: false, metal: 0 };
    this.state = 'bskill' + n;
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    if (n === 1) this.beginSkill1();
    else if (n === 3) this.beginSkill3();
    else if (n === 2) this.beginSkill2();
    else this.beginSkill4();
  }

  // バットのスキルを途中でやめる（被弾など）: 元の姿に戻す
  cancelBat() {
    if (!this.bs) return;
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreBat();
    this.bo = null;
    this.c.bat.userData.setMetal(0);
    this.bs = null;
    if (n === 1) { this.skillCooldown = BSKILL1.cooldown; this.skill3Ready = false; }
    if (n === 2 || n === 4) { this.skill2Cooldown = BSKILL2.cooldown; this.skill4Ready = false; }
    if (n === 3) this.skill3Ready = false;
    this.events.push({ type: 'batCancel' });
  }

  hit(dx, dz, power) { this.cancelBat(); super.hit(dx, dz, power); }
  launch(dx, dz, speed, up) { this.cancelBat(); super.launch(dx, dz, speed, up); }

  // 掴んで（held にして）いた敵を、普通の状態に戻す
  releaseFoe() {
    const v = this.victim;
    if (v && v.state === 'held') { v.state = 'ground'; v.c.group.position.y = 0; }
  }

  // 手を離れたバットを手に戻す
  restoreBat() {
    const bat = this.c.bat;
    const wrist = this.c.joints.rWrist;
    if (bat.parent !== wrist) wrist.add(bat);
    bat.position.set(0, -0.15, 0); // 手の中心（rig の hand/2。Character と同じ値）
    bat.position.y = -0.3 / 2;
    bat.quaternion.identity();
    bat.scale.set(1, 1, 1);
    bat.visible = true;
  }

  endBatSkill() {
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreBat();
    this.bo = null;
    this.bs = null;
    this.state = 'ground';
    this.vx = this.vz = 0;
    if (n === 1) { this.skillCooldown = BSKILL1.cooldown; this.skill3Ready = true; }          // ボタンがスキル3に変わる
    else if (n === 3) { this.skill3Ready = false; }
    else if (n === 2) { this.skill2Cooldown = BSKILL2.cooldown; this.skill4Ready = true; }   // ボタンがスキル4に変わる
    else if (n === 4) { this.skill4Ready = false; }
    this.c.animator.trailOn = false;
  }

  updateBatSkill(dt) {
    switch (this.bs.n) {
      case 1: this.updateSkill1(dt); break;
      case 3: this.updateSkill3(dt); break;
      case 2: this.updateSkill2(dt); break;
      default: this.updateSkill4(dt); break;
    }
  }

  // ============================================================
  // スキル1: バットを金属化 → 強いボール → バットは木に戻る
  // ============================================================
  beginSkill1() {
    this.bs.phase = 'metal';
    this.c.animator.play('batMetal', 0.12);
    this.events.push({ type: 'batSkill1Start' });
    this.events.push({ type: 'batMetalOn' });
  }

  updateSkill1(dt) {
    const { group, animator } = this.c;
    const K = BSKILL1;
    const b = this.bs;
    b.t += dt;
    const bat = this.c.bat;
    // 狙う向きへ（金属化の間から、ゆっくり向き直る）
    group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-12 * dt));
    if (b.phase === 'metal') {
      animator.attackT = Math.min(1, b.t / K.metal);
      bat.userData.setMetal(Math.min(1, b.t / (K.metal * 0.8)));
      if (b.t >= K.metal) { b.phase = 'swing'; b.t = 0; b.fired = false; b.tossed = false; animator.attackT = 0; animator.play('attackB3', 0.1); }
    } else if (b.phase === 'swing') {
      // 放り上げて、打つ（3段目の動きを使う。ためなしで一気に）
      const f = Math.min(1, b.t / K.swing);
      animator.attackT = f * 0.85;
      animator.trailOn = animator.attackT > 0.4 && animator.attackT < 0.72;
      if (!b.tossed && animator.attackT >= 0.16) { b.tossed = true; this.events.push({ type: 'batToss', time: (0.5 - 0.16) * K.swing / 0.85, metal: true }); }
      if (!b.fired && animator.attackT >= 0.5) { b.fired = true; this.events.push({ type: 'batBall', kind: 'metal', power: 3 }); }
      if (f >= 1) { b.phase = 'revert'; b.t = 0; animator.trailOn = false; this.events.push({ type: 'batRevert' }); animator.play('fight', 0.2); }
    } else {
      const f = Math.min(1, b.t / K.revert);
      bat.userData.setMetal(1 - f);
      if (f >= 1) { bat.userData.setMetal(0); this.endBatSkill(); }
    }
  }

  // ============================================================
  // スキル3: ボールを何度も打つ（5発）
  // ============================================================
  beginSkill3() {
    this.bs.phase = 'shots';
    this.bs.shot = 0;
    this.bs.t = 0;
    this.c.animator.play('attackB3', 0.08);
    this.events.push({ type: 'batSkill3Start' });
  }

  updateSkill3(dt) {
    const { group, animator } = this.c;
    const K = BSKILL3;
    const b = this.bs;
    b.t += dt;
    group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-16 * dt));
    // 1発ごとに、放り上げ(0.16) → 打つ(0.5) → 振り抜き(0.72) を interval 秒で回す
    const f = Math.min(1, b.t / K.interval);
    animator.attackT = 0.12 + f * 0.6;
    animator.trailOn = animator.attackT > 0.4 && animator.attackT < 0.7;
    if (!b.tossed && animator.attackT >= 0.16) { b.tossed = true; this.events.push({ type: 'batToss', time: (0.5 - 0.16) * K.interval / 0.6, quick: true }); }
    if (!b.fired && animator.attackT >= 0.5) { b.fired = true; this.events.push({ type: 'batBall', kind: 'normal', power: 1, skill3: true, shot: b.shot }); }
    if (f >= 1) {
      b.shot++;
      if (b.shot >= K.shots) { animator.trailOn = false; this.endBatSkill(); return; }
      b.t = 0; b.fired = false; b.tossed = false;
    }
  }

  // ============================================================
  // 必殺技: 鉄球 → バッティングセンターのムービー
  // ============================================================
  ensureIron() {
    if (this.iron) return this.iron;
    const m = createBall('iron');
    m.scale.setScalar(0.62);
    m.position.set(0, -0.15, 0);
    m.visible = false;
    this.c.joints.lWrist.add(m);
    this.iron = m;
    return m;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.ensureIron();
    this.ult = { phase: 'draw', t: 0, shown: false, released: false, hit: false, fly: null, timeScale: 1, saved: null, fired: {} };
    this.state = 'ult';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('ultDraw', 0.1);
    this.events.push({ type: 'ultStart' });
  }

  updateUlt(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    u.t += dt;
    const K = ULTB;
    if (u.phase === 'draw' || u.phase === 'throw') {
      const dx = vg.position.x - group.position.x;
      const dz = vg.position.z - group.position.z;
      group.rotation.y += angleDiff(Math.atan2(dx, dz), group.rotation.y) * (1 - Math.exp(-14 * dt));
    }
    if (u.phase === 'draw') {
      animator.attackT = Math.min(1, u.t / K.draw);
      if (!u.shown && animator.attackT >= 0.3) { u.shown = true; this.iron.visible = true; this.events.push({ type: 'ultBallDraw' }); }
      if (u.t >= K.draw) { u.phase = 'throw'; u.t = 0; animator.attackT = 0; animator.play('ultThrow', 0.08); }
    } else if (u.phase === 'throw') {
      const f = Math.min(1, u.t / K.throwTime);
      animator.attackT = f;
      if (!u.released && f >= K.release) {
        u.released = true;
        group.parent.attach(this.iron);
        u.fly = { t: 0, from: this.iron.position.clone() };
        this.events.push({ type: 'ultThrow' });
      }
      if (u.released && !u.hit) {
        u.fly.t += dt;
        const k = Math.min(1, u.fly.t / K.flight);
        _b.set(vg.position.x, vg.position.y + 3.0 * S, vg.position.z);
        _a.lerpVectors(u.fly.from, _b, k);
        this.iron.position.copy(_a);
        this.iron.rotation.x += dt * 30;
        if (k >= 1) {
          // 命中: 鉄球が胸に当たり、敵はふらふらになる（気絶）
          u.hit = true;
          u.phase = 'freeze';
          u.t = 0;
          this.iron.visible = false;
          v.state = 'held';
          v.vx = v.vz = v.vy = 0;
          v.attackActive = false;
          v.status.apply('stun', 30);
          v.c.animator.play('stunned', 0.05);
          this.events.push({ type: 'ultHit' });
        }
      }
    } else if (u.phase === 'freeze') {
      if (u.t >= K.freeze) this.startUltCine();
    } else if (u.phase === 'cine') {
      this.updateUltCine(dt);
    }
  }

  // 画面が切り替わる: 自分と相手を、バッティングセンターへ移す
  startUltCine() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTB;
    u.saved = { px: group.position.x, pz: group.position.z, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    u.phase = 'cine';
    u.t = 0;
    group.position.set(K.batter.x, 0, K.batter.z);
    group.rotation.set(0, Math.PI / 2, 0);
    vg.position.set(K.foe.x, 0, K.foe.z);
    vg.rotation.set(0, -Math.PI / 2 - 0.25, 0);
    animator.play('fight', 0.01);
    v.c.animator.play('stunned', 0.01);
    u.flung = null;
    this.events.push({ type: 'ultCineStart' });
  }

  // 打つ球 k の時刻
  static pitchT(k) { return ULTB.tIntro + k * ULTB.period; }

  updateUltCine(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTB;
    const T = u.t;
    const last = K.hits - 1;
    const tc = (k) => K.tIntro + k * K.period + K.pitchFlight; // 打つ瞬間（バットに当たる）
    // 技名（導入の途中で）
    if (T >= 1.1 && !u.fired.title) { u.fired.title = true; this.events.push({ type: 'ultTitle' }); }
    for (let k = 0; k < K.hits; k++) {
      const tp = K.tIntro + k * K.period;
      if (T >= tp && !u.fired['p' + k]) { u.fired['p' + k] = true; this.events.push({ type: 'ultPitch', k }); }
      if (T >= tc(k) && !u.fired['c' + k]) { u.fired['c' + k] = true; this.events.push({ type: 'ultContact', k, final: k === last }); }
      if (T >= tc(k) + K.hitFlight && !u.fired['i' + k]) {
        u.fired['i' + k] = true;
        v.c.animator.jolt = 1;
        v.c.animator.joltSide = k % 2 ? 1 : -1;
        if (k === 0) v.c.animator.play('pummeled', 0.05); // 打ち返されるたびに、頭と上体が弾かれる
        this.events.push({ type: 'ultImpact', k, final: k === last });
        if (k === last) u.flung = { t: 0 };
      }
    }
    // 最後の一球はスローモーション
    const tcl = tc(last);
    u.timeScale = T > tcl - 0.3 && T < tcl + K.hitFlight + 0.25 ? K.slowmo : 1;

    // 自分の動作: 球が来るのに合わせて、当たる瞬間に振り抜く
    let swinging = false;
    for (let k = 0; k < K.hits; k++) {
      const a = tc(k) - K.swingBefore;
      const b = tc(k) + K.swingAfter;
      if (T >= a && T <= b) {
        swinging = true;
        const f = (T - a) / (b - a);
        animator.attackT = 0.25 + 0.55 * f;
        animator.trailOn = f > 0.2 && f < 0.7;
        animator.play(k % 2 ? 'attackB3' : 'attack2', 0.04);
        break;
      }
    }
    if (!swinging) { animator.trailOn = false; animator.play('fight', 0.08); }

    // 敵: ふらふらしたまま。最後の一撃で吹き飛ばされる
    vg.rotation.x = 0;
    if (u.flung) {
      u.flung.t += dt;
      const t = u.flung.t;
      const out = new THREE.Vector3(1, 0.0, -0.35).normalize();
      const dist = 9 * S / 0.15 * 0.15;
      vg.position.set(K.foe.x + out.x * 5.5 * t, Math.max(0.06, 3.2 * t - 3.6 * t * t + 0.3), K.foe.z + out.z * 5.5 * t);
      vg.rotation.set(-Math.min(1.5, t * 4), -Math.PI / 2 - 0.25, 0);
      if (v.c.animator.name !== 'thrown') v.c.animator.play('thrown', 0.05);
      if (vg.position.y <= 0.07 && t > 0.2) { u.flung.t = 99; }
    }
    if (T >= ULTB_END) this.endUlt();
  }

  endUlt() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const sv = u.saved;
    this.restoreBat();
    this.iron.visible = false;
    this.c.joints.lWrist.add(this.iron);
    this.iron.position.set(0, -0.15, 0);
    this.iron.quaternion.identity();
    group.position.set(sv.px, 0, sv.pz);
    group.rotation.set(0, sv.yaw, 0);
    animator.trailOn = false;
    animator.play('fight', 0.01);
    this.state = 'ground';
    this.vx = this.vz = 0;
    // 相手は倒れた姿勢のまま、元の位置へ。しばらくして起き上がる
    v.status.remove('stun');
    vg.position.set(sv.ex, 0, sv.ez);
    vg.rotation.set(-Math.PI / 2, sv.eyaw, 0);
    v.state = 'down';
    v.downTimer = 1.5;
    v.vx = v.vz = v.vy = 0;
    v.c.animator.play('down', 0.01);
    v.c.animator.jolt = 0;
    this.ult = null;
    this.events.push({ type: 'ultCineEnd', saved: sv });
  }

  // ============================================================
  // 手を離れたバットの動き（投げる・落ちる・空中で回る・手に戻る）
  // ============================================================
  detachBat() {
    const bat = this.c.bat;
    this.c.group.parent.attach(bat);
    this.bo = { mode: 'none', t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), roll: 0, vel: new THREE.Vector3(), arc: 0, then: null };
    return this.bo;
  }

  // from → to へ飛ばす。回りながら、arc の高さの山なりで。着いたら then を呼ぶ
  batFly(from, to, dur, arc, then) {
    const o = this.bo;
    o.mode = 'fly'; o.t = 0; o.dur = dur; o.from.copy(from); o.to.copy(to); o.arc = arc; o.then = then ?? null;
    o.dir.subVectors(to, from).normalize();
  }

  batFall(from, vel) {
    const o = this.bo;
    o.mode = 'fall'; o.t = 0; o.vel.copy(vel); o.pos = from.clone();
  }

  batHover(pos) {
    const o = this.bo;
    o.mode = 'hover'; o.t = 0; o.base = pos.clone();
  }

  batRecall(dur, then) {
    const o = this.bo;
    o.mode = 'recall'; o.t = 0; o.dur = dur; o.from.copy(this.c.bat.position); o.then = then ?? null;
  }

  updateBatObject(dt) {
    const o = this.bo;
    if (!o) return;
    const S = this.c.scale;
    const bat = this.c.bat;
    o.t += dt;
    if (o.mode === 'fly') {
      const u = Math.min(1, o.t / o.dur);
      _a.lerpVectors(o.from, o.to, u);
      _a.y += o.arc * 4 * u * (1 - u);
      o.roll += dt * 46;
      this.placeSword(_a, o.dir.x, o.dir.y, o.dir.z, o.roll, bat);
      if (u >= 1) { o.mode = 'idle'; const f = o.then; o.then = null; if (f) f(); }
    } else if (o.mode === 'fall') {
      o.vel.y -= 52 * S * dt;
      o.pos.addScaledVector(o.vel, dt);
      if (o.pos.y < 0.12 * S) { o.pos.y = 0.12 * S; o.vel.set(0, 0, 0); o.mode = 'lie'; }
      o.roll += dt * (o.mode === 'fall' ? 30 : 0);
      this.placeSword(o.pos, o.dir.x, 0, o.dir.z, o.mode === 'fall' ? o.roll : 0, bat);
    } else if (o.mode === 'hover') {
      // 空中で、プロペラのように回り続ける（少し上下にゆれる）
      o.roll += dt * 28;
      _a.copy(o.base);
      _a.y += 0.25 * S * Math.sin(o.t * 6);
      this.placeSword(_a, 1, 0, 0, o.roll, bat);
    } else if (o.mode === 'recall') {
      const u = Math.min(1, o.t / o.dur);
      this.c.joints.rWrist.getWorldPosition(_b);
      _a.lerpVectors(o.from, _b, u * u);
      o.roll += dt * 40;
      _c.subVectors(_b, o.from).normalize();
      this.placeSword(_a, _c.x, _c.y, _c.z, o.roll, bat);
      if (u >= 1) { o.mode = 'idle'; const f = o.then; o.then = null; if (f) f(); }
    }
  }

  // 敵を殴る: 連打のたびに敵が弾かれる。phase は animator.phase（拳が伸びきる瞬間で1発）
  punchTick(dt, b, K, eventType) {
    const { animator } = this.c;
    const f = Math.min(1, b.t / ((K.punches - 0.5) / K.punchRate));
    animator.phase += Math.PI * 2 * K.punchRate * (0.8 + 0.4 * f) * dt;
    const half = Math.floor((animator.phase - Math.PI / 2) / Math.PI);
    if (half > b.lastHalf && animator.fade >= 1) {
      b.lastHalf = half;
      b.punches++;
      const side = half % 2 === 0 ? 1 : -1;
      const v = this.victim;
      v.c.animator.jolt = 1;
      v.c.animator.joltSide = side;
      this.events.push({ type: eventType, side, count: b.punches, skill: b.n });
    }
    return b.punches >= K.punches;
  }

  // 敵を目の前に保つ（殴っている間）
  holdFoe(dir, dist, jolt = 0.25) {
    const v = this.victim;
    const g = this.c.group;
    const S = this.c.scale;
    const vg = v.c.group;
    vg.position.set(g.position.x + dir.x * (dist + jolt * v.c.animator.jolt) * S, 0, g.position.z + dir.z * (dist + jolt * v.c.animator.jolt) * S);
    vg.rotation.y = Math.atan2(-dir.x, -dir.z);
  }

  clampToArena() {
    if (!this.bounds) return;
    const b = this.bounds;
    const g = this.c.group;
    g.position.x = Math.min(b.maxX - 0.2, Math.max(b.minX + 0.2, g.position.x));
    g.position.z = Math.min(b.maxZ - 0.2, Math.max(b.minZ + 0.2, g.position.z));
  }

  // ============================================================
  // スキル2: バットを投げつけ → ダッシュ → 殴りまくり → 吹き飛ばす → バットが戻る
  // ============================================================
  beginSkill2() {
    const v = this.victim;
    const S = this.c.scale;
    const g = this.c.group;
    const b = this.bs;
    b.hasTarget = false;
    if (v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
      b.hasTarget = Math.hypot(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z) < BSKILL2.range * S;
    }
    b.phase = 'throw';
    b.dir = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    b.released = false;
    this.c.animator.attackT = 0;
    this.c.animator.play('throwSword', 0.1);
    this.events.push({ type: 'batSkill2Start' });
  }

  updateSkill2(dt) {
    const { group, animator, scale: S } = this.c;
    const K = BSKILL2;
    const b = this.bs;
    const v = this.victim;
    const vg = v ? v.c.group : null;
    b.t += dt;
    this.updateBatObject(dt);

    // 相手のいる向きへ（掴んでいる間も向き合う）
    if (b.hasTarget && b.phase !== 'recall') {
      const dx = vg.position.x - group.position.x;
      const dz = vg.position.z - group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      b.dir.set(dx / d, 0, dz / d);
      group.rotation.y += angleDiff(Math.atan2(dx, dz), group.rotation.y) * (1 - Math.exp(-16 * dt));
    }

    if (b.phase === 'throw') {
      animator.attackT = Math.min(1, b.t / K.aim);
      if (!b.released && animator.attackT >= K.release) {
        b.released = true;
        this.detachBat();
        _a.copy(this.c.bat.position);
        if (b.hasTarget) {
          _b.set(vg.position.x, vg.position.y + 3.0 * S, vg.position.z).addScaledVector(b.dir, -0.8 * S);
          this.batFly(_a, _b, K.flight, 1.0 * S, () => this.skill2BatHit());
        } else {
          _b.copy(_a).addScaledVector(b.dir, 18 * S);
          this.batFly(_a, _b, 0.35, 0.6 * S, () => { b.phase = 'recall'; b.t = 0; this.batRecall(0.35, () => this.endBatSkill()); });
        }
        this.events.push({ type: 'batThrow', kind: 'skill2' });
      }
    } else if (b.phase === 'dash') {
      const f = Math.min(1, b.t / K.dash);
      group.position.lerpVectors(b.from, b.to, f);
      animator.trailOn = f < 1;
      if (f >= 1) {
        b.phase = 'punch'; b.t = 0; b.lastHalf = -1; b.punches = 0;
        animator.phase = 0;
        animator.play('flurry', 0.1);
        v.c.animator.play('pummeled', 0.1);
        this.events.push({ type: 'batSkill2Dash' });
      }
    } else if (b.phase === 'punch') {
      this.holdFoe(b.dir, K.holdDist);
      if (this.punchTick(dt, b, K, 'batPunch')) {
        b.phase = 'finish'; b.t = 0;
        animator.attackT = 0;
        animator.play('lungeStrike', 0.06);
      }
    } else if (b.phase === 'finish') {
      this.holdFoe(b.dir, K.holdDist, 0);
      animator.attackT = 0;
      if (b.t >= K.finish * 0.35 && !b.fired) {
        // 最後の一撃: 相手を遠くへ吹き飛ばす
        b.fired = true;
        v.launch(b.dir.x, b.dir.z, K.launchSpeed, K.launchUp);
        this.events.push({ type: 'batSkill2Final', dir: b.dir.clone() });
      }
      if (b.t >= K.finish) {
        // バットを呼び戻す
        b.phase = 'recall'; b.t = 0;
        animator.play('stand', 0.2);
        this.batRecall(0.4, () => this.endBatSkill());
        this.events.push({ type: 'batRecall' });
      }
    }
  }

  // バットが敵に当たった: 敵はよろめき、バットは跳ね返って落ちる。自分は敵へダッシュ
  skill2BatHit() {
    const { group, animator, scale: S } = this.c;
    const b = this.bs;
    const v = this.victim;
    const vg = v.c.group;
    v.state = 'held';
    v.vx = v.vz = v.vy = 0;
    v.attackActive = false;
    v.c.animator.play('impaled', 0.05);
    v.c.animator.jolt = 1;
    // バットは跳ね返って、敵の手前に落ちる
    this.batFall(this.c.bat.position, new THREE.Vector3(-b.dir.x * 6 * S, 9 * S, -b.dir.z * 6 * S));
    this.bo.dir.copy(b.dir);
    // ダッシュ先: 敵の目の前
    b.phase = 'dash'; b.t = 0;
    b.from = group.position.clone();
    b.to = new THREE.Vector3(vg.position.x - b.dir.x * BSKILL2.holdDist * S, 0, vg.position.z - b.dir.z * BSKILL2.holdDist * S);
    animator.attackT = 0;
    animator.play('lungeDash', 0.04);
    this.events.push({ type: 'batSkill2Hit' });
  }

  // ============================================================
  // スキル4: バットを空中で回転させ → 敵にパンチ → バットを回収して一撃
  // ============================================================
  beginSkill4() {
    const v = this.victim;
    const S = this.c.scale;
    const g = this.c.group;
    const b = this.bs;
    b.hasTarget = false;
    if (v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
      b.hasTarget = Math.hypot(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z) < BSKILL4.range * S;
    }
    b.phase = 'toss';
    b.dir = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    b.released = false;
    this.c.animator.attackT = 0;
    this.c.animator.play('batToss', 0.1);
    this.events.push({ type: 'batSkill4Start' });
  }

  updateSkill4(dt) {
    const { group, animator, scale: S } = this.c;
    const K = BSKILL4;
    const b = this.bs;
    const v = this.victim;
    const vg = v ? v.c.group : null;
    b.t += dt;
    this.updateBatObject(dt);
    if (b.hasTarget && b.phase !== 'recall' && b.phase !== 'leap' && b.phase !== 'smash' && b.phase !== 'land') {
      const dx = vg.position.x - group.position.x;
      const dz = vg.position.z - group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      b.dir.set(dx / d, 0, dz / d);
      group.rotation.y += angleDiff(Math.atan2(dx, dz), group.rotation.y) * (1 - Math.exp(-16 * dt));
    }

    if (b.phase === 'toss') {
      animator.attackT = Math.min(1, b.t / K.toss);
      if (!b.released && animator.attackT >= 0.55) {
        b.released = true;
        this.detachBat();
        // 敵の頭上（いなければ前方の空中）へ飛ばして、そこで回り続ける
        _a.copy(this.c.bat.position);
        if (b.hasTarget) _b.set(vg.position.x, K.height * S, vg.position.z);
        else _b.set(group.position.x + b.dir.x * 8 * S, K.height * S, group.position.z + b.dir.z * 8 * S);
        b.hoverPos = _b.clone();
        this.batFly(_a, _b, K.fly, 2.0 * S, () => { this.batHover(b.hoverPos); });
        this.events.push({ type: 'batThrow', kind: 'skill4' });
      }
      if (b.t >= K.toss) {
        if (!b.hasTarget) { b.phase = 'wait'; b.t = 0; animator.play('stand', 0.15); return; }
        b.phase = 'dash'; b.t = 0;
        b.from = group.position.clone();
        b.to = new THREE.Vector3(vg.position.x - b.dir.x * K.holdDist * S, 0, vg.position.z - b.dir.z * K.holdDist * S);
        vg.rotation.y = Math.atan2(-b.dir.x, -b.dir.z);
        v.state = 'held'; v.vx = v.vz = v.vy = 0; v.attackActive = false;
        v.c.animator.play('impaled', 0.05);
        animator.play('lungeDash', 0.04);
      }
    } else if (b.phase === 'wait') {
      // 敵がいない: バットが戻ってくる
      if (b.t > 0.5) { b.phase = 'recall'; b.t = 0; this.batRecall(0.4, () => this.endBatSkill()); }
    } else if (b.phase === 'dash') {
      const f = Math.min(1, b.t / K.dash);
      group.position.lerpVectors(b.from, b.to, f);
      if (f >= 1) {
        b.phase = 'punch'; b.t = 0; b.lastHalf = -1; b.punches = 0;
        animator.phase = 0;
        animator.play('flurry', 0.1);
        v.c.animator.play('pummeled', 0.1);
        this.events.push({ type: 'batSkill4Dash' });
      }
    } else if (b.phase === 'punch') {
      this.holdFoe(b.dir, K.holdDist);
      if (this.punchTick(dt, b, K, 'batPunch')) {
        // パンチが終わったら、空中のバットへ跳び上がる
        b.phase = 'leap'; b.t = 0;
        b.from = group.position.clone();
        animator.attackT = 0;
        animator.play('ultLeap', 0.06);
        this.events.push({ type: 'batSkill4Leap' });
      }
    } else if (b.phase === 'leap') {
      // 跳び上がる（バットの高さまで）。頂点でバットをつかむ
      const f = Math.min(1, b.t / K.leap);
      const peak = (K.height - 4.2) * S;
      group.position.y = peak * (1 - (1 - f) * (1 - f));
      this.holdFoe(b.dir, K.holdDist, 0);
      if (f >= 1) {
        // つかむ: バットが手に戻り、そのまま叩きつけの構え
        this.restoreBat();
        this.bo = null;
        b.phase = 'smash'; b.t = 0;
        b.top = group.position.clone();
        animator.attackT = 0;
        animator.play('airSlam', 0.05);
        this.events.push({ type: 'batSkill4Catch' });
      }
    } else if (b.phase === 'smash') {
      const f = Math.min(1, b.t / K.smash);
      group.position.y = b.top.y * (1 - f * f);
      animator.attackT = Math.min(1, 0.3 + f * 0.7);
      animator.trailOn = true;
      this.holdFoe(b.dir, K.holdDist, 0);
      if (f >= 1) {
        group.position.y = 0;
        animator.trailOn = false;
        v.launch(b.dir.x, b.dir.z, K.launchSpeed, K.launchUp);
        b.phase = 'land'; b.t = 0;
        animator.attackT = 0.72;
        animator.play('land', 0.05);
        this.events.push({ type: 'batSkill4Smash', dir: b.dir.clone() });
      }
    } else if (b.phase === 'land') {
      if (b.t >= K.land) this.endBatSkill();
    } else if (b.phase === 'recall') {
      // バットが戻るのを待つ（endBatSkill は recall の完了で呼ばれる）
    }
  }
}
