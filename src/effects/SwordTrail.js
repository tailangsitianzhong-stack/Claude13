import * as THREE from 'three';

const MAX = 40;        // 保持するサンプル数
const LIFE = 0.16;     // 軌跡が消えるまでの秒数
const a = new THREE.Vector3();
const b = new THREE.Vector3();

/**
 * 剣の軌跡。刃の根元と先端のワールド座標を記録し、帯状のメッシュにして徐々に消す。
 * シーンへの追加は呼び出し側で行う（trail.mesh）。
 */
export class SwordTrail {
  constructor(sword) {
    this.sword = sword;
    this.samples = []; // { base, tip, age }
    this.positions = new Float32Array(MAX * 2 * 3);
    this.colors = new Float32Array(MAX * 2 * 4);
    const index = [];
    for (let i = 0; i < MAX - 1; i++) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    geo.setIndex(index);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'SwordTrail';
  }

  // 現在の刃の位置を記録（剣を振っている間だけ呼ぶ）
  sample() {
    a.copy(this.sword.userData.base).applyMatrix4(this.sword.matrixWorld);
    b.copy(this.sword.userData.tip).applyMatrix4(this.sword.matrixWorld);
    this.samples.push({ base: a.clone(), tip: b.clone(), age: 0 });
    if (this.samples.length > MAX) this.samples.shift();
  }

  update(dt) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[0].age > LIFE) this.samples.shift();

    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const alpha = Math.max(0, 1 - s.age / LIFE);
      this.positions.set([s.base.x, s.base.y, s.base.z, s.tip.x, s.tip.y, s.tip.z], i * 6);
      // 根元側は透明、先端側ほど明るい白
      this.colors.set([0.75, 0.9, 1, 0, 1, 1, 1, alpha * 0.65], i * 8);
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, n >= 2 ? (n - 1) * 6 : 0);
  }
}
