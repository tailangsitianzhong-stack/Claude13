import * as THREE from 'three';
import { createBall } from '../character/Bat.js';
import { DAMAGE } from '../character/Health.js';

// バット用の演出・ボールの飛行と命中。コントローラ（BatController）が出す bat* のイベントを受けて動かす。
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const dir = new THREE.Vector3();

const BALL = {
  normal: { speed: 80, range: 130, radius: 0.34, hitR: 2.2, color: null },
  metal: { speed: 150, range: 240, radius: 0.5, hitR: 2.8, color: 0.53 },
};

export class BatDirector {
  // ctx: { scene, camera, impact, sparks, fx, p1, p2, getPlayer, dummy, stage, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    this.pool = { normal: [], metal: [] };
    this.flying = [];   // 飛んでいるボール
    this.tosses = [];   // 放り上げたボール（打つ前）
    for (const kind of ['normal', 'metal']) {
      for (let i = 0; i < (kind === 'normal' ? 14 : 5); i++) {
        const m = createBall(kind === 'metal' ? 'metal' : 'ball');
        m.visible = false;
        ctx.scene.add(m);
        this.pool[kind].push(m);
      }
    }
  }

  takeBall(kind) {
    const m = this.pool[kind].find((b) => !b.visible) ?? this.pool[kind][0];
    m.visible = true;
    return m;
  }

  get player() { return this.ctx.getPlayer(); }

  // 狙う方向（相手がいれば相手の胸へ。いなければ向いている方向）
  aimDir(from, spread = 0) {
    const { p1, p2 } = this.ctx;
    const h = p1.group.rotation.y;
    const S = p1.scale;
    const chest = w.set(p2.group.position.x, p2.group.position.y + 3.0 * S, p2.group.position.z);
    const toFoe = dir.subVectors(chest, from);
    const horiz = Math.hypot(toFoe.x, toFoe.z);
    const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const cos = horiz > 1e-6 ? (toFoe.x * fwd.x + toFoe.z * fwd.z) / horiz : 1;
    const out = (cos > 0.5 && horiz < 260 * S) ? toFoe.clone().normalize() : fwd; // 正面の近くにいれば追尾、そうでなければまっすぐ
    if (spread) {
      out.x += Math.cos(h) * spread * 0.012;
      out.z -= Math.sin(h) * spread * 0.012;
      out.y += spread * 0.006;
      out.normalize();
    }
    return out;
  }

  onEvent(e) {
    const { impact, sparks, fx, p1 } = this.ctx;
    const S = p1.scale;
    switch (e.type) {
      case 'batToss': {
        // 左手でボールを放り上げる: 手元から、打つ位置（体の前・胸の高さ）へ弧を描く
        p1.joints.lWrist.getWorldPosition(v);
        const h = p1.group.rotation.y;
        const to = new THREE.Vector3(p1.group.position.x + Math.sin(h) * 3.0 * S, p1.group.position.y + 3.3 * S, p1.group.position.z + Math.cos(h) * 3.0 * S);
        const m = this.takeBall(e.metal ? 'metal' : 'normal');
        m.scale.setScalar((e.metal ? 0.5 : 0.34) * S);
        m.position.copy(v);
        this.tosses.push({ m, from: v.clone(), to, t: 0, time: Math.max(0.08, e.time ?? 0.25), apex: (e.quick ? 2.2 : 3.4) * S });
        break;
      }
      case 'batBall':
        this.fire(e);
        break;
      case 'batMetalOn': {
        // バットが金属に変わる: 光がはしる
        p1.sword.getWorldPosition(v);
        v.addScaledVector(w.set(0, 0, 1).transformDirection(p1.sword.matrixWorld), 1.4 * S);
        impact.flash(v, p1.height * 1.6, 0.3);
        impact.ring(p1.group.position, p1.height * 1.6, 0.45);
        w.set(0, 0, 0);
        sparks.burst(v, w, 16, p1.height * 0.045, p1.height * 2.4, 0.53, 0.9);
        fx.zoom(-60);
        fx.shake(0.25);
        break;
      }
      case 'batRevert':
        p1.sword.getWorldPosition(v);
        impact.flash(v, p1.height * 0.9, 0.18);
        w.set(0, 0, 0);
        sparks.burst(v, w, 8, p1.height * 0.04, p1.height * 1.6, 0.1, 0.5);
        break;
      case 'batThrow':
        fx.zoom(80);
        fx.kick(0.3, 0, 0.7);
        fx.roll(-0.6);
        break;
      case 'batSkill2Hit': this.foeHit(DAMAGE.batThrow, { big: true, stop: 0.12 }); break;
      case 'batSkill2Dash': case 'batSkill4Dash': {
        // ダッシュ: 足元の土煙と、通り道の光の線
        fx.zoom(160);
        fx.kick(0, 0.1, 1.2);
        fx.shake(0.3);
        impact.ring(p1.group.position, p1.height * 1.5, 0.3);
        w.set(0, 0, 0);
        sparks.burst(v.set(p1.group.position.x, 0.03, p1.group.position.z), w, 8, p1.height * 0.06, p1.height * 2.2, 0.25, 0.25);
        break;
      }
      case 'batPunch': {
        // パンチ1発ごと: 小さな閃光と火花、画面の小突き
        const n = e.count;
        const dmg = e.skill === 4 ? DAMAGE.batS4Punch : DAMAGE.batPunch;
        this.foeHit(dmg, { stop: 0.025, small: true, side: e.side, n });
        break;
      }
      case 'batSkill2Final': this.foeHit(DAMAGE.batFinal, { huge: true, stop: 0.22, dir: e.dir }); break;
      case 'batSkill4Leap':
        fx.zoom(-60);
        impact.ring(p1.group.position, p1.height * 1.6, 0.4);
        break;
      case 'batSkill4Catch':
        p1.joints.rWrist.getWorldPosition(v);
        impact.flash(v, p1.height * 1.8, 0.22);
        fx.shake(0.35);
        w.set(0, 0, 0);
        sparks.burst(v, w, 14, p1.height * 0.04, p1.height * 2.2, 0.53, 0.9);
        break;
      case 'batSkill4Smash':
        this.foeHit(DAMAGE.batS4Smash, { huge: true, stop: 0.22, dir: e.dir, ground: true });
        break;
      case 'batRecall':
        fx.zoom(30);
        break;
      default:
        break;
    }
  }

  // 敵にバットやパンチが当たったときの共通の演出とダメージ
  foeHit(amount, o = {}) {
    const { impact, sparks, fx, p1, p2, hooks, camera } = this.ctx;
    const H = p2.height;
    const at = new THREE.Vector3(p2.group.position.x, p2.group.position.y + H * 0.62, p2.group.position.z);
    if (o.small) { at.x += (Math.random() - 0.5) * H * 0.3; at.y += (Math.random() - 0.2) * H * 0.3; }
    const d = o.dir ?? new THREE.Vector3(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
    hooks.damage(amount, at, o.huge ? 'huge' : o.big ? 'big' : '');
    hooks.hitStop(o.stop ?? 0.08);
    hooks.flashFoe(o.small ? 0.035 : 0.12);
    fx.shake(o.huge ? 1 : o.small ? 0.14 + Math.min(0.1, (o.n ?? 0) * 0.01) : 0.45);
    fx.zoom(o.huge ? -230 : o.small ? 40 : -110);
    if (o.small) fx.kick((o.side ?? 1) * 0.35, 0.1, -0.25);
    else fx.kick(0, 0.2, o.huge ? -1.6 : -0.7);
    impact.flash(at, H * (o.huge ? 3.4 : o.small ? 1.0 : 2.0), o.huge ? 0.24 : o.small ? 0.09 : 0.16);
    if (!o.small) impact.streak(at, d, camera, H * (o.huge ? 3.4 : 2.2), 0.18);
    sparks.burst(at, d, o.huge ? 26 : o.small ? 4 : 12, H * (o.huge ? 0.075 : 0.055), H * (o.huge ? 5 : 3.2));
    if (o.huge) {
      impact.ring(p2.group.position, H * 2.4, 0.5);
      impact.ring(p2.group.position, H * 1.4, 0.32);
      sparks.burst(at, d, 12, H * 0.06, H * 3.4, 0.12, 0.7);
    }
    if (o.ground) hooks.groundBreak(p2.group.position.x, p2.group.position.z, 6);
  }

  // ボールを打つ: バットの芯から、狙う向きへ飛ばす
  fire(e) {
    const { impact, sparks, fx, p1 } = this.ctx;
    const S = p1.scale;
    const kind = e.kind === 'metal' ? 'metal' : 'normal';
    const cfg = BALL[kind];
    // 打つ位置: 放り上げたボールがあればその位置、なければバットの芯
    let from;
    const ti = this.tosses.findIndex((t) => t.m.scale.x > 0);
    if (ti >= 0) { from = this.tosses[ti].m.position.clone(); this.tosses[ti].m.visible = false; this.tosses.splice(ti, 1); }
    else { p1.sword.updateWorldMatrix(true, false); from = new THREE.Vector3(0, 0, 2.4).applyMatrix4(p1.sword.matrixWorld); }
    const spread = e.skill3 ? ((e.shot ?? 0) % 3 - 1) : 0; // スキル3は、ほんの少しずつばらけさせる
    const d = this.aimDir(from, spread);
    const m = this.takeBall(kind);
    m.scale.setScalar(cfg.radius * S);
    m.position.copy(from);
    this.flying.push({ m, p: from.clone(), d: d.clone(), kind, left: cfg.range * S, speed: cfg.speed * S, power: e.power, skill3: !!e.skill3, spin: 0 });
    // 打った瞬間: 閃光と火花
    impact.flash(from, p1.height * (kind === 'metal' ? 2.0 : 1.1), kind === 'metal' ? 0.2 : 0.12);
    w.set(0, 0, 0);
    sparks.burst(from, d, kind === 'metal' ? 14 : 6, p1.height * 0.045, p1.height * (kind === 'metal' ? 4 : 2.6), kind === 'metal' ? 0.53 : null, kind === 'metal' ? 0.9 : 0.2);
    if (kind === 'metal') { impact.ring(p1.group.position, p1.height * 1.8, 0.4); fx.shake(0.55); fx.zoom(140); fx.kick(0, 0.1, 1.2); }
    else { fx.shake(e.skill3 ? 0.18 : 0.3); fx.zoom(e.skill3 ? 45 : 70); fx.kick(0.3, 0, 0.5); }
  }

  update(dt) {
    const { impact, sparks, p1, p2, dummy, hooks, stage } = this.ctx;
    const S = p1.scale;
    // 放り上げたボール
    for (let i = this.tosses.length - 1; i >= 0; i--) {
      const t = this.tosses[i];
      t.t += dt;
      const u = Math.min(1, t.t / t.time);
      t.m.position.lerpVectors(t.from, t.to, u);
      t.m.position.y += t.apex * 4 * u * (1 - u);
      t.m.rotation.x += dt * 12;
      if (t.t > t.time + 0.5) { t.m.visible = false; this.tosses.splice(i, 1); } // 打たれなかったら消す
    }
    // 飛んでいるボール
    const B = stage.bounds;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const b = this.flying[i];
      const step = Math.min(b.left, b.speed * dt);
      const prev = b.p.clone();
      b.p.addScaledVector(b.d, step);
      b.left -= step;
      b.m.position.copy(b.p);
      b.m.rotation.x += dt * 22;
      b.m.rotation.z += dt * 14;
      // 光の尾
      sparks.burst(b.p, w.set(0, 0, 0), 1, p1.height * 0.03, p1.height * 0.5, b.kind === 'metal' ? 0.53 : null, b.kind === 'metal' ? 0.9 : 0.1);
      // 命中判定: 前のフレームからの線分と、相手の胸の距離
      const foe = new THREE.Vector3(p2.group.position.x, p2.group.position.y + 3.0 * S, p2.group.position.z);
      const seg = new THREE.Vector3().subVectors(b.p, prev);
      const len2 = seg.lengthSq();
      const t01 = len2 > 0 ? Math.min(1, Math.max(0, w.subVectors(foe, prev).dot(seg) / len2)) : 0;
      const closest = prev.clone().addScaledVector(seg, t01);
      const cfg = BALL[b.kind];
      const hittable = dummy.state === 'ground' || dummy.state === 'hit' || dummy.state === 'down';
      if (hittable && closest.distanceTo(foe) < (cfg.hitR + 0.4) * S * 0.9 + 0.0) {
        this.hitFoe(b, closest);
        b.m.visible = false;
        this.flying.splice(i, 1);
      } else if (b.left <= 0 || Math.abs(b.p.x) > B.maxX + 4 || Math.abs(b.p.z) > B.maxZ + 4 || b.p.y < 0) {
        // 壁に当たる、または飛びきった: 小さく弾けて消える
        impact.flash(b.p, p1.height * 0.7, 0.1);
        sparks.burst(b.p, w.set(0, 0, 0), 6, p1.height * 0.04, p1.height * 1.8, b.kind === 'metal' ? 0.53 : null, 0.3);
        b.m.visible = false;
        this.flying.splice(i, 1);
      }
    }
  }

  hitFoe(b, at) {
    const { impact, sparks, fx, p1, p2, dummy, hooks, camera } = this.ctx;
    const H = p2.height;
    const metal = b.kind === 'metal';
    dummy.hit(b.d.x, b.d.z, b.power);
    const amount = metal ? DAMAGE.batMetalShot : b.skill3 ? DAMAGE.batSkill3Ball : DAMAGE.bat[2];
    hooks.damage(amount, at, metal ? 'huge' : b.skill3 ? '' : 'big');
    hooks.hitStop(metal ? 0.16 : b.skill3 ? 0.04 : 0.1);
    hooks.flashFoe(metal ? 0.14 : 0.08);
    fx.shake(metal ? 0.9 : b.skill3 ? 0.25 : 0.5);
    fx.zoom(metal ? -200 : b.skill3 ? -60 : -110);
    impact.flash(at, H * (metal ? 3.2 : 1.8), metal ? 0.22 : 0.14);
    impact.streak(at, b.d, camera, H * (metal ? 3.2 : 2.0), 0.16);
    sparks.burst(at, b.d, metal ? 22 : 12, H * 0.06, H * (metal ? 4.4 : 3.2));
    sparks.burst(at, b.d, metal ? 12 : 4, H * 0.05, H * 4.0, metal ? 0.53 : null, 0.6);
    if (metal) { impact.ring(p2.group.position, H * 2.0, 0.4); }
  }
}
