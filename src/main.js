import * as THREE from 'three';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';
import { CharacterController, ATTACKS, AIR_SLAM, FINISHER, SKILL1 } from './character/Controller.js';
import { input } from './input.js';
import { TouchControls } from './ui/TouchControls.js';
import { CameraFx } from './camera/CameraFx.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { Sparks } from './effects/Sparks.js';
import { Impact } from './effects/Impact.js';
import { GroundBreak } from './effects/GroundBreak.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5ff);
scene.fog = new THREE.Fog(0x87c5ff, 160, 420);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 1000);

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
const dummy = new CharacterController(p2, { bounds: stage.bounds });
player.target = p2;
player.victim = dummy; // コンボ技で掴む相手
dummy.idle = 'fight';
const NO_INPUT = { x: 0, z: 0, run: false, jump: false, attack: false, toggleStance: false };

// 三人称の追従カメラ。最初は P1 の真後ろから
const view = new ThirdPersonCamera(camera, renderer.domElement, { bounds: stage.bounds });
view.setBehind(p1.group.rotation.y);
const fx = new CameraFx(camera, () => view.currentDistance);
// 確認用: game.follow = false にすると追従を止め、camera.position と controls.target で自由に置ける
const controls = { target: new THREE.Vector3() };
const sparks = new Sparks(scene);
const impact = new Impact(scene);
const groundBreak = new GroundBreak(scene, stage.config.colors);
let hitStop = 0;   // ヒットストップの残り秒数（命中の瞬間、時間をほぼ止める）
let flash = 0;     // P2 を白く光らせる残り秒数

const forward = new THREE.Vector3();
const v1 = new THREE.Vector3();
const camInverse = new THREE.Quaternion();

const touch = new TouchControls();
const comboPrompt = document.getElementById('combo-prompt');

function readCommand() {
  let ix = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  let iz = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  // キーボードは常に全力、スティックは倒した量（0〜1）で速さが変わる
  const keyLen = Math.hypot(ix, iz);
  if (keyLen > 0) { ix /= keyLen; iz /= keyLen; } else { ix = touch.x; iz = touch.y; }
  // カメラの向きを基準に「前後左右」をワールドの向きへ変換
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  let x = forward.x * iz - forward.z * ix;
  let z = forward.z * iz + forward.x * ix;
  return {
    x, z,
    run: input.isDown('ShiftLeft', 'ShiftRight') || touch.run,
    jump: input.wasPressed('Space') || touch.takeJump(),
    attack: input.isDown('KeyJ', 'Mouse0') || touch.attack,
    skill: input.wasPressed('KeyK', 'KeyE') || touch.takeSkill(),
    toggleStance: input.wasPressed('KeyF'),
  };
}

const ATTACK_ALIGN_RATE = 1.2; // 攻撃中にカメラが背後へ回り込む速さ（0 で回り込まない）

// 斬る方向（キャラから見た 左, 上, 前）。カメラをこの向きへ振る
const SLASH_DIR = [
  [0.8, -0.6, 0.2],  // 袈裟斬り: 左下へ
  [-1.0, 0.05, 0.2], // 横薙ぎ: 右へ
  [0.0, -1.0, 0.35], // 兜割り: 真下へ
];

// 斬撃波の弧の傾き（0 = 水平。袈裟斬りは斜め、兜割りは縦）
const WAVE_TILT = [-0.75, 0.08, Math.PI / 2];
const slashWorld = new THREE.Vector3();

// キャラ基準の向きを、カメラから見た向き（右, 上, 手前）に直す
function toCameraSpace(character, [x, y, z]) {
  v1.set(x, y, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, character.group.rotation.y);
  return v1.applyQuaternion(camInverse.copy(camera.quaternion).invert());
}

