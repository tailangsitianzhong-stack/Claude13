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
import { BUILD } from './version.js';
import { OnomController, OSKILL1 as OSK1, OSKILL2 as OSK2 } from './character/OnomController.js';
import { OnomDirector } from './game/OnomDirector.js';
import { preloadWords, allWordTextures } from './game/Words.js';
import { ArrowController, ASKILL1 as ASK1, ASKILL2 as ASK2 } from './character/ArrowController.js';
import { ArrowDirector } from './game/ArrowDirector.js';
import { ArrowUltimateDirector } from './cinematic/ArrowUltimate.js';
import { CharacterController, ATTACKS, AIR_SLAM, FINISHER, SKILL1, SKILL2, SKILL3, SKILL4, ultPath } from './character/Controller.js';
import { FIGHT, DAMAGE } from './character/Health.js';
import { FightHud } from './ui/FightHud.js';
import { WeaponSelect } from './ui/WeaponSelect.js';
import { ModeSelect } from './ui/ModeSelect.js';
import { BattleHud } from './ui/BattleHud.js';
import { NPC_LOOKS, NpcBrain, createNameTag } from './game/Npc.js';
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

// プレイヤーと、相手（NPC）を向かい合わせに配置
const p1 = createCharacter({ name: 'P1', shirt: 0x1e88e5, pants: 0x2e3a4b, hair: 0x4a2c17, hairStyle: 'short', face: 'smile', sleeves: 'short' });
p1.group.position.set(-0.6, 0, 0);
p1.group.rotation.y = Math.PI / 2;
scene.add(p1.group);

// 相手（NPC）は最大3人。練習モードでは [0] だけが立っている（サンドバッグ）。バトルモードでは、人数に応じて 1〜3 人が戦う。
// 最初に全員を作っておく（試合中に作ると重くなるため。ロードのシェーダー準備にも含まれる）
const npcs = [];
for (let i = 0; i < NPC_LOOKS.length; i++) {
  const look = NPC_LOOKS[i];
  const c = createCharacter({ ...look, name: look.name });
  c.group.position.set(0.6 + i * 0.5, 0, 0);
  c.group.rotation.y = -Math.PI / 2;
  c.animator.play('fight', 0); // 構えポーズで待機
  const ctl = new CharacterController(c, { bounds: stage.bounds });
  ctl.idle = 'fight';
  // 頭の上の名前札（バトルモードだけ）。大きさ・高さは身長に合わせる
  const tag = createNameTag(look.name, look.tag);
  const h = c.height / c.scale;
  tag.scale.set(h * 0.85, h * 0.2125, 1);
  tag.position.set(0, h + 0.9, 0);
  c.group.add(tag);
  scene.add(c.group);
  c.group.visible = i === 0;
  npcs.push({ id: i, name: look.name, c, ctl, tag, brain: new NpcBrain(0.45 + 0.15 * i), alive: i === 0, dying: false, deathT: 0, flashT: 0, burnAcc: 0 });
}
const youTag = createNameTag('YOU', '#7fd0ff');
{ const h = p1.height / p1.scale; youTag.scale.set(h * 0.65, h * 0.1625, 1); youTag.position.set(0, h + 0.9, 0); p1.group.add(youTag); }
// 今狙っている相手（練習モードでは常に npcs[0]。バトルモードでは、いちばん近い相手に切り替わる）。
// 技の処理（ダメージ・演出）は、すべてこの p2 / dummy に対して行う
let p2 = npcs[0].c;
let dummy = npcs[0].ctl;
let activeNpcs = [npcs[0]];  // 今の試合に出ている相手
const characters = [p1, ...npcs.map((n) => n.c)];
for (const c of characters) { for (const t of [c.trail, c.trailGreat, c.trailBat, c.trailFang]) if (t) scene.add(t.mesh); }

// P1 をキーボードで操作。相手は、練習モードでは立っているだけ（攻撃を受けるとのけぞる）、バトルモードでは NPC として戦う
let player = new CharacterController(p1, { bounds: stage.bounds });
const swordPlayer = player;
const batPlayer = new BatController(p1, { bounds: stage.bounds }); // バットを選んだときに使う
const fangPlayer = new FangController(p1, { bounds: stage.bounds }); // 吸血牙を選んだときに使う
const arrowPlayer = new ArrowController(p1, { bounds: stage.bounds }); // 矢印を選んだときに使う
const onomPlayer = new OnomController(p1, { bounds: stage.bounds });   // 擬音を選んだときに使う
const allPlayers = [swordPlayer, batPlayer, fangPlayer, arrowPlayer, onomPlayer];
// 狙う相手・コンボ技で掴む相手を、今の相手にする
function setFoe(n) {
  p2 = n.c; dummy = n.ctl;
  for (const pl of allPlayers) { pl.target = p2; pl.victim = dummy; }
}
setFoe(npcs[0]);
const statusHud = new StatusHud('P2'); // 相手の状態異常の表示枠
const statusHudP1 = new StatusHud('P1', { id: 'status-hud-p1', left: 12, top: 96 }); // 自分の状態異常（加速・攻撃UP）の表示枠
const NO_INPUT = { x: 0, z: 0, run: false, jump: false, attack: false, skill: false, skillHold: false, skill2: false, ult: false, toggleStance: false };

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
  if (player.status.has('power')) amount *= 1.5; // 攻撃力アップ（擬音のドキドキ）: ダメージ +50%
  const dealt = dummy.health.damage(amount);
  if (dealt <= 0) return 0;
  if (player.state !== 'ult') player.gauge.add(dealt * FIGHT.gaugePerDamage); // 必殺技の最中は溜まらない
  const where = at ?? v1.set(p2.group.position.x, p2.group.position.y + p2.height * 0.7, p2.group.position.z);
  fightHud.popDamage(where, dealt, kind ?? (dealt >= 90 ? 'huge' : dealt >= 45 ? 'big' : ''));
  if (dummy.health.ko && mode === 'practice') onKO(); // バトルモードの脱落は、scanDeaths が決める
  return dealt;
}

