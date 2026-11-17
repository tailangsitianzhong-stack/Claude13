import * as THREE from 'three';
import { CharacterController, FINISHER, ULT_TARGET_STATES } from './Controller.js';

// 擬音のコントローラ。大声で擬音を言うと、その文字が飛び出す。移動・ジャンプ・被弾などの共通部分は CharacterController を使い、
// 通常攻撃・スキル・コンボ・必殺技を差し替える。ジャンプ中の攻撃はない。
//
//  通常攻撃（3段）: ドン（文字が飛んで、当たると吹っ飛ぶ）→ グラグラ（文字が地面に吸い込まれて、地割れの範囲攻撃）→ メラメラ（当たると燃焼）
//  コンボ（3段目を当てたあと、ジャンプボタン）: ドロドロ（当たると相手の移動速度が50%下がる）
//  スキル1: ドカン（途中で爆発して分裂。連鎖で4回ほど爆発）→ 使うとスキル3に切り替わる
//  スキル3: グルグル（当たるとダメージと気絶）
//  スキル2: スー（その上に乗って、移動速度が50%上がる）→ 使うとスキル4に切り替わる
//  スキル4: ドキドキ（当たると、自分の攻撃力が5秒間50%上がる）
//  必殺技: ドカン・ズドン・バンバン（爆発と、銃弾の音でダメージ）
//
// 文字の飛行・命中・効果は、OnomDirector（src/game/OnomDirector.js）が受け持つ。ここは、動きの進行と、きっかけのイベント。

// shout: 近接の判定をせず、文字を出す（main の checkHit が飛ばす）。word: 出す文字（Words.js のキー）
export const ONOM_ATTACKS = [
  { anim: 'attackO1', duration: 0.62, active: [0.34, 0.4], chain: 0.78, lunge: [0, 0, 0], power: 1, shout: true, word: 'don' },
  { anim: 'attackO2', duration: 0.7, active: [0.36, 0.42], chain: 0.82, lunge: [0, 0, 0], power: 1, shout: true, word: 'guragura' },
  { anim: 'attackO3', duration: 0.72, active: [0.36, 0.42], chain: 0.92, lunge: [0, 0, 0], power: 2, shout: true, word: 'meramera' },
];

export const OSKILL1 = { cooldown: 6, duration: 0.75, fireAt: 0.375 };
export const OSKILL2 = { cooldown: 8, duration: 0.7, fireAt: 0.35, haste: 6 };   // 加速の長さ（秒）
export const OSKILL3 = { duration: 0.7, fireAt: 0.35 };
export const OSKILL4 = { duration: 0.7, fireAt: 0.35, power: 5 };               // 攻撃力アップの長さ（秒）
export const OCOMBO = { range: 100, duration: 0.75, fireAt: 0.375 };

// 必殺技: 大声を出す（draw）→ 命中（相手がふらふらになる）→ 画面が切り替わって「擬音の世界」のムービー。
// ムービーの予定表（ムービー開始からの秒数）: 導入 → ドカン×3 → ズドン → バンバン×10 → 最後のバンバン → 余韻
export const ULTO = {
  range: 220,
  draw: 0.75,
  freeze: 0.34,         // 命中して、画面が切り替わるまでの間
  intro: 1.5,           // ムービーの導入（擬音の世界を見せる）
  dokan: [0.2, 0.65, 1.1],   // 以下は、導入のあとからの秒数
  zudon: 1.7, zudonFall: 0.4,
  banFrom: 2.75, banGap: 0.11, bans: 10,
  final: 4.1,
  tail: 1.7,            // 最後の一撃のあとの余韻
  player: { x: -3.0, z: 0 },   // ムービーの舞台での位置
  foe: { x: 1.6, z: 0 },
};
export const ULTO_END = ULTO.intro + ULTO.final + ULTO.tail;

const angleDiff = (a, b) => { const d = a - b; return d - Math.PI * 2 * Math.round(d / (Math.PI * 2)); };

export class OnomController extends CharacterController {
  constructor(character, opts) {
    super(character, opts);
    this.attacks = ONOM_ATTACKS;
    this.weaponId = 'onom';
    this.bs = null;
    this.oAct = false;
  }

  foeIn(range) {
    const v = this.victim;
    const g = this.c.group;
    if (!v || !(v.state === 'ground' || v.state === 'hit' || v.state === 'down')) return false;
    return Math.hypot(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z) < range * this.c.scale;
  }

  aimAtFoe(range) {
    const v = this.victim;
    const g = this.c.group;
    if (this.foeIn(range)) return Math.atan2(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z);
    return g.rotation.y;
  }

