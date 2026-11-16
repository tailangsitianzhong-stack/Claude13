import * as THREE from 'three';
import { DAMAGE } from '../character/Health.js';
import { RIG } from '../character/rig.js';
import { createArrowSticker, createArrow3D, ARROW_COLORS } from '../character/Arrow.js';

// 矢印の演出: ステッカーの貼り付け（腕・すね・床・相手・地面）、砲弾の飛行と命中、ダッシュの軌跡、地面の隆起、押さえつけ。
// コントローラ（ArrowController）が出す arrow* のイベントと、通常攻撃の節目（onSwing）を受けて動かす。
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const dir = new THREE.Vector3();

const HUE = { accel: 0.13, cannon: 0.05, up: 0.4, down: 0.76, slow: 0.58, pull: 0.88 };

// 砲弾の矢印: 太い立体の矢印に、オレンジの光の玉と、うしろへのびる炎。遠くからでも「砲弾だ」とわかる
let glowTexture = null;
function glowTex() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,230,1)'); grad.addColorStop(0.3, 'rgba(255,170,60,0.85)'); grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}
function createCannon() {
  const g = new THREE.Group();
  const arrow = createArrow3D(ARROW_COLORS.cannon, { variant: 'cannon', depth: 0.45, scale: 1, emissive: 1.3 });
  g.add(arrow);
  // 白い芯の輪郭（少し大きい白い矢印を後ろに）で、形をくっきりさせる
  const rim = createArrow3D(0xffffff, { variant: 'cannon', depth: 1.1, scale: 1.12, emissive: 1.5 });
  rim.material.transparent = true; rim.material.opacity = 0.0; rim.visible = false;
  g.add(rim);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
  sprite.scale.setScalar(2.2);
  g.add(sprite);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.0, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  flame.position.z = -2.4; // 先がうしろ（-Z）へのびる炎
  g.add(flame);
  g.userData.flame = flame;
  flame.visible = false;   // 構えている間は出さない（撃ち出してから）
  g.userData.setGlow = (k, time = 0) => {
    arrow.userData.setGlow(k * 0.5, time);
    flame.scale.set(1, 1, 0.7 + 0.5 * Math.abs(Math.sin(time * 31)));
    sprite.material.opacity = 0.35 + 0.15 * Math.sin(time * 22);
  };
  return g;
}

// 床に寝かせる矢印のステッカー（先が dir を向く）
function createFloorArrow(color, scale) {
  const pivot = new THREE.Group();
  const st = createArrowSticker(color, { variant: 'double', scale });
  st.rotation.x = Math.PI / 2; // 先が +Z、面は上下
  st.position.y = 0.025;
  pivot.add(st);
  pivot.userData.st = st;
  pivot.visible = false;
  return pivot;
}

const CANNON_SCALE = 0.5;   // 砲弾の矢印の大きさ（半分の長さ。ワールド単位 × S/0.15）

