import * as THREE from 'three';
import { ULTF, ULTF_END } from '../character/FangController.js';
import { DAMAGE, FIGHT } from '../character/Health.js';
import { DraculaCastle } from './DraculaCastle.js';

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * 吸血牙の必殺技の演出（ドラキュラ城のムービー）。
 *  - 赤い宝石が当たる → 画面が切り替わる（閃光 → ドラキュラ城）
 *  - 敵が「ここはどこだ」とあたふた → 蝙蝠の大群が一つにまとまって本体が現れる
 *  - 赤い宝石が光って凶暴化 → 重い牙の一撃（体力を最大の30%回復）
 * UltimateDirector（剣）と同じ口（active / update / updateCamera / onEvent / camDistance）を持つ。
 */
export class FangUltimateDirector {
  // ctx: { scene, camera, lights: {hemi, sun}, stage, impact, sparks, fx, overlay, p1, p2, getPlayer, hooks, swarm, fang }
  constructor(ctx) {
    this.ctx = ctx;
    this.castle = new DraculaCastle();
    ctx.scene.add(this.castle.group);
    this._active = false;
    this.camDistance = 4;
    this.saved = null;
    this.gather = new THREE.Vector3(ULTF.player.x, 1.9, ULTF.player.z); // 蝙蝠の大群が集まる点
    this.shakeT = 0;
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
    scene.background = new THREE.Color(0x07040b);
    scene.fog = new THREE.Fog(0x0b0610, 16, 48);
    lights.hemi.color.set(0x6a6cc0);
    lights.hemi.groundColor.set(0x2a1020);
    lights.hemi.intensity = 0.7;
    lights.sun.color.set(0x9ab4ff); // 月明かり
    lights.sun.intensity = 0.9;
    lights.sun.position.set(10, 9, -4);
    stage.group.visible = false;
    this.castle.group.visible = true;
    document.body.classList.add('cine-on');
    overlay.setTheme('blood');
    overlay.setOn(true);
    this._active = true;
  }

  exitCine() {
    const { scene, lights, stage, fx, overlay, camera, swarm } = this.ctx;
    const s = this.saved;
    if (s) {
      scene.background = s.bg; scene.fog = s.fog;
      lights.hemi.color.copy(s.hemi.sky); lights.hemi.groundColor.copy(s.hemi.ground); lights.hemi.intensity = s.hemi.i;
      lights.sun.color.copy(s.sun.color); lights.sun.intensity = s.sun.i; lights.sun.position.copy(s.sun.pos);
    }
    stage.group.visible = true;
    this.castle.group.visible = false;
    swarm.clear();
    document.body.classList.remove('cine-on');
    overlay.setOn(false);
    overlay.setTheme('');
    camera.up.set(0, 1, 0);
    fx.baseFov = 55; camera.fov = 55; camera.updateProjectionMatrix();
    this._active = false;
  }

  update(dt) {
    const { overlay, p1, sparks } = this.ctx;
    overlay.update(dt);
    this.castle.update(dt);
    const pl = this.player;
    const u = pl && pl.ult;
    // 赤い宝石が飛んでいる間、赤い光の粒を散らす
    if (u && u.phase === 'throw' && u.released && !u.hit && pl.gem) {
      pl.gem.getWorldPosition(v);
      sparks.burst(v, w.set(0, 0, 0), 2, p1.height * 0.035, p1.height * 1.2, 0.0, 1, 0.45, 0.2);
    }
    // 宝石が光っている間、手もとから赤い火花
    if (u && u.phase === 'cine' && pl.gem && pl.gem.visible && u.gemGlow > 0.3 && Math.random() < 0.5) {
      pl.gem.getWorldPosition(v);
      sparks.burst(v, w.set(0, 0, 0), 1, p1.height * 0.03, p1.height * 1.5, 0.0, 1, 0.45, 0.2);
    }
  }