// 攻撃の節目ごとのカメラ演出
function onAttackEvent(e) {
  const d = toCameraSpace(p1, SLASH_DIR[e.index ?? 2]);
  if (e.type.startsWith('skill')) {
    onSkillEvent(e);
  } else if (e.type === 'brake') {
    // 急停止: 足元に土煙
    v1.set(p1.group.position.x, 0.03, p1.group.position.z);
    forward.set(Math.sin(p1.group.rotation.y), 0, Math.cos(p1.group.rotation.y));
    sparks.burst(v1, forward, 7, p1.height * 0.06, p1.height * 1.5, 0.25, 0.2);
  } else if (e.type === 'finisherGrab') {
    fx.zoom(60);
  } else if (e.type === 'finisherGrip') {
    // 胸ぐらを掴んだ瞬間: 一瞬止めて、ぐっと寄る
    hitStop = 0.09;
    flash = 0.08;
    fx.shake(0.35);
    fx.zoom(-120);
    v1.set((p1.group.position.x + p2.group.position.x) / 2, p1.height * 0.7, (p1.group.position.z + p2.group.position.z) / 2);
    impact.flash(v1, p1.height * 1.4, 0.14);
  } else if (e.type === 'finisherJump') {
    // 踏み切り: 足元に衝撃波、視野が広がる
    fx.zoom(150);
    fx.kick(0, 0.9, 0.6);
    impact.ring(p1.group.position, p1.height * 1.6, 0.4);
    v1.set(p1.group.position.x, 0.03, p1.group.position.z);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 12, p1.height * 0.07, p1.height * 1.8, 0.25, 0.25);
  } else if (e.type === 'finisherThrow') {
    fx.kick(0, -1.3, 0);
    fx.roll(0.9);
    fx.zoom(60);
  } else if (e.type === 'finisherCrash') {
    // 相手が地面に激突
    hitStop = 0.07;
    flash = 0.1;
    fx.shake(0.65);
    v1.set(e.x, 0.03, e.z);
    impact.ring(v1, p2.height * 1.8, 0.4);
    impact.ring(v1, p2.height * 1.0, 0.28);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 18, p2.height * 0.08, p2.height * 2.4, 0.07, 0.45);
    sparks.burst(v1, forward, 10, p2.height * 0.07, p2.height * 2.0, 0.25, 0.25);
    impact.flash(v1.setY(p2.height * 0.3), p2.height * 2.0, 0.16);
  } else if (e.type === 'airSlamStart') {
    fx.zoom(90);           // 突っ込む勢いで視野が広がる
    fx.kick(0, 0.3, 0.8);
  } else if (e.type === 'airSlamLand') {
    airSlamImpact();
  } else if (e.type === 'attackStart' && e.index === 2) {
    fx.zoom(55);          // 跳び上がりで少し引く
    fx.kick(0, 0.5, 0);
  } else if (e.type === 'swing') {
    const strong = e.index === 2;
    fx.kick(d.x * 0.9, d.y * 0.9, 0);     // 斬る方向へカメラを振る
    fx.roll(-d.x * (strong ? 0.6 : 1.5)); // 斬撃に合わせて画面を傾ける
    fx.zoom(strong ? 30 : 55);            // 振りの勢いで視野が一瞬広がる
    // 斬撃波: 振った向きの三日月が前へ飛ぶ（見た目だけ。当たり判定は剣とオーラ）
    const h = p1.group.rotation.y;
    v1.set(p1.group.position.x + Math.sin(h) * 0.25, p1.height * (strong ? 0.75 : 0.62), p1.group.position.z + Math.cos(h) * 0.25);
    impact.wave(v1, h, WAVE_TILT[e.index], p1.height * (strong ? 1.15 : 0.95), p1.height * (strong ? 6 : 7.5));
  } else if (e.type === 'slam') {
    fx.shake(0.32);                       // 着地の衝撃
    fx.kick(0, -0.7, 0);
    // 叩きつけた地点に衝撃波の輪と土煙
    const h = p1.group.rotation.y;
    v1.set(p1.group.position.x + Math.sin(h) * p1.height * 0.9, 0.03, p1.group.position.z + Math.cos(h) * p1.height * 0.9);
    impact.ring(v1, p1.height * 1.5, 0.45);
    impact.ring(v1, p1.height * 0.9, 0.3);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 14, p1.height * 0.07, p1.height * 1.6, 0.25, 0.25);
  }
}

