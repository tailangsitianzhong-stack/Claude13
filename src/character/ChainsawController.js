import * as THREE from 'three';
import { CharacterController, ULT_TARGET_STATES } from './Controller.js';

// チェンソーのコントローラ。移動・ジャンプ・被弾などの共通部分は CharacterController を使い、通常攻撃・スキル・必殺技を差し替える。
//
//  通常攻撃（3段）: 引き紐を引いてエンジンをかけ、斜めに斬って吹っ飛ばす → 一瞬で距離を詰めて首元に刺し、連続ダメージ → 回転斬り
//  ジャンプ攻撃  : チェンソーを地面に叩きつけて、地割れ（剣の「叩きつけ」と同じ仕組み。main の airSlamImpact が、チェンソーのときは地割れを足す）
//  スキル1       : 小型ナイフを投げて気をそらし（気絶）、そのあと上からチェンソーを振り下ろす範囲攻撃 → 使うとスキル3に切り替わる
//  スキル3       : 両手をチェンソーにして連続で斬る。最後に出血（状態異常）
//  スキル2       : 足にチェンソーを生やして、飛び蹴り → 使うとスキル4に切り替わる
//  スキル4       : 足に歯車を生やして、移動速度 +40%（歯車の状態異常）
//  必殺技        : 引き金を投げつけて相手に持たせ、飛び蹴り。その勢いで引き紐が引かれて、ムービーへ。
//                  頭と両腕にもチェンソーを生やして、縦横無尽に動いて斬りまくる
// ダメージ・演出は ChainsawDirector（src/game/ChainsawDirector.js）。ここは、動きの進行と、きっかけのイベント。

// bite: 近接の判定が「正面の近くにいる相手」。grab: 首に刺して、離さない。launch: 当てると吹っ飛ばす。spin: 全方向（回転斬り）
export const SAW_ATTACKS = [
  { anim: 'attackS1', duration: 0.72, active: [0.46, 0.66], chain: 0.84, lunge: [0.26, 0.5, 13], power: 2, launch: true, bite: true, reach: 9 },
  { anim: 'attackS2', duration: 1.1, active: [0.3, 0.42], chain: 0.97, lunge: [0.16, 0.34, 55], power: 1, bite: true, grab: true, reach: 13 },
  { anim: 'attackS3', duration: 0.85, active: [0.3, 0.74], chain: 0.95, lunge: [0.2, 0.5, 10], power: 2, bite: true, spin: true, reach: 12 },
];
export const SAW_STAB = { from: 0.42, to: 0.86, gap: 0.07 };   // 首に刺している間（通常2の進み具合）と、ダメージの間隔（秒）

export const SSKILL1 = { cooldown: 6, throw: 0.45, wait: 0.2, slam: 0.85, slamAt: 0.5, range: 220, reach: 7, radius: 16 };
export const SSKILL2 = { cooldown: 8, grow: 0.25, speed: 200, maxDist: 75, range: 80, hitR: 5, revert: 0.25, after: 0.04, launchSpeed: 62, launchUp: 14 };
export const SSKILL3 = { slashes: 6, grow: 0.2, slash: 0.22, hitAt: 0.4, reach: 15, speed: 40, range: 70, finish: 0.35 };
export const SSKILL4 = { duration: 0.5, gearAt: 0.2, gear: 6 };    // 歯車の状態異常の長さ（秒）
export const ULTS = {
  range: 220,
  draw: 0.55,
  throwTime: 0.3, release: 0.5, flight: 0.2,
  kick: 0.32, kickSpeed: 230,   // 飛び蹴り
  freeze: 0.34,
  // ムービー（ゲーム内の秒数）
  tTitle: 0.4,
  tSprout: 1.3,        // 頭と両腕にチェンソーが生える
  tCut: 2.5,           // 斬りまくり開始
  cuts: 16, cutGap: 0.24,
  tFinal: 2.5 + 16 * 0.24 + 0.3,   // 最後の一撃
  tail: 1.9,
  player: { x: -3.2, z: 0 }, foe: { x: 0, z: 0 },
};
export const ULTS_END = ULTS.tFinal + 0.6 + ULTS.tail;