// スキルを使うたびに、ゲージが少し溜まる
const GAUGE_ON_USE = new Set(['onomSkill1Start', 'onomSkill2Start', 'onomSkill3Start', 'onomSkill4Start', 'onomComboStart', 'arrowSkill1Start', 'arrowSkill2Start', 'arrowSkill3Start', 'arrowSkill4Start', 'arrowFinStart', 'fangSkill1Start', 'fangSkill2Start', 'fangSkill3Start', 'fangSkill4Start', 'batSkill1Start', 'batSkill2Start', 'batSkill3Start', 'batSkill4Start', 'skillStart', 'skill2Start', 'skill3Start', 'skill4Start', 'finisherGrab', 'airSlamStart']);
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
  // 演出の例外で、ゲームの進行（ダメージ・状態）まで止めない
  try { handleAttackEvent(e); } catch (err) { window.game.reportError?.('event ' + e.type, err); }
}
function handleAttackEvent(e) {
  if (player.state !== 'ult' && GAUGE_ON_USE.has(e.type)) player.gauge.add(FIGHT.gaugePerSkill);
  if (EVENT_DAMAGE[e.type]) dealDamage(EVENT_DAMAGE[e.type]);
  const d = toCameraSpace(p1, SLASH_DIR[e.index ?? 2]);
  if (e.type.startsWith('onom')) {
    onomDirector.onEvent(e);
  } else if (e.type.startsWith('arrow')) {
    arrowDirector.onEvent(e);
  } else if (e.type.startsWith('fang')) {
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
    if (player.weaponId === 'arrow') arrowDirector.onSwing(e);
    else if (player.weaponId === 'fang') fangDirector.onSwing(e);
    else if (player.weaponId !== 'bat') impact.wave(v1, h, WAVE_TILT[e.index], p1.height * (strong ? 1.15 : 0.95), p1.height * (strong ? 6 : 7.5)); // バットには斬撃波はない
  } else if (e.type === 'slam' && player.weaponId !== 'fang' && player.weaponId !== 'arrow') {
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

// 吹き飛ばされた相手（n）の着地・壁への激突
function onFoeEvent(n, e) {
  const q = n.c;
  if (e.type === 'launchLand') {
    v1.set(e.x, 0.03, e.z);
    impact.ring(v1, q.height * 1.8, 0.4);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 12, q.height * 0.07, q.height * 2.4, 0.25, 0.25);
    if (n.ctl === dummy) fx.shake(0.4);
  } else if (e.type === 'wallSlam') {
    if (n.ctl === dummy) dealDamage(DAMAGE.wallSlam); else damageNpc(n, DAMAGE.wallSlam);
    v1.set(e.x, q.height * 0.5, e.z);
    impact.flash(v1, q.height * 2.6, 0.2);
    impact.ring(q.group.position, q.height * 2.0, 0.4);
    forward.set(0, 0, 0);
    sparks.burst(v1, forward, 18, q.height * 0.07, q.height * 3.0, 0.07, 0.3);
    if (n.ctl === dummy) { hitStop = 0.1; fx.shake(0.9); }
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
  if (!player.attackActive || player.hitDone || player.attacks[player.attackIndex].ranged || player.attacks[player.attackIndex].shout) { hadPrevTip = false; windPeak = 0; return; }
  p1.group.updateWorldMatrix(true, true);
  bladeBase.copy(p1.sword.userData.base).applyMatrix4(p1.sword.matrixWorld); // sword: 今握っている武器
  bladeTip.copy(p1.sword.userData.tip).applyMatrix4(p1.sword.matrixWorld);
  const bat = player.weaponId === 'bat';
  const fang = player.weaponId === 'fang';
  const arrow = player.weaponId === 'arrow';
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
  const r = HIT_RADIUS * p2.scale * (bat ? windRadiusScale() : fang ? 2 : 1); // 吸血牙: 斬撃をまとって、範囲は2倍
  const low = Math.min(bladeBase.y, bladeTip.y) < p2.group.position.y + p2.height * 1.05;
  let touching = low && (distToSegmentXZ(tx, tz, bladeBase, bladeTip) < r
    || (hadPrevTip && distToSegmentXZ(tx, tz, prevTip, bladeTip) < r));
  if ((fang || arrow) && atk.bite) {
    // 噛みつき・素手の打撃: 爪や拳ではなく、正面の近くにいる相手に当たる
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
  if (player.attackIndex === 2 && !fang && !arrow) player.finisherWindow = FINISHER.window; // 矢印は、押さえつけが終わったときに出る
  const power = player.attacks[player.attackIndex].power;
  const strong = power > 1;
  if (fang && atk.grab) player.startNeckBite(); // 首に噛みつく: つかんで離さない
  else if (arrow && atk.grab) player.startPress(); // 下向き矢印で、地面に押さえつける
  else if (arrow && atk.launch) dummy.launch(dx, dz, 62, 13); // 加速パンチ: 遠くへ吹っ飛ばす
  else dummy.hit(dx, dz, power);
  dealDamage((bat ? DAMAGE.bat : fang ? DAMAGE.fang : arrow ? DAMAGE.arrow : DAMAGE.attack)[player.attackIndex]);

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
  if (arrow) arrowDirector.onHit(player.attackIndex);
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
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, groundCracks, p1, get p2() { return p2; }, player, get dummy() { return dummy; }, ultPath,
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
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, p1, get p2() { return p2; }, getPlayer: () => player,
  hooks: swordUlt.ctx.hooks,
});

// ---- バット用の演出（ボールの飛行・命中など）----
const batDirector = new BatDirector({
  scene, camera, impact, sparks, fx, p1, get p2() { return p2; }, stage, get dummy() { return dummy; }, getPlayer: () => player,
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
  scene, camera, impact, sparks, fx, p1, get p2() { return p2; }, stage, get dummy() { return dummy; }, getPlayer: () => player, swarm: batSwarm,
  hooks: swordUlt.ctx.hooks,
});
const fangUlt = new FangUltimateDirector({
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, p1, get p2() { return p2; }, getPlayer: () => player,
  hooks: swordUlt.ctx.hooks, swarm: batSwarm, fang: fangDirector,
});

// 擬音: 文字の演出（必殺技はムービーなし。KO の後始末だけ、ult の stub が受け持つ）
const onomDirector = new OnomDirector({
  scene, camera, impact, sparks, fx, p1, get p2() { return p2; }, stage, get dummy() { return dummy; }, getPlayer: () => player,
  hooks: { ...swordUlt.ctx.hooks, groundBreak: (x, z, r) => groundBreak.trigger(x, z, r) },
});
const onomUlt = {
  active: false, camDistance: 4,
  update() {}, updateCamera() {},
  onEvent(e) { if (e.type === 'ultCineEnd') swordUlt.ctx.hooks.resetCamera(); }, // 必殺技の最中に KO が決まっていたら、ここで KO
};

// 矢印: ステッカー・砲弾・隆起の演出と、必殺技（ゴミ処理場のムービー）
const arrowHooks = { ...swordUlt.ctx.hooks, groundBreak: (x, z, r) => groundBreak.trigger(x, z, r) };
const arrowDirector = new ArrowDirector({
  scene, camera, impact, sparks, fx, p1, get p2() { return p2; }, stage, get dummy() { return dummy; }, getPlayer: () => player, hooks: arrowHooks, foes: npcs.map((n) => n.c),
});
const arrowUlt = new ArrowUltimateDirector({
  scene, camera, lights: { hemi, sun }, stage, impact, sparks, fx, overlay: cineOverlay, p1, get p2() { return p2; }, getPlayer: () => player,
  hooks: swordUlt.ctx.hooks, arrow: arrowDirector,
});

// ---- モード（練習 / バトル）と、NPC ----
//   練習モード   : 相手（npcs[0]）は立っているだけ。倒すと、しばらくして復活する
//   バトルモード : 自分を入れて 2〜4 人。NPC は考えて動き、自分を含めてお互いを攻撃する。最後まで立っていた人の勝ち
// 自分の技はすべて「今狙っている相手（dummy）」に当たる。バトルモードでは、動きが止まっているときに、いちばん近い相手へ切り替わる。
let mode = 'practice';
let matchCfg = { mode: 'practice', players: 2 };
let matchOver = null;   // null | 'win' | 'lose'
let matchEndT = 0;      // 勝敗が決まってからの秒数（結果の表示を出したら -1）
const battleHud = new BattleHud();
const NPC_DAMAGE = 0.75;      // NPC の通常攻撃は、プレイヤーの同じ攻撃の 75% のダメージ
const HURTABLE = new Set(['ground', 'crouch', 'air', 'land', 'attack', 'hit']); // 攻撃を受ける状態（技・必殺技・投げの最中は受けない）
const NPC_BUSY = new Set(['launched', 'held', 'thrown', 'down', 'finisher']);
const foeAlive = (n) => n.alive && !n.dying && !n.ctl.health.ko;

function resetFighter(k) {
  const c = k.c;
  const g = c.group;
  for (const fn of ['cancelBat', 'cancelFang', 'cancelArrow', 'cancelOnom']) if (typeof k[fn] === 'function') k[fn]();
  k.state = 'ground';
  k.vx = k.vy = k.vz = 0;
  k.timer = 0; k.downTimer = 0;
  k.fin = null; k.sk = null; k.s2 = null; k.s3 = null; k.s4 = null; k.ult = null;
  if ('bs' in k) k.bs = null;
  k.skillCooldown = 0; k.skill2Cooldown = 0; k.skill3Ready = false; k.skill4Ready = false;
  k.finisherWindow = 0; k.attackActive = false; k.hitDone = false; k.grace = 0;
  k.health.refill(); k.health.invulnerable = false; k.gauge.reset(); k.status.clear();
  g.position.y = 0; g.rotation.x = 0; g.rotation.z = 0; g.scale.setScalar(c.scale);
  c.animator.trailOn = false;
  c.animator.play(k.idle, 0);
  c.setFlash(0);
}

function placeFighters() {
  const list = [p1, ...activeNpcs.map((n) => n.c)];
  if (mode === 'practice') {
    p1.group.position.set(-0.6, 0, 0); p1.group.rotation.y = Math.PI / 2;
    npcs[0].c.group.position.set(0.6, 0, 0); npcs[0].c.group.rotation.y = -Math.PI / 2;
    return;
  }
  // バトル: 円形に並んで、中央を向く（自分は手前＝カメラ側）
  const R = 2.6;
  list.forEach((c, i) => {
    const a = Math.PI + (i / list.length) * Math.PI * 2;
    c.group.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    c.group.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
  });
}

function refreshRemaining() {
  const left = 1 + activeNpcs.filter(foeAlive).length;
  battleHud.setRemaining(left, activeNpcs.length + 1, mode === 'battle');
}

// 試合を始める（またはやり直す）
function setupMatch(cfg) {
  matchCfg = { mode: cfg.mode === 'battle' ? 'battle' : 'practice', players: cfg.players ?? 2 };
  mode = matchCfg.mode;
  matchOver = null; matchEndT = 0;
  ko = null; koPending = false; hitStop = 0; flash = 0; slashes.length = 0;
  battleHud.hideResult();
  const count = mode === 'battle' ? Math.min(NPC_LOOKS.length, Math.max(1, matchCfg.players - 1)) : 1;
  activeNpcs = npcs.slice(0, count);
  resetFighter(player);
  for (const n of npcs) {
    resetFighter(n.ctl);
    n.alive = activeNpcs.includes(n);
    n.dying = false; n.deathT = 0; n.flashT = 0; n.burnAcc = 0;
    n.brain = new NpcBrain(0.45 + 0.15 * n.id);
    n.c.group.visible = n.alive;
    n.tag.visible = mode === 'battle' && n.alive;
  }
  youTag.visible = mode === 'battle';
  placeFighters();
  setFoe(activeNpcs[0]);
  view.pivot.copy(p1.group.position);
  view.snapped = false;
  view.setBehind(p1.group.rotation.y);
  view.zoom = view.zoomTarget = 1;
  refreshRemaining();
}

// 敵の一覧（NPC の頭脳に渡す）。自分（プレイヤー）は、少しだけ狙われやすい
function enemiesOf(n) {
  const list = [{ c: p1, ctl: player, alive: () => !player.health.ko && !matchOver, weight: 0.85 }];
  for (const m of activeNpcs) if (m !== n) list.push({ c: m.c, ctl: m.ctl, alive: () => foeAlive(m), weight: 1 });
  return list;
}

// 自分が狙う相手を決める（バトルモード）。動きが止まっているときだけ、いちばん近い人へ。いまの相手が倒れたら、すぐ次へ
function updateFoeChoice() {
  if (mode !== 'battle' || matchOver) return;
  const st = player.state;
  if (st === 'ult' || ultDirector.active || koPending) return;
  if (st === 'finisher' || st === 'airSlam' || st === 'skill' || st === 'skill2' || st === 'skill3' || st === 'skill4' || player.bs || player.s2 || player.s3) return;
  const cur = activeNpcs.find((n) => n.ctl === dummy);
  const curOk = cur && foeAlive(cur);
  if (curOk && !(st === 'ground' || st === 'crouch' || st === 'air' || st === 'land' || st === 'hit')) return; // 攻撃の途中では、切り替えない
  let best = null; let bd = Infinity;
  for (const n of activeNpcs) {
    if (!foeAlive(n)) continue;
    const d = Math.hypot(n.c.group.position.x - p1.group.position.x, n.c.group.position.z - p1.group.position.z) * (n === cur ? 0.7 : 1); // いまの相手を、少し優先する（ころころ変わらない）
    if (d < bd) { bd = d; best = n; }
  }
  if (best && best !== cur) setFoe(best);
}

// 相手（n）に、プレイヤー以外が与えたダメージ（NPC の攻撃・燃焼・壁への激突）
function damageNpc(n, amount, at) {
  const dealt = n.ctl.health.damage(amount);
  if (dealt <= 0) return 0;
  const where = at ?? v1.set(n.c.group.position.x, n.c.group.position.y + n.c.height * 0.7, n.c.group.position.z);
  fightHud.popDamage(where, dealt, dealt >= 45 ? 'big' : '');
  return dealt;
}

// ---- NPC の攻撃の当たり判定 ----
const npcA = new THREE.Vector3();
const npcB = new THREE.Vector3();
function npcCheckHit(n) {
  const k = n.ctl;
  if (!k.attackActive || k.hitDone || n.dying || matchOver === 'lose') return;
  const sw = n.c.sword;
  if (!sw) return;
  n.c.group.updateWorldMatrix(true, true);
  npcA.copy(sw.userData.base).applyMatrix4(sw.matrixWorld);
  npcB.copy(sw.userData.tip).applyMatrix4(sw.matrixWorld);
  const targets = [{ c: p1, ctl: player, isPlayer: true }];
  for (const m of activeNpcs) if (m !== n && foeAlive(m)) targets.push({ c: m.c, ctl: m.ctl, n: m });
  for (const t of targets) {
    if ((t.ctl.grace ?? 0) > 0) continue;
    if (t.isPlayer ? !HURTABLE.has(t.ctl.state) : (NPC_BUSY.has(t.ctl.state) || t.ctl.state === 'skill')) continue;
    const pos = t.c.group.position;
    if (Math.min(npcA.y, npcB.y) > pos.y + t.c.height * 1.05) continue;
    if (distToSegmentXZ(pos.x, pos.z, npcA, npcB) >= HIT_RADIUS * t.c.scale) continue;
    npcLand(n, t);
    return;
  }
}
function npcLand(n, t) {
  const k = n.ctl;
  k.hitDone = true;
  const atk = k.attacks[k.attackIndex];
  const dx = t.c.group.position.x - n.c.group.position.x;
  const dz = t.c.group.position.z - n.c.group.position.z;
  const len = Math.hypot(dx, dz) || 1;
  t.ctl.hit(dx, dz, atk.power);
  t.ctl.grace = (atk.power > 1 ? 0.9 : 0.6) + 0.25; // のけぞっている間と、そのあと少しは、続けて当たらない（ハメ防止）
  const dmg = DAMAGE.attack[k.attackIndex] * NPC_DAMAGE;
  const dealt = t.isPlayer ? player.health.damage(dmg) : t.n.ctl.health.damage(dmg);
  const strong = atk.power > 1;
  const q = t.c;
  v1.set(q.group.position.x - (dx / len) * 0.05, q.group.position.y + q.height * 0.6, q.group.position.z - (dz / len) * 0.05);
  if (dealt > 0) fightHud.popDamage(v1, dealt, strong ? 'big' : '');
  forward.set(dx / len, 0, dz / len);
  sparks.burst(v1, forward, strong ? 16 : 9, q.height * (strong ? 0.07 : 0.055), q.height * 3.2);
  impact.flash(v1, q.height * (strong ? 2.2 : 1.5), strong ? 0.18 : 0.13);
  if (t.isPlayer) {
    hitStop = Math.max(hitStop, strong ? 0.1 : 0.05);
    fx.shake(strong ? 0.7 : 0.35);
    flashPlayer = 0.09;
  } else {
    t.n.flashT = 0.09;
  }
}
let flashPlayer = 0;
let flashPlayerOn = false;

function updateNpcs(dt, realDt) {
  const frozen = ultDirector.active; // 必殺技のムービー中は、相手以外の動きを止める
  player.grace = Math.max(0, (player.grace ?? 0) - dt);
  flashPlayer = Math.max(0, flashPlayer - realDt);
  for (const n of activeNpcs) {
    if (!n.alive) continue;
    const k = n.ctl;
    k.grace = Math.max(0, (k.grace ?? 0) - dt);
    n.flashT = Math.max(0, n.flashT - realDt);
    if (frozen && k !== dummy) continue;
    let cmd = NO_INPUT;
    if (mode === 'battle' && !matchOver && !n.dying) cmd = n.brain.think(n, enemiesOf(n), dt);
    k.update(dt, cmd);
    for (const e of k.events) onFoeEvent(n, e);
    k.events.length = 0;
    // 燃焼（擬音）: 今狙っていない相手の分は、ここで数える（狙っている相手の分は OnomDirector が数える）
    if (k !== dummy && k.status.has('burn') && foeAlive(n)) {
      n.burnAcc += dt;
      while (n.burnAcc >= 0.5) { n.burnAcc -= 0.5; damageNpc(n, DAMAGE.onomBurnTick); }
    } else n.burnAcc = 0;
  }
}

// 立っている相手は、狙っている人のほうを向く（気絶中は、ふらふらしたまま向き直らない）
function faceFoes(dt) {
  for (const n of activeNpcs) {
    if (!n.alive || n.dying) continue;
    const k = n.ctl;
    if (k.state !== 'ground' || k.status.has('stun')) continue;
    if (ultDirector.active && k !== dummy) continue;
    const tc = mode === 'battle' ? (n.brain.target?.c ?? p1) : p1;
    const want = Math.atan2(tc.group.position.x - n.c.group.position.x, tc.group.position.z - n.c.group.position.z);
    let diff = want - n.c.group.rotation.y;
    diff -= Math.PI * 2 * Math.round(diff / (Math.PI * 2));
    n.c.group.rotation.y += diff * (1 - Math.exp(-(mode === 'battle' ? 10 : 6) * dt));
  }
}

// キャラ同士はすり抜けない
function separateFighters() {
  // 自分は、掴み技などの最中はすり抜ける（今の相手との間だけ）
  const grappling = ((player.weaponId === 'fang' || player.weaponId === 'arrow' || player.weaponId === 'onom') && player.state.startsWith('bskill')) || player.state === 'finisher' || player.state === 'ult' || player.state === 'skill' || player.state === 'skill4' || dummy.state === 'launched' || dummy.state === 'held' || dummy.state === 'thrown' || dummy.state === 'down';
  const bodies = [{ c: p1, k: player, isP: true }];
  for (const n of activeNpcs) if (n.alive && !n.dying) bodies.push({ c: n.c, k: n.ctl, n });
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]; const b = bodies[j];
      const minDist = 0.36 * (a.c.height + b.c.height) / 2;
      const sx = a.c.group.position.x - b.c.group.position.x;
      const sz = a.c.group.position.z - b.c.group.position.z;
      const sep = Math.hypot(sx, sz);
      if (sep >= minDist || sep <= 1e-6) continue;
      if (a.c.group.position.y >= b.c.height || b.c.group.position.y >= a.c.height) continue; // 飛び越える
      if (NPC_BUSY.has(b.k.state) || (!a.isP && NPC_BUSY.has(a.k.state))) continue;
      if (a.isP && b.n.ctl === dummy && grappling) continue;
      if (a.isP && player.state === 'ult') continue;
      const nx = sx / sep; const nz = sz / sep;
      if (a.isP && mode === 'practice') {
        // 練習: 相手は動かない。自分を外へ押し出す
        a.c.group.position.x = b.c.group.position.x + nx * minDist;
        a.c.group.position.z = b.c.group.position.z + nz * minDist;
      } else {
        const push = (minDist - sep) / 2;
        a.c.group.position.x += nx * push; a.c.group.position.z += nz * push;
        b.c.group.position.x -= nx * push; b.c.group.position.z -= nz * push;
      }
      if (a.isP) {
        // 相手に向かう分の速度は消す（押し付けたまま走り続けない）
        const into = player.vx * sx + player.vz * sz;
        if (into < 0) { player.vx -= (into * sx) / (sep * sep); player.vz -= (into * sz) / (sep * sep); }
      }
    }
  }
}