// スキル1の節目ごとの演出
function onSkillEvent(e) {
  const h = p1.group.rotation.y;
  const chest = v1.set(p2.group.position.x, p2.group.position.y + p2.height * 0.62, p2.group.position.z);
  forward.set(Math.sin(h), 0, Math.cos(h));
  if (e.type === 'skillStart') {
    fx.zoom(40);
  } else if (e.type === 'skillThrow') {
    fx.zoom(90);                       // 投げる勢いで視野が広がる
    fx.kick(0, -0.3, 0.9);
    fx.roll(-0.8);
  } else if (e.type === 'skillStick') {
    hitStop = 0.11;                    // 刺さった瞬間: 止めて、寄せる
    flash = 0.1;
    fx.shake(0.5);
    fx.zoom(-150);
    impact.flash(chest, p2.height * 2.0, 0.18);
    impact.streak(chest, forward, camera, p2.height * 2.4);
    sparks.burst(chest, forward, 14, p2.height * 0.06, p2.height * 3.4);
  } else if (e.type === 'skillPull') {
    fx.zoom(50);
  } else if (e.type === 'skillPunch') {
    // 1発ごと: 小さな閃光と火花、画面を左右に小突く。終盤ほど強く
    const power = 0.5 + 0.5 * Math.min(1, e.count / 12);
    flash = 0.035;
    fx.shake(0.13 + 0.1 * power);
    fx.kick(e.side * 0.35 * power, 0.1, -0.25 * power);
    chest.x += (Math.random() - 0.5) * p2.height * 0.3;
    chest.y += (Math.random() - 0.2) * p2.height * 0.3;
    impact.flash(chest, p2.height * (0.8 + 0.5 * power), 0.09);
    sparks.burst(chest, forward, 4, p2.height * 0.045, p2.height * 2.6);
  } else if (e.type === 'skillPullOut') {
    hitStop = 0.07;
    flash = 0.08;
    fx.shake(0.4);
    fx.kick(0.6, 0.2, 0.5);
    fx.roll(1.0);
    forward.negate();                  // 引き抜いた向き（手前）へ火花
    impact.streak(chest, forward, camera, p2.height * 2.0);
    sparks.burst(chest, forward, 12, p2.height * 0.055, p2.height * 3.0);
    sparks.burst(chest, forward, 8, p2.height * 0.05, p2.height * 3.6, 0.53, 0.9);
  } else if (e.type === 'skillKick') {
    hitStop = 0.17;                    // 蹴り: 一番重い手応え
    flash = 0.14;
    fx.shake(0.95);
    fx.zoom(-210);
    fx.kick(0, 0.3, -1.4);
    impact.flash(chest, p2.height * 3.0, 0.22);
    impact.streak(chest, forward, camera, p2.height * 3.0);
    impact.ring(p2.group.position, p2.height * 2.0, 0.45);
    impact.wave(chest, h, Math.PI / 2, p2.height * 1.3, p2.height * 9);
    sparks.burst(chest, forward, 24, p2.height * 0.07, p2.height * 4.2);
    sparks.burst(chest, forward, 12, p2.height * 0.06, p2.height * 3.0, 0.53, 0.9);
  }
}

