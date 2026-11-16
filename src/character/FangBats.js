import * as THREE from 'three';

// 吸血牙の蝙蝠: 巨大蝙蝠（スキル2）、小さな蝙蝠の群れ（スキル3・必殺技の演出）、足の蝙蝠（スキル4）。
// 群れは InstancedMesh 1つ・はばたきは頂点シェーダ（翼の先を上下させる）で動かすので、数百匹でも軽い。

const uTime = { value: 0 };

// 小さな蝙蝠の形（+Z が前。体は小さなひし形、翼は左右に2枚ずつの三角）
function miniBatGeometry() {
  const P = [];
  const tri = (a, b, c) => P.push(...a, ...b, ...c);
  // 体
  const top = [0, 0.16, 0.05], bot = [0, -0.14, 0.0], front = [0, 0.0, 0.5], back = [0, -0.02, -0.34], l = [-0.16, 0, 0.05], r = [0.16, 0, 0.05];
  tri(top, l, front); tri(top, front, r); tri(top, back, l); tri(top, r, back);
  tri(bot, front, l); tri(bot, r, front); tri(bot, l, back); tri(bot, back, r);
  // 耳
  tri([-0.1, 0.1, 0.42], [-0.16, 0.34, 0.42], [-0.02, 0.1, 0.36]);
  tri([0.1, 0.1, 0.42], [0.02, 0.1, 0.36], [0.16, 0.34, 0.42]);
  // 翼（左右対称）
  for (const s of [-1, 1]) {
    tri([s * 0.14, 0, 0.3], [s * 1.35, 0, 0.45], [s * 0.14, 0, -0.38]);
    tri([s * 1.35, 0, 0.45], [s * 1.0, 0, -0.62], [s * 0.14, 0, -0.38]);
    tri([s * 1.35, 0, 0.45], [s * 1.5, 0, -0.35], [s * 1.0, 0, -0.62]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}
let sharedGeo = null;
let sharedMat = null;
function batMaterial() {
  if (sharedMat) return sharedMat;
  sharedMat = new THREE.MeshBasicMaterial({ color: 0x7a3aa0, side: THREE.DoubleSide, fog: false });
  sharedMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3][0] * 7.0 + instanceMatrix[3][2] * 5.0;
        #else
          float ph = 0.0;
        #endif
        transformed.y += abs(position.x) * 0.75 * sin(uTime * 24.0 + ph);`);
  };
  return sharedMat;
}
const geo = () => (sharedGeo ??= miniBatGeometry());

// 1匹の蝙蝠（単体のメッシュ）
export function createMiniBat(color = null) {
  const mat = color == null ? batMaterial() : (() => { const m = batMaterial().clone(); m.color.set(color); m.onBeforeCompile = batMaterial().onBeforeCompile; return m; })();
  const m = new THREE.Mesh(geo(), mat);
  m.frustumCulled = false;
  return m;
}

// ---- 巨大蝙蝠（+Z へ飛ぶ。全幅 約9リグ単位）----
export function createBigBat() {
  const g = new THREE.Group();
  g.name = 'BigBat';
  const body = new THREE.MeshStandardMaterial({ color: 0x2b1336, roughness: 0.7, flatShading: true });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x4d1c63, roughness: 0.8, side: THREE.DoubleSide, flatShading: true, emissive: 0x240830, emissiveIntensity: 0.6 });
  const bone = new THREE.MeshStandardMaterial({ color: 0x1b0c25, roughness: 0.6 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2a44, fog: false });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const add = (parent, geom, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geom, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // 胴・頭
  add(g, new THREE.BoxGeometry(1.5, 1.3, 2.4), body, 0, 0, 0);
  add(g, new THREE.BoxGeometry(1.15, 1.0, 1.0), body, 0, 0.2, 1.5);
  add(g, new THREE.BoxGeometry(0.75, 0.5, 0.7), body, 0, -0.05, 2.1);        // 鼻づら
  for (const s of [-1, 1]) {
    add(g, new THREE.ConeGeometry(0.28, 1.0, 4), body, s * 0.42, 1.0, 1.4, 0.15, 0, -s * 0.15); // 耳
    add(g, new THREE.BoxGeometry(0.22, 0.2, 0.12), eye, s * 0.34, 0.38, 2.02);                    // 赤い目
    add(g, new THREE.ConeGeometry(0.09, 0.36, 4), white, s * 0.2, -0.38, 2.28, Math.PI, 0, 0);    // 牙
  }
  // 翼（肩を軸に、前後方向 Z まわりに羽ばたく）
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.7, 0.3, 0.3);
    // 骨（上腕・前腕・指）
    add(w, new THREE.BoxGeometry(2.7, 0.22, 0.22), bone, s * 1.35, 0, 0.3);
    add(w, new THREE.BoxGeometry(2.6, 0.18, 0.18), bone, s * 3.9, 0.1, 0.55, 0, 0, s * 0.12);
    for (const [fx, fz, len, ry] of [[3.4, 0.55, 2.8, -0.35], [3.4, 0.55, 3.0, -0.8], [3.4, 0.55, 2.4, -1.25]]) {
      add(w, new THREE.BoxGeometry(len, 0.12, 0.12), bone, s * (fx + Math.cos(ry) * len / 2), 0, fz + Math.sin(ry) * len / 2 * -1, 0, s * ry, 0);
    }
    // 膜: 肩から指の先へ張る
    const sh = new THREE.Shape();
    const pts = [[0, 0.5], [2.7, 0.7], [5.1, 0.2], [4.3, -0.9], [3.7, -2.0], [2.6, -1.3], [1.7, -2.3], [0.2, -1.6]];
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const mem = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), wingMat);
    mem.scale.x = s;
    mem.position.y = -0.04;
    w.add(mem);
    g.add(w);
    wings.push({ w, s });
  }
  g.userData.flap = (t, k = 1) => {
    for (const { w, s } of wings) {
      w.rotation.z = s * (0.15 + 0.85 * Math.sin(t * 13) * k);
      w.children.forEach((c) => { if (c.geometry && c.geometry.type === 'BoxGeometry') c.rotation.y = c.rotation.y; });
    }
    g.position.y += 0; // 呼び出し側が高さを決める
  };
  g.userData.setGlow = () => {};
  return g;
}

// ---- 群れ（InstancedMesh）----
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class BatSwarm {
  constructor(scene, max = 260) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo(), batMaterial(), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.setHSL(0.78 + Math.random() * 0.08, 0.45, 0.62 + Math.random() * 0.25)); }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, maxLife: 1, wait: 0, mode: 'free', target: null, size: 1, speed: 10, onArrive: null, ang: 0, angV: 0, radius: 1, height: 0, seed: Math.random() * 10, center: null });
    this.next = 0;
    this.time = 0;
  }

  take() {
    for (let k = 0; k < this.max; k++) {
      const it = this.items[(this.next + k) % this.max];
      if (!it.alive) { this.next = (this.next + k + 1) % this.max; return it; }
    }
    const it = this.items[this.next]; this.next = (this.next + 1) % this.max; return it; // 満杯なら使い回す
  }

  get count() { let n = 0; for (const it of this.items) if (it.alive) n++; return n; }

  clear() { for (let i = 0; i < this.max; i++) { this.items[i].alive = false; this.mesh.setMatrixAt(i, ZERO); } this.mesh.instanceMatrix.needsUpdate = true; }

  // 中心から四方へ飛び散って、消える
  burst(center, n, { speed = 8, size = 0.35, life = 1.0, up = 0.3, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const it = this.take();
      it.alive = true; it.mode = 'free'; it.target = null; it.onArrive = null; it.wait = 0;
      it.p.copy(center).add(_d.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.5, (Math.random() - 0.5) * 0.4).multiplyScalar(size * 3));
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8) * spread;
      it.v.set(Math.cos(a) * sp, (Math.random() * 0.8 + up) * sp * 0.6, Math.sin(a) * sp);
      it.size = size * (0.7 + Math.random() * 0.6);
      it.life = it.maxLife = life * (0.7 + Math.random() * 0.6);
    }
  }

  // 目標の点（target: Vector3 の参照。動いてもよい）へ飛んでいく。着いたら消えて onArrive を呼ぶ
  stream(from, n, target, { speed = 18, size = 0.35, spread = 3, delay = 0, delayRange = 0.6, onArrive = null, life = 6 } = {}) {
    for (let i = 0; i < n; i++) {
      const it = this.take();
      it.alive = true; it.mode = 'seek'; it.target = target; it.onArrive = onArrive; it.wait = delay + Math.random() * delayRange;
      it.p.set(from.x + (Math.random() - 0.5) * spread, from.y + (Math.random() - 0.3) * spread * 0.5, from.z + (Math.random() - 0.5) * spread);
      it.v.set((Math.random() - 0.5) * speed * 0.3, (Math.random() - 0.2) * speed * 0.3, (Math.random() - 0.5) * speed * 0.3);
      it.speed = speed * (0.8 + Math.random() * 0.4);
      it.size = size * (0.7 + Math.random() * 0.6);
      it.life = it.maxLife = life;
    }
  }

  // center（Vector3 の参照）のまわりを渦巻く
  orbit(center, n, { radius = 3, height = 3, angV = 4, size = 0.35, life = 3, shrink = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const it = this.take();
      it.alive = true; it.mode = 'orbit'; it.center = center; it.wait = 0; it.onArrive = null; it.target = null;
      it.ang = Math.random() * Math.PI * 2;
      it.angV = angV * (0.7 + Math.random() * 0.6);
      it.radius = radius * (0.35 + Math.random() * 0.65);
      it.height = (Math.random() - 0.2) * height;
      it.shrink = shrink;
      it.size = size * (0.7 + Math.random() * 0.6);
      it.life = it.maxLife = life;
      it.p.set(center.x + Math.cos(it.ang) * it.radius, center.y + it.height, center.z + Math.sin(it.ang) * it.radius);
      it.v.set(0, 0, 0);
    }
  }

  update(dt, time) {
    this.time = time;
    uTime.value = time;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it.alive) continue;
      any = true;
      if (it.wait > 0) { it.wait -= dt; this.hide(i); continue; }
      it.life -= dt;
      if (it.life <= 0) { it.alive = false; this.hide(i); continue; }
      let scale = it.size;
      if (it.mode === 'free') {
        it.v.multiplyScalar(Math.exp(-1.2 * dt));
        it.v.y += Math.sin(time * 9 + it.seed * 6) * 6 * dt;
        it.p.addScaledVector(it.v, dt);
        scale *= Math.min(1, it.life / (it.maxLife * 0.3));
      } else if (it.mode === 'seek') {
        const t = it.target;
        _d.subVectors(t, it.p);
        const dist = _d.length();
        if (dist < 0.5 + it.size * 1.5) { it.alive = false; this.hide(i); if (it.onArrive) it.onArrive(it); continue; }
        _d.multiplyScalar(1 / dist);
        // 大きくうねりながら近づく
        _d.x += Math.sin(time * 5 + it.seed * 9) * 0.5;
        _d.y += Math.cos(time * 4.3 + it.seed * 7) * 0.35;
        _d.normalize();
        it.v.lerp(_d.multiplyScalar(it.speed), Math.min(1, 3.2 * dt));
        it.p.addScaledVector(it.v, dt);
      } else if (it.mode === 'orbit') {
        const c = it.center;
        it.ang += it.angV * dt;
        const r = it.radius * (1 - it.shrink * (1 - it.life / it.maxLife));
        it.p.set(c.x + Math.cos(it.ang) * r, c.y + it.height + 0.4 * Math.sin(time * 6 + it.seed * 5), c.z + Math.sin(it.ang) * r);
        it.v.set(-Math.sin(it.ang), 0, Math.cos(it.ang)).multiplyScalar(it.angV * r);
        scale *= Math.min(1, it.life / 0.4);
      }
      // 向き: 進む方向。ほんの少し左右に傾く
      if (it.v.lengthSq() > 1e-4) { _d.copy(it.v).normalize(); _q.setFromUnitVectors(_z, _d); } else _q.identity();
      _s.setScalar(scale);
      _m.compose(it.p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(i) { this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; }
}

// ---- 足の蝙蝠（スキル4）: 脚の代わりに、腰の下でぱたぱた飛ぶ蝙蝠の群れ ----
export class LegBats {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.bats = [];
    for (let i = 0; i < 9; i++) {
      const b = createMiniBat();
      b.scale.setScalar(0.55);
      b.userData = { a: (i / 9) * Math.PI * 2, r: 0.25 + 0.35 * (i % 3) / 2, h: -0.3 - (i % 4) * 0.45, ph: Math.random() * 6 };
      this.group.add(b);
      this.bats.push(b);
    }
  }
  // 腰（hips の座標）にぶら下げる
  attach(parent) { parent.add(this.group); }
  show(on) { this.group.visible = on; }
  update(dt, time) {
    uTime.value = time;
    if (!this.group.visible) return;
    for (const b of this.bats) {
      const u = b.userData;
      u.a += dt * 7;
      b.position.set(Math.cos(u.a) * u.r, u.h + 0.18 * Math.sin(time * 14 + u.ph), Math.sin(u.a) * u.r);
      b.rotation.y = -u.a + Math.PI / 2;
    }
  }
}
