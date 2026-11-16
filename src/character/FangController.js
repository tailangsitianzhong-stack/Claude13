import * as THREE from 'three';
import { CharacterController } from './Controller.js';
import { createCharacter } from './Character.js';
import { createGem } from './Fang.js';
import { createBigBat, LegBats } from './FangBats.js';
import { RIG } from './rig.js';

// 吸血牙のコントローラ。移動・ジャンプ・被弾などの共通部分は CharacterController を使い、
// 通常攻撃・ジャンプ攻撃・スキル・必殺技を吸血牙用に差し替える。
//
//  通常攻撃（3段）: 前方への噛みつき → 爪での斜め薙ぎ払い → 首に噛みつき肉を引きちぎる
//  ジャンプ攻撃  : 空中で、前方へ小さなかぎ爪を3つ（射程は短い）
//  スキル1       : 爪を赤くして薙ぎ払い、斬撃を前へ3つ高速で飛ばす。当たると自分の体力が少し回復 → 使うとスキル3に切り替わる
//  スキル3       : 蝙蝠の大群になって弾け、小さな分身4体が、それぞれ攻撃
//  スキル2       : 巨大蝙蝠になって前へ突進 → 使うとスキル4に切り替わる
//  スキル4       : 足だけを蝙蝠にして宙に浮き、回転しながら薙ぎ払う
//  必殺技        : 赤い宝石を投げつける → ドラキュラ城のムービー（蝙蝠の大群 → 宝石が光って凶暴化 → 重い牙の一撃・体力30%回復）

// bite: 近接の判定が「噛みつき」（正面の相手が近ければ当たる）。grab: 首に噛みつき、つかんで離さない
export const FANG_ATTACKS = [
  { anim: 'attackF1', duration: 0.52, active: [0.4, 0.6], chain: 0.78, lunge: [0.2, 0.46, 12], power: 1, bite: true, reach: 8 },
  { anim: 'attackF2', duration: 0.5, active: [0.34, 0.62], chain: 0.76, lunge: [0.24, 0.5, 10], power: 1 },
  { anim: 'attackF3', duration: 1.0, active: [0.4, 0.5], chain: 0.97, lunge: [0.18, 0.4, 12], power: 2, bite: true, grab: true, reach: 8 },
];
export const FANG_AIR = { duration: 0.55, cooldown: 0.7, shots: [0.2, 0.5, 0.8] };