const _a = new THREE.Vector3();
const angleDiff = (a, b) => { const d = a - b; return d - Math.PI * 2 * Math.round(d / (Math.PI * 2)); };

export class ChainsawController extends CharacterController {
  constructor(character, opts) {
    super(character, opts);
    this.attacks = SAW_ATTACKS;
    this.weaponId = 'saw';
    this.bs = null;       // スキルの進行状況
    this.stab = null;     // 首への刺しつけ（刺している間）
    this.revT = 0;        // エンジンが回っている残り秒数
    this.timeNow = 0;
  }

  // 相手の状態: 立っている・攻撃中でも狙える（NPC・通信対戦の相手は動き回るため）
  foeOk() { const v = this.victim; return !!v && ULT_TARGET_STATES.has(v.state); }
  foeIn(range) {
    const v = this.victim;
    const g = this.c.group;
    return this.foeOk() && Math.hypot(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z) < range * this.c.scale;
  }
  aimAtFoe(range) {
    const v = this.victim;
    const g = this.c.group;
    if (this.foeIn(range)) return Math.atan2(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z);
    return g.rotation.y;
  }

  // エンジンをかける（引き紐を引いた）: しばらく、刃が回り続ける
  startEngine(sec = 3) { this.revT = Math.max(this.revT, sec); }

  update(dt, cmd) {
    this.timeNow += dt;
    const saw = this.c.chainsaw;
    // エンジン: かかっている間は、刃が回る（スキル・必殺技の最中は、いつも回す）
    const busy = this.state.startsWith('bskill') || this.state === 'ult' || this.state === 'attack';
    this.revT = Math.max(0, this.revT - dt);
    if (saw) saw.userData.setRev(busy || this.revT > 0 ? 1 : 0);
    // 足の歯車（歯車の状態異常の間）
    const gears = this.status.has('gear');
    const c = this.c;
    if (c.gearL) {
      c.gearL.visible = c.gearR.visible = gears;
      if (gears) { c.gearL.rotation.x += dt * 22; c.gearR.rotation.x += dt * 22; }
    }
    // スキル中: 共通の移動処理は使わず、専用の進行だけ動かす
    if (this.state.startsWith('bskill')) {
      this.status.update(dt);
      this.skillCooldown = Math.max(0, this.skillCooldown - dt);
      this.skill2Cooldown = Math.max(0, this.skill2Cooldown - dt);
      this.updateSawSkill(dt);
      return;
    }
    // 地上でスキルボタンが押されたら、チェンソーのスキルを始める
    if (this.state === 'ground' && !this.status.has('stun') && this.jumpBuffer <= 0) {
      const can = this.c.sword && !(cmd.ult && this.canUlt());
      if (can && cmd.skill && this.skill3Ready) { this.startSawSkill(3); this.status.update(dt); return; }
      if (can && cmd.skill && this.skillCooldown <= 0) { this.startSawSkill(1); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill4Ready) { this.startSawSkill(4); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill2Cooldown <= 0) { this.startSawSkill(2); this.status.update(dt); return; }
    }
    if (cmd.skill || cmd.skill2) cmd = { ...cmd, skill: false, skill2: false };
    super.update(dt, cmd);
    if (this.stab) this.updateStab(dt);
    // 通常1の斬り始め: エンジンがかかる
    if (this.state === 'attack' && this.attackIndex === 0 && this.attackT > 0.28 && !this.sawStarted) { this.sawStarted = true; this.startEngine(3.5); this.events.push({ type: 'sawStart' }); }
    if (this.state !== 'attack') this.sawStarted = false;
  }

