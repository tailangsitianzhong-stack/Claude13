import * as THREE from 'three';
import { ULTS, ULTS_END } from '../character/ChainsawController.js';
import { createTrigger } from '../character/Chainsaw.js';
import { SawWorld } from './SawWorld.js';
import { SlashLines } from './SlashLines.js';

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * チェンソーの必殺技の演出。
 *  - 懐から引き金を出して、相手に投げつけて持たせる → 飛び蹴り → その勢いで引き紐が引かれて、画面が切り替わる
 *  - 「闇夜の森」: 頭と両腕にもチェンソーが生えて、相手のまわりを縦横無尽に動いて斬りまくる → 最後の一撃
 * UltimateDirector（剣）と同じ口（active / update / updateCamera / onEvent / camDistance）を持つ。ダメージは ChainsawDirector。
 */
export class ChainsawUltimateDirector {
  // ctx: { scene, camera, lights: {hemi, sun}, stage, impact, sparks, fx, overlay, p1, p2, getPlayer, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    this.world = new SawWorld();
    ctx.scene.add(this.world.group);
    this.lines = new SlashLines(ctx.scene);
    for (const it of this.lines.items) { it.glow.material.color.set(0xff2a30); }
    this.trigger = createTrigger();
    this.trigger.scale.setScalar(0.16);
    this.trigger.visible = false;
    ctx.scene.add(this.trigger);
    this._active = false;
    this.camDistance = 4;
    this.saved = null;
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
    scene.background = new THREE.Color(0x0c0610);
    scene.fog = new THREE.Fog(0x1a0a14, 8, 42);
    lights.hemi.color.set(0xc08aaa);
    lights.hemi.groundColor.set(0x3a1a1a);
    lights.hemi.intensity = 1.5;
    lights.sun.color.set(0xffa890);
    lights.sun.intensity = 2.1;
    lights.sun.position.set(-9, 15, 10);
    stage.group.visible = false;
    this.world.group.visible = true;
    document.body.classList.add('cine-on');
    overlay.setTheme('blood');
    overlay.setOn(true);
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
    this.world.group.visible = false;
    this.trigger.visible = false;
    document.body.classList.remove('cine-on');
    overlay.setTheme('');
    overlay.setOn(false);
    camera.up.set(0, 1, 0);
    fx.baseFov = 55; camera.fov = 55; camera.updateProjectionMatrix();
    this._active = false;
  }

  update(dt) {
    const { overlay, p1, p2 } = this.ctx;
    overlay.update(dt);
    this.world.update(dt);
    this.lines.update(dt);
    const pl = this.player;
    const u = pl && pl.ult;
    const time = performance.now() / 1000;
    // 引き金: 懐から出す（左手）→ 投げる（飛ぶ）→ 相手が握っている
    if (u && u.phase === 'draw') {
      p1.joints.lWrist.getWorldPosition(this.trigger.position);
      this.trigger.visible = u.t > 0.15;
      this.trigger.rotation.set(0, p1.group.rotation.y, 0);
      this.trigger.userData.setGlow(Math.min(1, u.t / ULTS.draw), time);
    } else if (u && u.phase === 'throw') {
      if (!u.released) { p1.joints.lWrist.getWorldPosition(this.trigger.position); this.trigger.visible = true; }
      else {
        const k = clamp01(u.flyT / ULTS.flight);
        p1.joints.lWrist.getWorldPosition(v);
        w.set(p2.group.position.x, p2.group.position.y + p2.height * 0.55, p2.group.position.z);
        this.trigger.position.lerpVectors(v, w, k);
        this.trigger.rotation.z = u.flyT * 30;
        this.trigger.visible = true;
      }
    } else if (u && (u.phase === 'kick' || u.phase === 'freeze' || u.phase === 'cine')) {
      // 相手が握っている
      p2.joints.rWrist.getWorldPosition(this.trigger.position);
      this.trigger.position.y += 0.02;
      this.trigger.rotation.set(0, p2.group.rotation.y, 0);
      this.trigger.userData.setGlow(1, time);
      this.trigger.visible = true;
    } else if (!u) this.trigger.visible = false;
  }

  onEvent(e) {
    const { impact, sparks, fx, overlay, p1, p2, hooks } = this.ctx;
    const H = p2.height;
    switch (e.type) {
      case 'ultHit':
        // 飛び蹴りが当たり、その勢いで引き紐が引かれる
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(0.9);
        fx.shake(1); fx.zoom(-260); fx.kick(0, 0.2, -1.5);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.6, p2.group.position.z);
        impact.flash(v, H * 3.6, 0.3);
        impact.ring(p2.group.position, H * 2.4, 0.45);
        sparks.burst(v, w.set(0, 0, 0), 24, H * 0.06, H * 4.4, 0.0, 0.9, 0.4, 0.2);
        hooks.damage(45, v, 'big');
        break;
      case 'ultCineStart':
        overlay.flash(1);
        this.enterCine();
        overlay.setLines(false);
        break;
      case 'ultTitle':
        overlay.flash(0.4);
        overlay.title('解体ショー', 'DISMANTLE', 1.8);
        fx.shake(0.3);
        break;
      case 'sawSprout':
        // 頭と両腕から、チェンソーが生える
        overlay.flash(0.5);
        fx.shake(0.8); fx.zoom(-120);
        p1.joints.neck.getWorldPosition(v);
        impact.flash(v, p1.height * 1.8, 0.3);
        sparks.burst(v, w.set(0, 1, 0), 20, p1.height * 0.05, p1.height * 3.4, 0.07, 0.9, 0.55, 0.3);
        break;
      case 'sawUltCut': {
        // 斬った通り道に、赤い光の線。カメラが小突かれる
        const F = ULTS.foe;
        v.set(e.x, e.y + p1.height * 0.6, e.z);
        w.set(F.x * 2 - e.x, p2.height * 0.55 + (e.up ? -p2.height * 0.4 : 0), F.z * 2 - e.z);
        this.lines.add(v, w, 0.55);
        v.set(F.x, p2.height * 0.6, F.z);
        impact.flash(v, H * 1.8, 0.12);
        fx.shake(0.35); fx.kick(Math.cos(e.a) * 0.6, e.up ? -0.7 : 0.1, 0.2);
        if (e.k % 4 === 3) overlay.flash(0.25);
        break;
      }
      case 'sawUltFinal':
        overlay.flash(1);
        fx.shake(1.4); fx.zoom(-280); fx.kick(0, -0.8, -1.4);
        this.trigger.visible = false;
        break;
      case 'ultCineEnd':
        overlay.flash(1);
        this.exitCine();
        hooks.resetCamera();
        break;
      default:
        break;
    }
  }

  // ---- ムービー中のカメラワーク（ムービー開始からの秒数 T）----
  updateCamera() {
    const pl = this.player;
    const u = pl && pl.ult;
    if (!u || u.phase !== 'cine') return;
    const T = u.t;
    const K = ULTS;
    const F = K.foe;
    let fov = 46;
    let roll = 0;
    if (T < K.tSprout) {
      // 1) 森の全景。ゆっくり押し込む（引き金をにぎった相手が、ふらふら）
      const a = T / K.tSprout;
      pos.set(lerp(-6.6, -5.0, a), lerp(1.3, 1.0, a), lerp(4.4, 3.2, a)); look.set(-1.0, 0.9, 0); fov = 52;
    } else if (T < K.tCut) {
      // 2) 自分の上半身を前から。頭と腕にチェンソーが生える
      const a = (T - K.tSprout) / (K.tCut - K.tSprout);
      pos.set(lerp(-1.4, -1.9, a), lerp(1.0, 1.15, a), lerp(1.9, 1.6, a)); look.set(K.player.x, 0.95, 0); fov = lerp(44, 40, a);
    } else if (T < K.tFinal - 0.1) {
      // 3) 斬りまくり: 1回ごとに、相手のまわりを回り込む（寄りと引きを交互に）
      const k = Math.max(0, u.cut ?? 0);
      const ang = k * 1.05 + 0.6;
      const near = k % 3 === 0;
      const r = near ? 2.1 : 3.4;
      pos.set(F.x + Math.cos(ang) * r, near ? 0.8 : 1.25 + 0.3 * (k % 2), F.z + Math.sin(ang) * r); look.set(F.x, 0.78, F.z); fov = near ? 40 : 48; roll = 0.05 * Math.sin(k * 1.9);
    } else if (T < K.tFinal + 0.7) {
      // 4) 最後の一撃: 低い位置から、上から叩きつけるのを見上げる（スロー）
      pos.set(F.x + 2.5, 0.45, F.z + 1.7); look.set(F.x - 0.2, 1.05, F.z); fov = 50;
    } else {
      // 5) 余韻: ゆっくり引いて、倒れた相手を見せる
      const a = clamp01((T - K.tFinal - 0.7) / (ULTS_END - K.tFinal - 0.7));
      pos.set(lerp(F.x + 2.5, F.x + 3.6, a), lerp(0.6, 2.0, a), lerp(F.z + 1.7, F.z + 6.0, a)); look.set(F.x, 0.4, F.z); fov = 50;
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
