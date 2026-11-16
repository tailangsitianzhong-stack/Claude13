import * as THREE from 'three';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';
import { BatController, BSKILL1, BSKILL2 } from './character/BatController.js';
import { BatDirector } from './game/BatDirector.js';
import { BatUltimateDirector } from './cinematic/BatUltimate.js';
import { FangController, FSKILL1 as FSK1, FSKILL2 as FSK2, FANG_ATTACKS } from './character/FangController.js';
import { FangDirector } from './game/FangDirector.js';
import { FangUltimateDirector } from './cinematic/FangUltimate.js';
import { BatSwarm } from './character/FangBats.js';
import { CharacterController, ATTACKS, AIR_SLAM, FINISHER, SKILL1, SKILL2, SKILL3, SKILL4, ultPath } from './character/Controller.js';
import { FIGHT, DAMAGE } from './character/Health.js';
import { FightHud } from './ui/FightHud.js';
import { WeaponSelect } from './ui/WeaponSelect.js';
import { getWeapon } from './game/weapons.js';
import { CineOverlay } from './cinematic/CineOverlay.js';
import { UltimateDirector } from './cinematic/UltimateDirector.js';
import { input } from './input.js';
import { TouchControls } from './ui/TouchControls.js';
import { StatusHud } from './ui/StatusHud.js';
import { CameraFx } from './camera/CameraFx.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { Sparks } from './effects/Sparks.js';
import { Impact } from './effects/Impact.js';
import { GroundBreak } from './effects/GroundBreak.js';
import { GroundCracks } from './effects/GroundCracks.js';

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
const hemi = new THREE.HemisphereLight(0xdff1ff, 0x5a7a3a, 1.4);
scene.add(hemi);
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
for (const c of characters) { for (const t of [c.trail, c.trailGreat, c.trailBat, c.trailFang]) if (t) scene.add(t.mesh); }

// P1 をキーボードで操作。P2 は今のところ立っているだけ（攻撃を受けるとのけぞる）
let player = new CharacterController(p1, { bounds: stage.bounds });
const swordPlayer = player;
const batPlayer = new BatController(p1, { bounds: stage.bounds }); // バットを選んだときに使う
const dummy = new CharacterController(p2, { bounds: stage.bounds });
const fangPlayer = new FangController(p1, { bounds: stage.bounds }); // 吸血牙を選んだときに使う
for (const pl of [swordPlayer, batPlayer, fangPlayer]) { pl.target = p2; pl.victim = dummy; } // 狙う相手・コンボ技で掴む相手
dummy.idle = 'fight';
const statusHud = new StatusHud('P2'); // 相手の状態異常の表示枠
const NO_INPUT = { x: 0, z: 0, run: false, jump: false, attack: false, toggleStance: false };

// 三人称の追従カメラ。最初は P1 の真後ろから
const view = new ThirdPersonCamera(camera, renderer.domElement, { bounds: stage.cameraBounds });
view.setBehind(p1.group.rotation.y);
const fx = new CameraFx(camera, () => (ultDirector.active ? ultDirector.camDistance : view.currentDistance));
// 確認用: game.follow = false にすると追従を止め、camera.position と controls.target で自由に置ける
const controls = { target: new THREE.Vector3() };
const sparks = new Sparks(scene);
const impact = new Impact(scene);
const groundBreak = new GroundBreak(scene, stage.config.colors);
const groundCracks = new GroundCracks(scene);
const fightHud = new FightHud();      // HP・必殺技ゲージ・ダメージ数字
const cineOverlay = new CineOverlay(); // ムービーの黒帯・閃光・タイトル
let hitStop = 0;   // ヒットストップの残り秒数（命中の瞬間、時間をほぼ止める）
let flash = 0;     // P2 を白く光らせる残り秒数

const forward = new THREE.Vector3();
const v1 = new THREE.Vector3();
const camInverse = new THREE.Quaternion();

const touch = new TouchControls();
const comboPrompt = document.getElementById('combo-prompt');
const ultPrompt = document.getElementById('ult-prompt');

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
    skill: input.wasPressed('KeyK', 'KeyE') || touch.takeSkill(0),
    skillHold: input.isDown('KeyK', 'KeyE') || touch.skillHeld(0), // スキル3のため（押している間）
    skill2: input.wasPressed('KeyL', 'KeyQ') || touch.takeSkill(1),
    ult: input.wasPressed('KeyT', 'KeyG') || touch.takeUlt(),
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
// ---- ダメージ・ゲージ・KO ----
// 技を当てたときは必ずここを通す。HP を減らし、ゲージを溜め、数字を出す
function dealDamage(amount, at, kind) {
  if (amount <= 0) return 0;
  const dealt = dummy.health.damage(amount);
  if (dealt <= 0) return 0;
  if (player.state !== 'ult') player.gauge.add(dealt * FIGHT.gaugePerDamage); // 必殺技の最中は溜まらない
  const where = at ?? v1.set(p2.group.position.x, p2.group.position.y + p2.height * 0.7, p2.group.position.z);
  fightHud.popDamage(where, dealt, kind ?? (dealt >= 90 ? 'huge' : dealt >= 45 ? 'big' : ''));
  if (dummy.health.ko) onKO();
  return dealt;
}

