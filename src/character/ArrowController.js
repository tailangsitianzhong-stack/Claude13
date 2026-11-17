import * as THREE from 'three';
import { CharacterController, FINISHER, ULT_TARGET_STATES } from './Controller.js';
import { DAMAGE } from './Health.js';

// 矢印のコントローラ。素手に矢印のステッカーを貼って戦う。移動・ジャンプ・被弾などの共通部分は CharacterController を使い、
// 通常攻撃・スキル・コンボ・必殺技を矢印用に差し替える。ジャンプ中の攻撃はない。
//
//  通常攻撃（3段）: 右腕に加速の矢印 → 吹っ飛ばしパンチ / 床に加速の矢印 → 猛ダッシュで蹴る / 相手に下向き矢印 → 押さえつけて連続パンチ
//  コンボ（3段目を当てたあと、ジャンプボタン）: 地面に上向き矢印を貼って、地面を隆起させる範囲攻撃
//  スキル1: 砲弾の矢印を貼り、高速で飛ばす → 使うとスキル3に切り替わる
//  スキル3: 相手までの床に加速の矢印を並べて、猛ダッシュ。距離が遠いほど速く、ダメージも高い
//  スキル2: 足に上向き矢印を貼り、高く飛んで地面へ叩きつけ → 使うとスキル4に切り替わる
//  スキル4: 相手に鈍足矢印を貼る。移動速度が50%（5秒間）
//  必殺技: 自分の上に前向き矢印を貼り、突撃 → 当たるとゴミ処理場のムービー。引き寄せ矢印で、大きなゴミが相手へ次々に引き寄せられて押しつぶす

// bite: 近接の判定が「正面の近くにいるか」。grab: 押さえつけ。launch: 命中で遠くへ吹き飛ばす
export const ARROW_ATTACKS = [
  { anim: 'attackA1', duration: 0.72, active: [0.44, 0.6], chain: 0.82, lunge: [0.3, 0.5, 16], power: 3, bite: true, reach: 9, launch: true },
  { anim: 'attackA2', duration: 0.95, active: [0.56, 0.74], chain: 0.9, lunge: [0, 0, 0], power: 2, bite: true, reach: 9.5, dash: [0.32, 0.58, 105] },
  { anim: 'attackA3', duration: 1.45, active: [0.28, 0.36], chain: 0.98, lunge: [0.1, 0.26, 14], power: 2, bite: true, grab: true, reach: 9 },
];
export const ARROW_PRESS = { punches: 6, from: 0.42, to: 0.93, hold: 1.9 };   // 押さえつけ: 連打の回数と、attackT の範囲

export const ASKILL1 = { cooldown: 6, duration: 0.7, stickAt: 0.05, fireAt: 0.35, speed: 240, range: 260 };
export const ASKILL2 = { cooldown: 8, stick: 0.32, rise: 0.42, hang: 0.06, dive: 0.13, height: 17, radius: 15, recover: 0.36, range: 90 };
export const ASKILL3 = { stick: 0.3, baseSpeed: 55, perDist: 1.35, maxDist: 140, gap: 4, recover: 0.4, range: 150 };
export const ASKILL4 = { duration: 0.62, shotAt: 0.225, flight: 0.22, slow: 5, range: 110 };
export const AFIN = { range: 16, stick: 0.35, erupt: 0.18, recover: 0.45, radius: 16 };

export const ULTA = {
  range: 220,
  draw: 0.7,         // 自分の上に、前向き矢印を貼る
  rushSpeed: 190,    // 突撃の速さ（リグ単位/秒）
  freeze: 0.34,
  // ムービー（ゲーム内の秒数）
  tTitle: 0.4,
  tStick: 1.7,       // 相手に引き寄せ矢印を貼る
  tPull: 2.5,        // ゴミが引き寄せられ始める
  tCrush: 7.4,       // 最後の大きな一撃（押しつぶす）
  tail: 1.9,
  player: { x: -2.6, z: 0 },
  foe: { x: 2.0, z: 0 },
};
export const ULTA_END = ULTA.tCrush + 0.25 + ULTA.tail;

