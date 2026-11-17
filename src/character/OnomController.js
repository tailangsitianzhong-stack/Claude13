import * as THREE from 'three';
import { CharacterController, FINISHER } from './Controller.js';

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

// 必殺技の予定表（draw のあとの秒数）: ドカン×3 → ズドン → バンバン×10 → 最後のバンバン
export const ULTO = {
  range: 220,
  draw: 0.75,
  dokan: [0.2, 0.65, 1.1],
  zudon: 1.7, zudonFall: 0.4,
  banFrom: 2.75, banGap: 0.11, bans: 10,
  final: 4.1,
  end: 4.9,
};

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
    if (v.state !== 'ground' && v.state !== 'hit' && v.state !== 'down') return false;
    return Math.hypot(v.c.group.position.x - this.c.group.position.x, v.c.group.position.z - this.c.group.position.z) < ULTO.range * this.c.scale;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.cancelOnom();
    this.ult = { t: 0, timeScale: 1, fired: {}, held: false, saved: null };
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
    group.rotation.y += angleDiff(Math.atan2(vg.position.x - group.position.x, vg.position.z - group.position.z), group.rotation.y) * (1 - Math.exp(-14 * dt));
    const fire = (name, at, extra = {}) => { if (u.t >= at && !u.fired[name]) { u.fired[name] = true; this.events.push({ type: name, ...extra }); return true; } return false; };
    if (u.t < K.draw) {
      animator.attackT = Math.min(1, u.t / K.draw) * 0.75;
      return;
    }
    const T = u.t - K.draw;
    if (!u.held) {   // 相手は、その場で、攻撃を受け続ける
      u.held = true;
      v.state = 'held';
      v.vx = v.vz = v.vy = 0;
      v.attackActive = false;
      v.c.animator.play('stunned', 0.1);
      this.events.push({ type: 'onomUltBegin' });
    }
    animator.attackT = 0.55 + 0.12 * Math.abs(Math.sin(T * 14));
    K.dokan.forEach((at, k) => fire('onomUltDokan' + k, at, { k }));
    fire('onomUltZudon', K.zudon);
    for (let i = 0; i < K.bans; i++) fire('onomUltBan' + i, K.banFrom + i * K.banGap, { i });
    fire('onomUltFinal', K.final);
    if (T >= K.end) this.endUlt();
  }

  endUlt() {
    const { animator } = this.c;
    const v = this.victim;
    v.status.remove('stun');
    if (v.state === 'held') {
      v.state = 'ground';
      v.c.group.position.y = 0;
      const dx = v.c.group.position.x - this.c.group.position.x, dz = v.c.group.position.z - this.c.group.position.z;
      v.hit(dx, dz, 2);
    }
    animator.play('fight', 0.2);
    this.state = 'ground';
    this.vx = this.vz = 0;
    this.ult = null;
    this.events.push({ type: 'ultCineEnd' });   // KO が、必殺技の最中に決まっていたら、ここで KO にする
  }
}