// ---- 脱落・勝敗 ----
function scanDeaths(realDt) {
  if (mode !== 'battle') return;
  const ultBusy = player.state === 'ult'; // 必殺技の最中は、終わってから脱落にする
  for (const n of activeNpcs) {
    if (!n.alive) continue;
    if (!n.dying) {
      if (n.ctl.health.ko && !ultBusy) beginDeath(n);
    } else {
      n.deathT += realDt;
      const st = n.ctl.state;
      if ((n.deathT > 1.6 && (!NPC_BUSY.has(st) || st === 'down')) || n.deathT > 4) { // 倒れたら、消える
        n.alive = false;
        n.c.group.visible = false; n.tag.visible = false;
        n.ctl.status.clear(); n.c.setFlash(0);
        refreshRemaining();
      }
    }
  }
  if (!matchOver) {
    if (player.health.ko) loseMatch();
    else if (activeNpcs.every((n) => !n.alive || n.dying)) winMatch();
  }
}
function beginDeath(n) {
  n.dying = true; n.deathT = 0;
  n.ctl.health.invulnerable = true;
  fightHud.showBanner('K.O.!', n.name);
  hitStop = Math.max(hitStop, 0.3);
  fx.shake(0.8);
  fx.zoom(-160);
  const st = n.ctl.state;
  if (st === 'ground' || st === 'hit' || st === 'down' || st === 'attack' || st === 'crouch' || st === 'land' || st === 'air' || st === 'airSlam') {
    n.ctl.launch(n.c.group.position.x - p1.group.position.x, n.c.group.position.z - p1.group.position.z, 60, 16);
  }
  n.ctl.status.apply('stun', 9);
  refreshRemaining();
}
function winMatch() {
  matchOver = 'win'; matchEndT = 0;
  fightHud.showBanner('YOU WIN!', '最後まで立っていた！');
}
function loseMatch() {
  matchOver = 'lose'; matchEndT = 0;
  player.health.invulnerable = true;
  fightHud.showBanner('K.O.!', 'YOU LOSE');
  hitStop = Math.max(hitStop, 0.35);
  fx.shake(1);
  fx.zoom(-200);
  let from = null; let bd = Infinity;
  for (const n of activeNpcs) { if (!n.alive) continue; const d = Math.hypot(n.c.group.position.x - p1.group.position.x, n.c.group.position.z - p1.group.position.z); if (d < bd) { bd = d; from = n; } }
  const st = player.state;
  if (from && (st === 'ground' || st === 'hit' || st === 'crouch' || st === 'land' || st === 'air' || st === 'attack')) {
    player.launch(p1.group.position.x - from.c.group.position.x, p1.group.position.z - from.c.group.position.z, 50, 14);
  }
}
// ムービーの最中は、相手以外の人と名前札を隠す（ムービーの舞台に、ほかの人が映り込まないように）
function syncBattleView() {
  const cine = ultDirector.active;
  for (const n of npcs) {
    n.c.group.visible = n.alive && (!cine || n.ctl === dummy);
    n.tag.visible = mode === 'battle' && n.alive && !cine;
  }
  youTag.visible = mode === 'battle' && !cine;
}
// 勝敗が決まったら、少ししてから結果（もう一度 / モード選択へ）を出す
function updateResult(realDt) {
  if (!matchOver || matchEndT < 0) return;
  matchEndT += realDt;
  if (matchEndT > 2.6) {
    matchEndT = -1;
    battleHud.showResult(matchOver === 'win', {
      retry: () => { setupMatch(matchCfg); fightHud.showBanner('READY', 'FIGHT!'); },
      menu: () => backToMenu(),
    });
  }
}

