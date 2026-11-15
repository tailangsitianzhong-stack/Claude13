import * as THREE from 'three';
import { faceTexture } from './face.js';

// ロブロックス風の低コストキャラ。全部ただの箱＋顔デカール1枚。
// 寸法（scale=1 のとき）: 身長 5 = 脚2 + 胴2 + 頭1
const DEFAULTS = {
  skin: 0xf5cd30,
  shirt: 0x1e88e5,
  pants: 0x2e3a4b,
  shoes: 0x222222,
  hair: 0x4a2c17,
  hairStyle: 'short', // 'short' | 'spiky' | 'none'
  face: 'smile',      // 'smile' | 'angry'
  scale: 1.5,
};

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// 関節: pivot（回転の中心）を親にして、箱をその下にぶら下げる。
// 先端（手・靴）は別色の箱として重ならないように継ぎ足す（Zファイティング防止）。
function limb(w, h, d, color, tipColor, tipRatio) {
  const pivot = new THREE.Group();
  const tipH = h * tipRatio;
  const mainH = h - tipH;
  const main = box(w, mainH, d, color);
  main.position.y = -mainH / 2;
  const tip = box(w, tipH, d, tipColor);
  tip.position.y = -mainH - tipH / 2;
  pivot.add(main, tip);
  return pivot;
}

function buildHair(style, color) {
  const hair = new THREE.Group();
  if (style === 'none') return hair;
  const add = (w, h, d, x, y, z, rx = 0, rz = 0) => {
    const b = box(w, h, d, color);
    b.position.set(x, y, z);
    b.rotation.set(rx, 0, rz);
    hair.add(b);
  };
  // 頭(1.2立方)の上にかぶせる。頭の中心が原点。
  if (style === 'short') {
    add(1.32, 0.35, 1.32, 0, 0.62, 0);          // てっぺん
    add(1.32, 1.0, 0.25, 0, 0.15, -0.55);       // 後ろ髪
    add(0.22, 0.75, 1.2, -0.6, 0.28, -0.05);    // 横髪 左
    add(0.22, 0.75, 1.2, 0.6, 0.28, -0.05);     // 横髪 右
    add(0.9, 0.22, 0.2, -0.15, 0.42, 0.58, 0, -0.15); // 前髪
  } else if (style === 'spiky') {
    add(1.3, 0.3, 1.3, 0, 0.62, 0);
    add(1.3, 0.8, 0.22, 0, 0.25, -0.56);
    const spikes = [[-0.4, 0.4, 0.3], [0, 0, 0], [0.4, -0.4, -0.3], [-0.3, 0.1, -0.45], [0.35, 0.2, 0.4]];
    spikes.forEach(([x, z, tilt]) => add(0.4, 0.6, 0.4, x, 0.95, z, tilt * 0.6, -tilt));
  }
  return hair;
}

/**
 * キャラを作る。返り値:
 *  - group: シーンに追加するルート（足元が y=0）
 *  - joints: { head, leftArm, rightArm, leftLeg, rightLeg } 関節（rotation.x で振る）
 *  - update(t): 待機モーション
 */
export function createCharacter(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const group = new THREE.Group();
  group.name = o.name ?? 'Character';
  const body = new THREE.Group(); // 待機の上下ゆれ用
  group.add(body);
  group.scale.setScalar(o.scale);

  // 脚（股関節が y=2）
  const leftLeg = limb(0.98, 2, 1, o.pants, o.shoes, 0.18);
  leftLeg.position.set(-0.5, 2, 0);
  const rightLeg = limb(0.98, 2, 1, o.pants, o.shoes, 0.18);
  rightLeg.position.set(0.5, 2, 0);

  // 胴
  const torso = box(2, 2, 1, o.shirt);
  torso.position.y = 3;

  // 腕（肩関節が y=3.9）。手の部分だけ肌色
  const makeArm = (side) => {
    const arm = limb(1, 2, 1, o.shirt, o.skin, 0.25);
    arm.position.set(side * 1.5, 3.9, 0);
    return arm;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // 頭（首の付け根が y=4）
  const head = new THREE.Group();
  head.position.y = 4;
  const skull = box(1.2, 1.2, 1.2, o.skin);
  skull.position.y = 0.6;
  head.add(skull);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshStandardMaterial({ map: faceTexture(o.face), transparent: true, roughness: 0.6 }),
  );
  face.position.set(0, 0.6, 0.601); // 頭の正面に貼り付け
  head.add(face);

  const hair = buildHair(o.hairStyle, o.hair);
  hair.position.y = 0.6;
  head.add(hair);

  body.add(leftLeg, rightLeg, torso, leftArm, rightArm, head);

  const joints = { head, leftArm, rightArm, leftLeg, rightLeg };
  const phase = Math.random() * Math.PI * 2;

  function update(t) {
    // 待機モーション: 呼吸っぽく上下 + 腕を少し揺らす（ファイティングポーズ）
    const s = Math.sin(t * 3 + phase);
    body.position.y = s * 0.04;
    leftArm.rotation.x = -0.9 + s * 0.08;
    rightArm.rotation.x = -0.6 - s * 0.08;
    leftArm.rotation.z = -0.15;
    rightArm.rotation.z = 0.15;
    head.rotation.x = s * 0.03;
  }

  return { group, joints, update, height: 5.2 * o.scale };
}
