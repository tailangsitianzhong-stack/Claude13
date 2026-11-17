import * as THREE from 'three';
import { DAMAGE } from '../character/Health.js';
import { ULTO } from '../character/OnomController.js';
import { createWordSprite, setWord, createFlatWord, WORDS } from './Words.js';

// 擬音の演出: 文字（スプライト）が飛び出して、当たって、効果を出す。
//   ドン（吹っ飛ばし）/ グラグラ（地面に吸い込まれて地割れ）/ メラメラ（燃焼）/ ドカン（爆発して分裂、連鎖）/ スー（乗って加速）
//   グルグル（気絶）/ ドキドキ（攻撃力アップ）/ ドロドロ（鈍足）/ 必殺技（ドカン・ズドン・バンバン）
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const HUE = { don: 0.13, meramera: 0.06, dokan: 0.03, guragura: 0.09, guru: 0.76, doki: 0.9, doro: 0.1, suu: 0.54, zudon: 0.14, ban: 0.13 };
const COMBO_WINDOW = 1.0;   // コンボのボタンが出る長さ（Controller.js の FINISHER.window と同じ）
const BURN_TIME = 4, BURN_TICK = 0.5;

export class OnomDirector {
  // ctx: { scene, camera, impact, sparks, fx, p1, p2, dummy, stage, getPlayer, hooks }
  constructor(ctx) {
    this.ctx = ctx;
    // 文字のスプライトを、先に作っておく（試合中に作ると、重くなる）
    this.pool = [];
    for (let i = 0; i < 40; i++) { const s = createWordSprite('don'); ctx.scene.add(s); this.pool.push(s); }
    this.ents = [];
    this.flat = createFlatWord('suu');         // スー: 足の下に敷く文字
    ctx.scene.add(this.flat);
    this.burnAcc = 0;
    this.burnFx = 0;
  }

  get player() { return this.ctx.getPlayer(); }

  take(key, width) {
    const s = this.pool.find((x) => !x.visible) ?? this.pool[0];
    setWord(s, key, width);
    s.material.rotation = 0;
    s.material.opacity = 1;
    s.visible = true;
    return s;
  }

  // 声を出した位置（口の前）
  mouth(out) {
    const { p1 } = this.ctx;
    const h = p1.group.rotation.y;
    return out.set(p1.group.position.x + Math.sin(h) * 4.5 * p1.scale, p1.group.position.y + p1.height * 0.8, p1.group.position.z + Math.cos(h) * 4.5 * p1.scale);
  }

  // 狙う向き（相手がいれば胸へ。正面の近くにいなければ、向いている方向）
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

  foeChest(out) { const { p2, p1 } = this.ctx; return out.set(p2.group.position.x, p2.group.position.y + 3.0 * p1.scale, p2.group.position.z); }
  foeHittable() { const s = this.ctx.dummy.state; return s === 'ground' || s === 'hit' || s === 'down'; }

  // ---- 文字を出す（飛んでいく）----
  shoot(key, o) {
    const { p1, impact, sparks, fx } = this.ctx;
    const S = p1.scale;
    this.mouth(v);
    const d = this.aimDir(v);
    const width = (o.width ?? 1.7) * p1.height;
    const s = this.take(key, width);
    s.position.copy(v);
    this.ents.push({ kind: o.kind ?? 'proj', key, s, p: v.clone(), d: d.clone(), speed: (o.speed ?? 60) * S, left: (o.range ?? 130) * S, width, t: 0, gen: o.gen ?? 0, fuse: o.fuse ?? 0, from: o.from ?? 0, spin: o.spin ?? 0, wobble: o.wobble ?? 0, pop: 0 });
    impact.flash(v, p1.height * 1.2, 0.14);
    sparks.burst(v, d, 6, p1.height * 0.04, p1.height * 2.2, HUE[o.hue ?? key] ?? 0.13, 1, 0.6, 0.3);
    fx.zoom(60); fx.kick(0, 0.1, 0.7);
    return d;
  }