// ---- 試合前の武器選択 ----
// 選んだ武器は game.weapon に入る。今は「剣」だけ（ほかの武器はあとから追加する）
let started = false;
let weapon = getWeapon();
let lastWeapon = 'sword';
let pendingCfg = { mode: 'practice', players: 2 };
function onWeaponChosen(id) {
  weapon = getWeapon(id);
  lastWeapon = id;
  // 選んだ武器に切り替える: キャラの持ち物と、操作するコントローラ
  p1.setWeapon(id);
  player = id === 'bat' ? batPlayer : id === 'fang' ? fangPlayer : id === 'arrow' ? arrowPlayer : id === 'onom' ? onomPlayer : swordPlayer;
  ultDirector = id === 'bat' ? batUlt : id === 'fang' ? fangUlt : id === 'arrow' ? arrowUlt : id === 'onom' ? onomUlt : swordUlt;
  touch.setWeapon(id); // ボタンのアイコンを、武器に合わせる
  const hud = document.getElementById('hud');
  if (id === 'bat') hud.textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ（空中の攻撃はなし）　左クリック / J: 攻撃（横殴り→一回転→ボール）　T / G: 必殺技　K / E: スキル1（金属バット弾）→ 使用後はスキル3（ボール連打）　L / Q: スキル2（バット投げ）→ 使用後はスキル4（空中バット）　F: 立ち⇔構え　｜　右ドラッグ: 視点　ホイール: 距離';
  if (id === 'onom') hud.textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ（空中の攻撃はなし）　左クリック / J: 攻撃（ドン→グラグラ→メラメラ）　3段目を当てたあとの Space: コンボ（ドロドロ）　T / G: 必殺技（ドカン・ズドン・バンバン）　K / E: スキル1（ドカン）→ 使用後はスキル3（グルグル）　L / Q: スキル2（スー）→ 使用後はスキル4（ドキドキ）　F: 立ち⇔構え　｜　右ドラッグ: 視点　ホイール: 距離';
  if (id === 'arrow') hud.textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ（空中の攻撃はなし）　左クリック / J: 攻撃（加速パンチ→ダッシュ蹴り→押さえつけ連打）　3段目を当てたあとの Space: コンボ（地面を隆起）　T / G: 必殺技（前向き矢印）　K / E: スキル1（砲弾）→ 使用後はスキル3（加速ダッシュ）　L / Q: スキル2（高く飛んで叩きつけ）→ 使用後はスキル4（鈍足矢印）　F: 立ち⇔構え　｜　右ドラッグ: 視点　ホイール: 距離';
  if (id === 'fang') hud.textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ　左クリック / J: 攻撃（噛みつき→爪の薙ぎ払い→首に噛みつく）　ジャンプ中に攻撃: かぎ爪×3　T / G: 必殺技（赤い宝石）　K / E: スキル1（赤い斬撃・吸血）→ 使用後はスキル3（分身）　L / Q: スキル2（巨大蝙蝠の突進）→ 使用後はスキル4（足を蝙蝠にして回転）　F: 立ち⇔構え　｜　右ドラッグ: 視点　ホイール: 距離';
  setupMatch(pendingCfg); // モードに合わせて、人数・位置・体力を整える
  started = true;
  document.body.classList.remove('pre-match');
  fightHud.showBanner('READY', 'FIGHT!');
  window.game.weapon = weapon;
}
// 流れ: スタート画面 → ロード → モード選択 → 武器選択 → 試合
let weaponSelect = null;
function openWeaponSelect() {
  weaponSelect = new WeaponSelect(onWeaponChosen, { hold: false, initial: lastWeapon });
}
let modeSelect = new ModeSelect((cfg) => { pendingCfg = cfg; openWeaponSelect(); }, { hold: true }); // スタート画面とロードのあとに出す
// 試合の結果から「モード選択へ」: 試合を止めて、モード選択へ戻る
function backToMenu() {
  started = false;
  document.body.classList.add('pre-match');
  setupMatch({ mode: 'practice', players: 2 }); // 後ろに映る舞台は、練習の配置
  battleHud.setRemaining(0, 0, false);
  modeSelect = new ModeSelect((cfg) => { pendingCfg = cfg; openWeaponSelect(); }, { hold: false });
}
// 試合前は、HP・ボタンなどの表示を隠す
document.body.classList.add('pre-match');

