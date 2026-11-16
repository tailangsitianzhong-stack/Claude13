import * as THREE from 'three';
import { ULTB, ULTB_END } from '../character/BatController.js';
import { createBall } from '../character/Bat.js';
import { DAMAGE } from '../character/Health.js';
import { BattingCenter } from './BattingCenter.js';
import { SlashLines } from './SlashLines.js';

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * バットの必殺技の演出（バッティングセンターのムービー）。
 * コントローラ（BatController の startUlt など）が出す ult* のイベントを受けて、
 *  - 鉄球の命中 → 画面が切り替わる（閃光 → バッティングセンター）
 *  - マシンから飛んでくるボールを打ちまくる（ボールの位置は、ムービーの時刻から計算する）
 *  - カメラワーク（カットを切り替える）
 *  - 最後の一撃のあと、元の画面へ戻る
 * を行う。UltimateDirector（剣）と同じ口（active / update / updateCamera / onEvent / camDistance）を持つ。
 */
export class BatUltimateDirector {
  // ctx: { scene, camera, lights: {hemi, sun}, stage, impact, sparks, fx, overlay, p1, p2, getPlayer, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    this.center = new BattingCenter();
    ctx.scene.add(this.center.group);
    this.lines = new SlashLines(ctx.scene);
    this._active = false;
    this.camDistance = 4;
    this.saved = null;
    // ボール（1球ごとに1つ）
    this.balls = [];
    for (let i = 0; i < ULTB.hits; i++) {
      const b = createBall('ball');
      b.scale.setScalar(0.09);
      b.visible = false;
      ctx.scene.add(b);
      this.balls.push(b);
    }
    this.iron = null;
  }

  get active() { return this._active; }
  get player() { return this.ctx.getPlayer(); }

  enterCine() {
    const { scene, lights, stage } = this.ctx;
    this.saved = {
      bg: scene.background.clone(), fog: scene.fog,
      hemi: { sky: lights.hemi.color.clone(), ground: lights.hemi.groundColor.clone(), i: lights.hemi.intensity },
      sun: { color: lights.sun.color.clone(), i: lights.sun.intensity, pos: lights.sun.position.clone() },
    };
    scene.background = new THREE.Color(0x05070f);
    scene.fog = new THREE.Fog(0x05070f, 18, 44);
    lights.hemi.color.set(0x8a96c8);
    lights.hemi.groundColor.set(0x1a2230);
    lights.hemi.intensity = 0.8;
    lights.sun.color.set(0xffe9c8);
    lights.sun.intensity = 1.0;
    lights.sun.position.set(-4, 9, 5);
    stage.group.visible = false;
    this.center.group.visible = true;
    document.body.classList.add('cine-on');
    this.ctx.overlay.setOn(true);
    this._active = true;
  }

  exitCine() {
    const { scene, lights, stage, fx, overlay, camera } = this.ctx;
    const s = this.saved;
    if (s) {
      scene.background = s.bg; scene.fog = s.fog;
      lights.hemi.color.copy(s.hemi.sky); lights.hemi.groundColor.copy(s.hemi.ground); lights.hemi.intensity = s.hemi.i;
      lights.sun.color.copy(s.sun.color); lights.sun.intensity = s.sun.i; lights.sun.position.copy(s.sun.pos);
    }
    stage.group.visible = true;
    this.center.group.visible = false;
    for (const b of this.balls) b.visible = false;
    document.body.classList.remove('cine-on');
    overlay.setOn(false);
    camera.up.set(0, 1, 0);
    fx.baseFov = 55; camera.fov = 55; camera.updateProjectionMatrix();
    this._active = false;
  }

  // ---- 毎フレーム ----
  update(dt) {
    const { overlay, p1, sparks } = this.ctx;
    overlay.update(dt);
    this.center.update(dt);
    this.lines.update(dt);
    const pl = this.player;
    const u = pl && pl.ult;
    // 懐から取り出した鉄球が飛んでいる間、光の粒を散らす
    if (u && u.phase === 'throw' && u.released && !u.hit && pl.iron) {
      pl.iron.getWorldPosition(v);
      sparks.burst(v, w.set(0, 0, 0), 2, p1.height * 0.035, p1.height * 1.2, 0.1, 0.2);
    }
    // ムービー中: ボールの位置を、ムービーの時刻から決める
    if (u && u.phase === 'cine') this.updateBalls(u.t);
  }

  tc(k) { return ULTB.tIntro + k * ULTB.period + ULTB.pitchFlight; }

  updateBalls(T) {
    const K = ULTB;
    const { p2, sparks, p1 } = this.ctx;
    const foe = v.set(p2.group.position.x, 0.46, p2.group.position.z);
    const F = new THREE.Vector3(K.foe.x, 0.46, K.foe.z);
    const P = new THREE.Vector3(K.contact.x, K.contact.y, K.contact.z);
    for (let k = 0; k < K.hits; k++) {
      const b = this.balls[k];
      const tp = K.tIntro + k * K.period;
      const tc = this.tc(k);
      let show = false;
      if (T >= tp && T < tc) {
        // マシンから、打席へ
        const u = (T - tp) / K.pitchFlight;
        b.position.lerpVectors(this.center.muzzle, P, u);
        b.position.y += 0.1 * Math.sin(Math.PI * u);
        show = true;
      } else if (T >= tc && T < tc + K.hitFlight) {
        // 打ち返されて、敵へ
        const u = (T - tc) / K.hitFlight;
        b.position.lerpVectors(P, F, u);
        show = true;
        sparks.burst(b.position, w.set(0, 0, 0), 1, p1.height * 0.03, p1.height * 0.6, 0.12, 0.2);
      }
      b.visible = show;
      if (show) { b.rotation.x += 0.4; b.rotation.z += 0.3; }
    }
  }

  // ---- イベント ----
  onEvent(e) {
    const { impact, sparks, fx, overlay, p1, p2, hooks } = this.ctx;
    const H = p2.height;
    const K = ULTB;
    switch (e.type) {
      case 'ultStart':
        fx.zoom(-70); fx.kick(0, 0.2, 0.4);
        break;
      case 'ultBallDraw':
        // 懐から鉄球を取り出す: 光がはじける
        this.player.iron.getWorldPosition(v);
        impact.flash(v, p1.height * 1.0, 0.16);
        sparks.burst(v, w.set(0, 0, 0), 10, p1.height * 0.04, p1.height * 1.8, 0.1, 0.2);
        break;
      case 'ultThrow':
        fx.zoom(110); fx.kick(0.4, 0, 0.8);
        break;
      case 'ultHit': {
        // 鉄球が当たった: 時間が止まり、画面が白く光る
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(0.8);
        fx.shake(0.9);
        fx.zoom(-260);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.64, p2.group.position.z);
        impact.flash(v, H * 3.4, 0.3);
        impact.ring(p2.group.position, H * 2.2, 0.4);
        w.copy(v).sub(p1.group.position).setY(0).normalize();
        sparks.burst(v, w, 22, H * 0.06, H * 4.0);
        sparks.burst(v, w, 10, H * 0.05, H * 3.0, 0.1, 0.2);
        hooks.damage(DAMAGE.batUltIron, v, 'big');
        break;
      }
      case 'ultCineStart':
        overlay.flash(1);
        this.enterCine();
        overlay.setLines(false);
        break;
      case 'ultTitle':
        overlay.flash(0.5);
        overlay.title('奥義', '乱れ打ち', 1.7);
        fx.shake(0.4);
        break;
      case 'ultPitch':
        // マシンが球を放つ
        this.center.kick();
        impact.flash(this.center.muzzle, 0.5, 0.1);
        sparks.burst(this.center.muzzle, w.set(-1, 0, 0), 4, 0.04, 2.4, 0.12, 0.3);
        break;
      case 'ultContact': {
        // バットがボールを捉えた: 閃光・火花・画面の小突き
        const P = v.set(K.contact.x, K.contact.y, K.contact.z);
        const big = e.final;
        impact.flash(P, p1.height * (big ? 3.4 : 1.8), big ? 0.3 : 0.14);
        impact.ring(w.set(P.x, 0.02, P.z), p1.height * (big ? 2.4 : 1.4), 0.3);
        sparks.burst(P, w.set(1, 0, 0.2), big ? 22 : 10, p1.height * 0.05, p1.height * (big ? 4.4 : 3.2));
        sparks.burst(P, w.set(1, 0, 0.2), 6, p1.height * 0.04, p1.height * 3, 0.12, 0.6);
        fx.shake(big ? 0.95 : 0.35);
        fx.zoom(big ? 160 : 60);
        fx.kick((e.k % 2 ? 1 : -1) * 0.3, 0.1, -0.3);
        if (big) overlay.flash(0.9);
        // 打ち返した軌跡に光の線
        this.lines.add(new THREE.Vector3(K.contact.x, K.contact.y, K.contact.z), new THREE.Vector3(K.foe.x, 0.46, K.foe.z), 0.5);
        break;
      }
      case 'ultImpact': {
        // 敵に命中
        const big = e.final;
        const at = v.set(p2.group.position.x, p2.group.position.y + H * 0.62, p2.group.position.z);
        const dir = w.set(K.foe.x - K.contact.x, 0, K.foe.z - K.contact.z).normalize().clone();
        hooks.damage(big ? DAMAGE.batUltFinal : DAMAGE.batUltHit, at, big ? 'huge' : e.k % 3 === 2 ? 'big' : '');
        hooks.hitStop(big ? 0.22 : 0.05);
        hooks.flashFoe(big ? 0.25 : 0.07);
        fx.shake(big ? 1 : 0.4);
        fx.zoom(big ? -240 : -90);
        impact.flash(at, H * (big ? 4.2 : 2.0), big ? 0.3 : 0.14);
        impact.streak(at, dir, this.ctx.camera, H * (big ? 3.6 : 2.2), 0.18);
        sparks.burst(at, dir, big ? 30 : 12, H * (big ? 0.075 : 0.055), H * (big ? 5 : 3.2));
        sparks.burst(at, dir, big ? 14 : 5, H * 0.05, H * 3.4, 0.12, 0.6);
        if (big) {
          overlay.flash(1);
          impact.ring(w.set(p2.group.position.x, 0.02, p2.group.position.z), H * 3.0, 0.7);
          impact.ring(w.set(p2.group.position.x, 0.02, p2.group.position.z), H * 1.6, 0.4);
        }
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
    const K = ULTB;
    const tail = this.tc(K.hits - 1) + K.hitFlight;
    let fov = 46;
    let roll = 0;
    if (T < K.tIntro) {
      // 1) 導入: 打席の後ろから、マシンと、ふらふらの敵が一列に見える広い画。じわっと寄る
      const a = T / K.tIntro;
      pos.set(lerp(-8.4, -7.0, a), lerp(2.6, 1.5, a), lerp(-3.8, -2.6, a));
      look.set(2.2, 0.7, 0.4);
      fov = lerp(52, 40, a);
      roll = 0.04 * (1 - a);
    } else if (T < tail) {
      const k = Math.min(K.hits - 1, Math.floor((T - K.tIntro) / K.period));
      const tk = T - (K.tIntro + k * K.period); // この球の中での経過
      if (k < 2) { // 打者の背中ごしに、マシンの方向を見る
        pos.set(-6.9 + 0.2 * tk, 1.15, -0.9); look.set(2.5, 0.7, 0.3); fov = 44;
      } else if (k < 4) { // 横から、振り抜きを見る
        pos.set(-3.9, 0.85, -4.3 + 0.3 * tk); look.set(-3.2, 0.62, 0.1); fov = 42;
      } else if (k === 4) { // バットがボールを捉える瞬間のアップ（低い位置から）
        pos.set(-2.3, 0.32, -1.5); look.set(K.contact.x, K.contact.y, K.contact.z); fov = 56; roll = 0.08;
      } else if (k === 5) { // 敵の後ろから、ボールが迫ってくるのを見る
        pos.set(4.6, 1.0, 2.7); look.set(0.5, 0.65, 0.5); fov = 46;
      } else if (k === 6) { // 真上から
        pos.set(-0.5, 6.0, 0.5 + 0.3 * tk); look.set(0, 0, 0.1); fov = 55; roll = 0.35 * tk;
      } else { // 最後の一球: 横から、スローで
        const f = this.ctx.p2.group.position;
        const toEnd = tk > K.pitchFlight + K.hitFlight - 0.05; // 命中のあとは、吹き飛ぶ敵を追う
        if (!toEnd) { pos.set(-1.2, 0.9, -3.6); look.set(0, 0.6, 0.5); fov = 42; }
        else { pos.set(1.2, 1.3, -4.3); look.set(f.x, Math.max(0.5, f.y + 0.4), f.z); fov = 55; }
      }
    } else {
      // 3) 最後: 倒れた敵を、遠くからゆっくり引いて見せる
      const a = Math.min(1, (T - tail) / K.tail);
      const f = this.ctx.p2.group.position;
      pos.set(lerp(1.6, -1.5, a), lerp(1.4, 2.0, a), lerp(-4.8, -4.9, a)); // ネットの内側（z > -5.2）に収める
      look.set(f.x, 0.5, f.z);
      fov = 50;
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
