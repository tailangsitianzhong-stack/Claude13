import * as THREE from 'three';
import { DAMAGE } from '../character/Health.js';
import { createKnife } from '../character/Chainsaw.js';
import { SSKILL1 } from '../character/ChainsawController.js';

// チェンソーの演出とダメージ（通常攻撃の血しぶき、首への刺しつけ、ナイフ、振り下ろしの地割れ、飛び蹴り、連続斬り、出血）。
// コントローラが出すイベント（saw...）を受けて、ダメージ・吹っ飛ばし・状態異常・演出を行う。必殺技のムービーは ChainsawUltimate が受け持つ。
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const BLOOD = [0.0, 0.9, 0.38, 0.2]; // 血しぶきの色（hue, sat, lightness, range）
const BLEED_TIME = 5;
const BLEED_TICK = 0.5;

export class ChainsawDirector {
  // ctx: { scene, camera, impact, sparks, fx, p1, p2, dummy, stage, getPlayer, groundCracks, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    // ナイフ（先に作っておく: 試合中に作ると重くなる）
    this.knives = [];
    for (let i = 0; i < 3; i++) { const k = createKnife(); k.scale.setScalar(0.18); k.visible = false; ctx.scene.add(k); this.knives.push({ m: k, t: 0, dur: 0.2, from: new THREE.Vector3(), to: new THREE.Vector3(), has: false, live: false }); }
    this.bleedFx = 0;
  }

  get player() { return this.ctx.getPlayer(); }

  foeChest(out) { const { p2, p1 } = this.ctx; return out.set(p2.group.position.x, p2.group.position.y + 3.0 * p1.scale, p2.group.position.z); }
  blood(at, dir, n, size, speed) { this.ctx.sparks.burst(at, dir, n, size, speed, BLOOD[0], BLOOD[1], BLOOD[2], BLOOD[3]); }

  // 通常攻撃を振った（斬り始め）: 火花が走る
  onSwing(e) {
    const { p1, sparks, fx } = this.ctx;
    fx.zoom(e.index === 2 ? 40 : 30);
    const saw = p1.chainsaw;
    saw.updateWorldMatrix(true, false);
    v.copy(saw.userData.tip).applyMatrix4(saw.matrixWorld);
    sparks.burst(v, w.set(0, 0, 0), 5, p1.height * 0.04, p1.height * 2, 0.1, 0.8, 0.6, 0.3);
  }

  // 通常攻撃が当たった（main の checkHit から）: 血しぶき
  onHit(index) {
    const { p2, p1 } = this.ctx;
    this.foeChest(v);
    w.set(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
    this.blood(v, w, index === 1 ? 16 : 12, p2.height * 0.05, p2.height * 3.4);
  }

  // ---- イベント ----
  onEvent(e) {
    const { impact, sparks, fx, p1, p2, hooks, dummy } = this.ctx;
    const H = p2.height;
    switch (e.type) {
      case 'sawStart':
        impact.flash(v.set(p1.group.position.x, p1.height * 0.5, p1.group.position.z), p1.height * 1.2, 0.12);
        fx.shake(0.18);
        break;
      case 'sawSkill1Start': case 'sawSkill2Start': case 'sawSkill3Start': case 'sawSkill4Start': fx.zoom(-40); break;
      // 通常2: 首に刺す
      case 'sawStabStart':
        hooks.hitStop(0.1);
        fx.zoom(-160); fx.shake(0.5);
        this.foeChest(v);
        this.blood(v, e.dir, 14, H * 0.05, H * 3.4);
        impact.flash(v, H * 2.2, 0.16);
        break;
      case 'sawStabTick': {
        this.foeChest(v);
        v.y += H * 0.12;
        hooks.damage(DAMAGE.sawStabTick, v, '');
        hooks.flashFoe(0.03);
        fx.shake(0.22);
        fx.kick((Math.random() - 0.5) * 0.6, 0.1, -0.25);
        this.blood(v, e.dir, 5, H * 0.045, H * 2.6);
        sparks.burst(v, w.set(0, 0, 0), 2, H * 0.035, H * 1.8, 0.1, 0.8, 0.6, 0.3);
        break;
      }
      case 'sawStabEnd':
        hooks.hitStop(0.12);
        fx.shake(0.8); fx.zoom(-120);
        this.foeChest(v);
        this.blood(v, e.dir, 22, H * 0.06, H * 4.2);
        impact.flash(v, H * 2.6, 0.2);
        impact.ring(p2.group.position, H * 1.6, 0.35);
        break;
      // スキル1: ナイフ → 振り下ろし
      case 'sawKnife': this.throwKnife(e); break;
      case 'sawRaise': fx.zoom(-80); fx.kick(0, 0.4, 0.4); break;
      case 'sawSlam': this.slam(e); break;
      // スキル2: 飛び蹴り
      case 'sawKickStart': fx.zoom(220); fx.kick(0, 0.1, 1.6); fx.shake(0.4); impact.ring(p1.group.position, p1.height * 2, 0.35); break;
      case 'sawKickHit': {
        const d = w.set(e.dir.x, 0, e.dir.z).clone();
        dummy.launch(d.x, d.z, 62, 14);
        this.foeChest(v);
        hooks.damage(DAMAGE.sawKick, v, 'big');
        hooks.hitStop(0.16); hooks.flashFoe(0.14);
        fx.shake(0.9); fx.zoom(-230); fx.kick(0, 0.3, -1.4);
        impact.flash(v, H * 3, 0.22);
        impact.streak(v, d, this.ctx.camera, H * 2.8, 0.2);
        impact.ring(p2.group.position, H * 2, 0.4);
        this.blood(v, d, 24, H * 0.065, H * 4.4);
        sparks.burst(v, d, 10, H * 0.05, H * 3.6, 0.1, 0.8, 0.6, 0.3);
        break;
      }
      // スキル3: 連続斬り → 出血
      case 'sawArmSlash': {
        if (!e.hit) { fx.zoom(40); break; }
        this.foeChest(v);
        v.y += (Math.random() - 0.5) * H * 0.25;
        v.x += (Math.random() - 0.5) * H * 0.3;
        hooks.damage(DAMAGE.sawArm, v, '');
        hooks.hitStop(0.045); hooks.flashFoe(0.05);
        fx.shake(0.3); fx.kick((e.k % 2 ? 1 : -1) * 0.5, 0.1, -0.3); fx.zoom(-50);
        w.set(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
        this.blood(v, w, 7, H * 0.05, H * 3);
        sparks.burst(v, w, 3, H * 0.04, H * 2.4, 0.1, 0.8, 0.6, 0.3);
        impact.flash(v, H * 1.4, 0.1);
        dummy.c.animator.jolt = 1; dummy.c.animator.joltSide = e.k % 2 ? 1 : -1;
        break;
      }
      case 'sawBleed':
        if (!e.hit) break;
        this.foeChest(v);
        hooks.damage(DAMAGE.sawArmFinal, v, 'big');
        dummy.status.apply('bleed', BLEED_TIME);                     // 出血
        this.bleedAcc = 0;
        hooks.hitStop(0.12); hooks.flashFoe(0.1);
        fx.shake(0.7); fx.zoom(-160);
        w.set(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
        this.blood(v, w, 26, H * 0.06, H * 4.4);
        impact.flash(v, H * 2.6, 0.2);
        impact.ring(p2.group.position, H * 1.8, 0.35);
        break;
      case 'sawGear':
        impact.ring(w.set(p1.group.position.x, 0.03, p1.group.position.z), p1.height * 1.8, 0.4);
        sparks.burst(w.set(p1.group.position.x, 0.1, p1.group.position.z), v.set(0, 0, 0), 14, p1.height * 0.05, p1.height * 2.4, 0.08, 0.9, 0.55, 0.3);
        fx.shake(0.3); fx.zoom(60);
        break;
      // 必殺技のダメージ（ムービーの舞台の演出は ChainsawUltimate）
      case 'sawUltCut': {
        this.foeChest(v);
        v.x += (Math.random() - 0.5) * H * 0.4; v.y += (Math.random() - 0.5) * H * 0.4;
        hooks.damage(DAMAGE.sawUltCut, v, '');
        hooks.hitStop(0.03); hooks.flashFoe(0.04);
        w.set(Math.cos(e.a), 0, Math.sin(e.a)).negate();
        this.blood(v, w, 8, H * 0.05, H * 3.4);
        sparks.burst(v, w, 3, H * 0.04, H * 2.6, 0.1, 0.8, 0.6, 0.3);
        break;
      }
      case 'sawUltFinal':
        this.foeChest(v);
        hooks.damage(DAMAGE.sawUltFinal, v, 'huge');
        hooks.hitStop(0.3); hooks.flashFoe(0.25);
        this.blood(v, w.set(0, 0.3, 0), 44, H * 0.07, H * 5.6);
        impact.flash(v, H * 5, 0.4);
        impact.ring(p2.group.position, H * 4, 0.7);
        impact.ring(p2.group.position, H * 2.2, 0.45);
        break;
      default: break;
    }
  }

  // ナイフを投げる
  throwKnife(e) {
    const { p1, p2, impact, fx } = this.ctx;
    const k = this.knives.find((x) => !x.live) ?? this.knives[0];
    k.from.set(p1.group.position.x, p1.group.position.y + p1.height * 0.7, p1.group.position.z);
    k.from.x += e.dir.x * 2.5 * p1.scale; k.from.z += e.dir.z * 2.5 * p1.scale;
    if (e.hasTarget) this.foeChest(k.to); else k.to.set(k.from.x + e.dir.x * 30 * p1.scale, k.from.y, k.from.z + e.dir.z * 30 * p1.scale);
    k.has = e.hasTarget;
    k.t = 0;
    k.dur = Math.max(0.12, k.from.distanceTo(k.to) / (160 * p1.scale));
    k.live = true;
    k.m.visible = true;
    k.m.position.copy(k.from);
    k.m.lookAt(k.to);
    impact.flash(k.from, p1.height * 0.8, 0.1);
    fx.zoom(60);
    void p2;
  }

  // 振り下ろし: 叩きつけた地点で地割れ。まわりの相手を吹き飛ばす
  slam(e) {
    const { impact, sparks, fx, p1, p2, hooks, dummy, groundCracks } = this.ctx;
    const S = p1.scale;
    const R = SSKILL1.radius * S;
    groundCracks.start(e.x, e.z, R * 1.2);
    groundCracks.setCharge(1, performance.now() / 1000);
    groundCracks.burst(p1.height);
    hooks.groundBreak(e.x, e.z, R * 0.5);
    v.set(e.x, 0.03, e.z);
    impact.ring(v, R, 0.5);
    impact.ring(v, R * 0.65, 0.38);
    impact.flash(w.set(e.x, p1.height * 0.3, e.z), p1.height * 2.6, 0.2);
    sparks.burst(v, w.set(0, 0, 0), 18, p1.height * 0.075, p1.height * 2.4, 0.07, 0.5, 0.45, 0.25);
    sparks.burst(v, w.set(0, 0, 0), 10, p1.height * 0.05, p1.height * 3.2, 0.1, 0.9, 0.55, 0.3);
    fx.shake(0.8); fx.kick(0, -1.0, 0); fx.zoom(-110);
    hooks.hitStop(0.1);
    const dx = p2.group.position.x - e.x;
    const dz = p2.group.position.z - e.z;
    const dist = Math.hypot(dx, dz);
    const s = dummy.state;
    if (dist <= R && (s === 'ground' || s === 'hit' || s === 'down' || s === 'attack' || s === 'crouch' || s === 'land')) {
      const ox = p2.group.position.x - p1.group.position.x;
      const oz = p2.group.position.z - p1.group.position.z;
      dummy.launch(dist > 1e-4 ? dx : ox, dist > 1e-4 ? dz : oz, 40, 16);
      this.foeChest(v);
      hooks.damage(DAMAGE.sawSlam, v, 'big');
      hooks.flashFoe(0.14);
      impact.flash(v, p2.height * 2.4, 0.2);
      this.blood(v, w.set(dx, 0, dz).normalize(), 16, p2.height * 0.06, p2.height * 3.6);
    }
  }

  update(dt) {
    const { sparks, p2, dummy, hooks, p1 } = this.ctx;
    // ナイフ
    for (const k of this.knives) {
      if (!k.live) continue;
      k.t += dt;
      const u = Math.min(1, k.t / k.dur);
      k.m.position.lerpVectors(k.from, k.to, u);
      if (u >= 1) {
        k.live = false; k.m.visible = false;
        if (k.has && this.foeOk()) {
          this.foeChest(v);
          hooks.damage(DAMAGE.sawKnife, v, '');
          dummy.status.apply('stun', 1.1);          // 気をそらされて、ふらふら
          hooks.flashFoe(0.08); hooks.hitStop(0.06);
          this.ctx.fx.shake(0.3);
          this.blood(v, w.set(0, 0, 0), 8, p2.height * 0.045, p2.height * 2.6);
          this.ctx.impact.flash(v, p2.height * 1.6, 0.14);
        } else sparks.burst(k.to, w.set(0, 0, 0), 5, p1.height * 0.04, p1.height * 1.6, 0.1, 0.5, 0.6, 0.3);
      }
    }
    // 出血: 少しずつダメージ。血のしずくが落ちる
    if (dummy.status.has('bleed')) {
      this.bleedAcc = (this.bleedAcc ?? 0) + dt;
      this.bleedFx += dt;
      if (this.bleedFx > 0.12) {
        this.bleedFx = 0;
        v.set(p2.group.position.x + (Math.random() - 0.5) * 0.2, p2.group.position.y + p2.height * (0.4 + Math.random() * 0.4), p2.group.position.z + (Math.random() - 0.5) * 0.2);
        sparks.burst(v, w.set(0, 0, 0), 1, p2.height * 0.04, p2.height * 0.8, BLOOD[0], BLOOD[1], BLOOD[2], BLOOD[3]);
      }
      // ダメージは、main の bleedTick が 0.5 秒ごとに入れる（バトルモードでは、狙っていない相手の分も数える）
    } else this.bleedAcc = 0;
  }

  foeOk() { const s = this.ctx.dummy.state; return s === 'ground' || s === 'hit' || s === 'down' || s === 'attack' || s === 'crouch' || s === 'land' || s === 'air'; }
}
export { BLEED_TICK };