// スキルを使うたびに、ゲージが少し溜まる
const GAUGE_ON_USE = new Set(['fangSkill1Start', 'fangSkill2Start', 'fangSkill3Start', 'fangSkill4Start', 'batSkill1Start', 'batSkill2Start', 'batSkill3Start', 'batSkill4Start', 'skillStart', 'skill2Start', 'skill3Start', 'skill4Start', 'finisherGrab', 'airSlamStart']);
// 当たった瞬間のダメージ（イベントで知らせてくる技）
const EVENT_DAMAGE = {
  skillStick: DAMAGE.skill1Stick, skillPunch: DAMAGE.skill1Punch, skillPullOut: DAMAGE.skill1PullOut, skillKick: DAMAGE.skill1Kick,
  skill4Hit: DAMAGE.skill4, finisherGrip: DAMAGE.finisherGrip, finisherCrash: DAMAGE.finisherCrash,
};

let ko = null;        // KO 中の進行（{ t }）
let koPending = false; // 必殺技の最中に HP が 0 になった（ムービーが終わってから KO にする）
function onKO() {
  if (ko) return;
  if (player.state === 'ult') { koPending = true; return; }
  startKO();
}
function startKO() {
  koPending = false;
  ko = { t: 0 };
  dummy.health.invulnerable = true;
  fightHud.showBanner('K.O.!', 'YOU WIN');
  hitStop = 0.45;
  fx.shake(1);
  fx.zoom(-220);
  const dx = p2.group.position.x - p1.group.position.x;
  const dz = p2.group.position.z - p1.group.position.z;
  if (dummy.state === 'ground' || dummy.state === 'hit' || dummy.state === 'down') dummy.launch(dx, dz, 60, 16);
  dummy.status.apply('stun', FIGHT.koRefillDelay + 1);
}

function onAttackEvent(e) {
  if (player.state !== 'ult' && GAUGE_ON_USE.has(e.type)) player.gauge.add(FIGHT.gaugePerSkill);
  if (EVENT_DAMAGE[e.type]) dealDamage(EVENT_DAMAGE[e.type]);
  const d = toCameraSpace(p1, SLASH_DIR[e.index ?? 2]);
  if (e.type.startsWith('fang')) {
    fangDirector.onEvent(e);
  } else if (e.type.startsWith('bat')) {
    batDirector.onEvent(e);
  } else if (e.type.startsWith('ult')) {
    ultDirector.onEvent(e);
  } else if (e.type.startsWith('skill4')) {
    onSkill4Event(e);
  } else if (e.type.startsWith('skill3')) {
    onSkill3Event(e);
  } else if (e.type.startsWith('skill2')) {
    onSkill2Event(e);
  } else if (e.type.startsWith('skill')) {
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
    if (player.weaponId === 'fang') fangDirector.onSwing(e);
    else if (player.weaponId !== 'bat') impact.wave(v1, h, WAVE_TILT[e.index], p1.height * (strong ? 1.15 : 0.95), p1.height * (strong ? 6 : 7.5)); // バットには斬撃波はない
  } else if (e.type === 'slam' && player.weaponId !== 'fang') {
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

let chargeSpark = 0; // ため中の光の粒を出す間隔（スキル2・3で共用）

// ---- スキル4: 突進 ----
function onSkill4Event(e) {
  const h = p1.group.rotation.y;
  if (e.type === 'skill4Start') {
    fx.zoom(-40);
    fx.kick(0, -0.25, 0.2);
  } else if (e.type === 'skill4Dash') {
    // 飛びかかり: 視野を一気に広げ、通り道に光の線と火花を走らせる
    const dx = e.toX - e.fromX;
    const dz = e.toZ - e.fromZ;
    const len = Math.hypot(dx, dz);
    fx.zoom(210);
    fx.kick(0, 0.15, 1.6);
    fx.shake(0.3);
    v1.set(e.fromX, 0.03, e.fromZ);
    impact.ring(v1, p1.height * 1.6, 0.3);
    forward.set(Math.sin(h), 0, Math.cos(h));
    sparks.burst(v1, forward.clone().negate(), 10, p1.height * 0.06, p1.height * 3.0, 0.25, 0.25); // 蹴り出しの土煙
    if (len > 1e-3) {
      const N = 5;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N;
        v1.set(e.fromX + dx * t, p1.height * 0.55, e.fromZ + dz * t);
        impact.streak(v1, forward, camera, (len / N) * 0.75, 0.2);
        sparks.burst(v1, forward.clone().negate(), 2, p1.height * 0.045, p1.height * 2.2, 0.53, 0.9);
      }
    }
  } else if (e.type === 'skill4Hit') {
    // 命中: 時間を止め、大きく寄り、画面を揺らす。相手は遠くへ吹き飛ぶ
    hitStop = 0.24;
    flash = 0.18;
    fx.shake(1);
    fx.zoom(-230);
    fx.kick(0, 0.3, -1.6);
    v1.set(p2.group.position.x, p2.height * 0.6, p2.group.position.z);
    forward.set(e.dirX, 0, e.dirZ);
    impact.flash(v1, p2.height * 3.6, 0.26);
    impact.streak(v1, forward, camera, p2.height * 3.4, 0.2);
    impact.ring(p2.group.position, p2.height * 2.4, 0.5);
    impact.ring(p2.group.position, p2.height * 1.4, 0.32);
    impact.wave(v1, Math.atan2(e.dirX, e.dirZ), Math.PI / 2, p2.height * 1.6, p2.height * 12, 0.4);
    sparks.burst(v1, forward, 26, p2.height * 0.075, p2.height * 5.0);
    sparks.burst(v1, forward, 14, p2.height * 0.06, p2.height * 3.4, 0.53, 0.9);
  }
}

// 吹き飛ばされた相手の着地・壁への激突
function onDummyEvent(e) {
  if (e.type === 'launchLand') {
    v1.set(e.x, 0.03, e.z);
    impact.ring(v1, p2.height * 1.8, 0.4);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 12, p2.height * 0.07, p2.height * 2.4, 0.25, 0.25);
    fx.shake(0.4);
  } else if (e.type === 'wallSlam') {
    dealDamage(DAMAGE.wallSlam);
    v1.set(e.x, p2.height * 0.5, e.z);
    impact.flash(v1, p2.height * 2.6, 0.2);
    impact.ring(p2.group.position, p2.height * 2.0, 0.4);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 18, p2.height * 0.07, p2.height * 3.0, 0.07, 0.3);
    hitStop = 0.1;
    fx.shake(0.9);
  }
}