// ---- スタート画面とロード ----
// index.html の #boot（JS より先に出る）。「スタート」を押すと、ロード（すべての技の準備）が走り、終わると武器選択が出る。
// ロード: 後から作ると重くなるものを先に作り、すべての見た目（ステージ・ムービーの舞台・エフェクト）を一度描いて、
// シェーダーのコンパイルと、画像・形の転送を済ませておく。試合中に、初めての技を出しても止まらないようにするため。
const bootEl = document.getElementById('boot');
document.getElementById('ver').textContent = 'build: ' + BUILD;
const startBtn = document.getElementById('start-btn');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
function setLoad(p, msg) {
  const pct = Math.round(Math.min(1, Math.max(0, p)) * 100);
  document.getElementById('load-bar').style.width = pct + '%';
  document.getElementById('load-pct').textContent = pct + '%';
  if (msg) document.getElementById('load-msg').textContent = msg;
}
// root の舞台（null = 試合のステージ）を表示した状態で、すべてのものを（画面の外のものも）一度描く
function warmRender(root) {
  const cine = [batUlt.center.group, fangUlt.castle.group, arrowUlt.yard.group];
  const saved = [];
  // 光源は、そのまま（光源の数が変わると、シェーダーが別物になる。試合中と同じ数で作る）
  scene.traverse((o) => { saved.push([o, o.visible, o.frustumCulled]); if (!o.isLight) o.visible = true; o.frustumCulled = false; });
  for (const g of cine) g.visible = g === root;
  stage.group.visible = root === null;
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  for (const [o, vis, cul] of saved) { o.visible = vis; o.frustumCulled = cul; }
}
async function loadAll() {
  setLoad(0.02, 'キャラクターを準備しています');
  await nextFrame();
  fangPlayer.preload();                       // 分身・巨大蝙蝠・足の蝙蝠・赤い宝石
  preloadWords();                             // 擬音の文字の絵
  for (const t of allWordTextures()) renderer.initTexture(t);   // 画像を、先に GPU へ送っておく（初めて出るときに、止まらない）
  setLoad(0.18, 'エフェクトを準備しています');
  await nextFrame();
  const places = [['試合のステージ', null], ['バッティングセンター', batUlt.center.group], ['ドラキュラ城', fangUlt.castle.group], ['ゴミ処理場', arrowUlt.yard.group]];
  for (let i = 0; i < places.length; i++) {
    setLoad(0.25 + (0.7 * i) / places.length, places[i][0] + 'を読み込んでいます');
    await nextFrame();
    warmRender(places[i][1]);
    await nextFrame();
  }
  setLoad(1, '準備ができました');
  await nextFrame();
}
let booted = false;
function finishBoot() {
  if (booted) return;
  booted = true;
  bootEl.classList.add('out');
  setTimeout(() => bootEl.remove(), 600);
  modeSelect.show();
}
// 確認用: ロードを飛ばして、すぐ武器選択（game.start から）
function skipBoot() {
  if (booted) return;
  booted = true;
  bootEl.remove();
  modeSelect.show();
}
let bootStarted = false;
async function onBootStart() {
  if (bootStarted || booted) return;
  bootStarted = true;
  bootEl.classList.add('loading');
  try { await loadAll(); } catch (err) { console.error(err); }
  finishBoot();
}
startBtn.disabled = false;
startBtn.textContent = 'START';
startBtn.addEventListener('click', onBootStart);
bootEl.addEventListener('click', () => { if (!startBtn.disabled) onBootStart(); });
if (/[?&]skipboot\b/.test(location.search)) skipBoot();

