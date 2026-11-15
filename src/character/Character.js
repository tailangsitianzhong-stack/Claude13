import * as THREE from 'three';
import { faceTexture } from './face.js';
import { Animator } from './Animator.js';
import { RIG } from './rig.js';

// ロブロックス風の低コストキャラ。全部ただの箱＋顔デカール1枚。
// キャラは +Z を向く。キャラ自身から見て左が +X、右が -X。

const DEFAULTS = {
  skin: 0xf4f4f4,
  shirt: 0x1e88e5,
  pants: 0x2e3a4b,
  shoes: 0x222222,
  hair: 0x4a2c17,
  hairStyle: 'short', // 'short' | 'spiky' | 'none'
  face: 'smile',      // 'smile' | 'angry'
  sleeves: 'short',   // 'short'（前腕が肌） | 'long'（手だけ肌）
  scale: 0.15,
};

const SKIN_GLOW = 0.3;

function box(w, h, d, color, glow = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  if (glow > 0) {
    // 白い肌が影側でグレーに沈まないよう、少しだけ自分で光らせる
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = glow;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  // 影は落とすが受けない: キャラが小さく、影の解像度では体の表面にノイズが出るため
  mesh.castShadow = true;
  return mesh;
}

// 関節 = 回転の中心になる空のグループ
function joint(parent, x, y, z, order = 'XYZ') {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  j.rotation.order = order;
  parent.add(j);
  return j;
}

// 上端 yTop から下端 yBottom までの箱を関節にぶら下げる
function hang(parentJoint, w, d, yTop, yBottom, color, z = 0, glow = 0) {
  const b = box(w, yTop - yBottom, d, color, glow);
  b.position.set(0, (yTop + yBottom) / 2, z);
  parentJoint.add(b);
  return b;
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
  // 1.2 立方の頭を基準にした配置（頭の中心が原点）。実際の頭サイズへは group を縮尺して合わせる。
  if (style === 'short') {
    add(1.32, 0.35, 1.32, 0, 0.62, 0);                // てっぺん
    add(1.32, 1.0, 0.25, 0, 0.15, -0.55);             // 後ろ髪
    add(0.22, 0.75, 1.2, -0.6, 0.28, -0.05);          // 横髪
    add(0.22, 0.75, 1.2, 0.6, 0.28, -0.05);
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
 * キャラを作る。
 * 関節の親子関係:
 *   group ─ hips(骨盤) ┬ waist(腰) ┬ neck(首) ─ 頭
 *                      │           ├ lShoulder(肩) ─ lElbow(肘)
 *                      │           └ rShoulder     ─ rElbow
 *                      ├ lHip(股) ─ lKnee(膝) ─ lAnkle(足首)
 *                      └ rHip     ─ rKnee     ─ rAnkle
 *
 * 返り値:
 *  - group: シーンに追加するルート（足元が y=0）
 *  - joints: 上記の関節（Three.js の Group）
 *  - animator: ポーズ再生（animator.play('walk') など）
 *  - update(dt): 毎フレーム呼ぶ
 */
export function createCharacter(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const R = RIG;
  const ov = R.jointOverlap;
  const group = new THREE.Group();
  group.name = o.name ?? 'Character';
  group.scale.setScalar(o.scale);

  // ---- 骨盤 ----
  const hips = joint(group, 0, R.hipY, 0, 'YXZ');
  hang(hips, R.pelvis[0], R.pelvis[2], R.pelvis[1] - 0.1, -0.1, o.pants);

  // ---- 胸 ----
  const waist = joint(hips, 0, R.waistUp, 0, 'YXZ');
  hang(waist, R.chest[0], R.chest[2], R.chestTop, R.chestTop - R.chest[1], o.shirt);

  // ---- 頭 ----
  const neck = joint(waist, 0, R.chestTop, 0, 'YXZ');
  const skull = hang(neck, R.head, R.head, R.head, 0, o.skin, 0, SKIN_GLOW);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(R.head * 0.92, R.head * 0.92),
    new THREE.MeshStandardMaterial({ map: faceTexture(o.face), transparent: true, roughness: 0.6 }),
  );
  face.position.set(0, R.head / 2, R.head / 2 + 0.002); // 頭の正面に貼り付け
  neck.add(face);
  const hair = buildHair(o.hairStyle, o.hair);
  hair.position.y = R.head / 2;
  hair.scale.setScalar(R.head / 1.2);
  neck.add(hair);

  // ---- 腕（肩 → 肘）----
  const makeArm = (side) => {
    const x = side * (R.chest[0] / 2 + R.armW / 2 + 0.04);
    // 回転順 XZY: 腕のねじり(Y) → 開き(Z) → 前後の振り(X)
    const shoulder = joint(waist, x, R.chestTop - R.shoulderDrop, 0, 'XZY');
    hang(shoulder, R.armW, R.armW, R.shoulderDrop, R.shoulderDrop - R.upperArm, o.shirt);
    const elbow = joint(shoulder, 0, R.shoulderDrop - R.upperArm, 0);
    const w = R.armW * 0.95; // 親より少し細くして、重なった面のちらつきを防ぐ
    if (o.sleeves === 'long') hang(elbow, w, w, ov, -R.forearm, o.shirt);
    else hang(elbow, w, w, ov, -R.forearm, o.skin, 0, SKIN_GLOW);
    hang(elbow, w, w, -R.forearm, -R.forearm - R.hand, o.skin, 0, SKIN_GLOW);
    return { shoulder, elbow };
  };
  const lArm = makeArm(1);
  const rArm = makeArm(-1);

  // ---- 脚（股 → 膝 → 足首）----
  const soles = []; // 接地判定に使う靴底の四隅
  const makeLeg = (side) => {
    const hip = joint(hips, side * R.legX, 0, 0, 'XZY');
    hang(hip, R.legW, R.legD, ov, -R.thigh, o.pants);
    const knee = joint(hip, 0, -R.thigh, 0);
    hang(knee, R.legW * 0.96, R.legD * 0.96, ov, -R.shin, o.pants);
    const ankle = joint(knee, 0, -R.shin, 0);
    hang(ankle, R.legW, R.footD, 0.08, -R.footH, o.shoes, R.footZ);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        soles.push({
          ankle,
          point: new THREE.Vector3((sx * R.legW) / 2, -R.footH, R.footZ + (sz * R.footD) / 2),
        });
      }
    }
    return { hip, knee, ankle };
  };
  const lLeg = makeLeg(1);
  const rLeg = makeLeg(-1);

  const joints = {
    hips, waist, neck,
    lShoulder: lArm.shoulder, lElbow: lArm.elbow,
    rShoulder: rArm.shoulder, rElbow: rArm.elbow,
    lHip: lLeg.hip, lKnee: lLeg.knee, lAnkle: lLeg.ankle,
    rHip: rLeg.hip, rKnee: rLeg.knee, rAnkle: rLeg.ankle,
  };

  const animator = new Animator({ group, joints, soles, scale: o.scale });

  return {
    group,
    joints,
    animator,
    scale: o.scale,
    height: (R.hipY + R.waistUp + R.chestTop + R.head) * o.scale,
    update: (dt) => animator.update(dt),
    parts: { skull, face, hair },
  };
}
