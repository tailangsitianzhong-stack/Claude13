import * as THREE from 'three';

// 西洋剣（片手で振れるロングソード）。箱と三角の切っ先だけで作る低コスト版。
// 柄を握る手の中心が原点、刃は +Z へ伸びる。刃の幅は Y、厚みは X。
export const SWORD = {
  bladeStart: 0.47,
  bladeLength: 2.55,
  tipLength: 0.42,
  bladeWidth: 0.27,
  bladeThick: 0.07,
};

const COLORS = {
  blade: 0xdfe5ec,
  fuller: 0xaeb7c2,
  guard: 0xc9a23a,
  grip: 0x5a3a22,
  pommel: 0xc9a23a,
};

function part(geometry, color, glow = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  if (glow > 0) {
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = glow;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

// 切っ先: 刃と同じ厚みのまま、幅だけ先端へ向けてすぼまる三角柱
function tipGeometry(width, thick, length) {
  const w = width / 2;
  const t = thick / 2;
  const v = [
    [-t, -w, 0], [t, -w, 0], [t, w, 0], [-t, w, 0], // 根元の四角
    [-t, 0, length], [t, 0, length],                // 先端の辺
  ];
  const faces = [
    [0, 4, 3], [1, 2, 5],             // 左右の三角面
    [3, 4, 5], [3, 5, 2],             // 上の刃
    [0, 1, 5], [0, 5, 4],             // 下の刃
  ];
  const positions = [];
  for (const f of faces) for (const i of f) positions.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

export function createSword() {
  const S = SWORD;
  const sword = new THREE.Group();
  sword.name = 'Sword';

  const blade = part(new THREE.BoxGeometry(S.bladeThick, S.bladeWidth, S.bladeLength), COLORS.blade, 0.25);
  blade.position.z = S.bladeStart + S.bladeLength / 2;

  const tip = part(tipGeometry(S.bladeWidth, S.bladeThick, S.tipLength), COLORS.blade, 0.25);
  tip.position.z = S.bladeStart + S.bladeLength;

  // 樋（刃の中央を走る溝）: 少しだけ厚い暗い帯として両面に見せる
  const fuller = part(new THREE.BoxGeometry(S.bladeThick + 0.016, S.bladeWidth * 0.3, S.bladeLength * 0.72), COLORS.fuller);
  fuller.position.z = S.bladeStart + S.bladeLength * 0.4;

  // 鍔（十字のガード）: 刃と同じ向きに長い棒 + 中央の厚み
  const guard = part(new THREE.BoxGeometry(0.17, 1.0, 0.14), COLORS.guard);
  guard.position.z = S.bladeStart - 0.07;
  const guardCore = part(new THREE.BoxGeometry(0.21, 0.36, 0.2), COLORS.guard);
  guardCore.position.z = S.bladeStart - 0.07;

  const grip = part(new THREE.BoxGeometry(0.13, 0.16, 0.66), COLORS.grip);
  grip.position.z = S.bladeStart - 0.14 - 0.33;

  const pommel = part(new THREE.BoxGeometry(0.22, 0.26, 0.2), COLORS.pommel);
  pommel.position.z = S.bladeStart - 0.14 - 0.66 - 0.08;

  sword.add(blade, tip, fuller, guard, guardCore, grip, pommel);

  // 剣の軌跡（トレイル）を描くための刃の根元と先端
  sword.userData.base = new THREE.Vector3(0, 0, S.bladeStart + 0.25);
  sword.userData.tip = new THREE.Vector3(0, 0, S.bladeStart + S.bladeLength + S.tipLength);
  return sword;
}