// ---- スキル3: 飛ぶ斬撃 ----
const slashes = []; // 飛んでいる斬撃 { x, z, dx, dz, left（残り距離）, radius, power, strong }

function onSkill3Event(e) {
  if (e.type === 'skill3Start') {
    fx.zoom(-30);
  } else if (e.type === 'skill3Full') {
    // 最大までたまった: 一瞬光る
    v1.set(p1.group.position.x, p1.height * 0.6, p1.group.position.z);
    impact.flash(v1, p1.height * 3.2, 0.2);
    impact.ring(p1.group.position, p1.height * 2.2, 0.35);
    fx.shake(0.5);
    fx.zoom(-90);
  } else if (e.type === 'skill3Shot') {
    const h = p1.group.rotation.y;
    const S = p1.scale;
    const triple = e.count === 3;
    const big = triple ? (e.last ? 1.5 : 1.15) : 0.7 + 0.6 * e.charge; // 1発だけのときは、ためた分だけ大きい
    const power = triple ? (e.last ? 3 : 2) : e.charge > 0.4 ? 2 : 1;
    const ox = p1.group.position.x + Math.sin(h) * 3.5 * S;
    const oz = p1.group.position.z + Math.cos(h) * 3.5 * S;
    slashes.push({ x: ox, z: oz, dx: Math.sin(h), dz: Math.cos(h), left: SKILL3.range * S, radius: SKILL3.radius * S * big, power, strong: power >= 3 });
    // 見た目: 三日月を重ねて厚みを出す
    v1.set(ox, p1.height * (e.index === 2 ? 0.75 : 0.6), oz);
    const dur = SKILL3.range / SKILL3.speed;
    const sz = big * SKILL3.size; // 見た目の大きさも当たり判定と同じく3倍
    impact.wave(v1, h, WAVE_TILT[e.index], p1.height * 1.35 * sz, SKILL3.speed * S, dur);
    impact.wave(v1, h, WAVE_TILT[e.index] + 0.12, p1.height * 1.05 * sz, SKILL3.speed * S, dur);
    impact.wave(v1, h, WAVE_TILT[e.index] + Math.PI / 2, p1.height * 0.75 * sz, SKILL3.speed * S, dur); // 直交させて、真後ろからも見えるように
    const d = toCameraSpace(p1, SLASH_DIR[e.index]);
    fx.kick(d.x * 1.1, d.y * 1.1, 0.9);
    fx.roll(-d.x * 1.4);
    fx.zoom(triple && e.last ? 150 : 90);
    fx.shake(triple && e.last ? 0.5 : 0.25);
    forward.set(Math.sin(h), 0, Math.cos(h));
    sparks.burst(v1, forward, 8, p1.height * 0.05, p1.height * 4.5, 0.53, 0.9);
  }
}

