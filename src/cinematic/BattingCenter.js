import * as THREE from 'three';
import { ULTB } from '../character/BatController.js';
import { createBall } from '../character/Bat.js';

// バッティングセンター: 打席（ホームプレート）・ネットで囲まれた通路・奥のピッチングマシン。
// 必殺技のムービーの間だけ表示する（ステージ本体は隠す）。

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(170,205,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0f26'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#ff3fa4'; g.lineWidth = 10; g.strokeRect(14, 14, 996, 228);
  g.shadowColor = '#4fd8ff'; g.shadowBlur = 28;
  g.fillStyle = '#e8fbff'; g.font = '900 120px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('BATTING CENTER', 512, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

export class BattingCenter {
  constructor() {
    const K = ULTB;
    this.group = new THREE.Group();
    this.group.name = 'BattingCenter';
    this.group.visible = false;
    const G = this.group;

    // ---- 床: 人工芝 ----
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(24, 12).rotateX(-Math.PI / 2), std(0x2a7d38));
    turf.position.set(0.5, 0, 0);
    turf.receiveShadow = true;
    G.add(turf);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.7).rotateX(-Math.PI / 2), std(0x3aa04a));
    strip.position.set(0.5, 0.004, 0);
    G.add(strip);
    // ホームプレート（五角形）
    const sh = new THREE.Shape();
    sh.moveTo(-0.3, -0.3); sh.lineTo(0.3, -0.3); sh.lineTo(0.3, 0.05); sh.lineTo(0, 0.38); sh.lineTo(-0.3, 0.05); sh.closePath();
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), std(0xf5f5f5, { roughness: 0.5 }));
    plate.rotation.y = -Math.PI / 2; // 尖った側を、マシンの方へ
    plate.position.set(K.batter.x + 0.1, 0.012, K.batter.z);
    G.add(plate);
    // バッターボックスの線
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sz of [-1, 1]) {
      for (const [w, d, x, z] of [[1.7, 0.05, 0, sz * 0.95], [1.7, 0.05, 0, sz * 2.0], [0.05, 1.1, -0.85, sz * 1.48], [0.05, 1.1, 0.85, sz * 1.48]]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), lineMat);
        l.position.set(K.batter.x + x, 0.014, K.batter.z + z);
        G.add(l);
      }
    }
    // マシンの前の土のサークル
    const mound = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28).rotateX(-Math.PI / 2), std(0x8a5a32));
    mound.position.set(K.machine.x, 0.006, K.machine.z);
    G.add(mound);

    // ---- ネット・壁 ----
    const net = netTexture();
    const netMat = (rx, ry) => { const t = net.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true }); };
    const panel = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), netMat(w / 0.5, h / 0.5));
      m.position.set(x, y, z); m.rotation.y = ry; G.add(m); return m;
    };
    panel(19, 6.5, 0.5, 3.25, -5.4, 0);            // 左（3塁側）
    panel(19, 6.5, 0.5, 3.25, 5.4, 0);             // 右
    panel(10.8, 6.5, -9.2, 3.25, 0, Math.PI / 2);  // 打席の後ろ
    // 奥の壁（看板つき）
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(11, 7).rotateY(-Math.PI / 2), std(0x0b1024, { roughness: 1 }));
    wall.position.set(9.8, 3.5, 0);
    G.add(wall);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: signTexture(), fog: false }));
    sign.position.set(9.7, 4.6, 0);
    G.add(sign);
    // 天井と照明
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(19, 11).rotateX(Math.PI / 2), std(0x0a0d1c, { roughness: 1 }));
    ceil.position.set(0.5, 6.6, 0);
    G.add(ceil);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf, fog: false });
    for (const x of [-7, -3.5, 0, 3.5, 7]) for (const z of [-2.4, 2.4]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.5), this.lampMat);
      l.position.set(x, 6.55, z);
      G.add(l);
    }
    this.lights = [];
    for (const [x, z] of [[-4.5, 0], [4, 0]]) {
      const pl = new THREE.PointLight(0xfff0d8, 28, 22, 1.6);
      pl.position.set(x, 5.8, z);
      G.add(pl);
      this.lights.push(pl);
    }

    // ---- ピッチングマシン ----
    const M = new THREE.Group();
    M.position.set(K.machine.x, 0, K.machine.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.0), std(0x2d3340, { roughness: 0.5, metalness: 0.4 }));
    body.position.set(0.1, 0.78, 0);
    body.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 1.02), std(0xffc21a, { roughness: 0.5 }));
    stripe.position.set(0.1, 0.9, 0);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), std(0x3a4150, { roughness: 0.5, metalness: 0.4 }));
    hood.position.set(-0.85, 0.85, 0);
    M.add(body, stripe, hood);
    this.wheels = [];
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14), std(0xd9302a, { roughness: 0.6 }));
      w.position.set(-1.1, 0.8, sz * 0.2);
      w.rotation.x = 0;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), std(0xeeeeee));
      cap.position.copy(w.position);
      M.add(w, cap);
      this.wheels.push(w);
    }
    for (const [x, z] of [[-0.5, -0.4], [-0.5, 0.4], [0.6, 0]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.45, 6), std(0x20242e, { roughness: 0.5 }));
      leg.position.set(x, 0.22, z);
      M.add(leg);
    }
    G.add(M);
    this.machine = M;
    this.muzzle = new THREE.Vector3(K.machine.x - 1.25, 0.82, K.machine.z);
    this.recoil = 0;
    this.spin = 0;
  }

  // ボールを放つ（反動）
  kick() { this.recoil = 1; }

  update(dt) {
    if (!this.group.visible) return;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.spin += dt * 30;
    this.machine.position.x = ULTB.machine.x + 0.12 * this.recoil;
    for (const w of this.wheels) w.rotation.y = this.spin;
  }
}