// デバッグ用
window.game = {
  // 確認用: モード選択・武器選択を飛ばして試合を始める。start('sword') = 練習モード、start('sword', { mode: 'battle', players: 4 }) = バトルモード
  start: (id, cfg = {}) => { skipBoot(); if (cfg.mode) modeSelect.select(cfg.mode); if (cfg.players) modeSelect.setPlayers(cfg.players); modeSelect.confirm(); if (id) weaponSelect.select(id); weaponSelect.confirm(); },
  isStarted: () => started, weapon, fightHud, dealDamage, view, touch, stage, characters, npcs, camera, controls, scene, fx, createCharacter, follow: true, manual: false,
  get player() { return player; }, get ult() { return ultDirector; }, get dummy() { return dummy; }, get mode() { return mode; }, get matchOver() { return matchOver; }, get activeNpcs() { return activeNpcs; },
  setupMatch, battleHud,
};

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

  updateFoeChoice();
  const cmd = readCommand();
  player.update(dt, matchOver === 'lose' ? NO_INPUT : cmd);
  updateNpcs(dt, realDt);
  input.endFrame();
  // コンボ技を出せる間、ジャンプボタン（と PC の案内）を切り替える
  const canFinish = player.finisherWindow > 0 && player.canGrab();
  touch.setSpecial(canFinish);
  // スキル1のボタン: スキル1を使ったあとはスキル3に変わる（ため中は、ため具合を表示）
  // スキルボタンの表示。武器ごとに、「いま切り替わっているか」「使用中か」が違うので、コントローラの状態から決める
  // 剣以外の武器（バット・吸血牙）は、player.bs が今のスキルの進行状況。スキルの待ち時間は武器ごとに違う
  const own = player.weaponId !== 'sword';
  const bs = own ? player.bs?.n : 0;
  const cd1 = player.weaponId === 'onom' ? OSK1.cooldown : player.weaponId === 'arrow' ? ASK1.cooldown : player.weaponId === 'fang' ? FSK1.cooldown : player.weaponId === 'bat' ? BSKILL1.cooldown : SKILL1.cooldown;
  const cd2 = player.weaponId === 'onom' ? OSK2.cooldown : player.weaponId === 'arrow' ? ASK2.cooldown : player.weaponId === 'fang' ? FSK2.cooldown : player.weaponId === 'bat' ? BSKILL2.cooldown : SKILL2.cooldown;
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
  statusHud.label = mode === 'battle' ? (activeNpcs.find((n) => n.ctl === dummy)?.name ?? 'P2') : 'P2';
  statusHud.update(dummy.status);
  statusHudP1.update(player.status);
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

  separateFighters();
  faceFoes(dt);

  frameDt = dt;
  p1.update(dt, checkHit); // 姿勢を進めるたびに、その時点の刃の位置で当たり判定
  {
    const frozen = ultDirector.active;
    for (const n of activeNpcs) {
      if (!n.alive || (frozen && n.ctl !== dummy)) continue;
      n.c.update(dt, mode === 'battle' ? () => npcCheckHit(n) : undefined); // NPC も同じ。刃の位置で当たり判定
    }
  }
  scanDeaths(realDt);
  updateResult(realDt);
  syncBattleView();
  sparks.update(dt, camera, p1.height * 1.1);
  guard('batDirector', () => batDirector.update(dt));
  guard('fangDirector', () => fangDirector.update(dt));
  guard('arrowDirector', () => arrowDirector.update(dt));
  guard('onomDirector', () => onomDirector.update(dt));
  guard('batSwarm', () => batSwarm.update(dt, clock.elapsedTime));
  impact.update(realDt); // 閃光や衝撃波はヒットストップ中も動かす
  ultDirector.update(realDt);
  groundBreak.update(realDt);
  groundCracks.update(realDt);
  updateSkill2Charge(realDt);
  updateSkill3(dt, realDt);
  updateTether(clock.elapsedTime);
  flash = Math.max(0, flash - realDt);
  for (const n of activeNpcs) n.c.setFlash(n.ctl === dummy ? (flash > 0 ? 1 : 0) : (n.flashT > 0 ? 1 : 0));
  if (flashPlayer > 0 || flashPlayerOn) { flashPlayerOn = flashPlayer > 0; p1.setFlash(flashPlayerOn ? 1 : 0); } // 吸血牙の赤い光（setTint）を消さないよう、光らせた前後だけ呼ぶ

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
window.game.onom = onomDirector; window.game.renderer = renderer; window.game.arrow = arrowDirector; window.game.fang = fangDirector; window.game.swarm = batSwarm;
window.game.step = step; // manual=true のとき、外からコマ送りできる（動作確認用）

