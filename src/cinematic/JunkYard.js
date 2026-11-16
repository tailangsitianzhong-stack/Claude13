import * as THREE from 'three';

// ゴミ処理場: 必殺技（矢印）のムービーの舞台。ゴミの山、錆びた車、ドラム缶、フェンス、クレーン。ステージ本体は、この間だけ隠す。
// createJunk: 引き寄せられて飛んでくるゴミ（種類と大きさごと）。

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });
const box = (w, h, d, color, x = 0, y = 0, z = 0, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(x, y, z); m.castShadow = true; return m; };
const cyl = (r, h, color, x = 0, y = 0, z = 0, rz = 0, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color)); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; return m; };

const RUST = [0x8a4b2a, 0x6a3a22, 0x7a6a52, 0x4a4f58, 0x9a7a3a, 0x3a5a7a, 0x7a2a2a];
const pick = (arr, k) => arr[Math.abs(Math.floor(k)) % arr.length];

// 種類: bag（ゴミ袋）, crate（木箱）, can（ドラム缶）, tire（タイヤ）, tv, washer（洗濯機）, fridge（冷蔵庫）, dumpster（ゴミ箱の大型）, car
export function createJunk(kind, k = 0) {
  const g = new THREE.Group();
  switch (kind) {
    case 'bag': { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(pick([0x1b2430, 0x2a2a2a, 0x24402e], k))); m.scale.set(1, 0.85, 0.9); m.castShadow = true; g.add(m); break; }
    case 'crate': g.add(box(0.9, 0.7, 0.8, 0x8a6a3a)); g.add(box(0.95, 0.12, 0.85, 0x6a4a22, 0, 0.2, 0)); break;
    case 'can': g.add(cyl(0.38, 0.9, pick([0xb03030, 0x2a5aa0, 0x777777], k))); g.add(cyl(0.4, 0.08, 0x222222, 0, 0.3, 0)); break;
    case 'tire': { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.18, 6, 12), mat(0x151515)); t.rotation.x = Math.PI / 2; t.castShadow = true; g.add(t); break; }
    case 'tv': g.add(box(1.0, 0.8, 0.8, 0x555a62)); g.add(box(0.8, 0.6, 0.05, 0x0c1218, 0, 0, 0.43)); break;
    case 'washer': g.add(box(0.9, 1.0, 0.9, 0xd8d8d8)); g.add(cyl(0.3, 0.06, 0x2a3440, 0, 0, 0.47, Math.PI / 2)); break;
    case 'fridge': g.add(box(0.9, 1.9, 0.85, 0xeeeeee)); g.add(box(0.05, 0.5, 0.06, 0x777777, 0.34, 0.45, 0.45)); g.add(box(0.9, 0.03, 0.86, 0xaaaaaa, 0, 0.45, 0)); break;
    case 'dumpster': g.add(box(1.8, 1.1, 1.0, 0x2e6a3a)); g.add(box(1.9, 0.12, 1.1, 0x1c4a28, 0, 0.62, 0)); break;
    case 'car': {
      const c = pick(RUST, k);
      g.add(box(2.2, 0.55, 1.0, c, 0, 0.45, 0));
      g.add(box(1.1, 0.45, 0.9, c, -0.1, 0.92, 0));
      g.add(box(1.0, 0.3, 0.92, 0x223344, -0.1, 0.95, 0, { roughness: 0.3 }));
      for (const [x, z] of [[-0.7, -0.5], [-0.7, 0.5], [0.7, -0.5], [0.7, 0.5]]) { const wh = cyl(0.26, 0.2, 0x151515, x, 0.26, z, 0, 10); wh.rotation.x = Math.PI / 2; g.add(wh); }
      break;
    }
    default: break;
  }
  return g;
}

export class JunkYard {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'JunkYard';
    this.group.visible = false;
    const G = this.group;
    // 地面: 土と砂利
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 40).rotateX(-Math.PI / 2), mat(0x4a4136, { flatShading: false }));
    ground.receiveShadow = true;
    G.add(ground);
    for (let i = 0; i < 26; i++) { // 暗いしみ
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 16;
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.8 + Math.random() * 1.6, 8).rotateX(-Math.PI / 2), mat(0x35302a, { flatShading: false }));
      p.position.set(Math.cos(a) * r, 0.005, Math.sin(a) * r); G.add(p);
    }
    // ゴミの山: 外周に、大小のゴミを積み上げた山
    const kinds = ['bag', 'crate', 'can', 'tire', 'tv', 'washer', 'fridge', 'dumpster', 'car'];
    let n = 0;
    for (let ring = 0; ring < 3; ring++) {
      const R = 11 + ring * 5;
      const count = 9 + ring * 3;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ring * 0.3;
        const heap = new THREE.Group();
        const pieces = 7 + (ring === 2 ? 5 : 0);
        for (let j = 0; j < pieces; j++) {
          const kd = kinds[(i * 3 + j * 5 + ring) % kinds.length];
          const jk = createJunk(kd, n++);
          const s = (kd === 'car' ? 1.6 : kd === 'fridge' || kd === 'dumpster' ? 1.5 : 1.7) * (0.8 + ((i + j) % 4) * 0.15);
          jk.scale.setScalar(s);
          const lvl = Math.floor(j / 3);
          jk.position.set((Math.sin(j * 2.1 + i) * 1.8) * (1 - lvl * 0.25), 0.35 + lvl * 0.95, Math.cos(j * 1.7 + i * 2) * 1.8 * (1 - lvl * 0.25));
          jk.rotation.set(Math.sin(j * 3) * 0.4, j * 1.9, Math.cos(j) * 0.4);
          heap.add(jk);
        }
        heap.position.set(Math.cos(a) * (R + (i % 3)), 0, Math.sin(a) * (R + (i % 3)));
        G.add(heap);
      }
    }
    // フェンス（波板）
    const fence = mat(0x6e747c);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.12), fence);
      f.position.set(Math.cos(a) * 21, 1.6, Math.sin(a) * 21);
      f.rotation.y = -a + Math.PI / 2;
      G.add(f);
    }
    // クレーン（遠く）
    const crane = new THREE.Group();
    crane.add(box(0.5, 14, 0.5, 0xc9a021, 0, 7, 0));
    crane.add(box(10, 0.4, 0.4, 0xc9a021, 4.5, 14, 0));
    crane.add(box(0.1, 6, 0.1, 0x222222, 8.5, 11, 0));
    crane.add(cyl(1.0, 0.6, 0x555555, 8.5, 7.8, 0));
    crane.position.set(-8, 0, -17);
    crane.rotation.y = 0.6;
    G.add(crane);
    // 看板
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#c9a021'; g2.fillRect(0, 0, 512, 128);
    g2.strokeStyle = '#222'; g2.lineWidth = 8; g2.strokeRect(6, 6, 500, 116);
    g2.fillStyle = '#222'; g2.font = '900 70px system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('JUNKYARD', 256, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
    sign.position.set(14, 4.2, -12); sign.rotation.y = -0.9;
    G.add(sign);
    // もやのような煙の柱
    this.smoke = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.2, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x5a4a40, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const a = i * 1.05 + 0.4;
      s.position.set(Math.cos(a) * 19, 7, Math.sin(a) * 19);
      G.add(s);
      this.smoke.push(s);
    }
    this.time = 0;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.smoke.forEach((s, i) => { s.rotation.y += dt * 0.1; s.material.opacity = 0.2 + 0.05 * Math.sin(this.time + i); });
  }
}
