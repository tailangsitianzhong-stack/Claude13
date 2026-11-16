import * as THREE from 'three';

// 攻撃の見た目を派手にする使い捨てエフェクト（すべて加算合成の光）。
//   flash : 命中点で一瞬ふくらむ星形の閃光（常にカメラを向く）
//   streak: 命中点を斬った向きに走る細長い光の線
//   ring  : 地面に広がる衝撃波の輪
//   wave  : 剣を振った先へ飛んでいく三日月形の斬撃波

function starTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(200,240,255,0.75)');
  grad.addColorStop(1, 'rgba(120,200,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // 十字とななめの光条
  g.translate(S / 2, S / 2);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 4; i++) {
    const len = i % 2 === 0 ? S / 2 : S / 3.2;
    g.beginPath();
    g.moveTo(0, -3); g.lineTo(len, 0); g.lineTo(0, 3); g.lineTo(-len, 0);
    g.closePath();
    g.fill();
    g.rotate(Math.PI / 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 三日月（弧の帯）。中心角 arc、内側ほど細い
function crescentGeometry(arc, rOuter, thickness) {
  const N = 20;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = -arc / 2 + arc * t;
    const w = thickness * Math.sin(Math.PI * t);      // 両端がとがる
    pos.push(Math.sin(a) * rOuter, 0, Math.cos(a) * rOuter, Math.sin(a) * (rOuter - w), 0, Math.cos(a) * (rOuter - w));
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const glow = (color, map) => new THREE.MeshBasicMaterial({
  color, map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.DoubleSide, fog: false,
});

const easeOut = (t) => 1 - (1 - t) * (1 - t);

export class Impact {
  constructor(scene) {
    this.items = [];
    const star = starTexture();
    const make = (kind, count, build) => {
      for (let i = 0; i < count; i++) {
        const obj = build();
        obj.visible = false;
        obj.frustumCulled = false;
        scene.add(obj);
        this.items.push({ kind, obj, life: 0, max: 1, size: 1, vel: new THREE.Vector3() });
      }
    };
    make('flash', 4, () => new THREE.Sprite(new THREE.SpriteMaterial({
      map: star, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    })));
    make('streak', 4, () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glow(0xcff4ff)));
    make('ring', 3, () => new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2), glow(0x9fe6ff)));
    make('wave', 12, () => new THREE.Mesh(crescentGeometry(2.3, 1, 0.34), glow(0x6fdcff)));
    make('wind', 14, () => new THREE.Mesh(crescentGeometry(2.3, 1, 0.3), glow(0xf2fbff))); // バットの風（白）
  }

  take(kind) {
    let best = null;
    for (const it of this.items) {
      if (it.kind !== kind) continue;
      if (it.life <= 0) return it;
      if (!best || it.life < best.life) best = it;
    }
    return best; // 全部使用中なら、一番消えかけのものを使い回す
  }

  start(kind, duration, size) {
    const it = this.take(kind);
    it.life = it.max = duration;
    it.size = size;
    it.obj.visible = true;
    it.vel.set(0, 0, 0);
    return it;
  }

  flash(pos, size, duration = 0.16) {
    const it = this.start('flash', duration, size);
    it.obj.position.copy(pos);
    it.obj.material.rotation = Math.random() * Math.PI;
  }

  // dir: 光の線が走る向き（ワールド）。camera を向く板にする
  streak(pos, dir, camera, size, duration = 0.14) {
    const it = this.start('streak', duration, size);
    it.obj.position.copy(pos);
    it.obj.quaternion.copy(camera.quaternion);
    // 板の横（ローカル X）を、画面上での dir の向きへ回す
    const local = dir.clone().applyQuaternion(camera.quaternion.clone().invert());
    it.obj.rotateZ(Math.atan2(local.y, local.x));
  }

  ring(pos, size, duration = 0.4) {
    const it = this.start('ring', duration, size);
    it.obj.position.set(pos.x, 0.012, pos.z);
  }

  /**
   * 斬撃波。origin から heading の向きへ飛ぶ。
   * tilt: 弧の面の傾き（0 = 水平の横薙ぎ、±で斜め、π/2 で縦）
   */
  wave(origin, heading, tilt, size, speed, duration = 0.28, kind = 'wave') {
    const it = this.start(kind, duration, size);
    it.obj.position.copy(origin);
    it.obj.rotation.set(0, heading, tilt, 'YXZ');
    it.vel.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.obj.visible = false; continue; }
      const t = 1 - it.life / it.max; // 0 → 1
      const o = it.obj;
      if (it.kind === 'flash') {
        o.scale.setScalar(it.size * (0.35 + 0.65 * easeOut(t)));
        o.material.opacity = 1 - t * t;
      } else if (it.kind === 'streak') {
        o.scale.set(it.size * (0.4 + 1.6 * easeOut(t)), it.size * 0.09 * (1 - t), 1);
        o.material.opacity = 1 - t;
      } else if (it.kind === 'ring') {
        o.scale.setScalar(it.size * (0.15 + 0.85 * easeOut(t)));
        o.material.opacity = 0.9 * (1 - t);
      } else if (it.kind === 'wind') {
        o.position.addScaledVector(it.vel, dt);
        o.scale.set(it.size * (0.6 + 0.9 * easeOut(t)), it.size * (0.6 + 0.5 * easeOut(t)), it.size * (0.6 + 0.9 * easeOut(t)));
        o.material.opacity = 0.7 * (1 - t * t);
      } else {
        o.position.addScaledVector(it.vel, dt);
        o.scale.setScalar(it.size * (0.8 + 0.5 * easeOut(t)));
        o.material.opacity = 0.85 * (1 - t * t);
      }
    }
  }
}
