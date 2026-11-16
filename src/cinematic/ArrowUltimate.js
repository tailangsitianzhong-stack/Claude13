import * as THREE from 'three';
import { ULTA, ULTA_END, junkSchedule } from '../character/ArrowController.js';
import { DAMAGE } from '../character/Health.js';
import { createArrow3D, ARROW_COLORS } from '../character/Arrow.js';
import { JunkYard, createJunk } from './JunkYard.js';

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hash = (k, s = 1) => { const x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

// ゴミの種類（大きさ別）と、見た目の大きさ（ワールド単位の倍率）
const KINDS = { s: [['bag', 0.26], ['crate', 0.24], ['can', 0.24], ['tire', 0.3]], m: [['can', 0.42], ['tv', 0.4], ['washer', 0.42], ['tire', 0.5], ['crate', 0.45]], b: [['fridge', 0.4], ['dumpster', 0.42], ['car', 0.42]], x: [['car', 0.8]] };

/**
 * 矢印の必殺技の演出（ゴミ処理場のムービー）。
 *  - 前向き矢印を頭の上に貼って突撃 → 命中で画面が切り替わる（閃光 → ゴミ処理場）
 *  - 相手に引き寄せ矢印を貼る → 大きなゴミが次々に引き寄せられて、相手を押しつぶす（位置は、ムービーの時刻から計算する）
 *  - 最後の一撃のあと、元の画面へ戻る
 * UltimateDirector（剣）と同じ口（active / update / updateCamera / onEvent / camDistance）を持つ。
 */
export class ArrowUltimateDirector {
  // ctx: { scene, camera, lights: {hemi, sun}, stage, impact, sparks, fx, overlay, p1, p2, getPlayer, hooks, arrow }
  constructor(ctx) {
    this.ctx = ctx;
    this.yard = new JunkYard();
    ctx.scene.add(this.yard.group);
    this._active = false;
    this.camDistance = 4;
    this.saved = null;
    this.headArrow = createArrow3D(ARROW_COLORS.forward, { depth: 0.16, scale: 0.0, variant: 'single' });
    this.headArrow.visible = false;
    ctx.scene.add(this.headArrow);
    this.headT = 0;
    // ゴミ（予定表の1つにつき1つ）
    this.sched = junkSchedule();
    this.junk = this.sched.map((p) => {
      const list = KINDS[p.size];
      const [kind, size] = list[Math.floor(hash(p.k, 2) * list.length) % list.length];
      const m = createJunk(kind, p.k);
      m.scale.setScalar(size);
      m.visible = false;
      ctx.scene.add(m);
      // 引き寄せられる前の置き場所（相手のまわりの輪の上）と、山の中での落ち着き場所
      const a = hash(p.k, 3) * Math.PI * 2;
      const r = p.size === 'x' ? 0 : 6 + hash(p.k, 4) * 6;
      const start = new THREE.Vector3(ULTA.foe.x + Math.cos(a) * r, p.size === 'x' ? 7 : 0.2 + hash(p.k, 5) * 0.2, ULTA.foe.z + Math.sin(a) * r);
      const rest = new THREE.Vector3(ULTA.foe.x + (hash(p.k, 6) - 0.5) * (p.size === 'b' ? 0.9 : 0.7), 0, ULTA.foe.z + (hash(p.k, 7) - 0.5) * (p.size === 'b' ? 0.9 : 0.7));
      rest.y = p.size === 's' ? 0.12 + hash(p.k, 8) * 0.3 : p.size === 'm' ? 0.3 + hash(p.k, 8) * 0.3 : p.size === 'b' ? 0.5 + hash(p.k, 8) * 0.4 : 0.4;
      return { m, p, start, rest, spin: new THREE.Vector3(hash(p.k, 9) * 4 - 2, hash(p.k, 10) * 4 - 2, hash(p.k, 11) * 4 - 2), kind };
    });
  }

  get active() { return this._active; }
  get player() { return this.ctx.getPlayer(); }

  enterCine() {
    const { scene, lights, stage, overlay } = this.ctx;
    this.saved = {
      bg: scene.background.clone(), fog: scene.fog,
      hemi: { sky: lights.hemi.color.clone(), ground: lights.hemi.groundColor.clone(), i: lights.hemi.intensity },
      sun: { color: lights.sun.color.clone(), i: lights.sun.intensity, pos: lights.sun.position.clone() },
    };
    scene.background = new THREE.Color(0x7a5a46);
    scene.fog = new THREE.Fog(0x7a5a46, 14, 46);
    lights.hemi.color.set(0xffd9b0);
    lights.hemi.groundColor.set(0x3a2a20);
    lights.hemi.intensity = 1.0;
    lights.sun.color.set(0xffb070);
    lights.sun.intensity = 1.5;
    lights.sun.position.set(-18, 9, -8);
    stage.group.visible = false;
    this.yard.group.visible = true;
    document.body.classList.add('cine-on');
    overlay.setTheme('');
    overlay.setOn(true);
    this.headArrow.visible = false;
    this._active = true;
  }

  exitCine() {
    const { scene, lights, stage, fx, overlay, camera, p2, arrow } = this.ctx;
    const s = this.saved;
    if (s) {
      scene.background = s.bg; scene.fog = s.fog;
      lights.hemi.color.copy(s.hemi.sky); lights.hemi.groundColor.copy(s.hemi.ground); lights.hemi.intensity = s.hemi.i;
      lights.sun.color.copy(s.sun.color); lights.sun.intensity = s.sun.i; lights.sun.position.copy(s.sun.pos);
    }
    stage.group.visible = true;
    this.yard.group.visible = false;
    for (const j of this.junk) j.m.visible = false;
    arrow.foeStickers.pull.visible = false;
    document.body.classList.remove('cine-on');
    overlay.setOn(false);
    camera.up.set(0, 1, 0);
    fx.baseFov = 55; camera.fov = 55; camera.updateProjectionMatrix();
    this._active = false;
  }

  update(dt) {
    const { overlay, p1, sparks } = this.ctx;
    overlay.update(dt);
    this.yard.update(dt);
    const pl = this.player;
    const u = pl && pl.ult;
    const time = performance.now() / 1000;
    // 頭の上の前向き矢印: 貼られて、突撃のあいだ自分についていく
    if (u && (u.phase === 'draw' || u.phase === 'rush' || u.phase === 'freeze') && this.headArrow.visible) {
      this.headT += dt;
      const S = p1.scale;
      const yaw = p1.group.rotation.y;
      this.headArrow.position.set(p1.group.position.x, p1.group.position.y + p1.height * (u.phase === 'draw' ? 1.35 : 1.0), p1.group.position.z);
      // 貼られている間は、鼻先を少し上げて（後ろから見ても形がわかる）、突撃では水平に前を向く
      const pitch = u.phase === 'draw' ? -0.6 * Math.min(1, this.headT / 0.2) : 0;
      this.headArrow.rotation.set(pitch, yaw, 0, 'YXZ');
      this.headArrow.scale.setScalar(0.001 + 0.8 * (S / 0.15) * Math.min(1, this.headT / 0.2));
      this.headArrow.userData.setGlow(1, time);
      if (u.phase === 'rush') {
        sparks.burst(this.headArrow.position, w.set(-Math.sin(yaw), 0, -Math.cos(yaw)), 4, p1.height * 0.06, p1.height * 3, 0.5, 1, 0.55, 0.3);
      }
    } else if (!u || u.phase === 'cine') this.headArrow.visible = false;
    // ムービー中: ゴミの位置を、ムービーの時刻から決める
    if (u && u.phase === 'cine') this.updateJunk(u.t, dt);
    // 引き寄せ矢印: 貼られたあとは、ぴかぴか光る
    if (u && u.phase === 'cine' && u.t > ULTA.tStick) this.ctx.arrow.foeStickers.pull.userData.setGlow(1, time);
  }

  // ---- ゴミの位置 ----
  updateJunk(T, dt) {
    const { sparks, p2 } = this.ctx;
    const F = v.set(ULTA.foe.x, 0, ULTA.foe.z);
    for (const j of this.junk) {
      const p = j.p;
      const m = j.m;
      if (T < 0.1) { m.visible = false; continue; }
      m.visible = true;
      const arrive = p.t0 + p.dur;
      if (T < p.t0) {
        // まだ引き寄せられていない: 置き場所で、引き寄せの直前にがたがた震える
        m.position.copy(j.start);
        const k = clamp01((T - (p.t0 - 0.3)) / 0.3);
        m.position.y += 0.12 * k * (1 + Math.sin(T * 60));
        m.rotation.set(0.1, hash(p.k) * 6, 0.05);
      } else if (T < arrive) {
        // 加速しながら、相手へ
        const u = clamp01((T - p.t0) / p.dur);
        const e = u * u * (p.size === 'x' ? 1 : 1.0);
        m.position.lerpVectors(j.start, j.rest, e);
        if (p.size !== 'x') m.position.y += 0.9 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (p.size === 'b' ? 1.2 : 0.7);
        m.rotation.set(j.spin.x * (1 - u) * 3, hash(p.k) * 6 + j.spin.y * (1 - u) * 3, j.spin.z * (1 - u) * 3);
        // 引き寄せられる光の粒（赤紫）
        if (Math.random() < 0.6) sparks.burst(m.position, w.set(0, 0, 0), 1, 0.03, 0.4, 0.88, 1, 0.55, 0.3);
      } else {
        // 命中して、山になる（ほんの少し、はずむ）
        const since = T - arrive;
        m.position.copy(j.rest);
        m.position.y += Math.max(0, 0.15 * Math.sin(since * 14) * Math.exp(-since * 7));
        m.rotation.set(j.spin.x * 0.2, hash(p.k) * 6 + 0.3, j.spin.z * 0.2);
      }
    }
  }

  onEvent(e) {
    const { impact, sparks, fx, overlay, p1, p2, hooks, arrow } = this.ctx;
    const H = p2.height;
    const K = ULTA;
    switch (e.type) {
      case 'ultStart':
        fx.zoom(-70); fx.kick(0, 0.2, 0.4);
        break;
      case 'ultArrowStick':
        // 自分の頭の上に、前向きの矢印をぺたり
        this.headArrow.visible = true;
        this.headT = 0;
        p1.joints.waist.getWorldPosition(v);
        v.y += p1.height * 0.6;
        impact.flash(v, p1.height * 1.6, 0.25);
        sparks.burst(v, w.set(0, 0, 0), 12, p1.height * 0.045, p1.height * 2.2, 0.5, 1, 0.55, 0.3);
        fx.zoom(-60); fx.shake(0.3);
        break;
      case 'ultRush':
        fx.zoom(280); fx.kick(0, 0, 1.8); fx.shake(0.6);
        impact.ring(p1.group.position, p1.height * 2.2, 0.4);
        break;
      case 'ultHit': {
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(0.8);
        fx.shake(0.9);
        fx.zoom(-260);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.64, p2.group.position.z);
        impact.flash(v, H * 3.4, 0.3);
        impact.ring(p2.group.position, H * 2.2, 0.4);
        w.copy(v).sub(p1.group.position).setY(0).normalize();
        sparks.burst(v, w, 24, H * 0.06, H * 4.2);
        hooks.damage(DAMAGE.arrowUltRush, v, 'big');
        break;
      }
      case 'ultCineStart':
        overlay.flash(1);
        this.enterCine();
        overlay.setLines(false);
        break;
      case 'ultTitle':
        overlay.flash(0.4);
        overlay.title('ゴミ処理場', 'JUNKYARD', 1.8);
        fx.shake(0.3);
        break;
      case 'ultPullStick':
        arrow.foeStickers.pull.visible = true;
        v.set(ULTA.foe.x, H * 0.62, ULTA.foe.z);
        impact.flash(v, H * 2.6, 0.3);
        sparks.burst(v, w.set(0, 0, 0), 16, H * 0.05, H * 3, 0.88, 1, 0.55, 0.3);
        overlay.flash(0.5);
        fx.shake(0.5); fx.zoom(-120);
        break;
      case 'ultPullStart':
        overlay.flash(0.35);
        fx.shake(0.45);
        break;
      case 'ultJunkHit': {
        const big = e.size === 'b';
        const med = e.size === 'm';
        const dmg = big ? DAMAGE.arrowUltBig : med ? DAMAGE.arrowUltJunk * 1.5 : DAMAGE.arrowUltJunk;
        v.set(p2.group.position.x, H * (0.3 + Math.random() * 0.5), p2.group.position.z);
        hooks.damage(dmg, v, big ? 'big' : '');
        hooks.hitStop(big ? 0.12 : med ? 0.05 : 0.025);
        hooks.flashFoe(big ? 0.12 : 0.04);
        fx.shake(big ? 0.7 : med ? 0.35 : 0.18);
        fx.zoom(big ? -140 : -50);
        impact.flash(v, H * (big ? 2.4 : 1.2), big ? 0.18 : 0.1);
        impact.ring(w.set(ULTA.foe.x, 0, ULTA.foe.z), H * (big ? 2.4 : 1.2), 0.3);
        w.set(Math.cos(e.k * 2.3), 0, Math.sin(e.k * 2.3));
        sparks.burst(v, w, big ? 18 : 6, H * 0.05, H * (big ? 4 : 2.6));
        sparks.burst(w.set(ULTA.foe.x, 0.05, ULTA.foe.z), v.set(0, 0, 0), big ? 10 : 4, H * 0.06, H * 1.6, 0.1, 0.3, 0.45, 0.2); // 土ぼこり
        break;
      }
      case 'ultCrush': {
        // 最後の一撃: 山のようなゴミが、相手を押しつぶす
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(1);
        fx.shake(1.4); fx.zoom(-280); fx.kick(0, -0.6, -1.4);
        v.set(ULTA.foe.x, H * 0.5, ULTA.foe.z);
        impact.flash(v, H * 5, 0.4);
        impact.ring(w.set(ULTA.foe.x, 0, ULTA.foe.z), H * 4, 0.7);
        impact.ring(w.set(ULTA.foe.x, 0, ULTA.foe.z), H * 2.2, 0.45);
        sparks.burst(v, w.set(0, 0.2, 0), 40, H * 0.08, H * 6);
        sparks.burst(w.set(ULTA.foe.x, 0.05, ULTA.foe.z), v.set(0, 0, 0), 24, H * 0.09, H * 3, 0.1, 0.3, 0.45, 0.2);
        hooks.damage(DAMAGE.arrowUltCrush, v, 'huge');
        arrow.foeStickers.pull.visible = false;
        break;
      }
      case 'ultCineEnd':
        overlay.flash(1);
        this.exitCine();
        hooks.resetCamera();
        break;
      default:
        break;
    }
  }

  // ---- ムービー中のカメラワーク ----
  updateCamera() {
    const pl = this.player;
    const u = pl && pl.ult;
    if (!u || u.phase !== 'cine') return;
    const T = u.t;
    const K = ULTA;
    const F = K.foe;
    let fov = 46;
    let roll = 0;
    if (T < 1.1) {
      // 1) ゴミの山に囲まれた処理場の全景。ふらふらの敵と、手前に自分
      const a = T / 1.1;
      pos.set(lerp(-8.2, -7.0, a), lerp(2.3, 1.7, a), 3.6); look.set(1.2, 0.8, 0); fov = 52;
    } else if (T < K.tStick) {
      // 2) 敵の正面のアップ（自分は矢印を構える）
      pos.set(-0.2, 0.7, 1.5); look.set(F.x, 0.6, F.z); fov = 40;
    } else if (T < K.tPull) {
      // 3) 引き寄せ矢印が貼られる胸もとのアップ
      const a = (T - K.tStick) / (K.tPull - K.tStick);
      pos.set(lerp(0.2, 0.5, a), 0.62, lerp(1.4, 1.1, a)); look.set(F.x, 0.55, F.z); fov = lerp(40, 34, a);
    } else if (T < 4.0) {
      // 4) 横から。小さなゴミが次々に引き寄せられて、命中する
      pos.set(F.x, 1.2, -4.8); look.set(F.x, 0.5, F.z); fov = 50;
    } else if (T < 5.4) {
      // 5) 低い位置から正面。ドラム缶・タイヤ・洗濯機が飛んでくる
      pos.set(-1.2, 0.35, 3.0); look.set(F.x, 0.5, F.z); fov = 52; roll = 0.06;
    } else if (T < K.tCrush - 0.6) {
      // 6) 高い位置から。冷蔵庫・車・大型ゴミ箱
      const a = (T - 5.4) / 1.4;
      pos.set(F.x - 2.2, lerp(3.8, 4.6, a), -4.6); look.set(F.x, 0.6, F.z); fov = 52;
    } else if (T < K.tCrush + 0.7) {
      // 7) 最後の一撃: 真横の低い位置から、上から降ってくる大きなゴミを見上げる（スロー）
      pos.set(F.x + 2.8, 0.55, -2.4); look.set(F.x, 1.0, F.z); fov = 50;
    } else {
      // 8) ゴミに埋もれた敵を、ゆっくり引いて見せる
      const a = clamp01((T - K.tCrush - 0.7) / 1.4);
      pos.set(lerp(F.x + 2.8, F.x - 1.0, a), lerp(0.7, 2.6, a), lerp(-2.6, -6.4, a)); look.set(F.x, 0.5, F.z); fov = 50;
    }
    this.apply(pos, look, fov, roll);
  }

  apply(p, target, fov, roll) {
    const { camera, fx } = this.ctx;
    camera.position.copy(p);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (roll) camera.rotateZ(roll);
    fx.baseFov = fov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    this.camDistance = p.distanceTo(target);
  }
}
