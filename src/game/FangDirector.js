import * as THREE from 'three';
import { DAMAGE } from '../character/Health.js';
import { crescentGeometry, glow } from '../effects/Impact.js';

// 吸血牙の演出: 赤い斬撃（飛んでいって当たる）、噛みつきの大きなあご、血しぶき、蝙蝠、吸血（体力回復）。
// コントローラ（FangController）が出す fang* のイベントと、通常攻撃の節目（onSwing / onBiteHit）を受けて動かす。
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const dir = new THREE.Vector3();
const _chest = new THREE.Vector3();

const RED = 0.0;       // 火花の色相（赤）
const BLOOD = [RED, 1, 0.36, 0.2]; // 暗い赤: hue, sat, 明るさの下限, 幅

// ---- あご（噛みつきの大きなエフェクト）----
// 上あごと下あごに、白い牙がずらりと並ぶ。大きく開いてから、がちんと閉じる。
function createJaw() {
  const g = new THREE.Group();
  const fangMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, fog: false, depthWrite: false });
  const gumMat = new THREE.MeshBasicMaterial({ color: 0xc0102a, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
  const make = (up) => {
    const hinge = new THREE.Group();
    hinge.position.z = -0.9;
    // 牙: 前の歯は大きく、奥ほど小さい。根元の赤い歯ぐきを1本ずつ付ける（面ではなく点で見せて、視界をふさがない）
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = (i / (N - 1) - 0.5) * 2;       // -1〜1
      const size = i === 2 || i === N - 3 ? 1.15 : i === 4 ? 0.9 : 0.7;
      const z = 1.7 - 1.5 * a * a;              // 中央が前へ出る弓形
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.2, size, 4), fangMat);
      fang.position.set(a * 1.05, up ? 0.3 - size / 2 : -0.3 + size / 2, z);
      fang.rotation.x = up ? Math.PI : 0;       // 上あごは下向き、下あごは上向き
      hinge.add(fang);
      const gum = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), gumMat);
      gum.position.set(a * 1.05, up ? 0.38 : -0.38, z);
      hinge.add(gum);
    }
    // 口の奥へ伸びる赤い筋（上あご・下あごの輪郭）
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.1), gumMat);
    rim.position.set(0, up ? 0.4 : -0.4, -0.1);
    hinge.add(rim);
    g.add(hinge);
    return hinge;
  };
  const upper = make(true);
  const lower = make(false);
  g.visible = false;
  g.userData = { upper, lower, fangMat, gumMat, t: 9, dur: 0.6, openAngle: 0.95, snapAt: 0.55 };
  return g;
}