function updateSkill3(dt, realDt) {
  // ため中: 光の粒が立ちのぼり、ためるほど画面が細かく震える
  const k = player.s3;
  if (k && k.phase === 'charge') {
    fx.trauma = Math.max(fx.trauma, 0.05 + 0.2 * k.charge);
    chargeSpark -= realDt;
    if (chargeSpark <= 0) {
      chargeSpark = 0.09 - 0.06 * k.charge;
      const a = Math.random() * Math.PI * 2;
      const r = p1.height * (0.3 + Math.random() * 0.5);
      v1.set(p1.group.position.x + Math.cos(a) * r, 0.03, p1.group.position.z + Math.sin(a) * r);
      forward.set(0, 0, 0);
      sparks.burst(v1, forward, 1 + Math.round(2 * k.charge), p1.height * 0.04, p1.height * (1.2 + 1.2 * k.charge), 0.53, 0.9);
    }
  }
  // 飛んでいる斬撃を進め、相手に届いたら命中
  for (let i = slashes.length - 1; i >= 0; i--) {
    const sl = slashes[i];
    const move = SKILL3.speed * p1.scale * dt;
    sl.x += sl.dx * move;
    sl.z += sl.dz * move;
    sl.left -= move;
    const dx = p2.group.position.x - sl.x;
    const dz = p2.group.position.z - sl.z;
    const hittable = dummy.state === 'ground' || dummy.state === 'hit' || dummy.state === 'down';
    if (hittable && Math.hypot(dx, dz) < sl.radius + 0.36 * p2.height * 0.5) {
      dummy.hit(sl.dx, sl.dz, sl.power);
      dealDamage(DAMAGE.skill3[sl.power] ?? 35);
      hitStop = sl.strong ? 0.16 : 0.07;
      flash = sl.strong ? 0.14 : 0.08;
      fx.shake(sl.strong ? 0.9 : 0.45);
      fx.zoom(sl.strong ? -190 : -100);
      v1.set(p2.group.position.x, p2.height * 0.6, p2.group.position.z);
      forward.set(sl.dx, 0, sl.dz);
      sparks.burst(v1, forward, sl.strong ? 22 : 12, p2.height * 0.06, p2.height * 3.6);
      sparks.burst(v1, forward, 8, p2.height * 0.05, p2.height * 4.2, 0.53, 0.9);
      impact.flash(v1, p2.height * (sl.strong ? 3.0 : 1.9), sl.strong ? 0.22 : 0.15);
      impact.streak(v1, forward, camera, p2.height * (sl.strong ? 3.0 : 2.0));
      if (sl.strong) impact.ring(p2.group.position, p2.height * 2.0, 0.4);
      slashes.splice(i, 1);
    } else if (sl.left <= 0 || Math.abs(sl.x) > stage.bounds.maxX + 1 || Math.abs(sl.z) > stage.bounds.maxZ + 1) {
      slashes.splice(i, 1); // 距離を飛びきった、または闘技場の外へ出た
    }
  }
}

// スキル2の節目ごとの演出
function onSkill2Event(e) {
  const k = player.s2;
  const radius = SKILL2.radius * p1.scale;
  if (e.type === 'skill2Start') {
    fx.zoom(50);
    fx.kick(0, 0.5, 0);
  } else if (e.type === 'skill2Stab') {
    // 突き刺した瞬間: ひびが走り始める
    groundCracks.start(k.x, k.z, radius);
    v1.set(k.x, 0.03, k.z);
    fx.shake(0.45);
    fx.kick(0, -0.9, 0);
    fx.zoom(-70);
    impact.ring(v1, p1.height * 1.4, 0.3);
    impact.flash(v1.setY(p1.height * 0.15), p1.height * 1.5, 0.14);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 8, p1.height * 0.045, p1.height * 1.1, 0.07, 0.45);
  } else if (e.type === 'skill2Burst') {
    skill2Burst(k.x, k.z, radius);
  } else if (e.type === 'skill2Cancel') {
    groundCracks.cancel();
  }
}

const nearCamera = (pos) => Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z) < p1.height * 1.6;

// 力を込めている間: ひびが広がり、地面が揺れ、光の粒が立ちのぼる
function updateSkill2Charge(dt) {
  const k = player.s2;
  if (!k || k.phase !== 'charge') return;
  const c = k.charge;
  groundCracks.setCharge(c, clock.elapsedTime);
  fx.trauma = Math.max(fx.trauma, 0.14 + 0.3 * c); // だんだん強くなる地鳴り
  chargeSpark -= dt;
  if (chargeSpark <= 0) {
    chargeSpark = 0.07 - 0.04 * c;
    // ひびの伸びた範囲のどこかから、光の粒と土くれが浮き上がる
    const a = Math.random() * Math.PI * 2;
    const r = SKILL2.radius * p1.scale * (0.1 + 0.85 * c * Math.random());
    v1.set(k.x + Math.cos(a) * r, 0.03, k.z + Math.sin(a) * r);
    if (nearCamera(v1)) return; // カメラの目の前には出さない（大きく映り込むため）
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 2, p1.height * 0.045, p1.height * 1.5, 0.53, 0.9);
    if (Math.random() < 0.5) sparks.burst(v1, forward, 1, p1.height * 0.07, p1.height * 1.2, 0.07, 0.45);
  }
}