  onEvent(e) {
    const { impact, sparks, fx, overlay, p1, p2, hooks, swarm, fang } = this.ctx;
    const H = p2.height;
    const K = ULTF;
    switch (e.type) {
      case 'ultStart':
        fx.zoom(-70); fx.kick(0, 0.2, 0.4);
        break;
      case 'ultBallDraw':
        // 懐から赤い宝石を取り出す: 赤い光がはじける
        this.player.gem.getWorldPosition(v);
        impact.flash(v, p1.height * 1.1, 0.18);
        sparks.burst(v, w.set(0, 0, 0), 10, p1.height * 0.04, p1.height * 1.8, 0.0, 1, 0.45, 0.2);
        break;
      case 'ultThrow':
        fx.zoom(110); fx.kick(0.4, 0, 0.8);
        break;
      case 'ultHit': {
        // 宝石が当たった: 時間が止まり、画面が白く光る
        hooks.hitStop(0.3);
        hooks.flashFoe(0.25);
        overlay.flash(0.8);
        fx.shake(0.9);
        fx.zoom(-260);
        v.set(p2.group.position.x, p2.group.position.y + H * 0.64, p2.group.position.z);
        impact.flash(v, H * 3.4, 0.3);
        impact.ring(p2.group.position, H * 2.2, 0.4);
        w.copy(v).sub(p1.group.position).setY(0).normalize();
        sparks.burst(v, w, 22, H * 0.06, H * 4.0, 0.0, 1, 0.4, 0.2);
        hooks.damage(DAMAGE.fangUltGem, v, 'big');
        break;
      }
      case 'ultCineStart':
        overlay.flash(1);
        this.enterCine();
        overlay.setLines(false);
        swarm.clear();
        break;
      case 'ultTitle':
        overlay.flash(0.4);
        overlay.title('ドラキュラ城', 'DRACULA CASTLE', 2.0);
        fx.shake(0.3);
        break;
      case 'ultSwarm': {
        // 蝙蝠の大群が、大扉から押し寄せ、一つの渦にまとまっていく
        const Tnow = () => (this.player.ult ? this.player.ult.t : 0);
        const q = this.gather;
        for (let wave = 0; wave < 3; wave++) {
          v.set(-15.5, 4, 0);
          swarm.stream(v, 56, q, {
            speed: 9, size: 0.16, spread: 5, delay: wave * 0.45, delayRange: 0.9, life: 8,
            onArrive: () => {
              const remain = Math.max(0.3, K.tAppear - Tnow());
              swarm.orbit(q, 1, { radius: 2.6, height: 3.0, angV: 6.5, size: 0.16, life: remain, shrink: 0.75 });
            },
          });
        }
        fx.shake(0.35);
        break;
      }
      case 'ultAppear':
        // 大群が一つにまとまって、本体が現れる
        swarm.clear();
        v.set(K.player.x, 1.0, K.player.z);
        swarm.burst(v, 60, { speed: 12, size: 0.16, life: 1.2, up: 0.4 });
        impact.flash(v, 3.2, 0.35);
        impact.ring(w.set(K.player.x, 0, K.player.z), 3.2, 0.5);
        overlay.flash(0.95);
        fx.shake(0.8); fx.zoom(-120);
        break;
      case 'ultGem':
        this.player.gem.getWorldPosition(v);
        impact.flash(v, 1.2, 0.3);
        fx.zoom(-60);
        break;
      case 'ultBerserk':
        // 宝石が強く光り、凶暴化
        this.player.gem.getWorldPosition(v);
        impact.flash(v, 2.6, 0.4);
        overlay.flash(0.85);
        fx.shake(1.0); fx.zoom(-180);
        this.shakeT = 1.0;
        v.set(K.player.x, 0.5, K.player.z);
        swarm.burst(v, 30, { speed: 9, size: 0.14, life: 1.0, up: 0.6 });
        break;
      case 'ultDash':
        fx.zoom(200); fx.kick(0, 0, 1.4);
        break;
      case 'ultBite': {
        // 重い牙の一撃: あごが首にがぶりと食らいつく。体力を最大の30%回復
        v.set(p2.group.position.x, H * 0.8, p2.group.position.z);
        fang.jaw(v, fang.jawHeading(w.set(1, 0, 0)), H * 2.0, { open: 1.0, tilt: 0.0, dur: 0.9, snap: 0.35 });
        hooks.damage(DAMAGE.fangUltBite, v, 'huge');
        hooks.hitStop(0.28);
        hooks.flashFoe(0.25);
        overlay.flash(1);
        fx.shake(1.2); fx.zoom(-260); fx.kick(0.6, 0.3, -1.4);
        impact.flash(v, H * 4.4, 0.34);
        sparks.burst(v, w.set(1, 0, 0), 40, H * 0.08, H * 5.5, 0.0, 1, 0.36, 0.2);
        sparks.burst(v, w.set(1, 0, 0), 14, H * 0.1, H * 3.4, 0.0, 1, 0.3, 0.1);
        const healed = hooks.heal(FIGHT.maxHp * DAMAGE.fangUltHeal);
        // 血が相手から自分へ流れ込む
        if (healed > 0) {
          const target = new THREE.Vector3(p1.group.position.x, p1.height * 0.6, p1.group.position.z);
          this.ctx.swarm.stream(v, 40, target, { speed: 8, size: 0.1, spread: 0.4, delayRange: 0.7, life: 4 });
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
  updateCamera(dt = 0.016) {
    const pl = this.player;
    const u = pl && pl.ult;
    if (!u || u.phase !== 'cine') return;
    const T = u.t;
    const K = ULTF;
    const f = this.ctx.p2.group.position;
    const P = K.player;
    let fov = 46;
    let roll = 0;
    if (T < 1.2) {
      // 1) 敵の背後から、広い大広間。あたふたしている敵が手前に、奥には大扉
      const a = T / 1.2;
      pos.set(lerp(9.2, 8.2, a), lerp(2.4, 2.0, a), 3.4); look.set(-3.0, 1.5, 0); fov = 50;
    } else if (T < K.tSwarm) {
      // 2) 敵の顔のアップ。きょろきょろと見回す
      pos.set(0.3, 0.78, 1.7); look.set(K.foe.x, 0.65, K.foe.z); fov = 40;
    } else if (T < 3.7) {
      // 3) 敵の肩ごしに、大扉から押し寄せる蝙蝠の大群
      pos.set(6.4, 1.6, 1.4); look.set(-8, 2.6, 0); fov = 58;
    } else if (T < K.tAppear) {
      // 4) 渦を巻く大群を、低い位置から見上げる（じわっと寄る）
      const a = (T - 3.7) / (K.tAppear - 3.7);
      pos.set(lerp(-0.6, -1.4, a), 0.5, lerp(-3.4, -2.6, a)); look.set(P.x, lerp(1.7, 1.2, a), P.z); fov = 56; roll = 0.12 * (1 - a);
    } else if (T < K.tGem) {
      // 5) 本体が現れる: 正面から
      const a = (T - K.tAppear) / (K.tGem - K.tAppear);
      pos.set(lerp(-0.6, -1.1, a), 0.5, 2.3); look.set(P.x, 0.55, P.z); fov = 46;
    } else if (T < K.tBerserk) {
      // 6) 赤い宝石のアップ
      pos.set(P.x + 0.9, 0.62, P.z - 1.3); look.set(P.x + 0.15, 0.52, P.z - 0.3); fov = 36;
    } else if (T < K.tDash) {
      // 7) 凶暴化した顔のアップ（ふるえる）
      const a = (T - K.tBerserk) / (K.tDash - K.tBerserk);
      pos.set(P.x + 1.6 - 0.2 * a, 0.62, P.z - 0.1); look.set(P.x, 0.62, P.z); fov = lerp(38, 32, a);
      this.shakeT = Math.max(this.shakeT, 0.6);
    } else if (T < K.tBite) {
      // 8) 飛びかかる: 横から追う
      pos.set(-0.2, 0.75, -3.2); look.set(0.2, 0.5, 0.1); fov = 48; roll = -0.06;
    } else if (T < K.tBite + 0.55) {
      // 9) 噛みつく瞬間: 近い横の画（スロー）
      pos.set(f.x - 1.3, 0.85, -1.8); look.set(f.x - 0.4, 0.62, f.z); fov = 42;
    } else {
      // 10) 吹き飛んだ敵を追い、引いて見せる
      const a = clamp01((T - K.tBite - 0.55) / 1.4);
      pos.set(lerp(1.5, -1.0, a), lerp(1.2, 2.2, a), lerp(-3.8, -5.2, a)); look.set(Math.min(f.x, 6.8), 0.5, f.z); fov = 52;
    }
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt * 1.4);
      const s = 0.02 * this.shakeT;
      pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s;
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