  // コンボを出せるか（基底の update が、3段目を当てたあとの窓（finisherWindow）と合わせて見る）
  canGrab() {
    if (this.c.group.position.y > 0.001) return false;
    const v = this.victim;
    if (!v || (v.state !== 'ground' && v.state !== 'hit')) return false;
    return this.foeIn(OCOMBO.range);
  }

  // 基底の update が、コンボ技を出すときに呼ぶ（名前を基底とそろえて上書きするのは、これだけ。ほかは別の名前にする）
  startFinisher() { this.startOnomSkill(5); }

  update(dt, cmd) {
    if (this.state.startsWith('bskill')) {
      this.status.update(dt);
      this.skillCooldown = Math.max(0, this.skillCooldown - dt);
      this.skill2Cooldown = Math.max(0, this.skill2Cooldown - dt);
      this.finisherWindow = Math.max(0, this.finisherWindow - dt);
      this.updateOnomSkill(dt);
      return;
    }
    if (this.state === 'air' && cmd.attack) cmd = { ...cmd, attack: false };   // ジャンプ中の攻撃はない
    if (this.state === 'ground' && !this.status.has('stun') && this.jumpBuffer <= 0) {
      const can = this.c.sword && !(cmd.ult && this.canUlt());
      if (can && cmd.skill && this.skill3Ready) { this.startOnomSkill(3); this.status.update(dt); return; }
      if (can && cmd.skill && this.skillCooldown <= 0) { this.startOnomSkill(1); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill4Ready) { this.startOnomSkill(4); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill2Cooldown <= 0) { this.startOnomSkill(2); this.status.update(dt); return; }
    }
    if (cmd.skill || cmd.skill2) cmd = { ...cmd, skill: false, skill2: false };
    super.update(dt, cmd);
    // 通常攻撃: 文字を出す瞬間
    const act = this.state === 'attack' && this.attackActive;
    if (act && !this.oAct) {
      const a = this.attacks[this.attackIndex];
      this.events.push({ type: 'onomShout', index: this.attackIndex, word: a.word });
    }
    this.oAct = act;
  }

  // ---- スキルの共通部分 ----
  startOnomSkill(n) {
    const { animator } = this.c;
    this.bs = { n, t: 0, fired: false };
    this.state = 'bskill' + n;
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    this.oAct = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('onomShout', 0.08);
    this.finisherWindow = n === 5 ? 0 : this.finisherWindow;
    this.events.push({ type: n === 5 ? 'onomComboStart' : 'onomSkill' + n + 'Start' });
  }

  updateOnomSkill(dt) {
    const { group, animator } = this.c;
    const b = this.bs;
    const K = b.n === 1 ? OSKILL1 : b.n === 2 ? OSKILL2 : b.n === 3 ? OSKILL3 : b.n === 4 ? OSKILL4 : OCOMBO;
    b.t += dt;
    if (b.t < K.fireAt) group.rotation.y += angleDiff(this.aimAtFoe(220), group.rotation.y) * (1 - Math.exp(-16 * dt));
    animator.attackT = Math.min(1, b.t / K.duration);
    if (!b.fired && b.t >= K.fireAt) {
      b.fired = true;
      if (b.n === 2) this.status.apply('haste', OSKILL2.haste);   // スー: その上に乗って、移動速度 +50%
      this.events.push({ type: b.n === 5 ? 'onomComboFire' : 'onomSkill' + b.n + 'Fire' });
    }
    if (b.t >= K.duration) this.endOnomSkill();
  }

  endOnomSkill() {
    const n = this.bs.n;
    this.bs = null;
    this.state = 'ground';
    this.vx = this.vz = 0;
    if (n === 1) { this.skillCooldown = OSKILL1.cooldown; this.skill3Ready = true; }          // ボタンがスキル3に変わる
    else if (n === 3) this.skill3Ready = false;
    else if (n === 2) { this.skill2Cooldown = OSKILL2.cooldown; this.skill4Ready = true; }   // ボタンがスキル4に変わる
    else if (n === 4) this.skill4Ready = false;
    this.c.animator.play('fight', 0.15);
  }

  cancelOnom() {
    this.oAct = false;
    if (!this.bs) return;
    const n = this.bs.n;
    this.bs = null;
    if (n === 1) { this.skillCooldown = OSKILL1.cooldown; this.skill3Ready = false; }
    if (n === 2) { this.skill2Cooldown = OSKILL2.cooldown; this.skill4Ready = false; }
    if (n === 3) this.skill3Ready = false;
    if (n === 4) this.skill4Ready = false;
  }