// 解放: 地割れが噴き上がり、範囲内の相手を外へ吹き飛ばす
function skill2Burst(cx, cz, radius) {
  groundCracks.burst(p1.height);
  groundBreak.trigger(cx, cz, radius * 0.42);
  v1.set(cx, 0.03, cz);
  impact.ring(v1, radius, 0.6);
  impact.ring(v1, radius * 0.7, 0.45);
  impact.ring(v1, radius * 0.4, 0.3);
  impact.flash(v1.setY(p1.height * 0.4), p1.height * 4.5, 0.25);
  // 範囲のあちこちで土くれと光の粒が跳ね上がる
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random();
    const r = radius * (0.25 + Math.random() * 0.6);
    v1.set(cx + Math.cos(a) * r, 0.03, cz + Math.sin(a) * r);
    if (nearCamera(v1)) continue;
    forward.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    sparks.burst(v1, forward, 5, p1.height * 0.085, p1.height * 3.0, 0.07, 0.45);
    sparks.burst(v1, forward, 3, p1.height * 0.055, p1.height * 3.6, 0.53, 0.9);
  }
  fx.shake(1);
  fx.kick(0, 1.2, 0.8);
  fx.zoom(140);

  // 範囲内の相手に命中（中心から外へ、一番強く吹き飛ばす）
  const dx = p2.group.position.x - cx;
  const dz = p2.group.position.z - cz;
  const dist = Math.hypot(dx, dz);
  const hittable = dummy.state === 'ground' || dummy.state === 'hit' || dummy.state === 'down';
  if (dist > radius || !hittable) return;
  dummy.hit(dist > 1e-4 ? dx : Math.sin(p1.group.rotation.y), dist > 1e-4 ? dz : Math.cos(p1.group.rotation.y), 3);
  dummy.status.apply('stun', SKILL2.stun); // 気絶（状態異常）を付与
  dealDamage(DAMAGE.skill2);
  hitStop = 0.16;
  flash = 0.14;
  v1.set(p2.group.position.x, p2.height * 0.55, p2.group.position.z);
  forward.set(dx, 0, dz).normalize();
  sparks.burst(v1, forward, 16, p2.height * 0.065, p2.height * 3.4);
  impact.flash(v1, p2.height * 2.4, 0.2);
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
  dealDamage(finisher ? DAMAGE.finisherSlam : DAMAGE.airSlam);
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

// ---- バットの風 ----
// バットを振ると、振りの強さ（バットの先の速さ）に応じた風が起こり、当たる範囲が広がる。
// 弱い振りで約 1.6 倍、いっぱいの振りで約 2.4 倍（平均しておよそ 2 倍）。
const WIND_EXTEND = 7;      // 風が刃を押し広げる長さ（リグ単位。振りの強さで 0.5〜1.5 倍）
const rawPrevTip = new THREE.Vector3();
const WIND_REF = 45;        // この速さ（身長あたり/秒）で最大の強さ
let windStrength = 0;       // 今の振りの強さ 0〜1
let windPeak = 0;           // この振りでの最大
let windGust = 0;           // 風を出すまでの間隔
let frameDt = 1 / 60;
const windPos = new THREE.Vector3();
const _wd = new THREE.Vector3();

function windRadiusScale() {
  return 1.6 + 0.8 * windStrength;
}

function spawnWind(dir, strong) {
  const h = Math.atan2(dir.x, dir.z);
  const k = 0.55 + 0.9 * windStrength;
  windPos.copy(bladeTip).lerp(bladeBase, 0.35);
  impact.wave(windPos, h, 0, p1.height * 1.5 * k, p1.height * (5 + 7 * windStrength), 0.32, 'wind');
  if (strong) impact.wave(windPos.setY(windPos.y * 0.7), h, 0.25, p1.height * 0.8 * k, p1.height * (4 + 6 * windStrength), 0.28, 'wind');
}

function checkHit() {
  if (!player.attackActive || player.hitDone || player.attacks[player.attackIndex].ranged) { hadPrevTip = false; windPeak = 0; return; }
  p1.group.updateWorldMatrix(true, true);
  bladeBase.copy(p1.sword.userData.base).applyMatrix4(p1.sword.matrixWorld); // sword: 今握っている武器
  bladeTip.copy(p1.sword.userData.tip).applyMatrix4(p1.sword.matrixWorld);
  const bat = player.weaponId === 'bat';
  const fang = player.weaponId === 'fang';
  const atk = player.attacks[player.attackIndex];
  if (bat) {
    if (hadPrevTip) {
      const sub = p1.animator.trailOn ? frameDt / 5 : frameDt;
      const dx = bladeTip.x - rawPrevTip.x;
      const dz = bladeTip.z - rawPrevTip.z;
      const speed = Math.hypot(dx, dz, bladeTip.y - rawPrevTip.y) / Math.max(sub, 1e-3) / p1.height;
      windStrength = Math.min(1, speed / WIND_REF);
      windPeak = Math.max(windPeak, windStrength);
      window.__wind = { speed, windStrength };
      windGust -= sub;
      if (windStrength > 0.25 && windGust <= 0) {
        windGust = 0.045;
        _wd.set(dx, 0, dz);
        if (_wd.lengthSq() < 1e-8) _wd.set(Math.sin(p1.group.rotation.y), 0, Math.cos(p1.group.rotation.y));
        spawnWind(_wd, windStrength > 0.6);
      }
    } else {
      windStrength = 0.45;
    }
    rawPrevTip.copy(bladeTip);
    // 風が刃の先を押し広げる: 刃の延長線上へ、振りが強いほど遠くまで当たる
    _wd.subVectors(bladeTip, bladeBase).normalize();
    bladeTip.addScaledVector(_wd, WIND_EXTEND * (0.5 + windStrength) * p1.scale);
  }
  const tx = p2.group.position.x;
  const tz = p2.group.position.z;
  const r = HIT_RADIUS * p2.scale * (bat ? windRadiusScale() : 1);
  const low = Math.min(bladeBase.y, bladeTip.y) < p2.group.position.y + p2.height * 1.05;
  let touching = low && (distToSegmentXZ(tx, tz, bladeBase, bladeTip) < r
    || (hadPrevTip && distToSegmentXZ(tx, tz, prevTip, bladeTip) < r));
  if (fang && atk.bite) {
    // 噛みつき: 爪ではなく、正面の近くにいる相手に当たる
    const ddx = tx - p1.group.position.x;
    const ddz = tz - p1.group.position.z;
    const dd = Math.hypot(ddx, ddz) || 1;
    const hy = p1.group.rotation.y;
    touching = (Math.sin(hy) * ddx + Math.cos(hy) * ddz) / dd > 0.45 && dd < atk.reach * p1.scale;
  }
  prevTip.copy(bladeTip);
  hadPrevTip = true;
  if (!touching) return;

  const dx = tx - p1.group.position.x;
  const dz = tz - p1.group.position.z;
  const dist = Math.hypot(dx, dz) || 1;

  player.hitDone = true;
  // 3段目を当てたら、少しの間だけコンボ技（掴み上げ）を出せる
  if (player.attackIndex === 2 && !fang) player.finisherWindow = FINISHER.window;
  const power = player.attacks[player.attackIndex].power;
  const strong = power > 1;
  if (fang && atk.grab) player.startNeckBite(); // 首に噛みつく: つかんで離さない
  else dummy.hit(dx, dz, power);
  dealDamage((bat ? DAMAGE.bat : fang ? DAMAGE.fang : DAMAGE.attack)[player.attackIndex]);

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
  if (fang) fangDirector.onBiteHit(player.attackIndex);
  if (bat) { // 風圧: 足もとに広がる輪と、土ぼこり。振りが強いほど大きい
    impact.ring(p2.group.position, p2.height * (1.2 + 1.8 * windStrength), 0.4);
    sparks.burst(v1.setY(p2.height * 0.15), forward, Math.round(8 + 14 * windStrength), p2.height * 0.06, p2.height * (2 + 3 * windStrength), 0.12, 0.2);
  }
}