export class ArrowDirector {
  // ctx: { scene, camera, impact, sparks, fx, p1, p2, dummy, stage, getPlayer, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, p2 } = ctx;
    // 床の矢印（プール）
    this.floor = [];
    for (let i = 0; i < 10; i++) { const f = createFloorArrow(ARROW_COLORS.accel, 0.25); f.userData.item = { t: 9, life: 1, delay: 0 }; scene.add(f); this.floor.push(f); }
    // 相手に貼る矢印（胸の正面）: 下向き・鈍足・引き寄せ（必殺技は ArrowUltimate が使う）
    this.foeStickers = {};
    const R = RIG;
    for (const [name, color, rotZ, scale] of [['down', ARROW_COLORS.down, Math.PI, 0.95], ['slow', ARROW_COLORS.slow, Math.PI, 0.95], ['pull', ARROW_COLORS.pull, Math.PI, 1.0]]) {
      const st = createArrowSticker(color, { scale });
      st.rotation.z = rotZ;
      st.position.set(0, R.chestTop - R.chest[1] / 2, R.chest[2] / 2 + 0.05);
      st.visible = false;
      p2.joints.waist.add(st);
      this.foeStickers[name] = st;
    }
    // 砲弾（立体の矢印）と、鈍足矢印の弾
    // ロード中に作っておく（試合中に作ると、重くなる）: 砲弾2つ、鈍足矢印の弾1つ
    this.cannonHeld = null;
    this.cannons = [];
    this.cannonPool = [];
    for (let i = 0; i < 3; i++) { const c = createCannon(); c.visible = false; scene.add(c); this.cannonPool.push(c); }
    this.slowArrow = createArrow3D(ARROW_COLORS.slow, { depth: 0.2, scale: 0.2 });
    this.slowArrow.visible = false;
    scene.add(this.slowArrow);
    this.slowShot = null;
    // 地面から立つ上向き矢印（コンボ）
    this.upArrow = createArrow3D(ARROW_COLORS.up, { depth: 0.14, scale: 0.0, pointing: 'y' });
    this.upArrow.visible = false;
    scene.add(this.upArrow);
    this.upT = 0;
    // 隆起する地面の柱（プール）
    this.pillars = [];
    const pm = new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 1 }); // 平らな面の指定（flatShading）をしない: 他の物と同じシェーダーを使えて、初めて出るときに止まらない
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pm); m.visible = false; m.castShadow = true; scene.add(m); this.pillars.push({ m, t: 9, h: 1, w: 1, delay: 0 }); }
    this.rush = null;        // 加速ダッシュ中の軌跡
  }

  get player() { return this.ctx.getPlayer(); }

  stickerOn(st, on) { if (st) st.visible = on; }

  // ---- 狙う向き ----
  aimDir(from, maxHoriz = 300) {
    const { p1, p2 } = this.ctx;
    const h = p1.group.rotation.y;
    const S = p1.scale;
    const chest = w.set(p2.group.position.x, p2.group.position.y + 3.0 * S, p2.group.position.z);
    const toFoe = dir.subVectors(chest, from);
    const horiz = Math.hypot(toFoe.x, toFoe.z);
    const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const cos = horiz > 1e-6 ? (toFoe.x * fwd.x + toFoe.z * fwd.z) / horiz : 1;
    return (cos > 0.5 && horiz < maxHoriz * S) ? toFoe.clone().normalize() : fwd;
  }

  // ---- 通常攻撃の節目 ----
  onSwing(e) {
    const { fx, sparks, p1 } = this.ctx;
    if (e.index === 0) { fx.zoom(70); fx.kick(0, -0.1, 1.0); fx.shake(0.3); }
    else if (e.index === 1) { fx.zoom(150); fx.kick(0, 0, 1.4); fx.shake(0.3); }
    else { fx.zoom(40); fx.kick(0, -0.5, 0.4); }
    p1.joints.rWrist.getWorldPosition(v);
    sparks.burst(v, w.set(0, 0, 0), 5, p1.height * 0.04, p1.height * 2.0, HUE.accel, 1, 0.55, 0.3);
  }

  // ---- 通常攻撃が当たった追加エフェクト（吹っ飛ばし・蹴り）----
  onHit(index) {
    const { impact, sparks, p2, p1 } = this.ctx;
    const H = p2.height;
    v.set(p2.group.position.x, p2.group.position.y + H * 0.62, p2.group.position.z);
    w.set(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
    sparks.burst(v, w, 14, H * 0.055, H * 3.6, HUE.accel, 1, 0.55, 0.3);
    if (index === 0) { impact.ring(p2.group.position, H * 1.8, 0.4); impact.flash(v, H * 3.0, 0.2); }
    if (index === 1) impact.ring(p2.group.position, H * 1.5, 0.35);
  }

  // ---- イベント ----
  onEvent(e) {
    const { impact, sparks, fx, p1, p2, hooks, scene, dummy } = this.ctx;
    const S = p1.scale;
    const H = p2.height;
    switch (e.type) {
      case 'arrowArmStick':
        // 右の前腕に、加速の矢印をぺたり
        p1.armSticker.visible = true;
        p1.joints.rElbow.getWorldPosition(v);
        impact.flash(v, p1.height * 1.1, 0.18);
        sparks.burst(v, w.set(0, 0, 0), 8, p1.height * 0.04, p1.height * 1.6, HUE.accel, 1, 0.6, 0.3);
        fx.zoom(-40);
        break;
      case 'arrowArmOff': p1.armSticker.visible = false; break;
      case 'arrowFloorStick': this.placeFloor(e.x, e.z, e.dir, e.len, 0.36 * S / 0.15, 4); fx.zoom(-30); break;
      case 'arrowPressStart': {
        this.foeStickers.down.visible = true;
        v.set(p2.group.position.x, p2.height * 0.7, p2.group.position.z);
        impact.flash(v, H * 2.2, 0.2);
        impact.ring(p2.group.position, H * 1.6, 0.4);
        sparks.burst(v, e.dir, 12, H * 0.05, H * 3, HUE.down, 1, 0.55, 0.3);
        fx.shake(0.45); fx.zoom(-110);
        break;
      }
      case 'arrowPunch':
        this.foeHit(DAMAGE.arrowPunch, { small: true, stop: 0.025, n: e.n, dir: e.dir });
        sparks.burst(v.set(p2.group.position.x, H * 0.4, p2.group.position.z), e.dir, 5, H * 0.045, H * 2.4, HUE.down, 1, 0.55, 0.3);
        impact.ring(p2.group.position, H * 1.0, 0.18);
        break;
      case 'arrowPressEnd': this.foeStickers.down.visible = false; break;
      // ---- スキル1: 砲弾 ----
      case 'arrowSkill1Start': fx.zoom(-40); break;
      case 'arrowCannonStick': {
        const m = this.cannonPool.find((c) => !c.visible) ?? createCannon();
        if (!m.parent) scene.add(m);
        m.visible = true;
        m.userData.flame.visible = false;
        m.scale.setScalar(0.001);
        this.cannonHeld = { m, t: 0 };
        p1.joints.rWrist.getWorldPosition(v);
        impact.flash(v, p1.height * 1.3, 0.2);
        break;
      }
      case 'arrowCannonFire': this.fireCannon(); break;
      // ---- スキル2: 高く飛んで叩きつけ ----
      case 'arrowShinStick':
        for (const s of p1.shinStickers) s.visible = true;
        p1.joints.lKnee.getWorldPosition(v);
        impact.flash(v, p1.height * 1.2, 0.2);
        sparks.burst(v, w.set(0, 0, 0), 8, p1.height * 0.04, p1.height * 1.6, HUE.up, 1, 0.55, 0.3);
        break;
      case 'arrowShinOff': for (const s of p1.shinStickers) s.visible = false; break;
      case 'arrowLeap':
        v.set(p1.group.position.x, 0.03, p1.group.position.z);
        impact.ring(v, p1.height * 1.8, 0.4);
        sparks.burst(v, w.set(0, 0, 0), 12, p1.height * 0.06, p1.height * 2.4, 0.25, 0.25);
        fx.zoom(200); fx.kick(0, 1.0, 0.6); fx.shake(0.4);
        break;
      case 'arrowDive': fx.zoom(-100); fx.kick(0, -1.4, 0.5); break;
      case 'arrowSlamLand': {
        v.set(e.x, 0.03, e.z);
        hooks.groundBreak(e.x, e.z, 7);
        impact.ring(v, p1.height * 3.0, 0.5);
        impact.ring(v, p1.height * 1.6, 0.32);
        sparks.burst(v, w.set(0, 0, 0), 22, p1.height * 0.07, p1.height * 3, 0.25, 0.25);
        fx.shake(0.9); fx.zoom(-160); fx.kick(0, -1.3, 0);
        if (e.hit) this.foeHit(DAMAGE.arrowSlam, { huge: true, stop: 0.2, dir: e.dir });
        else hooks.hitStop(0.06);
        this.eruptPillars(e.x, e.z, 0.7);
        break;
      }
      // ---- スキル3: 加速ダッシュ ----
      case 'arrowSkill3Start': fx.zoom(-50); break;
      case 'arrowRushPlace': {
        const sc = (0.34 + 0.22 * e.speedK) * S / 0.15;
        this.placeFloor(e.x, e.z, e.dir, e.len, sc, 10, e.speedK);
        fx.zoom(-60);
        break;
      }
      case 'arrowRushStart':
        this.rush = { speedK: e.speedK };
        fx.zoom(120 + 220 * e.speedK); fx.kick(0, 0, 1.2); fx.shake(0.3 + 0.3 * e.speedK);
        break;
      case 'arrowRushHit': {
        this.rush = null;
        const k = e.speedK;
        this.foeHit(e.damage, { huge: true, stop: 0.12 + 0.12 * k, dir: e.dir });
        v.set(p2.group.position.x, p2.height * 0.6, p2.group.position.z);
        sparks.burst(v, e.dir, 18 + Math.round(20 * k), H * 0.065, H * (3.6 + 2 * k), HUE.accel, 1, 0.55, 0.3);
        impact.ring(p2.group.position, H * (2.0 + 1.6 * k), 0.5);
        fx.shake(0.6 + 0.6 * k); fx.zoom(-120 - 160 * k);
        break;
      }
      // ---- スキル4: 鈍足矢印 ----
      case 'arrowSkill4Start': fx.zoom(-40); break;
      case 'arrowSlowShot': {
        p1.joints.rWrist.getWorldPosition(v);
        const m = this.slowArrow;
        m.visible = true;
        m.position.copy(v);
        const to = new THREE.Vector3(p2.group.position.x, p2.group.position.y + 3.0 * S, p2.group.position.z);
        this.slowShot = { m, from: v.clone(), to: e.hasTarget ? to : v.clone().addScaledVector(new THREE.Vector3(Math.sin(p1.group.rotation.y), 0, Math.cos(p1.group.rotation.y)), 8 * S), t: 0, dur: 0.22 };
        fx.zoom(60); fx.kick(0.3, 0, 0.5);
        break;
      }
      case 'arrowSlowStick':
        this.foeStickers.slow.visible = true;
        v.set(p2.group.position.x, p2.height * 0.65, p2.group.position.z);
        impact.flash(v, H * 2.0, 0.22);
        impact.ring(p2.group.position, H * 1.4, 0.35);
        sparks.burst(v, w.set(0, 0, 0), 12, H * 0.05, H * 2.6, HUE.slow, 1, 0.55, 0.3);
        break;
      // ---- コンボ: 上向き矢印で地面を隆起 ----
      case 'arrowFinStick':
        this.upArrow.position.set(e.x, 0, e.z);
        this.upArrow.rotation.y = Math.atan2(p1.group.position.x - e.x, p1.group.position.z - e.z); // 平らな面を自分のほうへ
        this.upArrow.visible = true;
        this.upT = 0;
        v.set(e.x, 0.03, e.z);
        impact.ring(v, p1.height * 1.4, 0.35);
        fx.zoom(-60);
        break;
      case 'arrowErupt': {
        this.upArrow.visible = false;
        v.set(e.x, 0.03, e.z);
        hooks.groundBreak(e.x, e.z, 9);
        impact.ring(v, p1.height * 3.6, 0.55);
        impact.ring(v, p1.height * 2.0, 0.35);
        this.eruptPillars(e.x, e.z, 1.0);
        sparks.burst(v, w.set(0, 0, 0), 26, p1.height * 0.07, p1.height * 3.4, 0.25, 0.25);
        sparks.burst(v, w.set(0, 0, 0), 14, p1.height * 0.06, p1.height * 3.4, HUE.up, 1, 0.55, 0.3);
        fx.shake(1.0); fx.zoom(-170); fx.kick(0, 1.0, -0.4);
        if (e.hit) this.foeHit(DAMAGE.arrowErupt, { huge: true, stop: 0.22, dir: e.dir });
        else hooks.hitStop(0.06);
        break;
      }
      case 'arrowFinOff': this.upArrow.visible = false; break;
      case 'arrowCancel':
        p1.armSticker.visible = false;
        for (const s of p1.shinStickers) s.visible = false;
        this.foeStickers.down.visible = false;
        this.upArrow.visible = false;
        if (this.cannonHeld) { this.cannonHeld.m.visible = false; this.cannonHeld = null; }
        this.rush = null;
        break;
      default: break;
    }
  }

  // ---- 床の矢印を、(x,z) から dir の向きへ並べる ----
  placeFloor(x, z, d, len, scale, maxN, speedK = 0) {
    const S = this.ctx.p1.scale;
    const n = Math.max(3, Math.min(maxN, Math.round(len / 5)));
    for (let i = 0; i < n; i++) {
      const f = this.floor[i % this.floor.length];
      const dist = (1.6 + (len - 1.6) * (i + 0.5) / n) * S;
      f.position.set(x + d.x * dist, 0, z + d.z * dist);
      f.rotation.y = Math.atan2(d.x, d.z);
      f.userData.st.userData.setOpacity(0);
      f.userData.st.scale.setScalar(scale);
      f.userData.baseScale = scale;
      f.userData.item = { t: 0, life: 0.95 + 0.25 * speedK, delay: i * 0.035 };
      f.visible = false;
    }
  }

  // ---- 砲弾 ----
  fireCannon() {
    const { p1, impact, sparks, fx, scene } = this.ctx;
    const S = p1.scale;
    const held = this.cannonHeld;
    if (!held) return;
    this.cannonHeld = null;
    const from = held.m.position.clone();
    const d = this.aimDir(from);
    held.m.scale.setScalar(CANNON_SCALE * S / 0.15);
    const heading = Math.atan2(d.x, d.z);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, d.y)));
    held.m.rotation.set(pitch, heading, 0, 'YXZ');
    held.m.userData.flame.visible = true;
    this.cannons.push({ m: held.m, p: from, d, left: 260 * S, speed: 240 * S, t: 0 });
    impact.flash(from, p1.height * 1.4, 0.2);
    impact.ring(p1.group.position, p1.height * 2.0, 0.4);
    sparks.burst(from, d, 16, p1.height * 0.06, p1.height * 4, HUE.cannon, 1, 0.55, 0.3);
    fx.shake(0.7); fx.zoom(180); fx.kick(0, 0.2, 1.6);
  }

  // ---- 地面の隆起 ----
  eruptPillars(x, z, k) {
    const S = this.ctx.p1.scale;
    this.pillars.forEach((pl, i) => {
      const a = (i / this.pillars.length) * Math.PI * 2 + Math.random() * 0.4;
      const r = (i === 0 ? 0 : 3 + Math.random() * 7 * k) * S;
      pl.m.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      pl.m.rotation.y = Math.random() * 3;
      pl.w = (1.6 + Math.random() * 1.6) * S;
      pl.h = (i === 0 ? 7 : 3 + Math.random() * 4) * S * k;
      pl.t = 0;
      pl.delay = i === 0 ? 0 : 0.02 + Math.random() * 0.05;
      pl.m.visible = false;
    });
  }

  foeHit(amount, o = {}) {
    const { impact, sparks, fx, p1, p2, hooks, camera } = this.ctx;
    const H = p2.height;
    const at = new THREE.Vector3(p2.group.position.x, p2.group.position.y + H * 0.62, p2.group.position.z);
    if (o.small) { at.x += (Math.random() - 0.5) * H * 0.3; at.y += (Math.random() - 0.2) * H * 0.3; }
    const d = o.dir ?? new THREE.Vector3(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
    hooks.damage(amount, at, o.huge ? 'huge' : o.big ? 'big' : '');
    hooks.hitStop(o.stop ?? 0.08);
    hooks.flashFoe(o.small ? 0.035 : 0.12);
    fx.shake(o.huge ? 1 : o.small ? 0.14 : 0.45);
    fx.zoom(o.huge ? -230 : o.small ? 40 : -110);
    if (o.small) fx.kick((o.n % 2 ? 1 : -1) * 0.35, 0.1, -0.25);
    else fx.kick(0, 0.2, o.huge ? -1.6 : -0.7);
    impact.flash(at, H * (o.huge ? 3.4 : o.small ? 1.0 : 2.0), o.huge ? 0.24 : o.small ? 0.09 : 0.16);
    if (!o.small) impact.streak(at, d, camera, H * (o.huge ? 3.4 : 2.2), 0.18);
    sparks.burst(at, d, o.huge ? 24 : o.small ? 4 : 12, H * (o.huge ? 0.075 : 0.055), H * (o.huge ? 5 : 3.2));
    if (o.huge) { impact.ring(p2.group.position, H * 2.4, 0.5); impact.ring(p2.group.position, H * 1.4, 0.32); }
  }

  update(dt) {
    const { impact, sparks, fx, p1, p2, dummy, hooks, stage } = this.ctx;
    const S = p1.scale;
    const time = performance.now() / 1000;
    // 腕・すね・相手のステッカーを、ぴかぴか光らせる
    if (p1.armSticker.visible) p1.armSticker.userData.setGlow(1, time);
    for (const s of p1.shinStickers) if (s.visible) s.userData.setGlow(1, time);
    for (const st of Object.values(this.foeStickers)) if (st.visible) st.userData.setGlow(1, time);
    // 鈍足: 状態が切れたら、矢印をはがす
    if (!dummy.status.has('slow')) this.foeStickers.slow.visible = false;
    // 床の矢印: ぽんと現れて、すっと消える
    for (const f of this.floor) {
      const it = f.userData.item;
      if (it.t >= it.life + it.delay) { f.visible = false; continue; }
      it.t += dt;
      const t = it.t - it.delay;
      if (t < 0) continue;
      f.visible = true;
      const k = t / it.life;
      const pop = Math.min(1, t / 0.08);
      f.userData.st.userData.setOpacity(Math.min(1, (1 - k) * 2.2) * pop);
      f.userData.st.userData.setGlow(1, time);
      f.userData.st.scale.setScalar(f.userData.baseScale * (0.6 + 0.4 * pop));
    }
    // 持っている砲弾: 自分の前で大きくなる
    const ch = this.cannonHeld;
    if (ch) {
      ch.t += dt;
      const yaw = p1.group.rotation.y;
      ch.m.position.set(p1.group.position.x + Math.sin(yaw) * 3.6 * S, p1.height * 1.55, p1.group.position.z + Math.cos(yaw) * 3.6 * S);
      ch.m.rotation.set(-0.95 * Math.min(1, ch.t / 0.2), yaw, 0, 'YXZ'); // 鼻先を上げて構える（後ろから見ても、矢印の形がわかる）
      ch.m.scale.setScalar((CANNON_SCALE * S / 0.15) * Math.min(1, ch.t / 0.2));
      ch.m.userData.setGlow(1, time);
    }
    // 飛んでいる砲弾
    const B = stage.bounds;
    for (let i = this.cannons.length - 1; i >= 0; i--) {
      const c = this.cannons[i];
      c.t += dt;
      // 撃ち出した直後はゆっくり、そこから一気に加速（飛んでいくのが見える）
      const speed = c.speed * (0.28 + 0.72 * Math.min(1, c.t / 0.2));
      const step = Math.min(c.left, speed * dt);
      const prev = c.p.clone();
      c.p.addScaledVector(c.d, step);
      c.left -= step;
      c.m.position.copy(c.p);
      c.m.userData.setGlow(1, time);
      sparks.burst(c.p, w.set(0, 0, 0), 3, p1.height * 0.07, p1.height * 1.0, HUE.cannon, 1, 0.55, 0.3);
      if (Math.random() < 0.5) impact.ring(w.set(c.p.x, 0, c.p.z), p1.height * 0.9, 0.18); // 通った地面に、衝撃の輪
      const foe = new THREE.Vector3(p2.group.position.x, p2.group.position.y + 3.0 * S, p2.group.position.z);
      const seg = new THREE.Vector3().subVectors(c.p, prev);
      const len2 = seg.lengthSq();
      const t01 = len2 > 0 ? Math.min(1, Math.max(0, w.subVectors(foe, prev).dot(seg) / len2)) : 0;
      const closest = prev.clone().addScaledVector(seg, t01);
      const hittable = dummy.state === 'ground' || dummy.state === 'hit' || dummy.state === 'down';
      if (hittable && closest.distanceTo(foe) < 5.2 * S) {
        this.cannonHit(c, closest);
        c.m.visible = false;
        this.cannons.splice(i, 1);
      } else if (c.left <= 0 || Math.abs(c.p.x) > B.maxX + 4 || Math.abs(c.p.z) > B.maxZ + 4 || c.p.y < 0) {
        impact.flash(c.p, p1.height * 1.4, 0.18);
        impact.ring(w.set(c.p.x, 0, c.p.z), p1.height * 1.6, 0.3);
        sparks.burst(c.p, w.set(0, 0, 0), 12, p1.height * 0.05, p1.height * 2.4, HUE.cannon, 1, 0.55, 0.3);
        c.m.visible = false;
        this.cannons.splice(i, 1);
      }
    }
    // 鈍足矢印の弾
    if (this.slowShot) {
      const s = this.slowShot;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      s.m.position.lerpVectors(s.from, s.to, u);
      const d = w.subVectors(s.to, s.from);
      if (d.lengthSq() > 1e-8) { d.normalize(); s.m.rotation.set(-Math.asin(Math.max(-1, Math.min(1, d.y))), Math.atan2(d.x, d.z), 0, 'YXZ'); }
      s.m.userData.setGlow(1, time);
      if (u >= 1) { s.m.visible = false; this.slowShot = null; }
    }
    // 地面から立つ上向き矢印: のびて、立つ
    if (this.upArrow.visible) {
      this.upT += dt;
      const k = Math.min(1, this.upT / 0.25);
      const sc = 0.001 + 0.5 * S / 0.15 * k;
      this.upArrow.scale.setScalar(sc);
      this.upArrow.position.y = sc; // 根もとを地面に
      this.upArrow.userData.setGlow(1, time);
    }
    // 隆起する柱
    for (const pl of this.pillars) {
      if (pl.t > 1.2) { pl.m.visible = false; continue; }
      pl.t += dt;
      const t = pl.t - pl.delay;
      if (t < 0) continue;
      const up = Math.min(1, t / 0.12);
      const down = t > 0.45 ? Math.min(1, (t - 0.45) / 0.55) : 0;
      const h = pl.h * (1 - Math.pow(1 - up, 2)) * (1 - down);
      pl.m.visible = h > 0.002;
      pl.m.scale.set(pl.w, Math.max(0.001, h), pl.w);
      pl.m.position.y = h / 2 - 0.02;
    }
    // 加速ダッシュの軌跡: 黄色い光の粒を撒く
    if (this.rush && this.player.bs && this.player.bs.n === 3) {
      p1.joints.hips.getWorldPosition(v);
      sparks.burst(v, w.set(-Math.sin(p1.group.rotation.y), 0, -Math.cos(p1.group.rotation.y)), 3 + Math.round(4 * this.rush.speedK), p1.height * 0.05, p1.height * (2 + 3 * this.rush.speedK), HUE.accel, 1, 0.55, 0.3);
      fx.shake(0.12);
    }
  }

  cannonHit(c, at) {
    const { impact, sparks, fx, p1, p2, dummy, hooks, camera } = this.ctx;
    const H = p2.height;
    dummy.launch(c.d.x, c.d.z, 70, 16);
    hooks.damage(DAMAGE.arrowCannon, at, 'huge');
    hooks.hitStop(0.2);
    hooks.flashFoe(0.2);
    fx.shake(1.1); fx.zoom(-260); fx.kick(0, 0.3, -1.6);
    impact.flash(at, H * 4.0, 0.3);
    impact.streak(at, c.d, camera, H * 3.6, 0.2);
    impact.ring(p2.group.position, H * 3.0, 0.55);
    impact.ring(p2.group.position, H * 1.6, 0.35);
    sparks.burst(at, c.d, 34, H * 0.08, H * 5.4, HUE.cannon, 1, 0.55, 0.3);
    sparks.burst(at, c.d, 12, H * 0.06, H * 4, 0.12, 0.9);
  }
}
