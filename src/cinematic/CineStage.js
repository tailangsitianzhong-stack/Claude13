import * as THREE from 'three';

// ムービーの舞台: 暗い空間に、光の輪が浮かぶ円形の床。ステージ本体（草原・石壁・海）は、この間だけ隠す。
export class CineStage {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CineStage';
    this.group.visible = false;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(15, 72).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0a0f20, roughness: 0.32, metalness: 0.65 }),
    );
    floor.receiveShadow = true;
    this.group.add(floor);

    // 床に描く光の輪（斬撃のたびに脈打つ）
    this.rings = [];
    for (const r of [1.5, 3.4, 5.8, 9]) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.035, r, 96).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      m.position.y = 0.01;
      this.group.add(m);
      this.rings.push(m);
    }
    // 放射状の線
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.03, 13).rotateX(-Math.PI / 2).translate(0, 0, 6.5),
        new THREE.MeshBasicMaterial({ color: 0x2a6fc0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      m.rotation.y = (i / 24) * Math.PI * 2;
      m.position.y = 0.008;
      this.group.add(m);
    }
    // 遠くに立つ光の柱（カメラが回ったときに奥行きが出る）
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const h = 6 + (i % 4) * 2.5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07).translate(0, h / 2, 0), pillarMat);
      m.position.set(Math.cos(a) * 12.5, 0, Math.sin(a) * 12.5);
      this.group.add(m);
    }
    // 舞う光の粒
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 9;
      pos.set([Math.cos(a) * r, Math.random() * 7, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fe0ff, size: 0.05, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
    this.pulse = 0;
  }

  // 斬撃のたびに、床の光の輪を明るくする
  hit() { this.pulse = 1; }

  update(dt) {
    if (!this.group.visible) return;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.rings.forEach((m, i) => { m.material.opacity = 0.45 + 0.5 * this.pulse; m.rotation.y += dt * (0.2 + i * 0.1); });
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.25;
      if (y > 7) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }
}
