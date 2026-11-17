import * as THREE from 'three';

// 闇夜の森: 必殺技（チェンソー）のムービーの舞台。血のような赤い月、葉のない木、小さな小屋、血だまり。ステージ本体は、この間だけ隠す。
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...o });

function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, '#ffb8a0'); grad.addColorStop(0.55, '#ff5a44'); grad.addColorStop(1, 'rgba(255,60,40,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(120,20,20,0.35)';
  for (const [x, y, r] of [[46, 52, 10], [78, 70, 14], [66, 40, 7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SawWorld {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SawWorld';
    this.group.visible = false;
    const G = this.group;
    // 地面
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 40).rotateX(-Math.PI / 2), mat(0x1d2a1c, { flatShading: false }));
    ground.receiveShadow = true;
    G.add(ground);
    // 血だまり（中心のまわり）
    for (let i = 0; i < 9; i++) {
      const a = i * 2.1;
      const r = i === 0 ? 0 : 0.8 + (i % 4) * 0.6;
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.35 + (i % 3) * 0.3, 10).rotateX(-Math.PI / 2), mat(0x5a0a10, { flatShading: false }));
      p.position.set(Math.cos(a) * r, 0.01 + i * 0.0005, Math.sin(a) * r);
      G.add(p);
    }
    // 赤い月
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    moon.scale.set(34, 34, 1);
    moon.position.set(-26, 22, -48);
    G.add(moon);
    // 葉のない木（まわりを囲む）
    const trunkMat = mat(0x2a1c14);
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + (i % 3) * 0.07;
      const r = 12 + ((i * 7) % 9) * 1.8;
      const h = 8 + ((i * 5) % 6);
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, h, 6), trunkMat);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      t.add(trunk);
      for (let b = 0; b < 4; b++) { // 枝
        const L = 2.2 + (b % 2) * 1.2;
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, L, 5), trunkMat);
        br.position.set(Math.cos(b * 1.7 + i) * L * 0.4, h * (0.55 + b * 0.1), Math.sin(b * 1.7 + i) * L * 0.4);
        br.rotation.set(Math.sin(b * 1.7 + i) * 0.9, 0, -Math.cos(b * 1.7 + i) * 0.9);
        t.add(br);
      }
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      G.add(t);
    }
    // 小屋（遠く）
    const cabin = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), mat(0x4a3322));
    walls.position.y = 1.5;
    walls.castShadow = true;
    cabin.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4).rotateY(Math.PI / 4), mat(0x2a1a14));
    roof.position.y = 3.9;
    cabin.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), new THREE.MeshBasicMaterial({ color: 0xffc04a, fog: true }));
    win.position.set(-1.2, 1.7, 2.02);
    cabin.add(win);
    cabin.position.set(11, 0, -13);
    cabin.rotation.y = -0.6;
    G.add(cabin);
    // 丸太と切り株
    for (let i = 0; i < 6; i++) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 7).rotateZ(Math.PI / 2), mat(0x5a3d26));
      const a = i * 1.1 + 0.4;
      lg.position.set(Math.cos(a) * 6.5, 0.3, Math.sin(a) * 6.5);
      lg.rotation.y = a;
      lg.castShadow = true;
      G.add(lg);
    }
    // 霧の柱
    this.fog = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 9, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x6a3a4a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const a = i * 1.05 + 0.2;
      f.position.set(Math.cos(a) * 16, 4.5, Math.sin(a) * 16);
      G.add(f);
      this.fog.push(f);
    }
    this.time = 0;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.fog.forEach((f, i) => { f.rotation.y += dt * 0.1; f.material.opacity = 0.18 + 0.05 * Math.sin(this.time * 0.8 + i); });
  }
}