// 自分の体力を回復する（吸血牙）。回復した量を、自分の頭の上に緑の数字で出す
function healPlayer(amount) {
  const healed = player.health.heal(amount);
  if (healed > 0) fightHud.popDamage(v1.set(p1.group.position.x, p1.group.position.y + p1.height * 1.15, p1.group.position.z), healed, 'heal');
  return healed;
}

// ---- 必殺技のムービー演出 ----
let ultDirector;
const swordUlt = new UltimateDirector({
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, groundCracks, p1, p2, player, dummy, ultPath,
  hooks: {
    hitStop: (sec) => { hitStop = Math.max(hitStop, sec); },
    flashFoe: (sec) => { flash = Math.max(flash, sec); },
    damage: (amount, at, kind) => dealDamage(amount, at, kind),
    // 吸血: 自分の体力を回復（実際に増えた量を返す）
    heal: (amount) => healPlayer(amount),
    // ムービーが終わったら、カメラを自分の背後へ戻す
    resetCamera: () => {
      view.pivot.copy(p1.group.position);
      view.snapped = false;
      view.setBehind(p1.group.rotation.y);
      view.zoom = view.zoomTarget = 1;
      view.followRate = 11;
      if (koPending) startKO();
    },
  },
});

ultDirector = swordUlt;
// バットの必殺技（バッティングセンターのムービー）。剣のものと同じ hooks を使う
const batUlt = new BatUltimateDirector({
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, p1, p2, getPlayer: () => player,
  hooks: swordUlt.ctx.hooks,
});

// ---- バット用の演出（ボールの飛行・命中など）----
const batDirector = new BatDirector({
  scene, camera, impact, sparks, fx, p1, p2, stage, dummy, getPlayer: () => player,
  hooks: {
    hitStop: (sec) => { hitStop = Math.max(hitStop, sec); },
    flashFoe: (sec) => { flash = Math.max(flash, sec); },
    damage: (amount, at, kind) => dealDamage(amount, at, kind),
    groundBreak: (x, z, r) => groundBreak.trigger(x, z, r),
  },
});

// 蝙蝠の群れ（吸血牙のスキル・必殺技で共通）
const batSwarm = new BatSwarm(scene, 340);
// 吸血牙の必殺技（ドラキュラ城のムービー）
const fangDirector = new FangDirector({
  scene, camera, impact, sparks, fx, p1, p2, stage, dummy, getPlayer: () => player, swarm: batSwarm,
  hooks: swordUlt.ctx.hooks,
});
const fangUlt = new FangUltimateDirector({
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, p1, p2, getPlayer: () => player,
  hooks: swordUlt.ctx.hooks, swarm: batSwarm, fang: fangDirector,
});

