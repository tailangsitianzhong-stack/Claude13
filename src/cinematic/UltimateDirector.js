import * as THREE from 'three';
import { ULT } from '../character/Controller.js';
import { DAMAGE } from '../character/Health.js';
import { CineStage } from './CineStage.js';
import { SlashLines } from './SlashLines.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const pos = new THREE.Vector3();
const look = new THREE.Vector3();

/**
 * 必殺技の演出を担当する。コントローラが出す ult* のイベントを受けて、
 *  - 画面の切り替え（白い閃光 → 暗い舞台、黒帯、集中線）
 *  - ムービー中のカメラワーク（カットを切り替えながら、斬撃の通り道を追う）
 *  - 小剣の命中、斬撃、締めの一撃ごとの効果
 * を行う。ムービーが終わると、環境とカメラを元の画面へ戻す。
 */
export class UltimateDirector {
  // ctx: { scene, camera, lights: {hemi, sun}, stage, impact, sparks, fx, overlay, groundCracks, p1, p2, player, dummy, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    this.cine = new CineStage();
    ctx.scene.add(this.cine.group);
    this.lines = new SlashLines(ctx.scene);
    this._active = false;
    this.camDistance = 4;
    this.saved = null;
  }

  get active() { return this._active; }

  // ---- 環境の切り替え ----
  enterCine() {
    const { scene, lights, stage } = this.ctx;
    this.saved = {
      bg: scene.background.clone(), fog: scene.fog,
      hemi: { sky: lights.hemi.color.clone(), ground: lights.hemi.groundColor.clone(), i: lights.hemi.intensity },
      sun: { color: lights.sun.color.clone(), i: lights.sun.intensity, pos: lights.sun.position.clone() },
    };
    scene.background = new THREE.Color(0x02040c);
    scene.fog = new THREE.Fog(0x02040c, 9, 28);
    lights.hemi.color.set(0x4a6cc0);
    lights.hemi.groundColor.set(0x0a0c18);
    lights.hemi.intensity = 0.9;
    lights.sun.color.set(0xb8d4ff);
    lights.sun.intensity = 1.5;
    lights.sun.position.set(-8, 14, 10);
    stage.group.visible = false;
    this.cine.group.visible = true;
    document.body.classList.add('cine-on');
    this.ctx.overlay.setOn(true);
    this._active = true;
  }

  exitCine() {
    const { scene, lights, stage, fx, overlay, camera } = this.ctx;
    const s = this.saved;
    if (s) {
      scene.background = s.bg;
      scene.fog = s.fog;
      lights.hemi.color.copy(s.hemi.sky);
      lights.hemi.groundColor.copy(s.hemi.ground);
      lights.hemi.intensity = s.hemi.i;
      lights.sun.color.copy(s.sun.color);
      lights.sun.intensity = s.sun.i;
      lights.sun.position.copy(s.sun.pos);
    }
    stage.group.visible = true;
    this.cine.group.visible = false;
    document.body.classList.remove('cine-on');
    overlay.setOn(false);
    camera.up.set(0, 1, 0);
    fx.baseFov = 55;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    this._active = false;
  }

  // ---- 毎フレーム ----
  update(dt) {
    const { overlay, player, p1, sparks } = this.ctx;
    overlay.update(dt);
    this.cine.update(dt);
    this.lines.update(dt);
    // 小剣が飛んでいる間、光の粒を後ろへ散らす
    const u = player.ult;
    if (u && u.phase === 'throw' && u.released && !u.hit) {
      p1.dagger.getWorldPosition(v);
      w.set(0, 0, 0);
      sparks.burst(v, w, 2, p1.height * 0.03, p1.height * 1.2, 0.53, 0.9);
    }
  }

  // ---- イベント ----
  onEvent(e) {
    const { impact, sparks, fx, overlay, p1, p2, player, hooks, groundCracks, camera } = this.ctx;
    const H = p2.height;
    switch (e.type) {
      case 'ultStart':
        fx.zoom(-70);
        fx.kick(0, 0.2, 0.4);
        break;
      case 'ultDagger':
        // 左手に小剣が現れる: 光の粒がはじける
        p1.joints.lWrist.getWorldPosition(v);
        impact.flash(v, p1.height * 0.9, 0.15);
        w.set(0, 0, 0);
        sparks.burst(v, w, 10, p1.height * 0.04, p1.height * 2.0, 0.53, 0.9);
        break;
      case 'ultThrow':
        fx.zoom(110);
        fx.kick(0.4, 0, 0.8);
        break;
      case 'ultHit': {
        // 小剣が刺さった: 時間が止まり、画面が白く光る
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(0.8);
        fx.shake(0.9);
        fx.zoom(-260);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.66, p2.group.position.z);
        impact.flash(v, H * 3.5, 0.3);
        impact.ring(p2.group.position, H * 2.2, 0.4);
        w.copy(v).sub(p1.group.position).setY(0).normalize();
        sparks.burst(v, w, 20, H * 0.06, H * 4.0);
        hooks.damage(DAMAGE.ultDagger, v, 'big');
        break;
      }
      case 'ultCineStart':
        // 画面が切り替わる: 真っ白になった間に、舞台を入れ替える
        overlay.flash(1);
        this.enterCine();
        overlay.setLines(false);
        break;
      case 'ultBlink': {
        // 一瞬で別の場所へ: 消えた所と現れた所に光がはじける
        if (e.k === 0) overlay.setLines(true);
        impact.flash(e.to, H * 0.9, 0.1);
        w.set(0, 0, 0);
        sparks.burst(e.to, w, 5, H * 0.045, H * 2.4, 0.53, 0.9);
        break;
      }
      case 'ultSlash': {
        // 相手を斬り抜けた: 通り道に光の線が残り、命中点で火花が散る
        this.lines.add(e.start, e.end, 1.2);
        this.cine.hit();
        impact.flash(e.mid, H * 2.4, 0.14);
        impact.streak(e.mid, e.d, camera, H * 3.4, 0.16);
        sparks.burst(e.mid, e.d, 12, H * 0.06, H * 4.4);
        sparks.burst(e.mid, e.d, 6, H * 0.05, H * 5.0, 0.53, 0.9);
        if (e.k % 3 === 0) impact.ring(v.set(e.mid.x, 0.02, e.mid.z), H * 2.0, 0.3);
        fx.shake(0.3);
        fx.zoom(50);
        fx.kick((e.k % 2 ? 1 : -1) * 0.4, 0.15, -0.3);
        hooks.flashFoe(0.05);
        hooks.damage(DAMAGE.ultSlash, e.mid, e.k % 4 === 3 ? 'big' : '');
        break;
      }
      case 'ultSummon': {
        // 小剣が光になって消え、両手剣が現れる。技の名前がどんと出る
        overlay.flash(0.9);
        overlay.title('奥義', '無影千刃斬', 1.7);
        fx.shake(0.5);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.66, p2.group.position.z);
        impact.flash(v, H * 2.0, 0.2);
        w.set(0, 0, 0);
        sparks.burst(v, w, 14, H * 0.05, H * 2.4, 0.53, 0.9);
        p1.joints.rWrist.getWorldPosition(v);
        impact.flash(v, p1.height * 2.2, 0.3);
        impact.ring(p1.group.position, p1.height * 2.4, 0.5);
        sparks.burst(v, w, 22, p1.height * 0.05, p1.height * 3.2, 0.53, 0.9);
        break;
      }
      case 'ultLeap':
        overlay.setLines(false);
        fx.zoom(-120);
        impact.ring(p1.group.position, p1.height * 2.0, 0.5);
        break;
      case 'ultFinal': {
        // 締めの一撃: 真っ白な閃光。相手は叩き落とされ、地面に光が走る
        overlay.flash(1);
        hooks.hitStop(0.24);
        hooks.flashFoe(0.25);
        fx.shake(1);
        fx.zoom(-250);
        fx.kick(0, 0.4, -1.8);
        this.cine.hit();
        this.lines.add(e.from, e.to, 1.5);
        v.set(e.pos.x, 0.45, e.pos.z);
        impact.flash(v, H * 5.5, 0.35);
        impact.ring(e.pos, H * 3.0, 0.7);
        impact.ring(e.pos, H * 1.8, 0.45);
        impact.ring(e.pos, H * 4.6, 0.95);
        w.set(0, 0, 0);
        sparks.burst(v, w, 40, H * 0.075, H * 5.0, 0.12, 0.6);
        sparks.burst(v, w, 24, H * 0.06, H * 4.0, 0.53, 0.9);
        groundCracks.start(e.pos.x, e.pos.z, 3.6);
        groundCracks.burst(p1.height);
        hooks.damage(DAMAGE.ultFinal, v, 'huge');
        break;
      }
      case 'ultCineEnd':
        // 元の画面へ戻る: もう一度真っ白になった間に、舞台を元に戻す
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
    const { player, p1 } = this.ctx;
    const u = player.ult;
    if (!u || u.phase !== 'cine') return;
    const C = ULT.center;
    const T = u.t;
    const cyc = ULT.windup + ULT.dash + ULT.finish;
    const tFinal = ULT.tBarrage + ULT.slashes * cyc;
    const holdEnd = ULT.leapTime + ULT.holdTime;
    let fov = 50;
    let roll = 0;

    if (T < ULT.tSummon) {
      // 1) 相手の胸に刺さった小剣へ、低い位置からゆっくり寄る
      const a = T / ULT.tSummon;
      pos.set(-1.9 + 0.55 * a, 1.0, -1.35 + 0.4 * a);
      look.set(0, 1.5, 0);
      fov = lerp(42, 33, a);
      roll = 0.05 * (1 - a);
    } else if (T < ULT.tBarrage) {
      // 2) 両手剣を構える自分を、あおりで映す。最後に一気に寄る
      const a = (T - ULT.tSummon) / (ULT.tBarrage - ULT.tSummon);
      pos.set(-2.35 - 0.5 * a, 0.3 + 0.15 * a, -1.5 + 0.4 * a);
      look.set(-4.3, 0.95 + 0.15 * a, 0);
      fov = lerp(50, 40, a) - 12 * smooth((a - 0.82) / 0.18);
      roll = -0.06 * (1 - a);
    } else if (T < tFinal) {
      // 3) 斬りまくり: 2回斬るごとにカットを切り替える
      const k = Math.floor((T - ULT.tBarrage) / cyc);
      const idx = Math.floor(k / 2);
      const tt = T - ULT.tBarrage - idx * 2 * cyc;
      switch (idx % 6) {
        case 0: { const ang = 0.5 + 0.9 * tt; pos.set(C.x + Math.cos(ang) * 5.6, 1.2, C.z + Math.sin(ang) * 5.6); look.set(C.x, C.y, C.z); fov = 56; break; }
        case 1: pos.set(0.4, 6.8, 0.6 + 0.3 * tt); look.set(0, 1.5, 0); fov = 52; roll = 0.4 * tt; break;
        case 2: { const ang = 1.6 + 0.4 * tt; pos.set(C.x + Math.cos(ang) * 4.4, 0.5, C.z + Math.sin(ang) * 4.4); look.set(C.x, C.y + 0.1, C.z); fov = 50; break; }
        case 3: { // 自分の少し後ろから、斬り抜ける先を追う
          p1.group.getWorldPosition(v);
          const d = this.ctx.ultPath(k).d;
          pos.copy(v).addScaledVector(d, -1.6).add(w.set(0, 0.45, 0));
          look.set(C.x, C.y, C.z); fov = 68; break; }
        case 4: { const ang = 3.9 + 0.8 * tt; pos.set(C.x + Math.cos(ang) * 5.8, 0.4, C.z + Math.sin(ang) * 5.8); look.set(C.x, C.y, C.z); fov = 54; break; }
        default: pos.set(C.x + 1.7, 0.7, C.z + 2.1); look.set(C.x, C.y, C.z); fov = 44; roll = -0.1; break;
      }
    } else {
      const Tf = T - tFinal;
      if (Tf < holdEnd) {
        // 4) 跳び上がった自分を、下から見上げる（スローモーション）
        const a = Tf / holdEnd;
        pos.set(-3.3 + 0.3 * a, 0.25, 3.0 - 0.4 * a);
        look.set(-1.0, 2.2, 0);
        fov = lerp(52, 42, a);
        roll = 0.12;
      } else {
        // 5) 急降下の一撃を、真横から。命中のあと、ゆっくり引いていく
        const a = Tf - holdEnd;
        pos.set(0.3 + 0.2 * a, 1.0 + 0.5 * a, 5.8 + 1.2 * a);
        look.set(0.2, 1.0, 0);
        fov = 46;
      }
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