export const FSKILL1 = {
  cooldown: 6,
  redden: 0.45,     // 爪を赤くする
  sweepTime: 0.2,   // 薙ぎ払い1回ぶん
  sweeps: 3,        // 斬撃の数
  recover: 0.4,
  range: 220,
};
export const FSKILL2 = {
  cooldown: 8,
  morph: 0.32,      // 蝙蝠になるまで
  speed: 135,       // 突進の速さ（リグ単位/秒）
  maxDist: 80,      // 相手がいなくても進む距離
  range: 80,        // 「前にいる相手」を狙える距離
  hitR: 4.6,        // 巨大蝙蝠が当たる半径
  revert: 0.4,      // 元の姿に戻るまで
  launchSpeed: 62, launchUp: 14,
};
export const FSKILL3 = {
  clones: 4,
  burst: 0.55,      // 蝙蝠の大群になって弾けるまで
  gap: 0.3,         // 分身が順番に攻撃を始める間隔
  dash: 0.14, slash: 0.4, hold: 0.2,
  gather: 0.6,      // 蝙蝠になって戻ってくるまで
  size: 0.55,       // 分身の大きさ（本体に対する倍率）
  range: 90,
};
export const FSKILL4 = {
  legs: 0.4,        // 足が蝙蝠になるまで
  spin: 1.1,        // 回転薙ぎ払いの長さ
  turns: 2.4,       // その間に回る回数
  hits: 4, hitAt: 0.2, hitGap: 0.24,  // 薙ぎ払いが当たる時刻
  speed: 26,        // 相手へ近づく速さ
  hitR: 16,         // 薙ぎ払いの届く半径（リグ単位。両腕の爪が届く範囲）
  end: 0.45,
  range: 70,
  launchSpeed: 55, launchUp: 11,
};
export const ULTF = {
  range: 220,
  draw: 0.6,        // 懐から赤い宝石を取り出す
  throwTime: 0.55, release: 0.6, flight: 0.24,
  freeze: 0.34,
  // ムービー（ゲーム内の秒数）
  tTitle: 0.5,      // 技名
  tSwarm: 2.3,      // 蝙蝠の大群が現れる
  tAppear: 4.7,     // 大群が一つにまとまって、本体が現れる
  tGem: 5.6,        // 宝石が手に現れて光りはじめる
  tBerserk: 6.2,    // 凶暴化
  tDash: 7.2,       // 飛びかかる
  dash: 0.3,
  tBite: 7.5,       // 噛みつく瞬間
  slowmo: 0.3,
  tail: 1.8,
  player: { x: -3.6, z: 0 },   // 本体が現れる位置
  foe: { x: 2.4, z: 0.2 },     // 敵（ふらふら見回している）
};
export const ULTF_END = ULTF.tBite + 0.25 + ULTF.tail;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const angleDiff = (a, b) => { const d = a - b; return d - Math.PI * 2 * Math.round(d / (Math.PI * 2)); };
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export class FangController extends CharacterController {
  constructor(character, opts) {
    super(character, opts);
    this.attacks = FANG_ATTACKS;
    this.weaponId = 'fang';
    this.bs = null;          // スキルの進行状況
    this.fa = null;          // ジャンプ攻撃の進行
    this.nb = null;          // 首への噛みつき（つかんでいる間）
    this.airCd = 0;
    this.fPrev = false;      // 前フレームに攻撃が押されていたか（空中で押した瞬間の検出用）
    this.bigBat = null;
    this.legBats = null;
    this.clones = null;
    this.gem = null;
    this.timeNow = 0;
  }

  get claws() { return this.c.claws; }

  update(dt, cmd) {
    this.timeNow += dt;
    // スキル中: 共通の移動処理は使わず、専用の進行だけ動かす
    if (this.state.startsWith('bskill')) {
      this.status.update(dt);
      this.skillCooldown = Math.max(0, this.skillCooldown - dt);
      this.skill2Cooldown = Math.max(0, this.skill2Cooldown - dt);
      this.updateFangSkill(dt);
      return;
    }
    this.airCd = Math.max(0, this.airCd - dt);
    // ジャンプ中の攻撃: 叩きつけの代わりに、小さなかぎ爪を3つ
    const pressed = cmd.attack && !this.fPrev;
    this.fPrev = cmd.attack;
    if (this.state === 'air') {
      if (pressed && !this.fa && this.airCd <= 0 && this.c.group.position.y > 0.5 * this.c.scale) this.startAirClaws();
      if (cmd.attack) cmd = { ...cmd, attack: false };
    }
    if (this.fa) this.updateAirClaws(dt);
    // 地上でスキルボタンが押されたら、吸血牙のスキルを始める
    if (this.state === 'ground' && !this.status.has('stun') && this.jumpBuffer <= 0) {
      const can = this.c.sword && !(cmd.ult && this.canUlt());
      if (can && cmd.skill && this.skill3Ready) { this.startFangSkill(3); this.status.update(dt); return; }
      if (can && cmd.skill && this.skillCooldown <= 0) { this.startFangSkill(1); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill4Ready) { this.startFangSkill(4); this.status.update(dt); return; }
      if (can && cmd.skill2 && this.skill2Cooldown <= 0) { this.startFangSkill(2); this.status.update(dt); return; }
    }
    if (cmd.skill || cmd.skill2) cmd = { ...cmd, skill: false, skill2: false };
    super.update(dt, cmd);
    if (this.nb) this.updateNeckBite(dt);
    this.legBats?.update(dt, this.timeNow);
  }

  // 今のスキルが敵を狙える向き
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

  foeIn(range) {
    const v = this.victim;
    const g = this.c.group;
    if (!v || !(v.state === 'ground' || v.state === 'hit' || v.state === 'down')) return false;
    return Math.hypot(v.c.group.position.x - g.position.x, v.c.group.position.z - g.position.z) < range * this.c.scale;
  }

  // ============================================================
  // 通常攻撃3: 首に噛みつき、つかんだまま肉を引きちぎる
  // ============================================================
  startNeckBite() {
    const v = this.victim;
    if (!v) return;
    const yaw = this.c.group.rotation.y;
    this.nb = { torn: false, dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)) };
    v.state = 'held';
    v.vx = v.vz = v.vy = 0;
    v.attackActive = false;
    v.c.animator.play('pummeled', 0.05);
    v.c.animator.jolt = 1;
    this.events.push({ type: 'fangNeckBite', dir: this.nb.dir.clone() });
  }

  updateNeckBite(dt) {
    const v = this.victim;
    const nb = this.nb;
    if (this.state !== 'attack' || !v || v.state !== 'held') { this.nb = null; return; }
    const t = this.attackT;
    // 噛みつかれている間は、目の前で動けない。引きちぎられる瞬間にぶるぶる震える
    this.holdFoe(nb.dir, 1.8, 0.25);
    if (t > 0.46 && t < 0.66) v.c.animator.jolt = Math.max(v.c.animator.jolt, 0.5 + 0.5 * Math.sin(t * 90));
    if (!nb.torn && t >= 0.68) {
      nb.torn = true;
      this.nb = null;
      v.state = 'ground';
      v.hit(nb.dir.x, nb.dir.z, 2);
      this.events.push({ type: 'fangTear', dir: nb.dir.clone() });
    }
  }

  // 敵を目の前に保つ
  holdFoe(dir, dist, jolt = 0.25) {
    const v = this.victim;
    const g = this.c.group;
    const S = this.c.scale;
    const vg = v.c.group;
    vg.position.set(g.position.x + dir.x * (dist + jolt * v.c.animator.jolt) * S, 0, g.position.z + dir.z * (dist + jolt * v.c.animator.jolt) * S);
    vg.rotation.y = Math.atan2(-dir.x, -dir.z);
  }

  // ============================================================
  // ジャンプ攻撃: かぎ爪を3つ
  // ============================================================
  startAirClaws() {
    const { animator } = this.c;
    this.fa = { t: 0, fired: [false, false, false] };
    this.airCd = FANG_AIR.cooldown;
    animator.attackT = 0;
    animator.play('attackFAir', 0.05);
    this.events.push({ type: 'fangAirStart' });
  }

  updateAirClaws(dt) {
    const { animator } = this.c;
    const fa = this.fa;
    if (this.state !== 'air') { this.fa = null; animator.trailOn = false; return; }
    fa.t += dt;
    const f = Math.min(1, fa.t / FANG_AIR.duration);
    animator.attackT = f;
    FANG_AIR.shots.forEach((at, i) => {
      if (!fa.fired[i] && f >= at) { fa.fired[i] = true; this.events.push({ type: 'fangAirClaw', k: i }); }
    });
    animator.trailOn = FANG_AIR.shots.some((at) => f > at - 0.1 && f < at + 0.06);
    if (f >= 1) { this.fa = null; animator.trailOn = false; animator.play('air', 0.1); }
  }

  // ============================================================
  // スキルの共通部分
  // ============================================================
  startFangSkill(n) {
    const { animator } = this.c;
    this.bs = { n, phase: 'init', t: 0, k: 0, fired: false };
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

  updateFangSkill(dt) {
    this.legBats?.update(dt, this.timeNow);
    switch (this.bs.n) {
      case 1: this.updateSkill1(dt); break;
      case 3: this.updateSkill3(dt); break;
      case 2: this.updateSkill2(dt); break;
      default: this.updateSkill4(dt); break;
    }
  }

  // 見た目を元に戻す（変身・爪の赤・分身・足の蝙蝠）
  restoreVisual() {
    const c = this.c;
    c.group.visible = true;
    c.joints.lHip.visible = c.joints.rHip.visible = true;
    c.group.position.y = 0;
    c.group.rotation.x = 0; c.group.rotation.z = 0;
    this.legBats?.show(false);
    if (this.bigBat) this.bigBat.visible = false;
    if (this.clones) for (const cl of this.clones) cl.group.visible = false;
    c.claws.userData.setRed(0);
    c.clawsL.userData.setRed(0);
    c.setTint(0xff1030, 0);
    c.animator.trailOn = false;
  }

  // スキルを途中でやめる（被弾など）
  cancelFang() {
    if (this.nb) { this.releaseFoe(); this.nb = null; }
    if (this.fa) { this.fa = null; this.c.animator.trailOn = false; }
    if (!this.bs) return;
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreVisual();
    this.bs = null;
    if (n === 1) { this.skillCooldown = FSKILL1.cooldown; this.skill3Ready = false; }
    if (n === 2 || n === 4) { this.skill2Cooldown = FSKILL2.cooldown; this.skill4Ready = false; }
    if (n === 3) this.skill3Ready = false;
    this.events.push({ type: 'fangCancel' });
  }

  hit(dx, dz, power) { this.cancelFang(); super.hit(dx, dz, power); }
  launch(dx, dz, speed, up) { this.cancelFang(); super.launch(dx, dz, speed, up); }

  releaseFoe() {
    const v = this.victim;
    if (v && v.state === 'held') { v.state = 'ground'; v.c.group.position.y = 0; }
  }

  endFangSkill() {
    const n = this.bs.n;
    this.releaseFoe();
    this.restoreVisual();
    this.bs = null;
    this.state = 'ground';
    this.vx = this.vz = 0;
    if (n === 1) { this.skillCooldown = FSKILL1.cooldown; this.skill3Ready = true; }          // ボタンがスキル3に変わる
    else if (n === 3) { this.skill3Ready = false; }
    else if (n === 2) { this.skill2Cooldown = FSKILL2.cooldown; this.skill4Ready = true; }   // ボタンがスキル4に変わる
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

  // ============================================================
  // スキル1: 爪を赤く染めて薙ぎ払い、赤い斬撃を3つ飛ばす
  // ============================================================
  beginSkill1() {
    this.bs.phase = 'redden';
    this.c.animator.play('fangRaise', 0.1);
    this.events.push({ type: 'fangSkill1Start' });
    this.events.push({ type: 'fangRedden' });
  }

  updateSkill1(dt) {
    const { group, animator } = this.c;
    const K = FSKILL1;
    const b = this.bs;
    b.t += dt;
    group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-14 * dt));
    if (b.phase === 'redden') {
      animator.attackT = Math.min(1, b.t / K.redden);
      const red = Math.min(1, b.t / (K.redden * 0.8));
      this.claws.userData.setRed(red);
      this.c.clawsL.userData.setRed(red);
      if (b.t >= K.redden) { b.phase = 'sweep'; b.t = 0; b.k = 0; b.fired = false; animator.attackT = 0; animator.play('fangSweep1', 0.05); }
    } else if (b.phase === 'sweep') {
      const f = Math.min(1, b.t / K.sweepTime);
      animator.attackT = f;
      animator.trailOn = f > 0.15 && f < 0.75;
      if (!b.fired && f >= 0.4) { b.fired = true; this.events.push({ type: 'fangShot', k: b.k, kind: 's1', tilt: b.k === 0 ? -0.75 : b.k === 1 ? 0.75 : 0.05 }); }
      if (f >= 1) {
        b.k++;
        b.t = 0;
        b.fired = false;
        if (b.k >= K.sweeps) { b.phase = 'recover'; animator.trailOn = false; animator.play('fight', 0.15); }
        else { animator.attackT = 0; animator.play(b.k === 1 ? 'fangSweep2' : 'fangSweep3', 0.03); }
      }
    } else {
      this.claws.userData.setRed(Math.max(0, 1 - b.t / K.recover));
      this.c.clawsL.userData.setRed(Math.max(0, 1 - b.t / K.recover));
      if (b.t >= K.recover) this.endFangSkill();
    }
  }

  // ============================================================
  // スキル2: 巨大蝙蝠になって前へ突進
  // ============================================================
  ensureBigBat() {
    if (!this.bigBat) {
      this.bigBat = createBigBat();
      this.bigBat.visible = false;
      this.c.group.parent.add(this.bigBat);
    }
    return this.bigBat;
  }

  placeBigBat(pitch = 0) {
    const bat = this.bigBat;
    const g = this.c.group;
    const S = this.c.scale;
    bat.position.set(g.position.x, g.position.y + 3.0 * S, g.position.z);
    bat.rotation.set(pitch, g.rotation.y, 0, 'YXZ');
    bat.scale.setScalar(S * 1.45);
    bat.userData.flap(this.timeNow);
  }

  beginSkill2() {
    const b = this.bs;
    b.phase = 'morph';
    b.hasTarget = this.foeIn(FSKILL2.range);
    this.c.animator.play('fangMorph', 0.08);
    this.events.push({ type: 'fangSkill2Start' });
    this.events.push({ type: 'fangMorph' });
  }

  updateSkill2(dt) {
    const { group, animator, scale: S } = this.c;
    const K = FSKILL2;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.phase === 'morph') {
      group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-16 * dt));
      animator.attackT = Math.min(1, b.t / K.morph);
      if (b.t >= K.morph) {
        // 蝙蝠になる: 本体を消して、巨大蝙蝠が現れる
        group.visible = false;
        this.ensureBigBat().visible = true;
        this.placeBigBat();
        b.phase = 'charge'; b.t = 0;
        b.dir = new THREE.Vector3(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
        b.dist = 0;
        b.hit = false;
        this.events.push({ type: 'fangBatOn' });
      }
    } else if (b.phase === 'charge') {
      // 相手の方へゆるく向きを変えながら、一直線に突っ込む
      if (!b.hit && this.foeIn(K.range * 1.4)) {
        _a.set(v.c.group.position.x - group.position.x, 0, v.c.group.position.z - group.position.z).normalize();
        b.dir.lerp(_a, Math.min(1, 5 * dt)).normalize();
      }
      const step = K.speed * S * dt;
      group.position.addScaledVector(b.dir, step);
      b.dist += step;
      group.rotation.y = Math.atan2(b.dir.x, b.dir.z);
      this.clampToArena();
      this.placeBigBat(0.12);
      if (!b.hit && v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
        const d = Math.hypot(v.c.group.position.x - group.position.x, v.c.group.position.z - group.position.z);
        if (d < K.hitR * S) {
          b.hit = true;
          b.t = 0;
          v.launch(b.dir.x, b.dir.z, K.launchSpeed, K.launchUp);
          this.events.push({ type: 'fangBatHit', dir: b.dir.clone() });
        }
      }
      // 当たったあとも、少し進んで止まる
      if ((b.hit && b.t > 0.1) || b.dist >= K.maxDist * S || (this.bounds && this.atWall())) {
        b.phase = 'revert'; b.t = 0;
        group.visible = true;
        this.bigBat.visible = false;
        animator.attackT = 0;
        animator.play('fangLand', 0.05);
        this.events.push({ type: 'fangBatOff' });
      }
    } else {
      animator.attackT = Math.min(1, b.t / K.revert);
      if (b.t >= K.revert) this.endFangSkill();
    }
  }

  atWall() {
    const b = this.bounds;
    const g = this.c.group.position;
    return g.x <= b.minX + 0.25 || g.x >= b.maxX - 0.25 || g.z <= b.minZ + 0.25 || g.z >= b.maxZ - 0.25;
  }

  // ============================================================
  // スキル3: 蝙蝠の大群になって弾け、小さな分身がそれぞれ攻撃する
  // ============================================================
  ensureClones() {
    if (this.clones) return this.clones;
    const parent = this.c.group.parent;
    this.clones = [];
    for (let i = 0; i < FSKILL3.clones; i++) {
      const cl = createCharacter({ name: 'FangClone', shirt: 0x1e88e5, pants: 0x2e3a4b, hair: 0x4a2c17, hairStyle: 'short', face: 'smile', sleeves: 'short', scale: this.c.scale * FSKILL3.size });
      cl.setWeapon('fang');
      cl.setTint(0xff1030, 0.3);
      cl.group.visible = false;
      cl.animator.play('fight', 0);
      parent.add(cl.group);
      parent.add(cl.trailFang.mesh);
      this.clones.push(cl);
    }
    return this.clones;
  }

  beginSkill3() {
    const b = this.bs;
    const g = this.c.group;
    const S = this.c.scale;
    b.phase = 'burst';
    this.ensureClones();
    // 分身が出る位置: 相手のまわり（相手がいなければ、前方）
    const v = this.victim;
    const near = this.foeIn(FSKILL3.range);
    b.center = near ? v.c.group.position.clone() : new THREE.Vector3(g.position.x + Math.sin(g.rotation.y) * 9 * S, 0, g.position.z + Math.cos(g.rotation.y) * 9 * S);
    b.base = Math.random() * Math.PI * 2;
    b.hasTarget = near;
    b.cl = this.clones.map((cl, i) => ({ cl, state: 'wait', t: 0, ang: b.base + (i / FSKILL3.clones) * Math.PI * 2, hit: false }));
    this.c.animator.play('fangMorph', 0.08);
    this.events.push({ type: 'fangSkill3Start' });
  }

  updateSkill3(dt) {
    const { group, animator, scale: S } = this.c;
    const K = FSKILL3;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.hasTarget && v && b.phase !== 'gather') b.center.set(v.c.group.position.x, 0, v.c.group.position.z);
    if (b.phase === 'burst') {
      animator.attackT = Math.min(1, b.t / K.burst);
      if (!b.fired && b.t >= K.burst * 0.45) {
        // 蝙蝠の大群になって弾ける: 本体は消え、分身が現れる
        b.fired = true;
        group.visible = false;
        b.cl.forEach((c, i) => {
          const cl = c.cl;
          cl.group.visible = true;
          cl.group.position.set(b.center.x + Math.sin(c.ang) * 7 * S, 0, b.center.z + Math.cos(c.ang) * 7 * S);
          cl.group.rotation.y = Math.atan2(b.center.x - cl.group.position.x, b.center.z - cl.group.position.z);
          cl.animator.play('fight', 0);
          this.events.push({ type: 'fangCloneAppear', i, x: cl.group.position.x, z: cl.group.position.z });
        });
        this.events.push({ type: 'fangBurst' });
      }
      if (b.t >= K.burst) { b.phase = 'swarm'; b.t = 0; }
    } else if (b.phase === 'swarm') {
      let done = 0;
      b.cl.forEach((c, i) => {
        const cl = c.cl;
        const start = i * K.gap;
        const ct = b.t - start;
        const g = cl.group;
        const fx = b.center.x, fz = b.center.z;
        const stand = _a.set(fx + Math.sin(c.ang) * 3.2 * S, 0, fz + Math.cos(c.ang) * 3.2 * S); // 敵の前に立つ位置
        const ring = _b.set(fx + Math.sin(c.ang) * 7 * S, 0, fz + Math.cos(c.ang) * 7 * S);
        if (ct < 0) { // 待機: 敵のまわりをうかがう
          g.position.copy(ring);
          g.rotation.y = Math.atan2(fx - g.position.x, fz - g.position.z);
          return;
        }
        if (ct < K.dash) { // 飛びかかり
          g.position.lerpVectors(ring, stand, smooth(ct / K.dash));
          g.rotation.y = Math.atan2(fx - g.position.x, fz - g.position.z);
          cl.animator.play('fight', 0.05);
        } else if (ct < K.dash + K.slash) { // 爪の薙ぎ払い
          g.position.copy(stand);
          g.rotation.y = Math.atan2(fx - g.position.x, fz - g.position.z);
          const f = (ct - K.dash) / K.slash;
          cl.animator.play('attackF2', 0.03);
          cl.animator.attackT = f;
          cl.animator.trailOn = f > 0.25 && f < 0.7;
          if (!c.hit && f >= 0.46) {
            c.hit = true;
            const final = i === K.clones - 1;
            const dx = fx - g.position.x, dz = fz - g.position.z;
            const d = Math.hypot(dx, dz) || 1;
            this.events.push({ type: 'fangCloneHit', i, final, dir: new THREE.Vector3(dx / d, 0, dz / d) });
            if (v) { v.c.animator.jolt = 1; v.c.animator.joltSide = i % 2 ? 1 : -1; }
            if (final && v && (v.state === 'ground' || v.state === 'hit')) v.hit(dx / d, dz / d, 2);
          }
        } else {
          g.position.copy(stand);
          cl.animator.trailOn = false;
          done++;
        }
        cl.animator.locoTarget = 0;
      });
      if (done >= K.clones && b.t > (K.clones - 1) * K.gap + K.dash + K.slash + K.hold) {
        b.phase = 'gather'; b.t = 0;
        this.events.push({ type: 'fangGather' });
        b.cl.forEach((c) => { c.cl.animator.trailOn = false; });
      }
    } else { // 蝙蝠に戻って、本体へ集まる
      if (!b.fired2 && b.t > 0.08) {
        b.fired2 = true;
        for (const c of b.cl) c.cl.group.visible = false;
      }
      if (b.t >= K.gather) {
        group.visible = true;
        animator.attackT = 0;
        animator.play('fangLand', 0.05);
        this.events.push({ type: 'fangRejoin' });
        this.endFangSkill();
      }
    }
    for (const c of b.cl) c.cl.update(dt);
    if (b.phase === 'gather') animator.attackT = Math.min(1, b.t / K.gather);
  }

  // ============================================================
  // スキル4: 足だけを蝙蝠にして宙に浮き、回転しながら薙ぎ払う
  // ============================================================
  beginSkill4() {
    const b = this.bs;
    b.phase = 'legs';
    b.hasTarget = this.foeIn(FSKILL4.range);
    if (!this.legBats) { this.legBats = new LegBats(); this.legBats.attach(this.c.joints.hips); }
    this.c.animator.play('fangMorph', 0.08);
    this.events.push({ type: 'fangSkill4Start' });
  }

  updateSkill4(dt) {
    const { group, animator, scale: S } = this.c;
    const K = FSKILL4;
    const b = this.bs;
    const v = this.victim;
    b.t += dt;
    if (b.phase === 'legs') {
      group.rotation.y += angleDiff(this.aimAtFoe(K.range), group.rotation.y) * (1 - Math.exp(-14 * dt));
      animator.attackT = Math.min(1, b.t / K.legs);
      if (!b.fired && b.t >= K.legs * 0.5) {
        b.fired = true;
        this.c.joints.lHip.visible = this.c.joints.rHip.visible = false;
        this.legBats.show(true);
        this.events.push({ type: 'fangLegsOn' });
      }
      if (b.t >= K.legs) {
        b.phase = 'spin'; b.t = 0; b.k = 0;
        b.yaw0 = group.rotation.y;
        animator.play('fangSpin', 0.1);
        animator.trailOn = true;
        this.events.push({ type: 'fangSpinStart' });
      }
    } else if (b.phase === 'spin') {
      const f = Math.min(1, b.t / K.spin);
      group.rotation.y = b.yaw0 + smooth(f * 0.6 + 0.4 * f) * K.turns * Math.PI * 2;
      // 相手へ近づきながら回る（相手の手前で止まる）
      if (v && this.foeIn(K.range)) {
        const dx = v.c.group.position.x - group.position.x;
        const dz = v.c.group.position.z - group.position.z;
        const d = Math.hypot(dx, dz);
        const stop = 5 * S;
        if (d > stop) { const s = Math.min(d - stop, K.speed * S * dt); group.position.x += (dx / d) * s; group.position.z += (dz / d) * s; this.clampToArena(); }
      }
      // 薙ぎ払いが当たる
      const hitT = K.hitAt + b.k * K.hitGap;
      if (b.k < K.hits && b.t >= hitT) {
        const final = b.k === K.hits - 1;
        const k = b.k++;
        if (this.foeIn(K.hitR) && v) {
          const dx = v.c.group.position.x - group.position.x;
          const dz = v.c.group.position.z - group.position.z;
          const d = Math.hypot(dx, dz) || 1;
          const dir = new THREE.Vector3(dx / d, 0, dz / d);
          this.events.push({ type: 'fangSpinHit', k, final, dir });
          v.c.animator.jolt = 1;
          v.c.animator.joltSide = k % 2 ? 1 : -1;
          if (final) v.launch(dir.x, dir.z, K.launchSpeed, K.launchUp);
        } else {
          this.events.push({ type: 'fangSpinSwing', k });
        }
      }
      if (f >= 1) {
        b.phase = 'end'; b.t = 0;
        animator.trailOn = false;
        group.rotation.y = b.yaw0 + K.turns * Math.PI * 2;
        this.c.joints.lHip.visible = this.c.joints.rHip.visible = true;
        this.legBats.show(false);
        animator.attackT = 0;
        animator.play('fangLand', 0.06);
        this.events.push({ type: 'fangLegsOff' });
      }
    } else {
      animator.attackT = Math.min(1, b.t / K.end);
      if (b.t >= K.end) this.endFangSkill();
    }
  }

  // ============================================================
  // 必殺技: 赤い宝石を投げつける → ドラキュラ城のムービー
  // ============================================================
  ensureGem() {
    if (this.gem) return this.gem;
    const g = createGem();
    g.scale.setScalar(0.7);
    g.position.set(0, -0.15, 0.1);
    g.visible = false;
    this.c.joints.lWrist.add(g);
    this.gem = g;
    return g;
  }

  canUlt() {
    const v = this.victim;
    if (!this.c.sword || !this.gauge.full || !v) return false;
    if (v.state !== 'ground' && v.state !== 'hit' && v.state !== 'down') return false;
    return Math.hypot(v.c.group.position.x - this.c.group.position.x, v.c.group.position.z - this.c.group.position.z) < ULTF.range * this.c.scale;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.ensureGem();
    this.cancelFang();
    this.ult = { phase: 'draw', t: 0, shown: false, released: false, hit: false, fly: null, timeScale: 1, saved: null, fired: {}, tint: 0, gemGlow: 0 };
    this.state = 'ult';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('batBallDraw', 0.1);
    this.events.push({ type: 'ultStart' });
  }

  updateUlt(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    u.t += dt;
    const K = ULTF;
    if (u.phase === 'draw' || u.phase === 'throw') {
      group.rotation.y += angleDiff(Math.atan2(vg.position.x - group.position.x, vg.position.z - group.position.z), group.rotation.y) * (1 - Math.exp(-14 * dt));
    }
    if (u.phase === 'draw') {
      animator.attackT = Math.min(1, u.t / K.draw);
      this.gem.userData.setGlow(0.25 + 0.4 * animator.attackT, this.timeNow);
      if (!u.shown && animator.attackT >= 0.3) { u.shown = true; this.gem.visible = true; this.events.push({ type: 'ultBallDraw' }); }
      if (u.t >= K.draw) { u.phase = 'throw'; u.t = 0; animator.attackT = 0; animator.play('batPitchL', 0.08); }
    } else if (u.phase === 'throw') {
      const f = Math.min(1, u.t / K.throwTime);
      animator.attackT = f;
      this.gem.userData.setGlow(0.7, this.timeNow);
      if (!u.released && f >= K.release) {
        u.released = true;
        group.parent.attach(this.gem);
        u.fly = { t: 0, from: this.gem.position.clone() };
        this.events.push({ type: 'ultThrow' });
      }
      if (u.released && !u.hit) {
        u.fly.t += dt;
        const k = Math.min(1, u.fly.t / K.flight);
        _b.set(vg.position.x, vg.position.y + 3.0 * S, vg.position.z);
        _a.lerpVectors(u.fly.from, _b, k);
        this.gem.position.copy(_a);
        this.gem.rotation.y += dt * 18;
        if (k >= 1) {
          // 命中: 宝石が胸に当たり、敵はふらふらになる
          u.hit = true;
          u.phase = 'freeze';
          u.t = 0;
          this.gem.visible = false;
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

  // 画面が切り替わる: 自分と相手を、ドラキュラ城へ移す。本体は蝙蝠の大群が集まるまで姿を見せない
  startUltCine() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTF;
    u.saved = { px: group.position.x, pz: group.position.z, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    u.phase = 'cine';
    u.t = 0;
    group.position.set(K.player.x, 0, K.player.z);
    group.rotation.set(0, Math.PI / 2, 0);
    group.visible = false;
    vg.position.set(K.foe.x, 0, K.foe.z);
    vg.rotation.set(0, -Math.PI / 2 + 0.2, 0);
    animator.play('fight', 0.01);
    v.status.remove('stun');
    v.c.animator.play('lookAround', 0.01);
    u.flung = null;
    u.appeared = false;
    // 宝石は、本体の手元へ戻しておく（光らせるのは、本体が現れてから）
    this.c.joints.lWrist.add(this.gem);
    this.gem.position.set(0, -0.15, 0.1);
    this.gem.quaternion.identity();
    this.gem.visible = false;
    this.events.push({ type: 'ultCineStart' });
  }

  updateUltCine(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const K = ULTF;
    const T = u.t;
    const fire = (name, at, extra = {}) => { if (T >= at && !u.fired[name]) { u.fired[name] = true; this.events.push({ type: name, ...extra }); return true; } return false; };
    fire('ultTitle', K.tTitle);
    fire('ultSwarm', K.tSwarm);
    // 敵: 「ここはどこだ」とあたふたして見回している。本体が現れたら、凍りつく
    vg.rotation.x = 0;
    if (T < K.tAppear) {
      v.c.animator.play('lookAround', 0.1);
    }
    // 本体が現れる
    if (T >= K.tAppear && !u.appeared) {
      u.appeared = true;
      group.visible = true;
      animator.play('fangLand', 0.01);
      v.c.animator.play('stunned', 0.1);
      this.events.push({ type: 'ultAppear' });
    }
    if (T >= K.tAppear && T < K.tGem) {
      animator.attackT = Math.min(1, (T - K.tAppear) / 0.7);
      if (animator.attackT >= 1) animator.play('fight', 0.2);
    }
    // 宝石が手に現れて光る
    if (T >= K.tGem && T < K.tBerserk) {
      if (fire('ultGem', K.tGem)) { this.gem.visible = true; animator.play('batBallDraw', 0.15); }
      animator.attackT = 0.55 + 0.45 * smooth((T - K.tGem) / 0.5);
      u.gemGlow = smooth((T - K.tGem) / (K.tBerserk - K.tGem));
    }
    // 凶暴化: 赤く光り、背を丸めて咆哮
    if (T >= K.tBerserk && T < K.tDash) {
      if (fire('ultBerserk', K.tBerserk)) animator.play('fangBerserk', 0.1);
      const f = (T - K.tBerserk) / (K.tDash - K.tBerserk);
      animator.attackT = f;
      u.gemGlow = 1;
      u.tint = smooth(f * 1.4);
      this.claws.userData.setRed(Math.min(1, f * 2));
      this.c.clawsL.userData.setRed(Math.min(1, f * 2));
    }
    // 飛びかかって、重い牙の一撃
    if (T >= K.tDash && T < K.tBite + 0.4) {
      if (fire('ultDash', K.tDash)) { animator.play('attackFStrike', 0.06); this.gem.visible = false; }
      const f = Math.min(1, (T - K.tDash) / K.dash);
      const bite = _a.set(vg.position.x - 2.2 * S, 0, vg.position.z);
      group.position.set(K.player.x + (bite.x - K.player.x) * smooth(f), 0, K.player.z + (bite.z - K.player.z) * smooth(f));
      animator.attackT = T < K.tBite ? 0.5 * Math.min(1, (T - K.tDash) / (K.tBite - K.tDash)) : Math.min(1, 0.5 + 0.5 * (T - K.tBite) / 0.4);
      u.gemGlow = 1;
    }
    if (T >= K.tBite && !u.fired.ultBite) {
      u.fired.ultBite = true;
      u.flung = { t: 0 };
      u.tint = 1;
      this.events.push({ type: 'ultBite', dir: new THREE.Vector3(1, 0, 0) });
    }
    // 最後はスローモーション
    u.timeScale = T > K.tBite - 0.3 && T < K.tBite + 0.45 ? K.slowmo : 1;
    // 敵: 噛まれて吹き飛ぶ
    if (u.flung) {
      u.flung.t += dt;
      const t = u.flung.t;
      vg.position.set(K.foe.x + 4.5 * t, Math.max(0.06, 2.4 * t - 3.2 * t * t + 0.3), K.foe.z);
      vg.rotation.set(-Math.min(1.5, t * 4), -Math.PI / 2 + 0.2, 0);
      if (v.c.animator.name !== 'thrown') v.c.animator.play('thrown', 0.05);
      if (vg.position.y <= 0.07 && t > 0.2) u.flung.t = 99;
    }
    // 凶暴化の余韻: 少しずつ静まる
    if (T > K.tBite + 0.6) {
      if (animator.name !== 'fight') animator.play('fight', 0.5);
      u.tint = Math.max(0, u.tint - dt * 0.6);
      u.gemGlow = 0;
    }
    this.c.setTint(0xff1030, u.tint);
    if (this.gem.visible) this.gem.userData.setGlow(u.gemGlow, this.timeNow);
    if (T >= ULTF_END) this.endUlt();
  }

  endUlt() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const sv = u.saved;
    this.restoreVisual();
    this.gem.visible = false;
    this.c.joints.lWrist.add(this.gem);
    this.gem.position.set(0, -0.15, 0.1);
    this.gem.quaternion.identity();
    group.position.set(sv.px, 0, sv.pz);
    group.rotation.set(0, sv.yaw, 0);
    animator.play('fight', 0.01);
    this.state = 'ground';
    this.vx = this.vz = 0;
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
}