// ---- 試合前の武器選択 ----
// 選んだ武器は game.weapon に入る。今は「剣」だけ（ほかの武器はあとから追加する）
let started = false;
let weapon = getWeapon();
const weaponSelect = new WeaponSelect((id) => {
  weapon = getWeapon(id);
  // 選んだ武器に切り替える: キャラの持ち物と、操作するコントローラ
  p1.setWeapon(id);
  player = id === 'bat' ? batPlayer : id === 'fang' ? fangPlayer : swordPlayer;
  ultDirector = id === 'bat' ? batUlt : id === 'fang' ? fangUlt : swordUlt;
  window.game.player = player;
  window.game.ult = ultDirector;
  touch.setWeapon(id); // ボタンのアイコンを、武器に合わせる
  if (id === 'bat') document.getElementById('hud').textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ（空中の攻撃はなし）　左クリック / J: 攻撃（横殴り→一回転→ボール）　T / G: 必殺技　K / E: スキル1（金属バット弾）→ 使用後はスキル3（ボール連打）　L / Q: スキル2（バット投げ）→ 使用後はスキル4（空中バット）　F: 立ち⇔構え　｜　右ドラッグ: 視点　ホイール: 距離';
  if (id === 'fang') document.getElementById('hud').textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ　左クリック / J: 攻撃（噛みつき→爪の薙ぎ払い→首に噛みつく）　ジャンプ中に攻撃: かぎ爪×3　T / G: 必殺技（赤い宝石）　K / E: スキル1（赤い斬撃・吸血）→ 使用後はスキル3（分身）　L / Q: スキル2（巨大蝙蝠の突進）→ 使用後はスキル4（足を蝙蝠にして回転）　F: 立ち⇔構え　｜　右ドラッグ: 視点　ホイール: 距離';
  started = true;
  document.body.classList.remove('pre-match');
  fightHud.showBanner('READY', 'FIGHT!');
  window.game.weapon = weapon;
});
// 試合前は、HP・ボタンなどの表示を隠す
document.body.classList.add('pre-match');

