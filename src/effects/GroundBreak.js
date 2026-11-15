import * as THREE from 'three';

// 叩きつけで地面が割れる演出。
//   - 中心: 暗くへこんだ円（クレーター）と、放射状のひび
//   - まわり: 地面の板が外向きに傾いてめくれ上がる（隆起）
// 少しの間そのまま残り、ゆっくり沈んで元の地面に戻る。床そのものは変形させない（見た目だけ）。

const CHUNKS = 22;
const CRACKS = 9;
const RISE = 0.09;   // めくれ上がるまでの秒数
const HOLD = 1.3;    // 残っている秒数
const SINK = 0.7;    // 沈んで消える秒数

const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class GroundBreak {
  constructor(scene, { grass = 0x4fa83d, dirt = 0x7a5232 } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.t = -1;

    // へこみ: 中心ほど暗い円を2枚重ねる
    const pit = (r, color, opacity, y) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      m.position.y = y;
      m.userData.opacity = opacity;
      this.group.add(m);
      return m;
    };
    this.pits = [pit(0.62, 0x2f5f24, 0.75, 0.004), pit(0.36, 0x3a2a18, 0.85, 0.006)];

    // ひび: 中心から外へ伸びる細い暗い帯
    this.cracks = [];
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x241a10, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < CRACKS; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), crackMat);
      m.position.y = 0.008;
      this.group.add(m);
      this.cracks.push(m);
    }
    this.crackMat = crackMat;

    // 隆起: 上面が草、側面が土の板
    const dirtMat = new THREE.MeshStandardMaterial({ color: dirt, roughness: 0.9 });
    const grassMat = new THREE.MeshStandardMaterial({ color: grass, roughness: 0.85 });
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0); // 上面が原点（地面の高さ）に来る
    this.chunks = [];
    for (let i = 0; i < CHUNKS; i++) {
      const pivot = new THREE.Group(); // 内側の辺を軸に、外向きへ跳ね上がる
      const mesh = new THREE.Mesh(geo, [dirtMat, dirtMat, grassMat, dirtMat, dirtMat, dirtMat]);
      mesh.castShadow = true;
      pivot.add(mesh);
      this.group.add(pivot);
      this.chunks.push({ pivot, mesh, tilt: 0, lift: 0, delay: 0 });
    }
  }

  // (x, z) を中心に、半径 radius の範囲で地面を割る
  trigger(x, z, radius) {
    this.group.position.set(x, 0, z);
    this.group.scale.setScalar(radius);
    this.group.visible = true;
    this.t = 0;

    this.cracks.forEach((m, i) => {
      const a = (i / CRACKS) * Math.PI * 2 + Math.random() * 0.5;
      m.rotation.y = a;
      m.scale.set(0.55 + Math.random() * 0.45, 1, 0.025 + Math.random() * 0.03);
    });

    // 内側の輪（小さく強く傾く）と外側の輪（大きくゆるく傾く）
    this.chunks.forEach((c, i) => {
      const inner = i < CHUNKS * 0.4;
      const count = inner ? Math.ceil(CHUNKS * 0.4) : CHUNKS - Math.ceil(CHUNKS * 0.4);
      const k = inner ? i : i - Math.ceil(CHUNKS * 0.4);
      const a = (k / count) * Math.PI * 2 + (inner ? 0 : 0.3) + (Math.random() - 0.5) * 0.35;
      const r = inner ? 0.36 + Math.random() * 0.08 : 0.62 + Math.random() * 0.14;
      const w = (inner ? 0.2 : 0.3) * (0.7 + Math.random() * 0.6);   // 輪に沿った幅
      const d = (inner ? 0.2 : 0.26) * (0.7 + Math.random() * 0.6);  // 外へ向かう長さ
      const h = 0.07 + Math.random() * 0.06;
      c.pivot.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
      c.pivot.rotation.set(0, a, 0);
      c.mesh.scale.set(d, h, w);
      c.mesh.position.set(d / 2, 0, 0);          // 軸（内側の辺）から外へ伸びる
      c.tilt = (inner ? 0.75 : 0.45) + Math.random() * 0.45;
      c.lift = (inner ? 0.05 : 0.03) + Math.random() * 0.04;
      c.delay = (inner ? 0 : 0.035) + Math.random() * 0.03; // 衝撃が内から外へ伝わる
      c.mesh.rotation.set(0, (Math.random() - 0.5) * 0.5, 0);
    });
    this.apply();
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t > RISE + HOLD + SINK + 0.1) {
      this.t = -1;
      this.group.visible = false;
      return;
    }
    this.apply();
  }

  apply() {
    const t = this.t;
    const out = Math.min(1, Math.max(0, (t - RISE - HOLD) / SINK)); // 0 → 1 で沈んで消える
    const fade = 1 - out;
    for (const p of this.pits) p.material.opacity = p.userData.opacity * fade * Math.min(1, t / 0.04);
    this.crackMat.opacity = 0.9 * fade * Math.min(1, t / 0.05);
    for (const c of this.chunks) {
      const k = Math.min(1, Math.max(0, (t - c.delay) / RISE));
      const up = easeOutBack(k) * (1 - out * out);
      // 外向きに跳ね上がる（内側の辺が持ち上がり、外側が地面に残る）
      c.pivot.rotation.z = c.tilt * up;
      c.pivot.position.y = c.lift * up - 0.002;
      c.pivot.visible = up > 0.01;
    }
  }
}
