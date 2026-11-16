import * as THREE from 'three';

// 斬り抜けた通り道に残る、光の線。細い白い芯と、太い水色の光でできていて、すこしの間残って消える。
const N = 24;

export class SlashLines {
  constructor(scene) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2); // Z 方向に伸びる筒
    this.items = [];
    for (let i = 0; i < N; i++) {
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      for (const m of [core, glow]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
      this.items.push({ core, glow, life: 0, max: 1 });
    }
    this.next = 0;
  }

  add(from, to, life = 1.0) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % N;
    it.life = it.max = life;
    for (const [m, w] of [[it.core, 0.018], [it.glow, 0.06]]) {
      m.position.addVectors(from, to).multiplyScalar(0.5);
      m.lookAt(to);
      m.scale.set(w, w, from.distanceTo(to));
      m.visible = true;
    }
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.core.visible = it.glow.visible = false; continue; }
      const k = it.life / it.max;
      it.core.material.opacity = Math.min(1, k * 2.2);
      it.glow.material.opacity = 0.55 * k * k;
    }
  }
}