// デバッグ用
window.game = { start: (id) => { if (id) weaponSelect.select(id); weaponSelect.confirm(); }, isStarted: () => started, weapon, ult: ultDirector, fightHud, dealDamage, view, touch, stage, characters, player, dummy, camera, controls, scene, fx, createCharacter, follow: true, manual: false };

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 1フレーム分ゲームを進めて描画する
function step(realDt) {
  // ヒットストップ中はゲーム内の時間だけほぼ止める（カメラ演出は実時間で動く）
  let dt = realDt;
  if (!started) { // 武器選択中は、試合を進めない（ステージとカメラだけ表示する）
    stage.update(clock.elapsedTime);
    view.update(realDt, p1.group.position, null);
    for (const c of characters) c.update(0);
    if (!window.game.skipRender) renderer.render(scene, camera);
    return;
  }
  if (hitStop > 0) {
    hitStop -= realDt;
    dt *= 0.03;
  }
  if (player.ult) dt *= player.ult.timeScale; // 必殺技の締めのため中は、スローモーション
  stage.update(clock.elapsedTime);

  player.update(dt, readCommand());
  dummy.update(dt, NO_INPUT);
  input.endFrame();
  // コンボ技を出せる間、ジャンプボタン（と PC の案内）を切り替える
  const canFinish = player.finisherWindow > 0 && player.canGrab();
  touch.setSpecial(canFinish);
  // スキル1のボタン: スキル1を使ったあとはスキル3に変わる（ため中は、ため具合を表示）
  // スキルボタンの表示。武器ごとに、「いま切り替わっているか」「使用中か」が違うので、コントローラの状態から決める
  // 剣以外の武器（バット・吸血牙）は、player.bs が今のスキルの進行状況。スキルの待ち時間は武器ごとに違う
  const own = player.weaponId !== 'sword';
  const bs = own ? player.bs?.n : 0;
  const cd1 = player.weaponId === 'fang' ? FSK1.cooldown : player.weaponId === 'bat' ? BSKILL1.cooldown : SKILL1.cooldown;
  const cd2 = player.weaponId === 'fang' ? FSK2.cooldown : player.weaponId === 'bat' ? BSKILL2.cooldown : SKILL2.cooldown;
  const alt1 = own ? player.skill3Ready || bs === 3 : player.skill3Ready || player.state === 'skill3';
  const alt2 = own ? player.skill4Ready || bs === 4 : player.skill4Ready || player.state === 'skill4';
  touch.setSkillAlt(0, alt1);
  if (alt1) {
    touch.setSkillCooldown(0, 0, 0, own ? bs === 3 : player.s3 !== null && player.s3.phase === 'release');
    touch.setSkillCharge(0, !own && player.s3 && player.s3.phase === 'charge' ? player.s3.charge : 0);
  } else {
    touch.setSkillCooldown(0, player.skillCooldown / cd1, player.skillCooldown, own ? bs === 1 : player.state === 'skill');
    touch.setSkillCharge(0, 0);
  }
  touch.setSkillAlt(1, alt2);
  if (alt2) {
    touch.setSkillCooldown(1, 0, 0, own ? bs === 4 : player.state === 'skill4');
  } else {
    touch.setSkillCooldown(1, player.skill2Cooldown / cd2, player.skill2Cooldown, own ? bs === 2 : player.state === 'skill2');
  }
  comboPrompt.classList.toggle('show', canFinish);

  for (const e of player.events) onAttackEvent(e);
  player.events.length = 0;
  for (const e of dummy.events) onDummyEvent(e);
  dummy.events.length = 0;
  statusHud.update(dummy.status);
  // HP・ゲージの表示と、必殺技ボタン（ゲージがたまると、ジャンプボタンの左に出る）
  fightHud.update(realDt, camera, player, dummy);
  const ultReady = player.gauge.full && player.state !== 'ult';
  touch.setUltReady(ultReady);
  ultPrompt.classList.toggle('show', ultReady);
  // KO: しばらくしたら HP が全回復して、再開する
  if (ko) {
    ko.t += realDt;
    if (ko.t >= FIGHT.koRefillDelay) {
      ko = null;
      dummy.health.refill();
      dummy.health.invulnerable = false;
      dummy.status.clear();
      fightHud.showBanner('READY', 'FIGHT!');
    }
  }

  // キャラ同士はすり抜けない（P1 を P2 の外へ押し出す）
  const minDist = 0.36 * (p1.height + p2.height) / 2;
  const sx = p1.group.position.x - p2.group.position.x;
  const sz = p1.group.position.z - p2.group.position.z;
  const sep = Math.hypot(sx, sz);
  const grappling = (player.weaponId === 'fang' && player.state.startsWith('bskill')) || player.state === 'finisher' || player.state === 'ult' || player.state === 'skill' || player.state === 'skill4' || dummy.state === 'launched' || dummy.state === 'held' || dummy.state === 'thrown' || dummy.state === 'down';
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
  if (dummy.state === 'ground' && !dummy.status.has('stun')) { // 気絶中はふらふらしたまま、向き直らない
    const want = Math.atan2(p1.group.position.x - p2.group.position.x, p1.group.position.z - p2.group.position.z);
    let diff = want - p2.group.rotation.y;
    diff -= Math.PI * 2 * Math.round(diff / (Math.PI * 2));
    p2.group.rotation.y += diff * (1 - Math.exp(-6 * dt));
  }

  frameDt = dt;
  p1.update(dt, checkHit); // 姿勢を進めるたびに、その時点の刃の位置で当たり判定
  p2.update(dt);
  sparks.update(dt, camera, p1.height * 1.1);
  batDirector.update(dt);
  fangDirector.update(dt);
  batSwarm.update(dt, clock.elapsedTime);
  impact.update(realDt); // 閃光や衝撃波はヒットストップ中も動かす
  ultDirector.update(realDt);
  groundBreak.update(realDt);
  groundCracks.update(realDt);
  updateSkill2Charge(realDt);
  updateSkill3(dt, realDt);
  updateTether(clock.elapsedTime);
  flash = Math.max(0, flash - realDt);
  p2.setFlash(flash > 0 ? 1 : 0);

  // 追従カメラ。視点を触っていないときだけ、進行方向（攻撃中は狙った方向）の背後へゆっくり回り込む
  if (ultDirector.active) {
    ultDirector.updateCamera(); // 必殺技のムービー中は、カメラワークをディレクターが決める
  } else if (window.game.follow) {
    // 視点と移動は分離: 歩いても走ってもカメラの向きは変わらない。
    // 攻撃中だけ、狙っている相手が画面に収まるよう背後へゆっくり回り込む（視点を触った直後は回らない）
    const align = player.state === 'skill3' ? { heading: p1.group.rotation.y, rate: ATTACK_ALIGN_RATE }
      : player.state === 'attack' ? { heading: player.aimYaw, rate: ATTACK_ALIGN_RATE }
      : null;
    // コンボ技の間はカメラを引き、高く跳んでも2人が画面に収まるようにする
    const cinematic = player.state === 'finisher' || player.finisherSlam;
    // スキル2: 力を込める間はじわっと寄り、解放で大きく引いて範囲全体を見せる
    const s2Zoom = !player.s2 ? 1 : player.s2.phase === 'charge' || player.s2.phase === 'stab' ? 0.85 : 2.0;
    // スキル3: ためるほど寄り、放つときは少し引く
    const s3Zoom = !player.s3 ? 1 : player.s3.phase === 'charge' ? 1 - 0.08 * player.s3.charge : 1.25;
    // スキル1・スキル4: カメラは相手の方へ寄せたり動かしたりしない（ズームもしない）
    view.zoomTarget = cinematic ? 2.3 : player.s2 ? s2Zoom : player.s3 ? s3Zoom : 1;
    view.heightFollow = cinematic ? 0.5 : 0.4;
    // スキル4の飛びかかり中は、カメラの追従を止める（相手の方へカメラが動かない）。終わったあとは、ゆっくり追いつく
    const targetRate = player.state === 'skill4' ? 0 : 11;
    view.followRate += (targetRate - view.followRate) * (1 - Math.exp(-(targetRate === 0 ? 40 : 2.4) * realDt));
    const focus = p1.group.position; // 常に自分を映す
    view.update(realDt, focus, align);
  } else {
    camera.lookAt(controls.target);
  }

  fx.update(realDt);
  fx.apply();
  if (!window.game.skipRender) renderer.render(scene, camera); // skipRender: 確認用の早送り
  fx.restore();
}
window.game.fang = fangDirector; window.game.swarm = batSwarm;
window.game.step = step; // manual=true のとき、外からコマ送りできる（動作確認用）

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!window.game.manual) step(dt);
});
