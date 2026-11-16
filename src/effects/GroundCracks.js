import * as THREE from 'three';

// スキル2の地割れ。中心から放射状にギザギザのひびが伸び、力がたまるほど光り、
// 解放の瞬間に光の柱が噴き上がる。地面の上に描く見た目だけの演出（床の形は変えない）。

const MAIN = 15;        // 中心から伸びる太いひびの本数
const STEPS = 11;       // 1本あたりの折れ曲がりの数
const GEYSERS = 14;     // 噴き上がる光の柱の数
const FADE = 1.4;       // 解放後、ひびが消えるまでの秒数

const VERT = `
  attribute float aDist;
  varying float vDist;
  void main() {
    vDist = aDist;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = `
  uniform float uProgress;  // ひびがどこまで伸びたか（0〜1）
  uniform float uGlow;      // 光の強さ
  uniform float uAlpha;
  varying float vDist;
  void main() {
    if (vDist > uProgress) discard;
    float front = smoothstep(uProgress - 0.18, uProgress, vDist); // 伸びている先端ほど明るい
    vec3 dark = vec3(0.07, 0.05, 0.04);
    vec3 glow = vec3(0.45, 0.95, 1.0);
    float g = clamp(uGlow * (0.55 + 0.45 * (1.0 - vDist)) + front * 0.8, 0.0, 1.6);
    gl_FragColor = vec4(mix(dark, glow, min(g, 1.0)) + glow * max(g - 1.0, 0.0), uAlpha);
  }`;

// ひび1本ぶんの帯を positions / dists / index に足す。枝分かれは depth で1回だけ
function addCrack(out, angle, startR, length, width, depth) {
  let x = Math.cos(angle) * startR;
  let z = Math.sin(angle) * startR;
  let a = angle;
  const steps = depth === 0 ? STEPS : 5;
  const seg = length / steps;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = width * (1 - t) * (0.7 + Math.random() * 0.6) + 0.002;
    const nx = -Math.sin(a);
    const nz = Math.cos(a);
    const base = out.positions.length / 3;
    out.positions.push(x + nx * w, 0, z + nz * w, x - nx * w, 0, z - nz * w);
    const d = Math.hypot(x, z);
    out.dists.push(d, d);
    if (prev !== null) out.index.push(prev, prev + 1, base, prev + 1, base + 1, base);
    prev = base;
    if (depth === 0 && i > 1 && i < steps - 1 && Math.random() < 0.42) {
      addCrack(out, a + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5), d, length * (1 - t) * 0.6, w * 0.7, 1);
    }
    a += (Math.random() - 0.5) * 0.75;
    a += (angle - a) * 0.25; // 折れ曲がっても、おおむね外へ向かう
    x += Math.cos(a) * seg;
    z += Math.sin(a) * seg;
  }
}

export class GroundCracks {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uProgress: { value: 0 }, uGlow: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.position.y = 0.012;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // 光の柱（解放の瞬間に、ひびのあちこちから噴き上がる）
    this.geysers = [];
    const geo = new THREE.CylinderGeometry(0.35, 1, 1, 7, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < GEYSERS; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x8fecff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      m.visible = false;
      this.group.add(m);
      this.geysers.push({ mesh: m, delay: 0, height: 1, width: 1 });
    }

    this.state = 'idle'; // 'idle' | 'grow' | 'burst'
    this.t = 0;
    this.radius = 1;
  }

  // (x, z) を中心に、半径 radius の地割れを作り始める
  start(x, z, radius) {
    const out = { positions: [], dists: [], index: [] };
    for (let i = 0; i < MAIN; i++) {
      const angle = (i / MAIN) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      addCrack(out, angle, 0.03, 0.75 + Math.random() * 0.25, 0.013, 0);
    }
    const geo = this.mesh.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
    geo.setAttribute('aDist', new THREE.Float32BufferAttribute(out.dists, 1));
    geo.setIndex(out.index);

    this.group.position.set(x, 0, z);
    this.mesh.scale.setScalar(radius);
    this.radius = radius;
    this.group.visible = true;
    this.state = 'grow';
    this.material.uniforms.uProgress.value = 0;
    this.material.uniforms.uGlow.value = 0;
    this.material.uniforms.uAlpha.value = 1;
    for (const g of this.geysers) g.mesh.visible = false;
  }

  // ためている間: charge（0〜1）に合わせてひびが伸び、脈打ちながら光が強くなる
  setCharge(charge, time) {
    if (this.state !== 'grow') return;
    this.material.uniforms.uProgress.value = 0.12 + 0.88 * Math.pow(charge, 0.8);
    this.material.uniforms.uGlow.value = charge * (0.55 + 0.25 * Math.sin(time * (10 + 22 * charge)));
  }

  // 解放: ひび全体が白く光り、光の柱が噴き上がる
  burst(unit) {
    if (this.state === 'idle') return;
    this.state = 'burst';
    this.t = 0;
    this.material.uniforms.uProgress.value = 1;
    this.geysers.forEach((g, i) => {
      const a = Math.random() * Math.PI * 2;
      const r = this.radius * (i < 3 ? 0.12 : 0.2 + Math.random() * 0.75);
      g.mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.delay = (r / this.radius) * 0.22; // 中心から外へ順に
      g.height = unit * (2.2 + Math.random() * 2.6) * (i < 3 ? 1.5 : 1);
      g.width = unit * (0.1 + Math.random() * 0.13);
    });
  }

  // 途中でやめた（被弾など）: すぐ消える
  cancel() {
    if (this.state === 'grow') { this.state = 'burst'; this.t = 0.3; for (const g of this.geysers) g.delay = 99; }
  }

  update(dt) {
    if (this.state !== 'burst') return;
    this.t += dt;
    const u = this.material.uniforms;
    u.uGlow.value = Math.max(0, 1.7 - this.t * 2.4);
    u.uAlpha.value = Math.max(0, 1 - Math.max(0, this.t - 0.35) / FADE);
    for (const g of this.geysers) {
      const k = (this.t - g.delay) / 0.5;
      g.mesh.visible = k > 0 && k < 1;
      if (!g.mesh.visible) continue;
      const rise = 1 - (1 - Math.min(1, k * 2.2)) ** 2; // 一気に伸びて、細くなりながら消える
      g.mesh.scale.set(g.width * (1.2 - 0.9 * k), g.height * rise, g.width * (1.2 - 0.9 * k));
      g.mesh.material.opacity = 0.55 * (1 - k * k);
    }
    if (this.t > 0.35 + FADE) {
      this.state = 'idle';
      this.group.visible = false;
    }
  }
}