export class FangDirector {
  // ctx: { scene, camera, impact, sparks, fx, p1, p2, dummy, stage, getPlayer, swarm, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    this.shots = [];      // 飛んでいる赤い斬撃
    this.shotPool = [];
    for (let i = 0; i < 10; i++) {
      const gm = glow(0xe0102c);
      gm.blending = THREE.NormalBlending; // 緑の草の上でも赤く見えるように
      const m = new THREE.Mesh(crescentGeometry(2.3, 1, 0.34), gm);
      m.visible = false;
      m.frustumCulled = false;
      ctx.scene.add(m);
      this.shotPool.push(m);
    }
    this.jaws = [];
    for (let i = 0; i < 3; i++) { const j = createJaw(); ctx.scene.add(j); this.jaws.push(j); }
    this.jawNext = 0;
  }

  get player() { return this.ctx.getPlayer(); }

  // 狙う向き（相手がいれば胸へ。正面の近くにいなければ、向いている方向）
  aimDir(from, maxHoriz = 260) {
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

  clawPos(out) {
    const { p1 } = this.ctx;
    p1.group.updateWorldMatrix(true, true);
    const c = p1.claws;
    return out.copy(c.userData.tip).multiplyScalar(0.5).applyMatrix4(c.matrixWorld);
  }

  // ---- 赤い斬撃を飛ばす ----
  fireShot(from, d, o) {
    const { p1 } = this.ctx;
    const S = p1.scale;
    const m = this.shotPool.find((s) => !s.visible) ?? this.shotPool[0];
    m.visible = true;
    const heading = Math.atan2(d.x, d.z);
    m.rotation.set(0, heading, o.tilt ?? 0, 'YXZ');
    m.scale.setScalar(o.size * S);
    m.position.copy(from);
    m.material.opacity = 0.95;
    this.shots.push({ m, p: from.clone(), d: d.clone(), left: o.range * S, speed: o.speed * S, damage: o.damage, heal: o.heal ?? 0, kind: o.kind, hitR: o.hitR * S, big: !!o.big });
  }

  // ---- 通常攻撃の節目（swing イベント）----
  onSwing(e) {
    const { impact, sparks, fx, p1 } = this.ctx;
    const h = p1.group.rotation.y;
    const S = p1.scale;
    if (e.index === 0) {
      // 噛みつき: 目の前に、大きなあごがガブッと閉じる
      const { p2 } = this.ctx;
      const dx = p2.group.position.x - p1.group.position.x;
      const dz = p2.group.position.z - p1.group.position.z;
      const near = Math.hypot(dx, dz) < 9 * S && (dx * Math.sin(h) + dz * Math.cos(h)) > 0;
      if (near) v.set(p2.group.position.x, p2.height * 0.66, p2.group.position.z);
      else v.set(p1.group.position.x + Math.sin(h) * 5 * S, p1.height * 0.62, p1.group.position.z + Math.cos(h) * 5 * S);
      const bh = near ? Math.atan2(dx, dz) : h;
      v.x += Math.sin(bh) * 0.25 * p2.height; v.z += Math.cos(bh) * 0.25 * p2.height; v.y += 0.1 * p2.height; // 相手の少し先まで噛みつく
      this.jaw(v, bh, p2.height * 1.35, { open: 0.7, tilt: 0 }); // 噛みつく向き（前）へ、口を開く
      fx.zoom(80); fx.kick(0, -0.2, 0.8); fx.shake(0.25);
    } else if (e.index === 1) {
      // 爪の薙ぎ払い: 右上から左下へ、赤い三日月が走る
      v.set(p1.group.position.x + Math.sin(h) * 0.4, p1.height * 0.72, p1.group.position.z + Math.cos(h) * 0.4);
      impact.wave(v, h, -0.75, p1.height * 2.5, p1.height * 9, 0.34, 'blood');
      impact.wave(v, h, -0.75 + 0.12, p1.height * 1.8, p1.height * 8, 0.3, 'blood');
      fx.kick(0.9, -0.5, 0); fx.roll(-1.3); fx.zoom(55);
    } else {
      fx.zoom(70); fx.kick(0, -0.3, 0.7);
    }
    sparks.burst(v, w.set(0, 0, 0), 6, p1.height * 0.04, p1.height * 2.2, RED, 1, 0.45, 0.2);
  }

  // ---- 通常攻撃が当たった（噛みつき・爪）の追加エフェクト ----
  onBiteHit(index) {
    const { impact, sparks, p2, p1 } = this.ctx;
    const H = p2.height;
    v.set(p2.group.position.x, p2.group.position.y + H * 0.66, p2.group.position.z);
    w.set(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
    sparks.burst(v, w, 12, H * 0.055, H * 3.4, ...BLOOD);
    if (index === 1) impact.ring(p2.group.position, H * 1.2, 0.3);
  }

  // あごの向き: 口をカメラの真横（画面の右か左）へ開いて、上下の牙の列がきれいなV字に見えるようにする。
  // attackDir（噛みつく向き）に近いほうの横向きを選ぶ
  jawHeading(attackDir) {
    const cam = this.ctx.camera;
    w.set(1, 0, 0).applyQuaternion(cam.quaternion);
    w.y = 0;
    if (w.lengthSq() < 1e-6) w.set(1, 0, 0);
    w.normalize();
    if (w.x * attackDir.x + w.z * attackDir.z < 0) w.negate();
    return Math.atan2(w.x, w.z);
  }

  // ---- あごのエフェクト ----
  // pos: 噛みつく中心、heading: 噛みつく向き（あごの正面）、size: 全体の大きさ
  jaw(pos, heading, size, { open = 1.0, tilt = 0, dur = 0.55, snap = 0.5 } = {}) {
    const j = this.jaws[this.jawNext];
    this.jawNext = (this.jawNext + 1) % this.jaws.length;
    const sc = size * 0.5;
    // pos を、あごの中ほどに合わせる（蝶番は手前。牙は蝶番から前へ並ぶ）
    j.position.set(pos.x - Math.sin(heading) * 0.15 * sc, pos.y, pos.z - Math.cos(heading) * 0.15 * sc);
    j.rotation.set(0, heading, tilt, 'YXZ');
    j.scale.setScalar(sc);
    j.visible = true;
    Object.assign(j.userData, { t: 0, dur, openAngle: 0.95 * open, snapAt: snap, hit: false });
  }

  // ---- イベント ----
  onEvent(e) {
    const { impact, sparks, fx, p1, p2, hooks, swarm } = this.ctx;
    const S = p1.scale;
    const H = p2.height;
    switch (e.type) {
      case 'fangSkill1Start': fx.zoom(30); break;
      case 'fangRedden':
        // 爪が赤く染まる: 両手に赤い光
        for (const c of [p1.claws, p1.clawsL]) {
          v.copy(c.userData.tip).multiplyScalar(0.6).applyMatrix4(c.matrixWorld);
          impact.flash(v, p1.height * 0.9, 0.3);
        }
        sparks.burst(v, w.set(0, 0, 0), 12, p1.height * 0.04, p1.height * 1.8, ...BLOOD);
        fx.zoom(-50); fx.shake(0.2);
        break;
      case 'fangShot': {
        this.clawPos(v);
        const d = this.aimDir(v);
        this.fireShot(v, d, { tilt: e.tilt, size: 4.4, range: 260, speed: 185, damage: DAMAGE.fangS1, heal: DAMAGE.fangS1Heal, hitR: 8, kind: 's1', big: true });
        impact.flash(v, p1.height * 0.9, 0.12);
        sparks.burst(v, d, 6, p1.height * 0.04, p1.height * 2.6, ...BLOOD);
        fx.shake(0.25); fx.zoom(60); fx.kick(e.k === 1 ? -0.5 : 0.5, 0, 0.4);
        break;
      }
      case 'fangAirClaw': {
        this.clawPos(v);
        const a = this.aimDir(v, 40);
        const yaw = (e.k === 0 ? -0.2 : e.k === 1 ? 0.2 : 0);
        a.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        a.y = Math.min(a.y, -0.18); // 空中から、下へ向けて
        a.normalize();
        this.fireShot(v, a, { tilt: e.k === 1 ? 0.7 : -0.7, size: 0.9, range: 15, speed: 80, damage: DAMAGE.fangAir, hitR: 2.4, kind: 'air' });
        sparks.burst(v, a, 3, p1.height * 0.03, p1.height * 1.6, ...BLOOD);
        fx.zoom(25);
        break;
      }
      // ---- スキル2: 巨大蝙蝠 ----
      case 'fangSkill2Start': fx.zoom(-40); break;
      case 'fangMorph':
        v.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z);
        swarm.burst(v, 16, { speed: 6 * S / 0.15, size: 0.05, life: 0.9 });
        impact.flash(v, p1.height * 1.6, 0.25);
        fx.shake(0.3);
        break;
      case 'fangBatOn':
        fx.zoom(150); fx.kick(0, 0, 1.4); fx.shake(0.4);
        v.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z);
        impact.ring(p1.group.position, p1.height * 1.8, 0.4);
        swarm.burst(v, 18, { speed: 8 * S / 0.15, size: 0.05, life: 1.0 });
        break;
      case 'fangBatHit':
        this.foeHit(DAMAGE.fangS2, { huge: true, stop: 0.2, dir: e.dir });
        sparks.burst(v.set(p2.group.position.x, H * 0.6, p2.group.position.z), e.dir, 20, H * 0.06, H * 4.2, ...BLOOD);
        swarm.burst(v, 20, { speed: 9 * S / 0.15, size: 0.05, life: 1.0 });
        break;
      case 'fangBatOff':
        v.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z);
        swarm.burst(v, 20, { speed: 7 * S / 0.15, size: 0.05, life: 0.9 });
        impact.flash(v, p1.height * 1.8, 0.22);
        impact.ring(p1.group.position, p1.height * 1.6, 0.35);
        fx.zoom(-60);
        break;
      // ---- スキル3: 分身 ----
      case 'fangSkill3Start': fx.zoom(-40); break;
      case 'fangBurst':
        v.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z);
        swarm.burst(v, 46, { speed: 10 * S / 0.15, size: 0.055, life: 1.3, up: 0.7 });
        impact.flash(v, p1.height * 2.4, 0.3);
        impact.ring(p1.group.position, p1.height * 2.2, 0.5);
        fx.shake(0.55); fx.zoom(-100);
        break;
      case 'fangCloneAppear':
        v.set(e.x, p1.height * 0.3, e.z);
        swarm.burst(v, 8, { speed: 5 * S / 0.15, size: 0.045, life: 0.8 });
        impact.flash(v, p1.height * 1.0, 0.2);
        break;
      case 'fangCloneHit':
        this.foeHit(e.final ? DAMAGE.fangS3Final : DAMAGE.fangS3, { stop: e.final ? 0.14 : 0.05, big: e.final, small: !e.final, dir: e.dir, n: e.i });
        sparks.burst(v.set(p2.group.position.x, H * 0.6, p2.group.position.z), e.dir, e.final ? 16 : 6, H * 0.05, H * 3.2, ...BLOOD);
        break;
      case 'fangGather': {
        // 分身が蝙蝠に戻り、本体の場所へ集まる
        const cl = this.player.clones;
        const target = _chest.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z).clone();
        this.gatherTarget = target;
        if (cl) for (const c of cl) { v.set(c.group.position.x, p1.height * 0.3, c.group.position.z); swarm.stream(v, 8, target, { speed: 20 * S / 0.15 * 0.9, size: 0.045, spread: 0.2, delayRange: 0.1 }); }
        break;
      }
      case 'fangRejoin':
        v.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z);
        impact.flash(v, p1.height * 1.8, 0.25);
        impact.ring(p1.group.position, p1.height * 1.5, 0.35);
        swarm.burst(v, 12, { speed: 5 * S / 0.15, size: 0.045, life: 0.7 });
        break;
      // ---- スキル4: 足の蝙蝠・回転薙ぎ払い ----
      case 'fangSkill4Start': fx.zoom(-40); break;
      case 'fangLegsOn':
        v.set(p1.group.position.x, p1.height * 0.18, p1.group.position.z);
        swarm.burst(v, 14, { speed: 6 * S / 0.15, size: 0.045, life: 0.8, up: 0.1 });
        impact.flash(v, p1.height * 1.2, 0.2);
        break;
      case 'fangSpinStart':
        fx.zoom(120); fx.shake(0.3);
        impact.ring(p1.group.position, p1.height * 1.8, 0.35);
        break;
      case 'fangSpinSwing': case 'fangSpinHit': {
        const h = p1.group.rotation.y;
        v.set(p1.group.position.x, p1.height * 0.6, p1.group.position.z);
        impact.wave(v, h, 0, p1.height * 1.5, p1.height * 3, 0.28, 'blood');
        impact.wave(v, h + Math.PI, 0, p1.height * 1.5, p1.height * 3, 0.28, 'blood');
        fx.shake(0.3); fx.roll(e.k % 2 ? 1.2 : -1.2);
        if (e.type === 'fangSpinHit') {
          this.foeHit(e.final ? DAMAGE.fangS4Final : DAMAGE.fangS4, { stop: e.final ? 0.18 : 0.05, big: e.final, huge: false, small: !e.final, dir: e.dir, n: e.k });
          sparks.burst(v.set(p2.group.position.x, H * 0.6, p2.group.position.z), e.dir, e.final ? 20 : 8, H * 0.05, H * 3.6, ...BLOOD);
        }
        break;
      }
      case 'fangLegsOff':
        v.set(p1.group.position.x, p1.height * 0.18, p1.group.position.z);
        swarm.burst(v, 14, { speed: 6 * S / 0.15, size: 0.045, life: 0.8, up: 0.1 });
        impact.flash(v, p1.height * 1.2, 0.2);
        break;
      // ---- 通常3段目: 首に噛みつく・引きちぎる ----
      case 'fangNeckBite': {
        const h = Math.atan2(e.dir.x, e.dir.z);
        v.set(p2.group.position.x, p2.height * 0.8, p2.group.position.z);
        this.jaw(v, Math.atan2(e.dir.x, e.dir.z), H * 1.3, { open: 0.9, tilt: 0.0, dur: 0.5, snap: 0.3 });
        sparks.burst(v, e.dir, 10, H * 0.05, H * 2.6, ...BLOOD);
        fx.shake(0.4); fx.zoom(-80);
        break;
      }
      case 'fangTear':
        v.set(p2.group.position.x, H * 0.8, p2.group.position.z);
        hooks.damage(DAMAGE.fangTear, v, 'big');
        hooks.hitStop(0.16);
        hooks.flashFoe(0.14);
        fx.shake(0.9); fx.zoom(-160); fx.kick(0.8, 0.3, -0.6);
        impact.flash(v, H * 3.0, 0.22);
        impact.streak(v, w.set(-e.dir.z, 0.4, e.dir.x), this.ctx.camera, H * 3.0, 0.2);
        impact.ring(p2.group.position, H * 2.0, 0.45);
        sparks.burst(v, e.dir, 34, H * 0.07, H * 5, ...BLOOD);
        sparks.burst(v, e.dir, 12, H * 0.09, H * 3, 0.0, 1, 0.3, 0.1); // 肉片
        break;
      case 'fangCancel': break;
      default: break;
    }
  }

  // 敵に当たったときの共通の演出とダメージ
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
    sparks.burst(at, d, o.huge ? 24 : o.small ? 4 : 12, H * (o.huge ? 0.075 : 0.055), H * (o.huge ? 5 : 3.2), ...BLOOD);
    if (o.huge) { impact.ring(p2.group.position, H * 2.4, 0.5); impact.ring(p2.group.position, H * 1.4, 0.32); }
  }

  update(dt) {
    const { impact, sparks, p1, p2, dummy, hooks, stage, swarm } = this.ctx;
    const S = p1.scale;
    // 飛んでいる斬撃
    const B = stage.bounds;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const step = Math.min(s.left, s.speed * dt);
      const prev = s.p.clone();
      s.p.addScaledVector(s.d, step);
      s.left -= step;
      s.m.position.copy(s.p);
      s.m.material.opacity = 0.35 + 0.6 * Math.min(1, s.left / (s.speed * 0.15 + 1e-6));
      sparks.burst(s.p, w.set(0, 0, 0), 1, p1.height * 0.03, p1.height * 0.5, ...BLOOD);
      // 命中判定: 前のフレームからの線分と、相手の胸の距離
      const foe = new THREE.Vector3(p2.group.position.x, p2.group.position.y + 3.0 * S, p2.group.position.z);
      const seg = new THREE.Vector3().subVectors(s.p, prev);
      const len2 = seg.lengthSq();
      const t01 = len2 > 0 ? Math.min(1, Math.max(0, w.subVectors(foe, prev).dot(seg) / len2)) : 0;
      const closest = prev.clone().addScaledVector(seg, t01);
      const hittable = dummy.state === 'ground' || dummy.state === 'hit' || dummy.state === 'down';
      if (hittable && closest.distanceTo(foe) < s.hitR) {
        this.hitFoe(s, closest);
        s.m.visible = false;
        this.shots.splice(i, 1);
      } else if (s.left <= 0 || Math.abs(s.p.x) > B.maxX + 4 || Math.abs(s.p.z) > B.maxZ + 4 || s.p.y < 0) {
        impact.flash(s.p, p1.height * 0.6, 0.1);
        sparks.burst(s.p, w.set(0, 0, 0), 4, p1.height * 0.04, p1.height * 1.6, ...BLOOD);
        s.m.visible = false;
        this.shots.splice(i, 1);
      }
    }
    // あご
    for (const j of this.jaws) {
      const u = j.userData;
      if (!j.visible) continue;
      u.t += dt;
      const f = u.t / u.dur;
      if (f >= 1) { j.visible = false; continue; }
      // 開いている → がちんと閉じる（snapAt を過ぎたら一気に）
      const closing = Math.min(1, Math.max(0, (f - u.snapAt * 0.55) / (u.snapAt * 0.45 + 1e-6)));
      const open = u.openAngle * (1 - closing * closing * closing);
      u.upper.rotation.x = -open;
      u.lower.rotation.x = open;
      const pop = f < 0.12 ? f / 0.12 : 1;
      const fade = f > 0.75 ? 1 - (f - 0.75) / 0.25 : 1;
      u.fangMat.opacity = fade * pop;
      u.gumMat.opacity = fade * pop;
      if (!u.hit && closing >= 1) {
        u.hit = true; // 閉じた瞬間: 閃光と火花
        v.copy(j.position);
        impact.flash(v, p1.height * 2.6, 0.2);
        sparks.burst(v, w.set(0, 0, 0), 14, p1.height * 0.06, p1.height * 3.2, ...BLOOD);
      }
    }
    // 蝙蝠の集合（スキル3の合流）は、本体が動いても追いかけられるよう目標を更新
    if (this.gatherTarget) this.gatherTarget.set(p1.group.position.x, p1.height * 0.55, p1.group.position.z);
  }

  // 斬撃が当たった
  hitFoe(s, at) {
    const { impact, sparks, fx, p1, p2, hooks, camera, swarm } = this.ctx;
    const H = p2.height;
    const big = s.big;
    this.ctx.dummy.hit(s.d.x, s.d.z, big ? 1.5 : 1);
    hooks.damage(s.damage, at, big ? 'big' : '');
    hooks.hitStop(big ? 0.09 : 0.04);
    hooks.flashFoe(big ? 0.1 : 0.05);
    fx.shake(big ? 0.45 : 0.2);
    fx.zoom(big ? -110 : -50);
    impact.flash(at, H * (big ? 2.2 : 1.2), big ? 0.16 : 0.1);
    impact.streak(at, s.d, camera, H * (big ? 2.4 : 1.4), 0.15);
    sparks.burst(at, s.d, big ? 14 : 6, H * 0.055, H * 3.4, ...BLOOD);
    // 吸血: 当たった分、自分の体力が回復する。血のしずくが相手から自分へ
    if (s.heal > 0) {
      const healed = hooks.heal(s.heal);
      if (healed > 0) {
        const target = new THREE.Vector3(p1.group.position.x, p1.height * 0.6, p1.group.position.z);
        swarm.stream(at, 3, target, { speed: 40 * p1.scale / 0.15, size: 0.04, spread: 0.1, delayRange: 0.08 });
      }
    }
  }
}