  // ============================================================
  // 通常2: 首元にチェンソーを刺して、連続ダメージ
  // ============================================================
  startSawStab() {
    const v = this.victim;
    if (!v) return;
    const yaw = this.c.group.rotation.y;
    this.stab = { dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), tick: 0, ended: false };
    v.state = 'held';
    v.vx = v.vz = v.vy = 0;
    v.attackActive = false;
    v.c.animator.play('pummeled', 0.05);
    v.c.animator.jolt = 1;
    this.events.push({ type: 'sawStabStart', dir: this.stab.dir.clone() });
  }

  updateStab(dt) {
    const v = this.victim;
    const sb = this.stab;
    if (this.state !== 'attack' || !v || v.state !== 'held') { this.stab = null; return; }
    const t = this.attackT;
    this.holdFoe(sb.dir, 2.0, 0.3, Math.min(1, 18 * dt));
    if (t >= SAW_STAB.from && t < SAW_STAB.to) {
      v.c.animator.jolt = Math.max(v.c.animator.jolt, 0.5 + 0.5 * Math.sin(t * 120));
      sb.tick -= dt;
      if (sb.tick <= 0) { sb.tick = SAW_STAB.gap; this.events.push({ type: 'sawStabTick', dir: sb.dir.clone() }); }
    }
    if (!sb.ended && t >= SAW_STAB.to) {
      sb.ended = true;
      this.stab = null;
      v.state = 'ground';
      v.hit(sb.dir.x, sb.dir.z, 2);
      this.events.push({ type: 'sawStabEnd', dir: sb.dir.clone() });
    }
  }

  // 相手を目の前に保つ
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

  // ============================================================
  // スキルの共通部分
  // ============================================================
  startSawSkill(n) {
    const { animator } = this.c;
    this.bs = { n, phase: 'init', t: 0, k: 0, fired: false };
    this.state = 'bskill' + n;
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    this.startEngine(2);
    if (n === 1) this.beginSkill1();
    else if (n === 3) this.beginSkill3();
    else if (n === 2) this.beginSkill2();
    else this.beginSkill4();
  }

  updateSawSkill(dt) {
    switch (this.bs.n) {
      case 1: this.updateSkill1(dt); break;
      case 3: this.updateSkill3(dt); break;
      case 2: this.updateSkill2(dt); break;
      default: this.updateSkill4(dt); break;
    }
  }

  // 見た目を元に戻す（足・左手のチェンソー）
  restoreVisual() {
    const c = this.c;
    c.group.position.y = 0;
    c.group.rotation.x = 0; c.group.rotation.z = 0;
    if (c.sawL) c.sawL.visible = false;
    if (c.legSawL) c.legSawL.visible = c.legSawR.visible = false;
    if (c.headSaw) c.headSaw.visible = false;
    c.animator.trailOn = false;
  }

  cancelSaw() {
    if (this.stab) { this.releaseFoe(); this.stab = null; }
    if (!this.bs) return;
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreVisual();
    this.bs = null;
    if (n === 1) { this.skillCooldown = SSKILL1.cooldown; this.skill3Ready = false; }
    if (n === 2 || n === 4) { this.skill2Cooldown = SSKILL2.cooldown; this.skill4Ready = false; }
    if (n === 3) this.skill3Ready = false;
    this.events.push({ type: 'sawCancel' });
  }

  hit(dx, dz, power) { this.cancelSaw(); super.hit(dx, dz, power); }
  launch(dx, dz, speed, up) { this.cancelSaw(); super.launch(dx, dz, speed, up); }

  releaseFoe() {
    const v = this.victim;
    if (v && v.state === 'held') { v.state = 'ground'; v.c.group.position.y = 0; }
  }

  endSawSkill() {
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreVisual();
    this.bs = null;
    this.state = 'ground';
    this.vx = this.vz = 0;
    if (n === 1) { this.skillCooldown = SSKILL1.cooldown; this.skill3Ready = true; }          // ボタンがスキル3に変わる
    else if (n === 3) { this.skill3Ready = false; }
    else if (n === 2) { this.skill2Cooldown = SSKILL2.cooldown; this.skill4Ready = true; }   // ボタンがスキル4に変わる
    else if (n === 4) { this.skill4Ready = false; }
    this.c.animator.play('fight', 0.15);
  }

  clampToArena() {
    if (!this.bounds) return;
    const b = this.bounds;
    const g = this.c.group;
    g.position.x = Math.min(b.maxX - 0.2, Math.max(b.minX + 0.2, g.position.x));
    g.position.z = Math.min(b.maxZ - 0.2, Math.max(b.minZ + 0.2, g.position.z));
  }

  atWall() {
    const b = this.bounds;
    const g = this.c.group.position;
    return g.x <= b.minX + 0.25 || g.x >= b.maxX - 0.25 || g.z <= b.minZ + 0.25 || g.z >= b.maxZ - 0.25;
  }

  // ============================================================
  // スキル1: ナイフを投げて気をそらし、上からチェンソーを振り下ろす
  // ============================================================
  beginSkill1() {
    this.bs.phase = 'throw';
    this.c.animator.play('sawThrow', 0.08);
    this.events.push({ type: 'sawSkill1Start' });
  }

  updateSkill1(dt) {
    const { group, animator, scale: S } = this.c;
    const K = SSKILL1;
    const b = this.bs;
    b.t += dt;
    group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-14 * dt));
    if (b.phase === 'throw') {
      animator.attackT = Math.min(1, b.t / K.throw);
      if (!b.fired && animator.attackT >= 0.5) {
        b.fired = true;
        const yaw = group.rotation.y;
        this.events.push({ type: 'sawKnife', dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), hasTarget: this.foeIn(K.range) });
      }
      if (b.t >= K.throw) { b.phase = 'wait'; b.t = 0; animator.play('fight', 0.1); }
    } else if (b.phase === 'wait') {
      if (b.t >= K.wait) { b.phase = 'slam'; b.t = 0; b.fired = false; animator.attackT = 0; animator.play('sawOverhead', 0.08); this.events.push({ type: 'sawRaise' }); }
    } else {
      animator.attackT = Math.min(1, b.t / K.slam);
      animator.trailOn = animator.attackT > 0.35 && animator.attackT < 0.62;
      if (!b.fired && animator.attackT >= K.slamAt) {
        b.fired = true;
        const near = this.foeIn(K.range);
        const yaw = group.rotation.y;
        // 叩きつける地点: 相手がいれば相手の足もと（近づきすぎない）、いなければ前方
        const v = this.victim;
        const d = near ? Math.min(K.reach * S, Math.hypot(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z)) : K.reach * S;
        const dirx = near ? (v.c.group.position.x - group.position.x) : Math.sin(yaw);
        const dirz = near ? (v.c.group.position.z - group.position.z) : Math.cos(yaw);
        const len = Math.hypot(dirx, dirz) || 1;
        this.events.push({ type: 'sawSlam', x: group.position.x + (dirx / len) * d, z: group.position.z + (dirz / len) * d, dirX: dirx / len, dirZ: dirz / len });
      }
      if (b.t >= K.slam) this.endSawSkill();
    }
  }

  // ============================================================
  // スキル2: 足にチェンソーを生やして、飛び蹴り
  // ============================================================
  beginSkill2() {
    const b = this.bs;
    b.phase = 'grow';
    this.c.legSawL.visible = this.c.legSawR.visible = true;
    this.c.animator.play('sawLegGrow', 0.08);
    this.events.push({ type: 'sawSkill2Start' });
  }

  updateSkill2(dt) {
    const { group, animator, scale: S } = this.c;
    const K = SSKILL2;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.phase === 'grow') {
      group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-16 * dt));
      animator.attackT = Math.min(1, b.t / K.grow);
      if (b.t >= K.grow) {
        b.phase = 'kick'; b.t = 0;
        b.dir = new THREE.Vector3(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
        b.dist = 0; b.hit = false;
        animator.attackT = 0;
        animator.play('sawKick', 0.04);
        this.events.push({ type: 'sawKickStart' });
      }
    } else if (b.phase === 'kick') {
      if (!b.hit && this.foeIn(K.range * 1.4)) {
        _a.set(v.c.group.position.x - group.position.x, 0, v.c.group.position.z - group.position.z).normalize();
        b.dir.lerp(_a, Math.min(1, 6 * dt)).normalize();
      }
      const step = K.speed * S * dt;
      group.position.addScaledVector(b.dir, step);
      b.dist += step;
      group.rotation.y = Math.atan2(b.dir.x, b.dir.z);
      group.position.y = 1.0 * S * 3 * Math.sin(Math.min(1, b.dist / (K.maxDist * S)) * Math.PI) * 0 + 0.0;
      animator.attackT = Math.min(1, b.dist / (30 * S));
      animator.trailOn = true;
      this.clampToArena();
      if (!b.hit && this.foeOk()) {
        const d = Math.hypot(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z);
        if (d < K.hitR * S) {
          b.hit = true; b.t = 0;
          this.events.push({ type: 'sawKickHit', dir: b.dir.clone() });
        }
      }
      if ((b.hit && b.t > K.after) || b.dist >= K.maxDist * S || (this.bounds && this.atWall())) {
        b.phase = 'revert'; b.t = 0;
        animator.trailOn = false;
        animator.attackT = 0;
        animator.play('fight', 0.12);
        this.c.legSawL.visible = this.c.legSawR.visible = false;
      }
    } else if (b.t >= K.revert) this.endSawSkill();
  }

  // ============================================================
  // スキル3: 両手をチェンソーにして連続で斬り、最後に出血させる
  // ============================================================
  beginSkill3() {
    const b = this.bs;
    b.phase = 'grow';
    this.c.sawL.visible = true;
    this.c.animator.play('fangMorph', 0.08);
    this.events.push({ type: 'sawSkill3Start' });
  }

  updateSkill3(dt) {
    const { group, animator, scale: S } = this.c;
    const K = SSKILL3;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-14 * dt));
    if (b.phase === 'grow') {
      animator.attackT = Math.min(1, b.t / K.grow);
      if (b.t >= K.grow) { b.phase = 'slash'; b.t = 0; b.k = 0; b.fired = false; animator.attackT = 0; animator.play('fangSweep1', 0.05); }
    } else if (b.phase === 'slash') {
      // 相手へ近づきながら斬る
      if (this.foeIn(K.range)) {
        const dx = v.c.group.position.x - group.position.x;
        const dz = v.c.group.position.z - group.position.z;
        const d = Math.hypot(dx, dz);
        const gap = Math.max(0, d - 4.2 * S);
        const step = Math.min(gap, K.speed * S * dt);
        if (d > 1e-5) { group.position.x += (dx / d) * step; group.position.z += (dz / d) * step; }
        this.clampToArena();
      }
      const f = Math.min(1, b.t / K.slash);
      animator.attackT = f;
      animator.trailOn = f > 0.15 && f < 0.75;
      if (!b.fired && f >= K.hitAt) { b.fired = true; this.events.push({ type: 'sawArmSlash', k: b.k, hit: this.foeIn(K.reach) }); }
      if (f >= 1) {
        b.k++; b.t = 0; b.fired = false;
        if (b.k >= K.slashes) { b.phase = 'finish'; animator.trailOn = false; animator.play('fight', 0.1); this.events.push({ type: 'sawBleed', hit: this.foeIn(K.reach * 1.2) }); }
        else { animator.attackT = 0; animator.play(b.k % 2 ? 'fangSweep2' : 'fangSweep1', 0.03); }
      }
    } else if (b.t >= K.finish) this.endSawSkill();
  }

  // ============================================================
  // スキル4: 足に歯車を生やして、移動速度 +40%
  // ============================================================
  beginSkill4() {
    this.bs.phase = 'gear';
    this.c.animator.play('sawGear', 0.08);
    this.events.push({ type: 'sawSkill4Start' });
  }

  updateSkill4(dt) {
    const { animator } = this.c;
    const K = SSKILL4;
    const b = this.bs;
    b.t += dt;
    animator.attackT = Math.min(1, b.t / K.duration);
    if (!b.fired && b.t >= K.gearAt) { b.fired = true; this.status.apply('gear', K.gear); this.events.push({ type: 'sawGear' }); }
    if (b.t >= K.duration) this.endSawSkill();
  }

  // ============================================================
  // 必殺技: 引き金を投げつけて持たせ → 飛び蹴り → 引き紐が引かれて、ムービー
  // ============================================================
  canUlt() {
    const v = this.victim;
    if (!this.c.sword || !this.gauge.full || !v) return false;
    if (!ULT_TARGET_STATES.has(v.state)) return false;
    return Math.hypot(v.c.group.position.x - this.c.group.position.x, v.c.group.position.z - this.c.group.position.z) < ULTS.range * this.c.scale;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.cancelSaw();
    this.ult = { phase: 'draw', t: 0, released: false, timeScale: 1, saved: null, fired: {}, dir: null };
    this.state = 'ult';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('ultDraw', 0.1);
    this.startEngine(30);
    this.events.push({ type: 'sawUltStart' });
  }

  updateUlt(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTS;
    u.t += dt;
    if (u.phase === 'draw' || u.phase === 'throw') {
      group.rotation.y += angleDiff(Math.atan2(vg.position.x - group.position.x, vg.position.z - group.position.z), group.rotation.y) * (1 - Math.exp(-14 * dt));
    }
    if (u.phase === 'draw') {
      animator.attackT = Math.min(1, u.t / K.draw);
      if (u.t >= K.draw) { u.phase = 'throw'; u.t = 0; animator.attackT = 0; animator.play('ultThrow', 0.08); }
    } else if (u.phase === 'throw') {
      animator.attackT = Math.min(1, u.t / K.throwTime);
      if (!u.released && animator.attackT >= K.release) { u.released = true; u.flyT = 0; this.events.push({ type: 'sawTriggerThrow' }); }
      if (u.released) {
        u.flyT += dt;
        if (u.flyT >= K.flight) {
          // 引き金が相手の手に収まる: 相手は、引き金を握ったまま動けない
          u.phase = 'kick'; u.t = 0;
          v.state = 'held';
          v.vx = v.vz = v.vy = 0;
          v.attackActive = false;
          v.c.animator.play('stunned', 0.05);
          u.dir = new THREE.Vector3(vg.position.x - group.position.x, 0, vg.position.z - group.position.z).normalize();
          group.rotation.y = Math.atan2(u.dir.x, u.dir.z);
          this.c.legSawL.visible = this.c.legSawR.visible = true;
          animator.attackT = 0;
          animator.play('sawKick', 0.04);
          this.events.push({ type: 'sawTriggerHit' });
        }
      }
    } else if (u.phase === 'kick') {
      // 飛び蹴りで突っ込む。当たると、その勢いで引き紐が引かれる
      _a.set(vg.position.x - group.position.x, 0, vg.position.z - group.position.z);
      const d = _a.length();
      if (d > 1e-5) u.dir.lerp(_a.multiplyScalar(1 / d), Math.min(1, 9 * dt)).normalize();
      const step = Math.min(K.kickSpeed * S * dt, Math.max(0, d - 3.2 * S));
      group.position.addScaledVector(u.dir, step);
      group.rotation.y = Math.atan2(u.dir.x, u.dir.z);
      animator.attackT = Math.min(1, u.t / 0.25);
      animator.trailOn = true;
      if (d <= 3.6 * S || u.t > 1.6) {
        u.phase = 'freeze'; u.t = 0;
        animator.trailOn = false;
        this.events.push({ type: 'ultHit' });
      }
    } else if (u.phase === 'freeze') {
      if (u.t >= K.freeze) this.startUltCine();
    } else if (u.phase === 'cine') {
      this.updateUltCine(dt);
    }
  }

  // 画面が切り替わる: 自分と相手を、ムービーの舞台へ移す
  startUltCine() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTS;
    u.saved = { px: group.position.x, pz: group.position.z, py: group.position.y, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    u.phase = 'cine';
    u.t = 0;
    u.cut = -1;
    group.position.set(K.player.x, 0, K.player.z);
    group.rotation.set(0, Math.PI / 2, 0);
    vg.position.set(K.foe.x, 0, K.foe.z);
    vg.rotation.set(0, -Math.PI / 2, 0);
    this.c.legSawL.visible = this.c.legSawR.visible = false;
    animator.play('fight', 0.01);
    v.c.animator.play('stunned', 0.01);
    this.events.push({ type: 'ultCineStart' });
  }

  // 斬りまくり: k 回目の位置（相手のまわりを、縦横無尽に）。ムービーの演出（カメラ・線）も、同じ式を使う
  cutSpot(k) {
    const K = ULTS;
    const a = k * 2.399 + 0.5;             // 黄金角: まんべんなくばらける
    const r = 1.5 + 0.7 * ((k * 5) % 3) / 2;
    const up = k % 4 === 3;                // 4回に1回は、上から
    const low = k % 5 === 1;               // たまに、低い位置から
    return { x: K.foe.x + Math.cos(a) * r, z: K.foe.z + Math.sin(a) * r, y: up ? 1.1 : low ? 0 : (k % 2) * 0.25, a, up };
  }

  updateUltCine(dt) {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTS;
    const T = u.t;
    const c = this.c;
    const fire = (name, at, extra = {}) => { if (T >= at && !u.fired[name]) { u.fired[name] = true; this.events.push({ type: name, ...extra }); return true; } return false; };
    fire('ultTitle', K.tTitle);
    if (fire('sawSprout', K.tSprout)) { c.headSaw.visible = true; c.sawL.visible = true; animator.play('fangBerserk', 0.1); }
    if (T >= K.tSprout && T < K.tCut) animator.attackT = Math.min(1, (T - K.tSprout) / (K.tCut - K.tSprout));
    // 相手は、ふらふらと浮かんだまま。斬られるたびに押されて回る
    if (!u.finalFired) {
      const hover = 0.05 * Math.sin(T * 8);
      vg.position.set(K.foe.x, hover, K.foe.z);
      vg.rotation.x = 0.15 * Math.sin(T * 5.5);
    }
    // 斬りまくり: 1回ごとに、相手のまわりの別の位置へ飛んで、斬る
    if (T >= K.tCut && T < K.tFinal - 0.1) {
      const k = Math.min(K.cuts - 1, Math.floor((T - K.tCut) / K.cutGap));
      const f = ((T - K.tCut) - k * K.cutGap) / K.cutGap;
      if (k !== u.cut) {
        u.cut = k;
        const sp = this.cutSpot(k);
        u.spot = sp;
        animator.play(sp.up ? 'airSlam' : k % 3 === 0 ? 'fangSweep3' : k % 2 ? 'fangSweep2' : 'fangSweep1', 0.02);
        this.events.push({ type: 'sawUltCut', k, x: sp.x, y: sp.y, z: sp.z, a: sp.a, up: sp.up });
      }
      const sp = u.spot;
      const slide = Math.min(1, f * 2.2);   // 前半で飛びつき、後半で斬る
      group.position.set(sp.x * (0.5 + 0.5 * slide) + K.foe.x * (0.5 - 0.5 * slide), sp.y * Math.sin(Math.min(1, f) * Math.PI), sp.z * (0.5 + 0.5 * slide) + K.foe.z * (0.5 - 0.5 * slide));
      group.rotation.y = Math.atan2(K.foe.x - group.position.x, K.foe.z - group.position.z);
      animator.attackT = Math.min(1, f);
      animator.trailOn = f > 0.2 && f < 0.85;
    } else if (T >= K.tFinal - 0.1 && !u.finalFired) {
      // 最後の一撃のため、いったん相手の上へ跳び上がって、全部のチェンソーで叩き落とす
      animator.trailOn = true;
      const f = Math.min(1, (T - (K.tFinal - 0.1)) / 0.4);
      group.position.set(K.foe.x - 1.3 * (1 - f), 1.5 * Math.sin(f * Math.PI * 0.9), K.foe.z);
      group.rotation.y = Math.PI / 2;
      if (animator.name !== 'sawOverhead') { animator.play('sawOverhead', 0.05); }
      animator.attackT = Math.min(0.5, f * 0.5);
      if (T >= K.tFinal) {
        u.finalFired = true;
        animator.attackT = 0.5;
        this.events.push({ type: 'sawUltFinal' });
      }
    } else if (u.finalFired) {
      animator.attackT = Math.min(1, 0.5 + (T - K.tFinal) / 0.6 * 0.5);
      animator.trailOn = false;
      vg.rotation.x = Math.max(-1.45, vg.rotation.x - 6 * dt);   // 相手が倒れていく
      vg.position.y = Math.max(0, vg.position.y - 2 * dt);
    }
    // 最後の一撃のあたりは、スローモーション
    u.timeScale = T > K.tFinal - 0.3 && T < K.tFinal + 0.45 ? 0.3 : 1;
    if (T >= ULTS_END) this.endUlt();
  }

  endUlt() {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const sv = u.saved ?? { px: group.position.x, pz: group.position.z, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    this.restoreVisual();
    group.position.set(sv.px, 0, sv.pz);
    group.rotation.set(0, sv.yaw, 0);
    animator.play('fight', 0.01);
    this.state = 'ground';
    this.vx = this.vz = 0;
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