  hit(dx, dz, power) { this.cancelOnom(); super.hit(dx, dz, power); }
  launch(dx, dz, speed, up) { this.cancelOnom(); super.launch(dx, dz, speed, up); }

  // ============================================================
  // 必殺技: ドカン → ズドン → バンバン
  // ============================================================
  canUlt() {
    const v = this.victim;
    if (!this.c.sword || !this.gauge.full || !v) return false;
    if (!ULT_TARGET_STATES.has(v.state)) return false;
    return Math.hypot(v.c.group.position.x - this.c.group.position.x, v.c.group.position.z - this.c.group.position.z) < ULTO.range * this.c.scale;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.cancelOnom();
    this.ult = { phase: 'draw', t: 0, timeScale: 1, fired: {}, saved: null };
    this.state = 'ult';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('onomShout', 0.1);
    this.events.push({ type: 'onomUltStart' });
  }

  updateUlt(dt) {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const K = ULTO;
    u.t += dt;
    const vg = v.c.group;
    if (u.phase === 'draw') {
      group.rotation.y += angleDiff(Math.atan2(vg.position.x - group.position.x, vg.position.z - group.position.z), group.rotation.y) * (1 - Math.exp(-14 * dt));
      animator.attackT = Math.min(1, u.t / K.draw) * 0.75;
      if (u.t >= K.draw) {
        // 命中: 相手は、その場でふらふらになる
        u.phase = 'freeze'; u.t = 0;
        v.state = 'held';
        v.vx = v.vz = v.vy = 0;
        v.attackActive = false;
        v.status.apply('stun', 30);
        v.c.animator.play('stunned', 0.05);
        this.events.push({ type: 'ultHit' });
      }
    } else if (u.phase === 'freeze') {
      animator.attackT = 0.55 + 0.12 * Math.abs(Math.sin(u.t * 14));
      if (u.t >= K.freeze) this.startUltCine();
    } else if (u.phase === 'cine') {
      this.updateUltCine(dt);
    }
  }

  // 画面が切り替わる: 自分と相手を、ムービーの舞台へ移す（元の位置は覚えておく）
  startUltCine() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTO;
    u.saved = { px: group.position.x, pz: group.position.z, py: group.position.y, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    u.phase = 'cine';
    u.t = 0;
    group.position.set(K.player.x, 0, K.player.z);
    group.rotation.set(0, Math.PI / 2, 0);
    vg.position.set(K.foe.x, 0, K.foe.z);
    vg.rotation.set(0, -Math.PI / 2, 0);
    animator.play('fight', 0.01);
    v.status.remove('stun');
    v.c.animator.play('stunned', 0.01);
    this.events.push({ type: 'ultCineStart' });
  }

  updateUltCine(dt) {
    const { animator } = this.c;
    const u = this.ult;
    const K = ULTO;
    const T = u.t;
    const fire = (name, at, extra = {}) => { if (T >= K.intro + at && !u.fired[name]) { u.fired[name] = true; this.events.push({ type: name, ...extra }); return true; } return false; };
    if (T < K.intro) {
      // 導入: 構えて、深く息を吸う
      if (!u.fired.title) { u.fired.title = true; this.events.push({ type: 'ultTitle' }); }
      animator.attackT = 0;
    } else {
      if (!u.fired.shout) { u.fired.shout = true; animator.play('onomShout', 0.1); }
      animator.attackT = 0.55 + 0.12 * Math.abs(Math.sin((T - K.intro) * 14));
    }
    K.dokan.forEach((at, k) => fire('onomUltDokan' + k, at, { k }));
    fire('onomUltZudon', K.zudon);
    for (let i = 0; i < K.bans; i++) fire('onomUltBan' + i, K.banFrom + i * K.banGap, { i });
    fire('onomUltFinal', K.final);
    // 最後の一撃のあたりは、スローモーション
    u.timeScale = T > K.intro + K.final - 0.25 && T < K.intro + K.final + 0.5 ? 0.3 : 1;
    if (T >= ULTO_END) this.endUlt();
  }

  endUlt() {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const sv = u.saved ?? { px: group.position.x, pz: group.position.z, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    group.position.set(sv.px, 0, sv.pz);
    group.rotation.set(0, sv.yaw, 0);
    animator.play('fight', 0.01);
    this.state = 'ground';
    this.vx = this.vz = 0;
    v.status.remove('stun');
    // 相手は倒れた姿勢のまま、元の位置へ。しばらくして起き上がる
    vg.scale.set(S, S, S);
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
}
