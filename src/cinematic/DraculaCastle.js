import * as THREE from 'three';

// ドラキュラ城の大広間。必殺技のムービーの間だけ表示する（ステージ本体は隠す）。
// 長い広間（X 方向）: 手前（-X）に大扉、奥（+X）に月の見える大窓と玉座。赤い絨毯、石の柱、シャンデリア、ろうそく。
export const CASTLE = {
  halfW: 7.5,       // 広間の幅の半分（Z）
  x0: -17,          // 大扉の位置
  x1: 17,           // 奥の壁
  height: 11,
};

function stoneTexture(base = '#2a2733', line = '#15131b', rx = 8, ry = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line; g.lineWidth = 3;
  for (let y = 0; y < 4; y++) {
    g.beginPath(); g.moveTo(0, y * 32); g.lineTo(128, y * 32); g.stroke();
    const off = y % 2 ? 32 : 0;
    for (let x = 0; x < 3; x++) { g.beginPath(); g.moveTo(off + x * 64, y * 32); g.lineTo(off + x * 64, y * 32 + 32); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#26222e'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#35303f'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  g.strokeStyle = '#121018'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(17, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

function windowTexture(moon = false) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5b4cc4'); grad.addColorStop(1, '#1c1650');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  if (moon) { g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(64, 96, 38, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(40,30,90,0.35)'; g.beginPath(); g.arc(78, 88, 8, 0, 7); g.arc(52, 108, 6, 0, 7); g.fill(); }
  g.strokeStyle = '#0a0812'; g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 250); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.moveTo(0, 128); g.lineTo(128, 128); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DraculaCastle {
  constructor() {
    const C = CASTLE;
    this.group = new THREE.Group();
    this.group.name = 'DraculaCastle';
    this.group.visible = false;
    const G = this.group;
    const L = C.x1 - C.x0;

    // ---- 床・絨毯 ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, C.halfW * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.15 }));
    floor.position.set((C.x0 + C.x1) / 2, 0, 0);
    floor.receiveShadow = true;
    G.add(floor);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(L - 1, 2.8).rotateX(-Math.PI / 2), std(0x7a0c1e, { roughness: 0.95 }));
    carpet.position.set((C.x0 + C.x1) / 2, 0.008, 0);
    G.add(carpet);
    for (const sz of [-1, 1]) { // 絨毯の金の縁
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(L - 1, 0.12).rotateX(-Math.PI / 2), std(0xc9a13a, { roughness: 0.5, metalness: 0.4 }));
      edge.position.set((C.x0 + C.x1) / 2, 0.01, sz * 1.4);
      G.add(edge);
    }

    // ---- 壁・天井 ----
    const wallMat = (rx, ry) => new THREE.MeshStandardMaterial({ map: stoneTexture('#2a2733', '#14121a', rx, ry), roughness: 0.95 });
    for (const sz of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, C.height), wallMat(L / 3, C.height / 3));
      wall.position.set((C.x0 + C.x1) / 2, C.height / 2, sz * C.halfW);
      wall.rotation.y = sz > 0 ? Math.PI : 0;
      G.add(wall);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(C.halfW * 2, C.height), wallMat(5, 3.6));
    back.position.set(C.x1, C.height / 2, 0); back.rotation.y = -Math.PI / 2; G.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(C.halfW * 2, C.height), wallMat(5, 3.6));
    front.position.set(C.x0, C.height / 2, 0); front.rotation.y = Math.PI / 2; G.add(front);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L, C.halfW * 2).rotateX(Math.PI / 2), std(0x120f19, { roughness: 1 }));
    ceil.position.set((C.x0 + C.x1) / 2, C.height, 0); G.add(ceil);

    // ---- 柱と梁 ----
    const pil = std(0x3a3646, { roughness: 0.8 });
    for (let x = -13; x <= 13; x += 4.4) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, C.height, 1.0), pil);
        p.position.set(x, C.height / 2, sz * 5.4); p.castShadow = true; G.add(p);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), pil);
        cap.position.set(x, C.height - 0.3, sz * 5.4); G.add(cap);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), pil);
        base.position.set(x, 0.2, sz * 5.4); G.add(base);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, C.halfW * 2), pil);
      beam.position.set(x, C.height - 0.35, 0); G.add(beam);
    }

    // ---- 窓（側面は青紫、奥の大窓は月）----
    const winGeo = new THREE.PlaneGeometry(2.2, 5.6);
    const winMat = new THREE.MeshBasicMaterial({ map: windowTexture(false), fog: false });
    for (let x = -11; x <= 11; x += 4.4) {
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.position.set(x + 2.2, 6.2, sz * (C.halfW - 0.05)); w.rotation.y = sz > 0 ? Math.PI : 0; G.add(w);
      }
    }
    const moonWin = new THREE.Mesh(new THREE.PlaneGeometry(5, 8.5), new THREE.MeshBasicMaterial({ map: windowTexture(true), fog: false }));
    moonWin.position.set(C.x1 - 0.05, 6.4, 0); moonWin.rotation.y = -Math.PI / 2; G.add(moonWin);

    // ---- 大扉（手前）: 蝙蝠が入ってくる ----
    const doorMat = std(0x2a1710, { roughness: 0.7 });
    for (const sz of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.5, 2.8), doorMat);
      d.position.set(C.x0 + 0.2, 3.75, sz * 1.45); G.add(d);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 6.4), pil);
    frame.position.set(C.x0 + 0.3, 7.7, 0); G.add(frame);

    // ---- 玉座（奥）----
    const dais = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 5), std(0x3a3646));
    dais.position.set(C.x1 - 2.4, 0.3, 0); G.add(dais);
    const dais2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 3.8), std(0x48425a));
    dais2.position.set(C.x1 - 1.9, 0.9, 0); G.add(dais2);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.4), std(0x6b0f20, { roughness: 0.7 }));
    seat.position.set(C.x1 - 1.6, 1.7, 0); G.add(seat);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.6, 1.6), std(0x1d0a12, { roughness: 0.7 }));
    seatBack.position.set(C.x1 - 1.0, 3.0, 0); G.add(seatBack);

    // ---- ろうそく（炎は光る小さな板）と、シャンデリア ----
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false });
    const waxMat = std(0xe8dcc0, { roughness: 0.8 });
    const candle = (x, y, z, h = 0.5) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 6), waxMat);
      w.position.set(x, y + h / 2, z); G.add(w);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), flameMat);
      f.position.set(x, y + h + 0.1, z); G.add(f); this.flames.push(f);
    };
    for (const [x, z] of [[-9, -2.4], [-9, 2.4], [-3, -2.4], [-3, 2.4], [3, -2.4], [3, 2.4], [9, -2.4], [9, 2.4]]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1.2, 6), std(0x1a1a22, { metalness: 0.6, roughness: 0.4 }));
      stand.position.set(x, 0.6, z); G.add(stand);
      candle(x, 1.2, z, 0.35);
    }
    this.chandeliers = [];
    for (const x of [-9, 0, 9]) {
      const ch = new THREE.Group();
      ch.position.set(x, 8.2, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 6, 18).rotateX(Math.PI / 2), std(0x1a1a22, { metalness: 0.7, roughness: 0.4 }));
      ch.add(ring);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 4), std(0x1a1a22));
      chain.position.y = 1.5; ch.add(chain);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), waxMat);
        w.position.set(Math.cos(a) * 1.5, 0.15, Math.sin(a) * 1.5); ch.add(w);
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), flameMat);
        f.position.set(Math.cos(a) * 1.5, 0.4, Math.sin(a) * 1.5); ch.add(f); this.flames.push(f);
      }
      G.add(ch);
      this.chandeliers.push(ch);
    }
    // 光源（重いので少なめ）: 広間の中ほどのオレンジの灯り2つと、奥の月明かり
    this.lights = [];
    for (const [x, z] of [[-3.5, 0], [4, 0]]) {
      const pl = new THREE.PointLight(0xff9a4a, 22, 20, 1.5);
      pl.position.set(x, 5.2, z);
      G.add(pl);
      this.lights.push(pl);
    }
    this.time = 0;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.flames.forEach((f, i) => { f.scale.y = 0.85 + 0.3 * Math.sin(this.time * 14 + i * 1.9); });
    this.chandeliers.forEach((c, i) => { c.rotation.z = 0.02 * Math.sin(this.time * 1.2 + i); c.rotation.y += dt * 0.15; });
    this.lights.forEach((l, i) => { l.intensity = 22 + 3 * Math.sin(this.time * 9 + i * 2); });
  }
}
