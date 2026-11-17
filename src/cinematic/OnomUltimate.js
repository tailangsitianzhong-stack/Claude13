import * as THREE from 'three';
import { ULTO, ULTO_END } from '../character/OnomController.js';
import { DAMAGE } from '../character/Health.js';
import { ComicWorld } from './ComicWorld.js';

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * 擬音の必殺技の演出（「擬音の世界」のムービー）。
 *  - 大声のあと、相手に命中 → 画面が切り替わる（閃光 → マンガのコマのような世界）
 *  - ドカン×3 → ズドン → バンバン×10 → 最後のバンバン（文字の飛行・爆発・ダメージは OnomDirector。ここは、舞台・カメラ・画面効果）
 *  - 最後の一撃のあと、元の画面へ戻る
 * UltimateDirector（剣）と同じ口（active / update / updateCamera / onEvent / camDistance）を持つ。
 */
export class OnomUltimateDirector {
  // ctx: { scene, camera, lights: {hemi, sun}, stage, impact, sparks, fx, overlay, p1, p2, getPlayer, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    this.world = new ComicWorld();
    ctx.scene.add(this.world.group);
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
    scene.background = new THREE.Color(0xffd84a);
    scene.fog = new THREE.Fog(0xffd84a, 40, 100);
    lights.hemi.color.set(0xfff2d0);
    lights.hemi.groundColor.set(0xc86a8a);
    lights.hemi.intensity = 1.5;
    lights.sun.color.set(0xffffff);
    lights.sun.intensity = 1.7;
    lights.sun.position.set(-10, 18, 12);
    stage.group.visible = false;
    this.world.group.visible = true;
    document.body.classList.add('cine-on');
    overlay.setTheme('');
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
    document.body.classList.remove('cine-on');
    overlay.setOn(false);
    camera.up.set(0, 1, 0);
    fx.baseFov = 55; camera.fov = 55; camera.updateProjectionMatrix();
    this._active = false;
  }

  update(dt) {
    this.ctx.overlay.update(dt);
    this.world.update(dt);
  }

  onEvent(e) {
    const { impact, sparks, fx, overlay, p2, hooks } = this.ctx;
    const H = p2.height;
    switch (e.type) {
      case 'ultHit':
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(0.8);
        fx.shake(0.8);
        fx.zoom(-240);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.64, p2.group.position.z);
        impact.flash(v, H * 3.2, 0.3);
        impact.ring(p2.group.position, H * 2.2, 0.4);
        sparks.burst(v, w.set(0, 0, 0), 22, H * 0.06, H * 4);
        break;
      case 'ultCineStart':
        overlay.flash(1);
        this.enterCine();
        overlay.setLines(false);
        break;
      case 'ultTitle':
        overlay.flash(0.4);
        overlay.title('擬音の世界', 'ONOMATOPOEIA', 1.8);
        fx.shake(0.3);
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
    const K = ULTO;
    const P = K.player;
    const F = K.foe;
    const t0 = K.intro;
    let fov = 46;
    let roll = 0;
    if (T < t0) {
      // 1) 導入: 擬音の世界の全景。自分と、ふらふらの相手
      const a = T / t0;
      pos.set(lerp(-6.4, -5.0, a), lerp(1.9, 1.3, a), lerp(5.2, 3.8, a)); look.set(-0.6, 0.7, 0); fov = 52;
    } else if (T < t0 + K.zudon - 0.15) {
      // 2) ドカン: 正面の低めの位置から、ふたりを横から見る
      const a = (T - t0) / (K.zudon - 0.15);
      pos.set(lerp(F.x - 1.9, F.x - 1.2, a), 0.8, 3.0); look.set(F.x - 0.25, 0.9, 0); fov = 46; roll = 0.04 * Math.sin(a * 6);
    } else if (T < t0 + K.banFrom - 0.1) {
      // 3) ズドン: 真下から見上げる。大きな文字が降ってくる
      pos.set(F.x + 1.6, 0.3, 2.7); look.set(F.x, 1.5, 0); fov = 62;
    } else if (T < t0 + K.final - 0.2) {
      // 4) バンバン: 自分の肩ごしに、相手をアップ（連射で小刻みに揺れる）
      const a = clamp01((T - t0 - K.banFrom) / (K.final - K.banFrom));
      pos.set(P.x - 0.4, lerp(1.2, 1.0, a), 1.5); look.set(F.x - 0.4, 0.75, 0); fov = lerp(48, 42, a);
    } else if (T < t0 + K.final + 0.7) {
      // 5) 最後の一撃: 正面から、相手の顔のアップ（スロー）
      pos.set(F.x - 0.7, 0.95, 2.5); look.set(F.x, 0.72, 0); fov = 40;
    } else {
      // 6) 余韻: ゆっくり引いて、ぐったりした相手を見せる
      const a = clamp01((T - t0 - K.final - 0.7) / (ULTO_END - t0 - K.final - 0.7));
      pos.set(lerp(F.x - 2.3, F.x - 3.0, a), lerp(0.9, 2.4, a), lerp(1.8, 6.2, a)); look.set(F.x, 0.5, 0); fov = 50;
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