  // ---- イベント ----
  onEvent(e) {
    const { impact, sparks, fx, p1, p2, hooks, dummy } = this.ctx;
    const S = p1.scale;
    const H = p2.height;
    switch (e.type) {
      // 通常攻撃
      case 'onomShout':
        if (e.word === 'don') this.shoot('don', { speed: 70, hue: 'don', from: 1 });
        else if (e.word === 'meramera') this.shoot('meramera', { speed: 52, wobble: 1, from: 3, hue: 'meramera' });
        else this.quake(e.index + 1);
        break;
      case 'onomSkill1Start': case 'onomSkill2Start': case 'onomSkill3Start': case 'onomSkill4Start': case 'onomComboStart': fx.zoom(-40); break;
      // スキル1: ドカン（途中で爆発して分裂。連鎖）
      case 'onomSkill1Fire': this.shoot('dokan', { kind: 'dokan', speed: 80, width: 1.9, fuse: 0.3, gen: 0, hue: 'dokan' }); break;
      // スキル2: スー（足の下に敷いて、その上に乗る）
      case 'onomSkill2Fire': {
        v.set(p1.group.position.x, 0.03, p1.group.position.z);
        impact.flash(w.set(v.x, p1.height * 0.3, v.z), p1.height * 1.6, 0.22);
        impact.ring(v, p1.height * 1.8, 0.4);
        sparks.burst(v, w.set(0, 0, 0), 14, p1.height * 0.05, p1.height * 2.4, HUE.suu, 1, 0.6, 0.3);
        const s = this.take('suu', p1.height * 1.7);
        s.position.set(p1.group.position.x, p1.height * 0.2, p1.group.position.z);
        this.ents.push({ kind: 'rise', s, p: s.position.clone(), t: 0, life: 0.8, vy: 1.2 * p1.height, width: p1.height * 1.7 });
        fx.zoom(80); fx.shake(0.3);
        break;
      }
      case 'onomSkill3Fire': this.shoot('guruguru', { kind: 'proj', speed: 56, spin: 1, wobble: 2, width: 1.6, hue: 'guru', from: 0 }); break;
      case 'onomSkill4Fire': this.shoot('dokidoki', { speed: 54, wobble: 3, width: 1.6, hue: 'doki', from: 0 }); break;
      case 'onomComboFire': this.shoot('dorodoro', { speed: 44, wobble: 4, width: 1.6, hue: 'doro', from: 0 }); break;
      // 必殺技
      case 'onomUltStart': fx.zoom(-90); fx.kick(0, 0.2, 0.4); break;
      case 'onomUltBegin': fx.zoom(-60); break;
      default:
        if (e.type.startsWith('onomUltDokan')) this.ultDokan(e.k);
        else if (e.type === 'onomUltZudon') this.ultZudon();
        else if (e.type.startsWith('onomUltBan')) this.ultBan(e.i);
        else if (e.type === 'onomUltFinal') this.ultFinal();
        break;
    }
  }

  // ---- グラグラ: 文字が、地面に吸い込まれて、地割れ ----
  quake(from) {
    const { p1, p2 } = this.ctx;
    const S = p1.scale;
    this.mouth(v);
    const foeNear = Math.hypot(p2.group.position.x - p1.group.position.x, p2.group.position.z - p1.group.position.z) < 100 * S && this.foeHittable();
    const h = p1.group.rotation.y;
    const T = foeNear ? new THREE.Vector3(p2.group.position.x, 0, p2.group.position.z) : new THREE.Vector3(p1.group.position.x + Math.sin(h) * 14 * S, 0, p1.group.position.z + Math.cos(h) * 14 * S);
    const width = 1.8 * p1.height;
    const s = this.take('guragura', width);
    s.position.copy(v);
    this.ents.push({ kind: 'quake', key: 'guragura', s, from: v.clone(), T, t: 0, width, hover: 0.22, travel: 0.4, fromAtk: from });
    this.ctx.fx.zoom(50);
  }

