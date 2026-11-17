import * as THREE from 'three';

// 擬音の世界: 必殺技（擬音）のムービーの舞台。マンガのコマのような、ハーフトーン（網点）の床、集中線の空、飛び交う爆発の吹き出し。
// ステージ本体は、この間だけ隠す。

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const tex = (c, repeat) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
};

// 網点の床
function dotsTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffe14a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ff6a8a';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(16 + x * 32 + (y % 2 ? 16 : 0), 16 + y * 32, 9, 0, Math.PI * 2); g.fill(); }
  return tex(c, 22);
}

// 集中線の空（横に一周する縞。上へ向かって暗くなる）
function raysTexture() {
  const [c, g] = canvas(1024, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2a1a6a'); grad.addColorStop(0.5, '#ff5a3a'); grad.addColorStop(1, '#ffd84a');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  let x = 0;
  let k = 0;
  while (x < 1024) {
    const w = 8 + ((k * 37) % 23);
    if (k % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.38)'; g.fillRect(x, 0, w, 512); }
    else { g.fillStyle = 'rgba(20,10,50,0.22)'; g.fillRect(x, 0, w * 0.6, 512); }
    x += w; k++;
  }
  return tex(c);
}

// 爆発の吹き出し（ギザギザの星）
function burstTexture(fill, seed = 0) {
  const [c, g] = canvas(256, 256);
  const n = 14;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 118 : 70 + ((i * 29 + seed * 13) % 17);
    const px = 128 + Math.cos(a) * r; const py = 128 + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#1a1030'; g.stroke();
  g.fillStyle = fill; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { g.beginPath(); g.arc(70 + x * 28, 70 + y * 28, 4, 0, Math.PI * 2); g.fill(); }
  return tex(c);
}

// 丸い吹き出し
function bubbleTexture() {
  const [c, g] = canvas(256, 192);
  g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#1a1030'; g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(128, 84, 112, 70, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(80, 140); g.lineTo(56, 184); g.lineTo(116, 148); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect(70, 118, 60, 22);
  return tex(c);
}

export class ComicWorld {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ComicWorld';
    this.group.visible = false;
    const G = this.group;
    // 床（網点）と、ステージの輪
    const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dotsTexture(), roughness: 1 }));
    floor.receiveShadow = true;
    G.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.12, 6, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.8 }));
    ring.position.y = 0.04;
    G.add(ring);
    // 空
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(90, 28, 14), new THREE.MeshBasicMaterial({ map: raysTexture(), side: THREE.BackSide, fog: false }));
    G.add(this.dome);
    // 飛び交う爆発の吹き出しと、丸い吹き出し
    this.floaters = [];
    const fills = ['#ff3d5a', '#ffd84a', '#3dd6ff', '#ff9a2a', '#b46bff', '#7dff6a'];
    for (let i = 0; i < 16; i++) {
      const isBubble = i % 4 === 3;
      const t = isBubble ? bubbleTexture() : burstTexture(fills[i % fills.length], i);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
      const a = (i / 16) * Math.PI * 2 + 0.3;
      const r = 13 + (i % 5) * 3.2;
      const size = isBubble ? 5.2 : 4.4 + (i % 3) * 1.6;
      s.scale.set(size * (isBubble ? 1.3 : 1), size, 1);
      s.position.set(Math.cos(a) * r, 2.5 + (i % 6) * 1.7, Math.sin(a) * r);
      G.add(s);
      this.floaters.push({ s, y0: s.position.y, ph: i * 1.3, size });
    }
    this.time = 0;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.dome.rotation.y += dt * 0.12;
    for (const f of this.floaters) {
      f.s.position.y = f.y0 + 0.5 * Math.sin(this.time * 1.6 + f.ph);
      const k = 1 + 0.06 * Math.sin(this.time * 5 + f.ph);
      f.s.scale.x = f.size * k * (f.s.scale.x < 0 ? -1 : 1) * (f.s.material.map && f.s.material.map.image && f.s.material.map.image.height === 192 ? 1.3 : 1);
      f.s.scale.y = f.size * k;
    }
  }
}