// 引き寄せ中の光の綱（かざした手 → 刺さった剣）
const tetherMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
);
tetherMesh.visible = false;
tetherMesh.frustumCulled = false;
scene.add(tetherMesh);
function updateTether(time) {
  const t = player.tether;
  tetherMesh.visible = !!t && t.power > 0.01;
  if (!tetherMesh.visible) return;
  const len = t.from.distanceTo(t.to);
  const w = p1.height * 0.022 * (1 + 0.35 * Math.sin(time * 60)); // 細かく脈打つ
  tetherMesh.position.lerpVectors(t.from, t.to, 0.5);
  tetherMesh.lookAt(t.to);
  tetherMesh.scale.set(w, w, len);
  tetherMesh.material.opacity = 0.85 * t.power;
}

// 空中攻撃の着地: 剣が叩いた地点を中心に、まわりの相手をまとめて吹き飛ばす範囲攻撃
function airSlamImpact() {
  const h = p1.group.rotation.y;
  const S = p1.scale;
  const cx = p1.group.position.x + Math.sin(h) * AIR_SLAM.reach * S;
  const cz = p1.group.position.z + Math.cos(h) * AIR_SLAM.reach * S;
  const radius = AIR_SLAM.radius * S;

  // 地面: へこみとひび、まわりの地面がめくれ上がる隆起
  groundBreak.trigger(cx, cz, radius * 0.55);
  // 範囲いっぱいに広がる衝撃波の輪を重ね、土煙と光の粒を巻き上げる
  v1.set(cx, 0.03, cz);
  impact.ring(v1, radius, 0.5);
  impact.ring(v1, radius * 0.65, 0.38);
  impact.ring(v1, radius * 0.35, 0.26);
  impact.flash(v1.setY(p1.height * 0.25), p1.height * 2.4, 0.18);
  forward.set(0, 0, 0);
  sparks.burst(v1, forward, 20, p1.height * 0.075, p1.height * 2.2, 0.25, 0.25);
  sparks.burst(v1, forward, 14, p1.height * 0.09, p1.height * 2.8, 0.07, 0.45); // 土くれ
  sparks.burst(v1, forward, 12, p1.height * 0.05, p1.height * 3.4, 0.53, 0.9);
  fx.shake(0.6);
  fx.kick(0, -1.1, 0);
  fx.zoom(-90);

  // 範囲内の相手に命中（中心から外へ吹き飛ばす）
  const wasFinisher = player.finisherSlam;
  player.finisherSlam = false;
  const dx = p2.group.position.x - cx;
  const dz = p2.group.position.z - cz;
  if (Math.hypot(dx, dz) > radius) return;
  const ox = p2.group.position.x - p1.group.position.x;
  const oz = p2.group.position.z - p1.group.position.z;
  const finisher = wasFinisher; // 掴み技の締めは、さらに強く吹き飛ばす
  dummy.hit(ox, oz, finisher ? 3 : 2);
  hitStop = finisher ? 0.2 : 0.14;
  if (finisher) { fx.shake(0.5); fx.zoom(-80); impact.ring(p2.group.position, radius * 1.2, 0.6); }
  flash = 0.14;
  fx.shake(0.4);
  fx.zoom(-120);
  v1.set(p2.group.position.x, p2.height * 0.55, p2.group.position.z);
  forward.set(ox, 0, oz).normalize();
  sparks.burst(v1, forward, 16, p2.height * 0.065, p2.height * 3.2);
  impact.flash(v1, p2.height * 2.4, 0.2);
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
  // 3段目を当てたら、少しの間だけコンボ技（掴み上げ）を出せる
  if (player.attackIndex === 2) player.finisherWindow = FINISHER.window;
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
  sparks.burst(v1, forward, strong ? 22 : 12, p2.height * (strong ? 0.07 : 0.055), p2.height * 3.2);
  sparks.burst(v1, forward, strong ? 10 : 6, p2.height * 0.05, p2.height * 4.2, 0.53, 0.9); // 水色の光の粒
  // 命中点の閃光と、斬った向きに走る光の線
  impact.flash(v1, p2.height * (strong ? 2.6 : 1.7), strong ? 0.2 : 0.15);
  const [sdx, sdy, sdz] = SLASH_DIR[player.attackIndex];
  slashWorld.set(sdx, sdy, sdz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, p1.group.rotation.y).normalize();
  impact.streak(v1, slashWorld, camera, p2.height * (strong ? 2.2 : 1.6));
  if (strong) impact.ring(p2.group.position, p2.height * 1.3, 0.35);
}

