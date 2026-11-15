import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';
import { CharacterController } from './character/Controller.js';
import { input } from './input.js';

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

// P1 をキーボードで操作
const player = new CharacterController(p1, { bounds: stage.bounds });
const forward = new THREE.Vector3();
const lastPlayerPos = p1.group.position.clone();

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
    toggleStance: input.wasPressed('KeyF'),
  };
}

// デバッグ用
window.game = { stage, characters, player, camera, controls, scene, createCharacter, follow: true, manual: false };

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 1フレーム分ゲームを進めて描画する
function step(dt) {
  stage.update(clock.elapsedTime);

  player.update(dt, readCommand());
  input.endFrame();

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

  // P2 は P1 の方を向き続ける
  const want = Math.atan2(p1.group.position.x - p2.group.position.x, p1.group.position.z - p2.group.position.z);
  let diff = want - p2.group.rotation.y;
  diff -= Math.PI * 2 * Math.round(diff / (Math.PI * 2));
  p2.group.rotation.y += diff * (1 - Math.exp(-6 * dt));

  for (const c of characters) c.update(dt);

  // カメラは P1 を追いかける（回転・ズームは自由）
  if (window.game.follow) {
    const pos = p1.group.position;
    const dx = pos.x - lastPlayerPos.x;
    const dz = pos.z - lastPlayerPos.z;
    camera.position.x += dx;
    camera.position.z += dz;
    controls.target.x += dx;
    controls.target.z += dz;
  }
  lastPlayerPos.copy(p1.group.position);

  controls.update();
  renderer.render(scene, camera);
}
window.game.step = step; // manual=true のとき、外からコマ送りできる（動作確認用）

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!window.game.manual) step(dt);
});