  // ---- 命中の共通 ----
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
    if (o.small) fx.kick((Math.random() < 0.5 ? 1 : -1) * 0.35, 0.1, -0.25); else fx.kick(0, 0.2, o.huge ? -1.6 : -0.7);
    impact.flash(at, H * (o.huge ? 3.4 : o.small ? 1.0 : 2.0), o.huge ? 0.24 : o.small ? 0.09 : 0.16);
    if (!o.small) impact.streak(at, d, camera, H * (o.huge ? 3.4 : 2.2), 0.18);
    sparks.burst(at, d, o.huge ? 26 : o.small ? 4 : 12, H * (o.huge ? 0.075 : 0.055), H * (o.huge ? 5 : 3.2), o.hue ?? null, 1, 0.6, 0.3);
    if (o.huge) { impact.ring(p2.group.position, H * 2.4, 0.5); impact.ring(p2.group.position, H * 1.4, 0.32); }
    return at;
  }

  // 文字が、相手に当たった
  onHitFoe(e, at) {
    const { dummy, p1, p2, impact, sparks } = this.ctx;
    const d = e.d.clone().setY(0).normalize();
    switch (e.key) {
      case 'don':
        dummy.launch(d.x, d.z, 64, 13);          // 吹っ飛ばす
        this.foeHit(DAMAGE.onom[0], { big: true, stop: 0.12, dir: d, hue: HUE.don });
        impact.ring(p2.group.position, p2.height * 2.2, 0.45);
        break;
      case 'meramera':
        dummy.hit(d.x, d.z, 1);
        this.foeHit(DAMAGE.onom[2], { big: true, stop: 0.08, dir: d, hue: HUE.meramera });
        dummy.status.apply('burn', BURN_TIME);   // 燃焼
        this.burnAcc = 0;
        if (e.from === 3) this.player.finisherWindow = COMBO_WINDOW;   // コンボのボタンが出る
        break;
      case 'guruguru':
        dummy.hit(d.x, d.z, 2);
        this.foeHit(DAMAGE.onomGuru, { big: true, stop: 0.14, dir: d, hue: HUE.guru });
        dummy.status.apply('stun', 2.5);          // 気絶
        break;
      case 'dokidoki':
        dummy.hit(d.x, d.z, 1);
        this.foeHit(DAMAGE.onomDoki, { stop: 0.08, dir: d, hue: HUE.doki });
        this.player.status.apply('power', 5);     // 自分の攻撃力 +50%（5秒）
        v.set(p1.group.position.x, p1.height * 0.6, p1.group.position.z);
        impact.flash(v, p1.height * 1.8, 0.3);
        impact.ring(p1.group.position, p1.height * 1.6, 0.4);
        sparks.burst(v, w.set(0, 0, 0), 14, p1.height * 0.05, p1.height * 2.2, HUE.doki, 1, 0.65, 0.3);
        break;
      case 'dorodoro':
        dummy.hit(d.x, d.z, 1);
        this.foeHit(DAMAGE.onomDoro, { stop: 0.08, dir: d, hue: HUE.doro });
        dummy.status.apply('slow', 5);            // 鈍足（移動速度 50%）
        break;
      default: break;
    }
  }

  // ---- スキル1: 爆発 ----
  explode(e) {
    const { impact, sparks, fx, p1, p2, hooks, dummy } = this.ctx;
    const S = p1.scale;
    const H = p2.height;
    const gen = e.gen;
    const k = 1 - gen * 0.15;
    impact.flash(e.p, p1.height * (2.6 * k), 0.2);
    impact.ring(w.set(e.p.x, 0.03, e.p.z), p1.height * (2.2 * k), 0.35);
    sparks.burst(e.p, w.set(0, 0, 0), 14 - gen * 2, p1.height * 0.06, p1.height * (4 * k), HUE.dokan, 1, 0.55, 0.3);
    fx.shake(0.3 * k + 0.1); fx.zoom(-40 - 20 * (3 - gen));
    // 相手が近ければ、ダメージ
    this.foeChest(w);
    if (this.foeHittable() && w.distanceTo(e.p) < (7.5 - gen * 0.3) * S) {
      const d = new THREE.Vector3(p2.group.position.x - e.p.x, 0, p2.group.position.z - e.p.z).normalize();
      this.foeHit(DAMAGE.onomDokan[Math.min(3, gen)], { big: gen === 0, small: gen > 0, stop: gen === 0 ? 0.1 : 0.04, dir: d, hue: HUE.dokan });
      dummy.c.animator.jolt = 1;
      if (gen >= 3) dummy.hit(d.x, d.z, 2);
      else if (gen === 0) dummy.hit(d.x, d.z, 1);
    }
    // 分裂: 2つに分かれて、それぞれまた爆発（連鎖）
    if (gen < 3) {
      for (const sgn of [-1, 1]) {
        const d = e.d.clone().applyAxisAngle(UP, sgn * (0.55 + Math.random() * 0.25));
        this.foeChest(w);
        const toFoe = w.clone().sub(e.p).normalize();
        d.lerp(toFoe, 0.42).normalize();
        const width = e.width * 0.84;
        const s = this.take('dokan', width);
        s.position.copy(e.p);
        this.ents.push({ kind: 'dokan', key: 'dokan', s, p: e.p.clone(), d, speed: 78 * S, left: 60 * S, width, t: 0, gen: gen + 1, fuse: 0.22, from: 0, spin: 0, wobble: 0, pop: 0.12 });
      }
    }
  }

  // ---- 必殺技 ----
  ultTarget(out) { const { p2 } = this.ctx; return out.set(p2.group.position.x, p2.group.position.y, p2.group.position.z); }

  ultDokan(k) {
    const { p1, p2 } = this.ctx;
    const a = k * 2.1 + 0.6;
    const base = this.ultTarget(new THREE.Vector3());
    const pos = new THREE.Vector3(base.x + Math.cos(a) * 3 * p1.scale, p2.height * (0.9 + 0.35 * k), base.z + Math.sin(a) * 3 * p1.scale);
    const width = 2.3 * p1.height;
    const s = this.take('dokan', width);
    s.position.copy(pos);
    this.ents.push({ kind: 'timed', key: 'dokan', s, p: pos, t: 0, dur: 0.3, width, grow: true, onEnd: (e) => {
      const { impact, sparks, fx, hooks } = this.ctx;
      impact.flash(e.p, p2.height * 3.4, 0.28);
      impact.ring(w.set(e.p.x, 0.03, e.p.z), p2.height * 3.0, 0.5);
      sparks.burst(e.p, w.set(0, 0, 0), 22, p2.height * 0.07, p2.height * 4.6, HUE.dokan, 1, 0.55, 0.3);
      this.foeHit(DAMAGE.onomUltDokan, { big: true, stop: 0.1, hue: HUE.dokan });
      fx.shake(0.7);
    } });
  }

  ultZudon() {
    const { p2, p1 } = this.ctx;
    const base = this.ultTarget(new THREE.Vector3());
    const width = 3.6 * p1.height;
    const s = this.take('zudon', width);
    const pos = new THREE.Vector3(base.x, 6.5 * p1.height, base.z);
    s.position.copy(pos);
    this.ents.push({ kind: 'timed', key: 'zudon', s, p: pos, t: 0, dur: ULTO.zudonFall, width, fall: { from: pos.y, to: p2.height * 0.7 }, onEnd: (e) => {
      const { impact, sparks, fx, hooks } = this.ctx;
      hooks.groundBreak(p2.group.position.x, p2.group.position.z, 9);
      impact.flash(e.p, p2.height * 5, 0.35);
      impact.ring(w.set(e.p.x, 0.03, e.p.z), p2.height * 4.4, 0.6);
      impact.ring(w.set(e.p.x, 0.03, e.p.z), p2.height * 2.4, 0.4);
      sparks.burst(e.p, w.set(0, 0.2, 0), 36, p2.height * 0.08, p2.height * 5.6, HUE.zudon, 1, 0.55, 0.3);
      this.foeHit(DAMAGE.onomUltZudon, { huge: true, stop: 0.25, hue: HUE.zudon });
      fx.shake(1.2); fx.zoom(-240); fx.kick(0, -0.8, -1.2);
    } });
  }

  ultBan(i) {
    const { p1, p2, impact, sparks, fx } = this.ctx;
    this.mouth(v);
    v.x += (Math.random() - 0.5) * 0.12; v.y += (Math.random() - 0.5) * 0.1;
    const to = this.foeChest(new THREE.Vector3());
    to.x += (Math.random() - 0.5) * p2.height * 0.5; to.y += (Math.random() - 0.5) * p2.height * 0.4;
    const width = (0.9 + 0.2 * (i % 2)) * p1.height;
    const s = this.take('ban', width);
    s.position.copy(v);
    s.material.rotation = (Math.random() - 0.5) * 0.5;
    this.ents.push({ kind: 'timed', key: 'ban', s, p: v.clone(), from3: v.clone(), to3: to, t: 0, dur: 0.15, width, onEnd: (e) => {
      const { hooks } = this.ctx;
      this.foeHit(DAMAGE.onomUltBan, { small: true, stop: 0.02, hue: HUE.ban });
      impact.flash(e.p, p2.height * 0.9, 0.08);
    } });
    impact.flash(v, p1.height * 0.9, 0.08);
    sparks.burst(v, w.set(0, 0, 0), 3, p1.height * 0.03, p1.height * 1.8, 0.13, 0.9, 0.75, 0.2);
    fx.shake(0.12); fx.kick((i % 2 ? 1 : -1) * 0.2, 0.05, 0.4);
  }

  ultFinal() {
    const { p1, p2, impact, sparks, fx } = this.ctx;
    this.mouth(v);
    const to = this.foeChest(new THREE.Vector3());
    const width = 3.2 * p1.height;
    const s = this.take('banban', width);
    s.position.copy(v);
    this.ents.push({ kind: 'timed', key: 'banban', s, p: v.clone(), from3: v.clone(), to3: to, t: 0, dur: 0.22, width, grow: true, onEnd: (e) => {
      impact.flash(e.p, p2.height * 5, 0.35);
      impact.ring(w.set(e.p.x, 0.03, e.p.z), p2.height * 4.0, 0.6);
      sparks.burst(e.p, w.set(0, 0.2, 0), 40, p2.height * 0.08, p2.height * 6, 0.13, 0.9, 0.7, 0.25);
      this.foeHit(DAMAGE.onomUltFinal, { huge: true, stop: 0.3, hue: 0.13 });
      fx.shake(1.3); fx.zoom(-260);
    } });
    impact.flash(v, p1.height * 2.2, 0.2);
    fx.zoom(120);
  }

  free(e) { e.s.visible = false; }

  update(dt) {
    const { impact, sparks, fx, p1, p2, dummy, hooks, stage } = this.ctx;
    const S = p1.scale;
    const time = performance.now() / 1000;
    const B = stage.bounds;
    // 敵が燃えている: 少しずつダメージ。炎の粒と、小さな「メラメラ」
    if (dummy.status.has('burn')) {
      this.burnAcc += dt;
      this.burnFx += dt;
      while (this.burnAcc >= BURN_TICK) {
        this.burnAcc -= BURN_TICK;
        v.set(p2.group.position.x, p2.group.position.y + p2.height * 0.8, p2.group.position.z);
        hooks.damage(DAMAGE.onomBurnTick, v, '');
      }
      sparks.burst(v.set(p2.group.position.x, p2.group.position.y + p2.height * 0.4, p2.group.position.z), w.set(0, 1, 0), 1, p2.height * 0.05, p2.height * 1.8, 0.04 + Math.random() * 0.05, 1, 0.55, 0.3);
      if (this.burnFx > 0.45) {
        this.burnFx = 0;
        const s = this.take('meramera', p2.height * 0.9);
        s.position.set(p2.group.position.x + (Math.random() - 0.5) * 0.3, p2.height * 0.9, p2.group.position.z + (Math.random() - 0.5) * 0.3);
        this.ents.push({ kind: 'rise', s, p: s.position.clone(), t: 0, life: 0.7, vy: 0.9 * p2.height, width: p2.height * 0.9 });
      }
    } else this.burnAcc = 0;
    // スー: 足の下に敷いた文字（加速している間、ついてくる）
    const pl = this.player;
    const haste = pl.status.has('haste');
    this.flat.visible = haste;
    if (haste) {
      const left = pl.status.list().find((s) => s.name === 'haste')?.left ?? 0;
      this.flat.position.set(p1.group.position.x, p1.group.position.y + 0.03, p1.group.position.z);
      this.flat.rotation.y = p1.group.rotation.y;
      this.flat.scale.setScalar(p1.height * 0.95);
      this.flat.material.opacity = left < 1 ? 0.35 + 0.65 * Math.abs(Math.sin(time * 14)) : 1;
    }
    // 文字たち
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];
      e.t += dt;
      let dead = false;
      switch (e.kind) {
        case 'proj': case 'dokan': {
          const step = Math.min(e.left, e.speed * dt);
          const prev = e.p.clone();
          e.p.addScaledVector(e.d, step);
          e.left -= step;
          // 見た目: ゆらゆら・くるくる・脈うつ
          e.s.position.copy(e.p);
          if (e.wobble === 1) e.s.position.y += 0.05 * Math.sin(e.t * 30);                  // メラメラ: 炎のゆらぎ
          if (e.wobble === 2) { // グルグル: らせん
            w.set(-e.d.z, 0, e.d.x).multiplyScalar(0.12 * Math.cos(e.t * 22));
            e.s.position.add(w); e.s.position.y += 0.12 * Math.sin(e.t * 22);
          }
          if (e.wobble === 3) setWord(e.s, e.key, e.width * (1 + 0.22 * Math.abs(Math.sin(e.t * 12))));   // ドキドキ: 心臓のように脈うつ
          if (e.wobble === 4) e.s.position.y -= 0.05 * Math.abs(Math.sin(e.t * 9));         // ドロドロ: どろっと垂れる
          if (e.spin) e.s.material.rotation = e.t * 14;
          else if (e.kind === 'dokan') { const pp = e.pop > 0 ? Math.min(1, e.t / e.pop) : 1; setWord(e.s, e.key, e.width * (0.5 + 0.5 * pp)); }
          sparks.burst(e.s.position, w.set(0, 0, 0), 1, p1.height * 0.04, p1.height * 0.6, HUE[e.key === 'guruguru' ? 'guru' : e.key === 'dokidoki' ? 'doki' : e.key === 'dorodoro' ? 'doro' : e.key] ?? 0.1, 1, 0.6, 0.3);
          // 命中判定
          if (this.foeHittable()) {
            this.foeChest(w);
            const seg = new THREE.Vector3().subVectors(e.s.position, prev);
            const len2 = seg.lengthSq();
            const t01 = len2 > 0 ? Math.min(1, Math.max(0, new THREE.Vector3().subVectors(w, prev).dot(seg) / len2)) : 0;
            const closest = prev.clone().addScaledVector(seg, t01);
            const hitR = 5.2 * S + e.width * 0.12;
            if (closest.distanceTo(w) < hitR) {
              if (e.kind === 'dokan') { this.explode({ ...e, p: closest }); } else this.onHitFoe(e, closest);
              dead = true;
              break;
            }
          }
          if (e.kind === 'dokan' && e.t >= e.fuse) { this.explode(e); dead = true; break; }   // 導火線が切れて、爆発
          if (e.left <= 0 || Math.abs(e.p.x) > B.maxX + 4 || Math.abs(e.p.z) > B.maxZ + 4 || e.p.y < 0) {
            if (e.kind === 'dokan') this.explode(e);
            else { impact.flash(e.p, p1.height * 0.8, 0.12); sparks.burst(e.p, w.set(0, 0, 0), 5, p1.height * 0.04, p1.height * 1.6, 0.1, 0.5, 0.6, 0.3); }
            dead = true;
          }
          break;
        }
        case 'quake': {
          // 出てきて少しゆれる → 地面へ吸い込まれる（小さくなる）→ 地割れ
          if (e.t < e.hover) {
            e.s.position.set(e.from.x + 0.03 * Math.sin(e.t * 90), e.from.y + 0.03 * Math.cos(e.t * 80), e.from.z);
            setWord(e.s, 'guragura', e.width * (0.6 + 0.4 * Math.min(1, e.t / 0.12)));
          } else {
            const u = Math.min(1, (e.t - e.hover) / e.travel);
            const k = u * u;
            e.s.position.lerpVectors(e.from, w.set(e.T.x, 0.06, e.T.z), k);
            e.s.position.y += 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u);
            setWord(e.s, 'guragura', e.width * (1 - 0.85 * k));
            e.s.material.rotation = u * 3;
            if (u >= 1) { this.quakeLand(e); dead = true; }
          }
          break;
        }
        case 'rise': {
          const u = e.t / e.life;
          e.s.position.set(e.p.x, e.p.y + e.vy * e.t, e.p.z);
          e.s.material.opacity = Math.min(1, (1 - u) * 2);
          setWord(e.s, e.s.userData.key, e.width * (0.8 + 0.4 * Math.min(1, e.t / 0.12)));
          if (u >= 1) dead = true;
          break;
        }
        case 'timed': {
          const u = Math.min(1, e.t / e.dur);
          if (e.fall) e.s.position.set(e.p.x, e.fall.from + (e.fall.to - e.fall.from) * u * u, e.p.z);
          else if (e.to3) e.s.position.lerpVectors(e.from3, e.to3, u);
          if (e.grow) setWord(e.s, e.key, e.width * (0.45 + 0.55 * Math.min(1, u * 1.6)));
          e.p.copy(e.s.position);
          if (u >= 1) { if (e.onEnd) e.onEnd(e); dead = true; }
          break;
        }
        default: dead = true;
      }
      if (dead) { this.free(e); this.ents.splice(i, 1); }
    }
  }

  // グラグラ: 地割れ（範囲攻撃）
  quakeLand(e) {
    const { impact, sparks, fx, p1, p2, hooks, dummy } = this.ctx;
    const S = p1.scale;
    hooks.groundBreak(e.T.x, e.T.z, 7);
    v.set(e.T.x, 0.03, e.T.z);
    impact.ring(v, p1.height * 3.4, 0.55);
    impact.ring(v, p1.height * 1.8, 0.35);
    sparks.burst(v, w.set(0, 0, 0), 22, p1.height * 0.07, p1.height * 3.2, 0.09, 0.5, 0.45, 0.25);
    fx.shake(0.9); fx.zoom(-120); fx.kick(0, -0.9, 0);
    if (this.foeHittable() && Math.hypot(p2.group.position.x - e.T.x, p2.group.position.z - e.T.z) < 16 * S) {
      const d = new THREE.Vector3(p2.group.position.x - p1.group.position.x, 0, p2.group.position.z - p1.group.position.z).normalize();
      dummy.launch(d.x, d.z, 16, 20);      // 地面がわれて、相手が跳ね上がる
      this.foeHit(DAMAGE.onom[1], { big: true, stop: 0.14, dir: d, hue: 0.09 });
    } else hooks.hitStop(0.05);
  }
}