// デバッグ用
window.game = { view, touch, stage, characters, player, dummy, camera, controls, scene, fx, createCharacter, follow: true, manual: false };

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
  // コンボ技を出せる間、ジャンプボタン（と PC の案内）を切り替える
  const canFinish = player.finisherWindow > 0 && player.canGrab();
  touch.setSpecial(canFinish);
  touch.setSkillCooldown(player.skillCooldown / SKILL1.cooldown, player.skillCooldown, player.state === 'skill');
  comboPrompt.classList.toggle('show', canFinish);

  for (const e of player.events) onAttackEvent(e);
  player.events.length = 0;
  dummy.events.length = 0;

  // キャラ同士はすり抜けない（P1 を P2 の外へ押し出す）
  const minDist = 0.36 * (p1.height + p2.height) / 2;
  const sx = p1.group.position.x - p2.group.position.x;
  const sz = p1.group.position.z - p2.group.position.z;
  const sep = Math.hypot(sx, sz);
  const grappling = player.state === 'finisher' || player.state === 'skill' || dummy.state === 'held' || dummy.state === 'thrown' || dummy.state === 'down';
  if (!grappling && sep < minDist && sep > 1e-6 && p1.group.position.y < p2.height) {
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
  impact.update(realDt); // 閃光や衝撃波はヒットストップ中も動かす
  groundBreak.update(realDt);
  updateTether(clock.elapsedTime);
  flash = Math.max(0, flash - realDt);
  p2.setFlash(flash > 0 ? 1 : 0);

  // 追従カメラ。視点を触っていないときだけ、進行方向（攻撃中は狙った方向）の背後へゆっくり回り込む
  if (window.game.follow) {
    // 視点と移動は分離: 歩いても走ってもカメラの向きは変わらない。
    // 攻撃中だけ、狙っている相手が画面に収まるよう背後へゆっくり回り込む（視点を触った直後は回らない）
    const align = player.state === 'attack' ? { heading: player.aimYaw, rate: ATTACK_ALIGN_RATE }
      : player.state === 'skill' ? { heading: p1.group.rotation.y, rate: ATTACK_ALIGN_RATE } : null;
    // コンボ技の間はカメラを引き、高く跳んでも2人が画面に収まるようにする
    const cinematic = player.state === 'finisher' || player.finisherSlam;
    // スキル1: 投げて引き寄せるまでは少し引き、連打からは近くで見せる
    const skillPhase = player.sk ? player.sk.phase : null;
    const skillZoom = !skillPhase ? 1 : (skillPhase === 'flurry' || skillPhase === 'pullOut' || skillPhase === 'kick') ? 1.1 : 1.5;
    view.zoomTarget = cinematic ? 2.3 : skillZoom;
    view.heightFollow = cinematic ? 0.5 : 0.4;
    // スキル1で相手を捉えている間は、2人の中間を映す（投げた先の相手が画面から出ないように）
    let focus = p1.group.position;
    if (player.sk && player.sk.hasTarget) focus = v1.lerpVectors(p1.group.position, p2.group.position, 0.5).setY(p1.group.position.y);
    view.update(realDt, focus, align);
  } else {
    camera.lookAt(controls.target);
  }

  fx.update(realDt);
  fx.apply();
  if (!window.game.skipRender) renderer.render(scene, camera); // skipRender: 確認用の早送り
  fx.restore();
}
window.game.step = step; // manual=true のとき、外からコマ送りできる（動作確認用）

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!window.game.manual) step(dt);
});
