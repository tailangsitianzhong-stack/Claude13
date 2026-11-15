import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';
import { CharacterController, ATTACKS } from './character/Controller.js';
import { input } from './input.js';
import { CameraFx } from './camera/CameraFx.js';
import { Sparks } from './effects/Sparks.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5ff);
scene.fog = new THREE.Fog(0x87c5ff, 160, 420);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(-0.3, 0.9, 2.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.3, 0.4, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 0.8;
controls.maxDistance = 260;
controls.enablePan = false;
// 左クリックは攻撃に使うので、カメラ回転は右ドラッグ
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

// ライト（ロブロックスっぽい明るくフラットな光）
scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a7a3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(40, 70, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.01;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 });
scene.add(sun);

const stage = createStage();
scene.add(stage.group);

// プレイヤー2人を向かい合わせに配置
const p1 = createCharacter({ name: 'P1', shirt: 0x1e88e5, pants: 0x2e3a4b, hair: 0x4a2c17, hairStyle: 'short', face: 'smile', sleeves: 'short' });
p1.group.position.set(-0.6, 0, 0);
p1.group.rotation.y = Math.PI / 2;
const p2 = createCharacter({ name: 'P2', shirt: 0xe53935, pants: 0x3b3b3b, hair: 0x1b1b1b, hairStyle: 'spiky', face: 'angry', sleeves: 'long' });
p2.group.position.set(0.6, 0, 0);
p2.group.rotation.y = -Math.PI / 2;
p2.animator.play('fight', 0); // P2 は構えポーズで待機
scene.add(p1.group, p2.group);
const characters = [p1, p2];
for (const c of characters) if (c.trail) scene.add(c.trail.mesh);

// P1 をキーボードで操作。P2 は今のところ立っているだけ（攻撃を受けるとのけぞる）
const player = new CharacterController(p1, { bounds: stage.bounds });
player.target = p2;
const dummy = new CharacterController(p2, { bounds: stage.bounds });
dummy.idle = 'fight';
const NO_INPUT = { x: 0, z: 0, run: false, jump: false, attack: false, toggleStance: false };

const fx = new CameraFx(camera, controls);
const sparks = new Sparks(scene);
let hitStop = 0;   // ヒットストップの残り秒数（命中の瞬間、時間をほぼ止める）
let flash = 0;     // P2 を白く光らせる残り秒数

const forward = new THREE.Vector3();
const v1 = new THREE.Vector3();
const camInverse = new THREE.Quaternion();
const follow = p1.group.position.clone(); // カメラが追う点（P1 を少し遅れて追う）

function readCommand() {
  const ix = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  const iz = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  // カメラの向きを基準に「前後左右」をワールドの向きへ変換
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  let x = forward.x * iz - forward.z * ix;
  let z = forward.z * iz + forward.x * ix;
  const len = Math.hypot(x, z);
  if (len > 0) { x /= len; z /= len; }
  return {
    x, z,
    run: input.isDown('ShiftLeft', 'ShiftRight'),
    jump: input.wasPressed('Space'),
    attack: input.isDown('KeyJ', 'Mouse0'),
    toggleStance: input.wasPressed('KeyF'),
  };
}

// 斬る方向（キャラから見た 左, 上, 前）。カメラをこの向きへ振る
const SLASH_DIR = [
  [0.8, -0.6, 0.2],  // 袈裟斬り: 左下へ
  [-1.0, 0.05, 0.2], // 横薙ぎ: 右へ
  [0.0, -1.0, 0.35], // 兜割り: 真下へ
];

// キャラ基準の向きを、カメラから見た向き（右, 上, 手前）に直す
function toCameraSpace(character, [x, y, z]) {
  v1.set(x, y, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, character.group.rotation.y);
  return v1.applyQuaternion(camInverse.copy(camera.quaternion).invert());
}

// 攻撃の節目ごとのカメラ演出
function onAttackEvent(e) {
  const d = toCameraSpace(p1, SLASH_DIR[e.index]);
  if (e.type === 'attackStart' && e.index === 2) {
    fx.zoom(55);          // 跳び上がりで少し引く
    fx.kick(0, 0.5, 0);
  } else if (e.type === 'swing') {
    const strong = e.index === 2;
    fx.kick(d.x * 0.9, d.y * 0.9, 0);     // 斬る方向へカメラを振る
    fx.roll(-d.x * (strong ? 0.6 : 1.5)); // 斬撃に合わせて画面を傾ける
    fx.zoom(strong ? 30 : 55);            // 振りの勢いで視野が一瞬広がる
  } else if (e.type === 'slam') {
    fx.shake(0.32);                       // 着地の衝撃
    fx.kick(0, -0.7, 0);
  }
}

// 剣が当たったか: 刃（根元〜先端）が相手の体の幅まで近づいた瞬間に命中とする。
// 1フレームで刃が通り過ぎても拾えるよう、前フレームの剣先からの軌跡も調べる
const HIT_RADIUS = 1.5; // 相手の体の半径（リグ単位）
const bladeBase = new THREE.Vector3();
const bladeTip = new THREE.Vector3();
const prevTip = new THREE.Vector3();
let hadPrevTip = false;

// 点 (px, pz) から線分 a→b までの水平距離
function distToSegmentXZ(px, pz, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - a.x) * abx + (pz - a.z) * abz) / len2)) : 0;
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