// ゴミの引き寄せの予定表: [{ k, size: 's'|'m'|'b'|'x', t0（引き寄せ開始）, dur（飛んで届くまで）}]。コントローラ（ダメージ）と演出（位置）が同じものを見る
export function junkSchedule() {
  const list = [];
  let k = 0;
  for (let i = 0; i < 10; i++) list.push({ k: k++, size: 's', t0: ULTA.tPull + i * 0.14, dur: 0.5 });
  for (let i = 0; i < 5; i++) list.push({ k: k++, size: 'm', t0: 4.0 + i * 0.25, dur: 0.6 });
  for (let i = 0; i < 3; i++) list.push({ k: k++, size: 'b', t0: 5.4 + i * 0.45, dur: 0.75 });
  list.push({ k: k++, size: 'x', t0: 6.75, dur: ULTA.tCrush - 6.75 });
  return list;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const angleDiff = (a, b) => { const d = a - b; return d - Math.PI * 2 * Math.round(d / (Math.PI * 2)); };
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export class ArrowController extends CharacterController {
  constructor(character, opts) {
    super(character, opts);
    this.attacks = ARROW_ATTACKS;
    this.weaponId = 'arrow';
    this.bs = null;       // スキルの進行状況
    this.pn = null;       // 押さえつけ（通常3段目）
    this.af = { stuck: false, am: false };
    this.timeNow = 0;
    this.pressScaleOn = false;
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

  // ---- コンボ技（3段目を当てたあと）を出せるか ----
  canGrab() {
    const v = this.victim;
    if (!v || this.c.group.position.y > 0.001) return false;
    if (v.state !== 'ground' && v.state !== 'hit') return false;
    return Math.hypot(v.c.group.position.x - this.c.group.position.x, v.c.group.position.z - this.c.group.position.z) < AFIN.range * this.c.scale;
  }

  update(dt, cmd) {
    this.timeNow += dt;
    if (this.state.startsWith('bskill')) {
      this.status.update(dt);
      this.skillCooldown = Math.max(0, this.skillCooldown - dt);
      this.skill2Cooldown = Math.max(0, this.skill2Cooldown - dt);
      this.finisherWindow = Math.max(0, this.finisherWindow - dt);
      this.updateArrowSkill(dt);
      return;
    }
    // ジャンプ中の攻撃はない
    if (this.state === 'air' && cmd.attack) cmd = { ...cmd, attack: false };
    // コンボ: 3段目を当てたあと、ジャンプボタンで、地面に上向き矢印を貼って隆起させる（基底の update が、canGrab と finisherWindow を見て、startFinisher を呼ぶ）
    if (this.state === 'ground' && !this.status.has('stun') && this.jumpBuffer <= 0) {
      const can = this.c.sword && !(cmd.ult && this.canUlt());
      if (can && cmd.skill && this.skill3Ready) { this.startArrowSkill(3); this.status.update(dt); return; }
      if (can && cmd.skill && this.skillCooldown <= 0) { this.startArrowSkill(1); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill4Ready) { this.startArrowSkill(4); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill2Cooldown <= 0) { this.startArrowSkill(2); this.status.update(dt); return; }
    }
    if (cmd.skill || cmd.skill2) cmd = { ...cmd, skill: false, skill2: false };
    super.update(dt, cmd);
    this.updateAttackExtras(dt);
  }

  // 基底の update が、コンボ技を出すときに呼ぶ。矢印では、つかみ技ではなく、地面を隆起させるコンボになる
  startFinisher() {
    this.cancelPress(false);
    this.startArrowSkill(5);
  }

  startAttack(index, cmd) {
    this.af = { stuck: false, am: this.af.am, dashDir: null };
    super.startAttack(index, cmd);
  }

  // 通常攻撃ごとの、矢印の貼り付け・ダッシュ・押さえつけ
  updateAttackExtras(dt) {
    const S = this.c.scale;
    const { group, animator } = this.c;
    const inAttack = this.state === 'attack';
    const idx = this.attackIndex;
    // 右腕の加速の矢印: 1段目の「貼る」から、振り終わるまで
    const wantArm = inAttack && idx === 0 && this.attackT >= 0.2 && this.attackT < 0.8;
    if (wantArm && !this.af.am) { this.af.am = true; this.events.push({ type: 'arrowArmStick' }); }
    if (!wantArm && this.af.am) { this.af.am = false; this.events.push({ type: 'arrowArmOff' }); }
    if (inAttack && idx === 1) {
      const a = this.attacks[1];
      // 床に加速の矢印を貼る
      if (!this.af.stuck && this.attackT >= 0.18) {
        this.af.stuck = true;
        const v = this.victim;
        const near = this.foeIn(70);
        const yaw = near ? Math.atan2(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z) : group.rotation.y;
        this.af.dashDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const len = near ? Math.max(6, Math.hypot(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z) / S - 3) : 22;
        this.events.push({ type: 'arrowFloorStick', x: group.position.x, z: group.position.z, dir: this.af.dashDir.clone(), len });
      }
      // 猛ダッシュ（相手の手前まで）
      const [from, to, speed] = a.dash;
      if (this.af.dashDir && this.attackT >= from && this.attackT <= to) {
        const v = this.victim;
        if (this.foeIn(70)) {
          _a.set(v.c.group.position.x - group.position.x, 0, v.c.group.position.z - group.position.z);
          const d = _a.length();
          if (d > 1e-5) this.af.dashDir.lerp(_a.multiplyScalar(1 / d), Math.min(1, 12 * dt)).normalize();
          const gapStop = 3.6 * S;
          const step = Math.min(speed * S * dt, Math.max(0, d - gapStop));
          group.position.addScaledVector(this.af.dashDir, step);
        } else group.position.addScaledVector(this.af.dashDir, speed * S * dt);
        group.rotation.y = Math.atan2(this.af.dashDir.x, this.af.dashDir.z);
        this.clampToArena();
        animator.trailOn = false;
      }
    }
    if (this.pn) this.updatePress(dt);
  }

  // ---- 通常3段目: 下向き矢印を貼って地面に押さえつけ、連続パンチ ----
  startPress() {
    const v = this.victim;
    if (!v) return;
    const yaw = this.c.group.rotation.y;
    this.pn = { dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), k: 0 };
    v.state = 'held';
    v.vx = v.vz = v.vy = 0;
    v.attackActive = false;
    v.c.animator.play('pressed', 0.05);
    v.c.animator.jolt = 1;
    this.events.push({ type: 'arrowPressStart', dir: this.pn.dir.clone() });
  }

  updatePress(dt) {
    const v = this.victim;
    const pn = this.pn;
    const S = this.c.scale;
    if (this.state !== 'attack' || !v || v.state !== 'held') { this.cancelPress(false); return; }
    const t = this.attackT;
    // 目の前に引き寄せて、地面に押しつぶす（上下につぶれる）
    this.holdFoe(pn.dir, 2.1, 0.2, Math.min(1, 18 * dt));
    const sq = 0.72 + 0.1 * Math.min(1, v.c.animator.jolt);
    v.c.group.scale.set(S * 1.14, S * sq, S * 1.14);
    this.pressScaleOn = true;
    // 連打
    const P = ARROW_PRESS;
    while (pn.k < P.punches && t >= P.from + (pn.k / P.punches) * (P.to - P.from)) {
      pn.k++;
      v.c.animator.jolt = 1;
      v.c.animator.joltSide = pn.k % 2 ? 1 : -1;
      this.events.push({ type: 'arrowPunch', n: pn.k, side: pn.k % 2 ? 1 : -1, dir: pn.dir.clone() });
    }
    if (t >= P.to) {
      this.cancelPress(true);
      this.finisherWindow = FINISHER.window; // コンボ技のボタンが出る
    }
  }

  // 押さえつけを終える。finish: 最後に弾き飛ばす
  cancelPress(finish) {
    const v = this.victim;
    const pn = this.pn;
    if (!pn && !this.pressScaleOn) return;
    this.pn = null;
    if (v && this.pressScaleOn) { const S = this.c.scale; v.c.group.scale.set(S, S, S); }
    this.pressScaleOn = false;
    if (v && v.state === 'held') {
      v.state = 'ground';
      v.c.group.position.y = 0;
      if (finish && pn) v.hit(pn.dir.x, pn.dir.z, 2);
    }
    this.events.push({ type: 'arrowPressEnd' });
  }

  holdFoe(dir, dist, jolt = 0.25, rate = 1) {
    const v = this.victim;
    const g = this.c.group;
    const S = this.c.scale;
    const vg = v.c.group;
    const tx = g.position.x + dir.x * (dist + jolt * v.c.animator.jolt) * S;
    const tz = g.position.z + dir.z * (dist + jolt * v.c.animator.jolt) * S;
    vg.position.set(vg.position.x + (tx - vg.position.x) * rate, 0, vg.position.z + (tz - vg.position.z) * rate);
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
  // スキルの共通部分
  // ============================================================
  startArrowSkill(n) {
    const { animator } = this.c;
    this.cancelPress(false);
    this.bs = { n, phase: 'init', t: 0, fired: false };
    this.state = 'bskill' + n;
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    if (n === 1) this.beginSkill1();
    else if (n === 2) this.beginSkill2();
    else if (n === 3) this.beginSkill3();
    else if (n === 4) this.beginSkill4();
    else this.beginArrowFinisher();
  }

  updateArrowSkill(dt) {
    switch (this.bs.n) {
      case 1: this.updateSkill1(dt); break;
      case 2: this.updateSkill2(dt); break;
      case 3: this.updateSkill3(dt); break;
      case 4: this.updateSkill4(dt); break;
      default: this.updateArrowFinisher(dt); break;
    }
  }

  restoreVisual() {
    const c = this.c;
    c.group.visible = true;
    c.group.position.y = Math.max(0, c.group.position.y);
    if (c.group.position.y < 0.5) c.group.position.y = 0;
    c.animator.trailOn = false;
    if (this.victim && this.pressScaleOn) { const S = c.scale; this.victim.c.group.scale.set(S, S, S); this.pressScaleOn = false; }
  }

  cancelArrow() {
    if (this.pn) this.cancelPress(false);
    if (this.af.am) { this.af.am = false; }
    this.events.push({ type: 'arrowCancel' });
    if (!this.bs) return;
    const n = this.bs.n;
    this.releaseFoe();
    this.c.group.position.y = 0;
    this.bs = null;
    if (n === 1) { this.skillCooldown = ASKILL1.cooldown; this.skill3Ready = false; }
    if (n === 2) { this.skill2Cooldown = ASKILL2.cooldown; this.skill4Ready = false; }
    if (n === 3) this.skill3Ready = false;
    if (n === 4) this.skill4Ready = false;
  }

  hit(dx, dz, power) { this.cancelArrow(); super.hit(dx, dz, power); }
  launch(dx, dz, speed, up) { this.cancelArrow(); super.launch(dx, dz, speed, up); }

  releaseFoe() {
    const v = this.victim;
    if (v && v.state === 'held') { v.state = 'ground'; v.c.group.position.y = 0; }
  }

  endArrowSkill() {
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreVisual();
    this.bs = null;
    this.state = 'ground';
    this.vx = this.vz = 0;
    this.c.group.position.y = 0;
    if (n === 1) { this.skillCooldown = ASKILL1.cooldown; this.skill3Ready = true; }          // ボタンがスキル3に変わる
    else if (n === 3) { this.skill3Ready = false; }
    else if (n === 2) { this.skill2Cooldown = ASKILL2.cooldown; this.skill4Ready = true; }   // ボタンがスキル4に変わる
    else if (n === 4) { this.skill4Ready = false; }
    this.c.animator.play('fight', 0.15);
  }

  // ============================================================
  // スキル1: 砲弾の矢印を貼り、高速で飛ばす
  // ============================================================
  beginSkill1() {
    this.c.animator.play('arrowCannon', 0.08);
    this.events.push({ type: 'arrowSkill1Start' });
  }

  updateSkill1(dt) {
    const { group, animator } = this.c;
    const K = ASKILL1;
    const b = this.bs;
    b.t += dt;
    if (b.t < K.fireAt) group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-16 * dt));
    animator.attackT = Math.min(1, b.t / K.duration);
    if (!b.stuck && b.t >= K.stickAt) { b.stuck = true; this.events.push({ type: 'arrowCannonStick' }); }
    if (!b.fired && b.t >= K.fireAt) { b.fired = true; this.events.push({ type: 'arrowCannonFire' }); }
    if (b.t >= K.duration) this.endArrowSkill();
  }

  // ============================================================
  // スキル2: 足に上向き矢印を貼り、高く飛んで地面へ叩きつけ
  // ============================================================
  beginSkill2() {
    const b = this.bs;
    const S = this.c.scale;
    const g = this.c.group;
    b.phase = 'stick';
    b.hasTarget = this.foeIn(ASKILL2.range);
    this.c.animator.play('arrowStick', 0.08);
    this.events.push({ type: 'arrowSkill2Start' });
  }

  updateSkill2(dt) {
    const { group, animator, scale: S } = this.c;
    const K = ASKILL2;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.phase === 'stick') {
      group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-16 * dt));
      animator.attackT = Math.min(1, b.t / K.stick);
      if (!b.fired && animator.attackT >= 0.45) { b.fired = true; this.events.push({ type: 'arrowShinStick' }); }
      if (b.t >= K.stick) {
        b.phase = 'rise'; b.t = 0;
        b.from = group.position.clone();
        // 着地点: 相手の手前（相手がいなければ前方）
        const yaw = this.aimAtFoe(K.range);
        group.rotation.y = yaw;
        b.dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        if (this.foeIn(K.range)) b.land = new THREE.Vector3(v.c.group.position.x - b.dir.x * 2.5 * S, 0, v.c.group.position.z - b.dir.z * 2.5 * S);
        else b.land = new THREE.Vector3(group.position.x + b.dir.x * 14 * S, 0, group.position.z + b.dir.z * 14 * S);
        animator.play('arrowJump', 0.06);
        this.events.push({ type: 'arrowLeap' });
      }
    } else if (b.phase === 'rise' || b.phase === 'hang') {
      const total = K.rise + K.hang;
      const f = Math.min(1, b.t / K.rise);
      const ph = Math.min(1, b.t / total);
      group.position.y = K.height * S * (1 - (1 - f) * (1 - f));
      group.position.x = b.from.x + (b.land.x - b.from.x) * ph * 0.9;
      group.position.z = b.from.z + (b.land.z - b.from.z) * ph * 0.9;
      this.clampToArena();
      if (b.t >= total) { b.phase = 'dive'; b.t = 0; b.from2 = group.position.clone(); animator.play('arrowDive', 0.04); this.events.push({ type: 'arrowDive' }); }
    } else if (b.phase === 'dive') {
      const f = Math.min(1, b.t / K.dive);
      group.position.y = b.from2.y * (1 - f * f);
      group.position.x = b.from2.x + (b.land.x - b.from2.x) * f;
      group.position.z = b.from2.z + (b.land.z - b.from2.z) * f;
      if (f >= 1) {
        group.position.y = 0;
        group.position.x = b.land.x; group.position.z = b.land.z;
        this.clampToArena();
        // 着地: 範囲攻撃
        let hitFoe = false;
        if (v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
          const d = Math.hypot(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z);
          if (d < K.radius * S) { hitFoe = true; v.launch(b.dir.x, b.dir.z, 42, 14); }
        }
        this.events.push({ type: 'arrowSlamLand', x: group.position.x, z: group.position.z, hit: hitFoe, dir: b.dir.clone() });
        b.phase = 'recover'; b.t = 0;
        animator.attackT = 0.5;
        animator.play('arrowStick', 0.05);
      }
    } else {
      animator.attackT = 0.5 + 0.5 * Math.min(1, b.t / K.recover);
      if (b.t >= K.recover) { this.events.push({ type: 'arrowShinOff' }); this.endArrowSkill(); }
    }
  }

  // ============================================================
  // スキル3: 相手までの床に加速の矢印を貼り、猛ダッシュ（距離が遠いほど速く、ダメージも高い）
  // ============================================================
  beginSkill3() {
    const b = this.bs;
    const S = this.c.scale;
    const g = this.c.group;
    const v = this.victim;
    b.phase = 'stick';
    b.hasTarget = this.foeIn(ASKILL3.range);
    if (b.hasTarget) {
      const dx = v.c.group.position.x - g.position.x, dz = v.c.group.position.z - g.position.z;
      b.dist = Math.min(ASKILL3.maxDist, Math.hypot(dx, dz) / S);
      b.dir = new THREE.Vector3(dx, 0, dz).normalize();
    } else {
      b.dist = 30;
      b.dir = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    }
    g.rotation.y = Math.atan2(b.dir.x, b.dir.z);
    b.speed = ASKILL3.baseSpeed + ASKILL3.perDist * b.dist;      // 遠いほど速い（リグ単位/秒）
    b.damage = Math.min(DAMAGE.arrowRushMax, DAMAGE.arrowRushBase + DAMAGE.arrowRushPerDist * b.dist);
    this.c.animator.play('attackA2', 0.08);
    this.events.push({ type: 'arrowSkill3Start' });
  }

  updateSkill3(dt) {
    const { group, animator, scale: S } = this.c;
    const K = ASKILL3;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.phase === 'stick') {
      animator.attackT = 0.2 * Math.min(1, b.t / K.stick);
      if (!b.fired && b.t >= K.stick * 0.75) {
        b.fired = true;
        const len = Math.max(4, b.dist - 3);
        this.events.push({ type: 'arrowRushPlace', x: group.position.x, z: group.position.z, dir: b.dir.clone(), len, speedK: Math.min(1, b.dist / 100) });
      }
      if (b.t >= K.stick) { b.phase = 'rush'; b.t = 0; this.events.push({ type: 'arrowRushStart', speedK: Math.min(1, b.dist / 100) }); }
    } else if (b.phase === 'rush') {
      // 相手のほうへ向きを合わせながら、加速して突っ込む
      if (b.hasTarget && this.foeIn(K.range * 1.2)) {
        _a.set(v.c.group.position.x - group.position.x, 0, v.c.group.position.z - group.position.z);
        const d = _a.length();
        if (d > 1e-5) b.dir.lerp(_a.multiplyScalar(1 / d), Math.min(1, 10 * dt)).normalize();
      }
      const ramp = Math.min(1, b.t / 0.12);               // 走り出しの加速
      const step = b.speed * ramp * S * dt;
      b.traveled = (b.traveled ?? 0) + step;
      group.position.addScaledVector(b.dir, step);
      group.rotation.y = Math.atan2(b.dir.x, b.dir.z);
      this.clampToArena();
      animator.attackT = 0.32 + 0.18 * Math.min(1, b.t / 0.25);
      let arrived = false;
      if (b.hasTarget && v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
        const d = Math.hypot(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z);
        arrived = d < K.gap * S;
      } else arrived = b.traveled >= b.dist * S;
      if (arrived || b.t > 2.0) {
        b.phase = 'kick'; b.t = 0;
        animator.attackT = 0.62;
        // 蹴り: 距離が遠いほど、ダメージも吹き飛びも大きい
        if (b.hasTarget && v && this.foeIn(K.gap * 2.2)) {
          const sp = 40 + 0.45 * b.dist;
          v.launch(b.dir.x, b.dir.z, Math.min(90, sp), Math.min(18, 8 + 0.1 * b.dist));
          this.events.push({ type: 'arrowRushHit', dist: b.dist, damage: b.damage, dir: b.dir.clone(), speedK: Math.min(1, b.dist / 100) });
        }
      }
    } else if (b.phase === 'kick') {
      animator.attackT = 0.62 + 0.38 * Math.min(1, b.t / K.recover);
      if (b.t >= K.recover) this.endArrowSkill();
    }
  }

  // ============================================================
  // スキル4: 相手に鈍足矢印を貼る（移動速度 50%・5秒間）
  // ============================================================
  beginSkill4() {
    this.bs.hasTarget = this.foeIn(ASKILL4.range);
    this.c.animator.play('arrowSlap', 0.08);
    this.events.push({ type: 'arrowSkill4Start' });
  }

  updateSkill4(dt) {
    const { group, animator } = this.c;
    const K = ASKILL4;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.t < K.shotAt) group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-16 * dt));
    animator.attackT = Math.min(1, b.t / 0.45);
    if (!b.fired && b.t >= K.shotAt) { b.fired = true; this.events.push({ type: 'arrowSlowShot', hasTarget: b.hasTarget }); }
    if (b.fired && !b.stuck && b.t >= K.shotAt + K.flight) {
      b.stuck = true;
      if (b.hasTarget && v && this.foeIn(K.range * 1.3)) {
        v.status.apply('slow', K.slow);
        this.events.push({ type: 'arrowSlowStick' });
      }
    }
    if (b.t >= K.duration) this.endArrowSkill();
  }

  // ============================================================
  // コンボ: 地面に上向き矢印を貼って、地面を隆起させる範囲攻撃
  // ============================================================
  // 【注意】基底クラスにも startFinisher / updateFinisher（剣のつかみ技）がある。名前をそろえて上書きすると、基底の更新から
  // 意図しない呼び出しが起きて、固まる原因になる（実際に起きた）。ここは別の名前にして、startFinisher だけを上書きする
  beginArrowFinisher() {
    const b = this.bs;
    const S = this.c.scale;
    const g = this.c.group;
    const v = this.victim;
    b.phase = 'stick';
    // 貼る場所: 相手の足もと
    b.at = v ? new THREE.Vector3(v.c.group.position.x, 0, v.c.group.position.z) : g.position.clone();
    b.dir = new THREE.Vector3(b.at.x - g.position.x, 0, b.at.z - g.position.z).normalize();
    g.rotation.y = Math.atan2(b.dir.x, b.dir.z);
    this.finisherWindow = 0;
    this.c.animator.play('arrowStick', 0.06);
    this.events.push({ type: 'arrowFinStart' });
  }

  updateArrowFinisher(dt) {
    const { group, animator, scale: S } = this.c;
    const K = AFIN;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.phase === 'stick') {
      animator.attackT = Math.min(1, b.t / K.stick) * 0.7;
      if (!b.fired && animator.attackT >= 0.45 * 0.7 / 0.7 * 0.7) { b.fired = true; this.events.push({ type: 'arrowFinStick', x: b.at.x, z: b.at.z }); }
      if (b.t >= K.stick) { b.phase = 'erupt'; b.t = 0; b.hit = false; }
    } else if (b.phase === 'erupt') {
      if (!b.hit) {
        b.hit = true;
        let hitFoe = false;
        if (v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
          const d = Math.hypot(v.c.group.position.x - b.at.x, v.c.group.position.z - b.at.z);
          if (d < K.radius * S) { hitFoe = true; v.launch(b.dir.x, b.dir.z, 14, 34); } // 高く打ち上げる
        }
        this.events.push({ type: 'arrowErupt', x: b.at.x, z: b.at.z, hit: hitFoe, dir: b.dir.clone() });
      }
      animator.attackT = 0.7;
      if (b.t >= K.erupt) { b.phase = 'recover'; b.t = 0; }
    } else {
      animator.attackT = 0.7 + 0.3 * Math.min(1, b.t / K.recover);
      if (b.t >= K.recover) { this.events.push({ type: 'arrowFinOff' }); this.endArrowSkill(); }
    }
  }

  // ============================================================
  // 必殺技: 自分の上に前向き矢印 → 突撃 → ゴミ処理場のムービー
  // ============================================================
  canUlt() {
    const v = this.victim;
    if (!this.c.sword || !this.gauge.full || !v) return false;
    if (!ULT_TARGET_STATES.has(v.state)) return false;
    return Math.hypot(v.c.group.position.x - this.c.group.position.x, v.c.group.position.z - this.c.group.position.z) < ULTA.range * this.c.scale;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.cancelArrow();
    this.ult = { phase: 'draw', t: 0, stuck: false, timeScale: 1, saved: null, fired: {}, sched: junkSchedule(), crushed: 0 };
    this.state = 'ult';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('arrowRaise', 0.1);
    this.events.push({ type: 'ultStart' });
  }

  updateUlt(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    u.t += dt;
    const K = ULTA;
    if (u.phase === 'draw') {
      group.rotation.y += angleDiff(Math.atan2(vg.position.x - group.position.x, vg.position.z - group.position.z), group.rotation.y) * (1 - Math.exp(-14 * dt));
      animator.attackT = Math.min(1, u.t / K.draw);
      if (!u.stuck && animator.attackT >= 0.55) { u.stuck = true; this.events.push({ type: 'ultArrowStick' }); }
      if (u.t >= K.draw) {
        u.phase = 'rush'; u.t = 0;
        u.dir = new THREE.Vector3(vg.position.x - group.position.x, 0, vg.position.z - group.position.z).normalize();
        group.rotation.y = Math.atan2(u.dir.x, u.dir.z);
        animator.play('arrowRush', 0.05);
        this.events.push({ type: 'ultRush' });
      }
    } else if (u.phase === 'rush') {
      // 前向き矢印の加速で、人間砲弾のように突撃
      _a.set(vg.position.x - group.position.x, 0, vg.position.z - group.position.z);
      const d = _a.length();
      if (d > 1e-5) u.dir.lerp(_a.multiplyScalar(1 / d), Math.min(1, 8 * dt)).normalize();
      const ramp = Math.min(1, u.t / 0.1);
      const step = Math.min(K.rushSpeed * ramp * S * dt, Math.max(0, d - 3 * S));
      group.position.addScaledVector(u.dir, step);
      group.rotation.y = Math.atan2(u.dir.x, u.dir.z);
      if (d <= 3.2 * S || u.t > 2.5) {
        // 命中: 相手はふらふらになる（気絶）
        u.phase = 'freeze'; u.t = 0;
        v.state = 'held';
        v.vx = v.vz = v.vy = 0;
        v.attackActive = false;
        v.status.apply('stun', 30);
        v.c.animator.play('stunned', 0.05);
        animator.play('arrowRush', 0.05);
        this.events.push({ type: 'ultHit' });
      }
    } else if (u.phase === 'freeze') {
      if (u.t >= K.freeze) this.startUltCine();
    } else if (u.phase === 'cine') {
      this.updateUltCine(dt);
    }
  }

  startUltCine() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTA;
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
    u.flung = null;
    this.events.push({ type: 'ultCineStart' });
  }

  updateUltCine(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTA;
    const T = u.t;
    const fire = (name, at, extra = {}) => { if (T >= at && !u.fired[name]) { u.fired[name] = true; this.events.push({ type: name, ...extra }); return true; } return false; };
    fire('ultTitle', K.tTitle);
    // 引き寄せ矢印を、相手に貼る
    if (T >= K.tStick - 0.6 && T < K.tStick + 0.8) {
      if (!u.fired.slap) { u.fired.slap = true; animator.play('arrowSlap', 0.1); }
      animator.attackT = Math.min(1, (T - (K.tStick - 0.6)) / 0.9);
    }
    fire('ultPullStick', K.tStick);
    if (T >= K.tStick + 0.9 && animator.name !== 'fight') animator.play('fight', 0.3);
    // ゴミが引き寄せられて、次々に命中する
    for (const p of u.sched) {
      if (p.size === 'x') continue;
      const arrive = p.t0 + p.dur;
      const key = 'j' + p.k;
      if (T >= arrive && !u.fired[key]) {
        u.fired[key] = true;
        u.crushed++;
        v.c.animator.jolt = 1;
        v.c.animator.joltSide = p.k % 2 ? 1 : -1;
        if (v.c.animator.name !== 'pressed') v.c.animator.play('pressed', 0.05);
        this.events.push({ type: 'ultJunkHit', k: p.k, size: p.size });
      }
    }
    fire('ultPullStart', K.tPull);
    // 相手: だんだんつぶれていく。最後の一撃で、ぺしゃんこ
    let sq = 1;
    if (T >= K.tPull) sq = 1 - 0.28 * Math.min(1, (T - K.tPull) / (K.tCrush - K.tPull));
    if (T >= K.tCrush) sq = 0.28 - 0.14 * Math.min(1, (T - K.tCrush) / 0.12);
    vg.scale.set(S * (2 - sq * 0.9), S * sq, S * (2 - sq * 0.9));
    if (T >= K.tCrush && !u.fired.ultCrush) { u.fired.ultCrush = true; this.events.push({ type: 'ultCrush' }); }
    // 最後の一撃のあたりは、スローモーション
    u.timeScale = T > K.tCrush - 0.45 && T < K.tCrush + 0.5 ? 0.3 : 1;
    if (T >= ULTA_END) this.endUlt();
  }

  endUlt() {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const sv = u.saved;
    this.restoreVisual();
    group.position.set(sv.px, 0, sv.pz);
    group.rotation.set(0, sv.yaw, 0);
    animator.play('fight', 0.01);
    this.state = 'ground';
    this.vx = this.vz = 0;
    v.status.remove('stun');
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
