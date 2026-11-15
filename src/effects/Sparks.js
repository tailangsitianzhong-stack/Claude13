import * as THREE from 'three';

const COUNT = 36;
const GRAVITY = 9;

// 命中時に飛び散る小さな四角い火花（使い回しのプール）
export class Sparks {
  constructor(scene) {
    this.items = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1, size: 1 });
    }
    this.next = 0;
  }

  // pos から dir の方向を中心に count 個飛ばす
  burst(pos, dir, count, size, speed) {
    for (let i = 0; i < count; i++) {
      const it = this.items[this.next];
      this.next = (this.next + 1) % COUNT;
      it.mesh.position.copy(pos);
      it.vel.set(
        dir.x * 0.6 + (Math.random() - 0.5) * 1.6,
        Math.random() * 1.2 + 0.2,
        dir.z * 0.6 + (Math.random() - 0.5) * 1.6,
      ).multiplyScalar(speed * (0.5 + Math.random()));
      it.max = it.life = 0.22 + Math.random() * 0.2;
      it.size = size * (0.6 + Math.random() * 0.8);
      it.mesh.material.color.setHSL(0.11 + Math.random() * 0.05, 1, 0.6 + Math.random() * 0.35);
      it.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      it.mesh.visible = true;
    }
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.mesh.visible = false; continue; }
      it.vel.y -= GRAVITY * dt * it.size * 12;
      it.mesh.position.addScaledVector(it.vel, dt);
      it.mesh.scale.setScalar(it.size * (it.life / it.max));
    }
  }
}