function checkHit() {
  if (!player.attackActive || player.hitDone) { hadPrevTip = false; return; }
  p1.group.updateWorldMatrix(true, true);
  bladeBase.copy(p1.sword.userData.base).applyMatrix4(p1.sword.matrixWorld);
  bladeTip.copy(p1.sword.userData.tip).applyMatrix4(p1.sword.matrixWorld);
  const tx = p2.group.position.x;
  const tz = p2.group.position.z;
  const r = HIT_RADIUS * p2.scale;
  const low = Math.min(bladeBase.y, bladeTip.y) < p2.group.position.y + p2.height * 1.05;
  const touching = low && (distToSegmentXZ(tx, tz, bladeBase, bladeTip) < r
    || (hadPrevTip && distToSegmentXZ(tx, tz, prevTip, bladeTip) < r));
  prevTip.copy(bladeTip);
  hadPrevTip = true;
  if (!touching) return;

  const dx = tx - p1.group.position.x;
  const dz = tz - p1.group.position.z;
  const dist = Math.hypot(dx, dz) || 1;

  player.hitDone = true;
  const power = ATTACKS[player.attackIndex].power;
  const strong = power > 1;
  dummy.hit(dx, dz, power);

  // 手応え: 時間を一瞬止め、画面を揺らし、ぐっと寄る
  hitStop = strong ? 0.13 : 0.07;
  flash = strong ? 0.14 : 0.09;
  fx.shake(strong ? 0.8 : 0.42);
  fx.zoom(strong ? -190 : -110);
  const d = toCameraSpace(p1, SLASH_DIR[player.attackIndex]);
  fx.kick(d.x * (strong ? 1.6 : 1.0), d.y * (strong ? 1.6 : 1.0), strong ? -1.2 : -0.6);

  v1.set(p2.group.position.x - (dx / dist) * 0.05, p2.height * 0.6, p2.group.position.z - (dz / dist) * 0.05);
  forward.set(dx / dist, 0, dz / dist);
  sparks.burst(v1, forward, strong ? 18 : 10, p2.height * (strong ? 0.07 : 0.055), p2.height * 3.2);
}

// デバッグ用
window.game = { stage, characters, player, dummy, camera, controls, scene, fx, createCharacter, follow: true, manual: false };

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 1フレーム分ゲームを進めて描画する
function step(realDt) {
  // ヒットストップ中はゲーム内の時間だけほぼ止める（カメラ演出は実時間で動く）
  let dt = realDt;
  if (hitStop > 0) {
    hitStop -= realDt;
    dt *= 0.03;
  }
  stage.update(clock.elapsedTime);

  player.update(dt, readCommand());
  dummy.update(dt, NO_INPUT);
  input.endFrame();

  for (const e of player.events) onAttackEvent(e);
  player.events.length = 0;
  dummy.events.length = 0;

  // キャラ同士はすり抜けない（P1 を P2 の外へ押し出す）
  const minDist = 0.36 * (p1.height + p2.height) / 2;
  const sx = p1.group.position.x - p2.group.position.x;
  const sz = p1.group.position.z - p2.group.position.z;
  const sep = Math.hypot(sx, sz);
  if (sep < minDist && sep > 1e-6 && p1.group.position.y < p2.height) {
    p1.group.position.x = p2.group.position.x + (sx / sep) * minDist;
    p1.group.position.z = p2.group.position.z + (sz / sep) * minDist;
    // 相手に向かう分の速度は消す（押し付けたまま走り続けない）
    const into = (player.vx * sx + player.vz * sz) / sep;
    if (into < 0) {
      player.vx -= (into * sx) / sep;
      player.vz -= (into * sz) / sep;
    }
  }

  // P2 は（のけぞっていなければ）P1 の方を向き続ける
  if (dummy.state === 'ground') {
    const want = Math.atan2(p1.group.position.x - p2.group.position.x, p1.group.position.z - p2.group.position.z);
    let diff = want - p2.group.rotation.y;
    diff -= Math.PI * 2 * Math.round(diff / (Math.PI * 2));
    p2.group.rotation.y += diff * (1 - Math.exp(-6 * dt));
  }

  p1.update(dt, checkHit); // 姿勢を進めるたびに、その時点の刃の位置で当たり判定
  p2.update(dt);
  sparks.update(dt);
  flash = Math.max(0, flash - realDt);
  p2.setFlash(flash > 0 ? 1 : 0);

  // カメラは P1 を少し遅れて追いかける（踏み込みや走りの勢いが画面に出る）。ジャンプには控えめに付いていく
  if (window.game.follow) {
    const pos = p1.group.position;
    const k = 1 - Math.exp(-11 * realDt);
    const dx = (pos.x - follow.x) * k;
    const dy = (pos.y * 0.4 - follow.y) * k;
    const dz = (pos.z - follow.z) * k;
    follow.x += dx; follow.y += dy; follow.z += dz;
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
    controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
  }

  controls.update();
  fx.update(realDt);
  fx.apply();
  renderer.render(scene, camera);
  fx.restore();
}
window.game.step = step; // manual=true のとき、外からコマ送りできる（動作確認用）

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!window.game.manual) step(dt);
});