const clock = new THREE.Clock();
// 演出の更新で例外が出ても、そのコマの残り（描画まで）は続ける
function guard(label, fn) { try { fn(); } catch (err) { window.game.reportError?.(label, err); } }

// 1回のエラーで、ゲーム全体が止まらないように: three の描画ループは、コールバックが例外を出すと、次のコマを予約せず、
// 画面が最後のコマのまま固まる。例外は、画面の下に出して（タップで消える）、ゲームは動かし続ける。
const reported = new Set();
function reportRuntimeError(label, err) {
  console.error(label, err);
  const key = label + ':' + (err && err.message);
  if (reported.has(key)) return;
  reported.add(key);
  const box = document.getElementById('boot-error');
  if (!box) return;
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' / ') : '';
  box.hidden = false;
  box.style.pointerEvents = 'auto';
  box.textContent = '[' + BUILD + '] 実行中のエラー(' + label + '): ' + (err && err.message ? err.message : err) + (stack ? '  [' + stack + ']' : '') + '  （タップで閉じる）';
  box.onclick = () => { box.hidden = true; };
}
window.game.reportError = reportRuntimeError;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (window.game.manual) return;
  try {
    step(dt);
  } catch (err) {
    reportRuntimeError('step', err);
    try { renderer.render(scene, camera); } catch (e2) { /* 描けなくても、ループは止めない */ }
  }
});
