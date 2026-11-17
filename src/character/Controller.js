import * as THREE from 'three';
import { RIG } from './rig.js';
import { STAB_IMPACT } from './poses.js';
import { Health, Gauge } from './Health.js';

// 速さ・ジャンプの設定（単位は「リグ単位」= キャラの縮尺を掛ける前。身長が約5）
export const MOVE = {
  walkSpeed: 9.2,     // 毎秒
  runSpeed: 24,
  accel: 90,          // 加速
  decel: 120,         // 減速
  brakeDecel: 60,     // 走りから止まるときの減速（少し滑って止まる）
  airControl: 0.35,   // 空中での加減速の効き
  turnRate: 14,       // 向きを変える速さ
  // 歩き・走り1周期（2歩）で進む距離。足の運びを移動距離に合わせる。
  // 速さを上げた分は歩幅を広げて、足の回転が速くなりすぎないようにしている
  walkStride: 5.9,
  runStride: 13.5,
  jumpHeight: 4.2,     // 身長の約0.85倍
  gravity: 62,
  crouchTime: 0.09,   // 踏み切り前のため
  landTime: 0.16,     // 着地の沈み込み
};

// 連続攻撃。攻撃ボタンを押し続ける（または連打する）と 1 → 2 → 3 → 1 … と繰り返す。
//   duration: 全体の長さ（秒）
//   active  : 剣が当たる区間（モーションの進み具合 0〜1）
//   chain   : ここを過ぎたら次の攻撃へつなげられる
//   lunge   : 踏み込みで前へ進む区間と速さ（リグ単位/秒）
//   power   : 命中時の強さ（のけぞり・ヒットストップ・画面揺れに影響）
export const ATTACKS = [
  { anim: 'attack1', duration: 0.46, active: [0.36, 0.64], chain: 0.72, lunge: [0.28, 0.5, 10], power: 1 },
  { anim: 'attack2', duration: 0.44, active: [0.34, 0.64], chain: 0.72, lunge: [0.26, 0.5, 10], power: 1 },
  { anim: 'attack3', duration: 0.68, active: [0.5, 0.71], chain: 0.86, lunge: [0.24, 0.58, 14], power: 2 },
];
// 必殺技を当てられる相手の状態。立っているときだけでなく、攻撃・ジャンプの最中でも、必殺技は当たる（通信対戦・NPC は、動き回っているため）
export const ULT_TARGET_STATES = new Set(['ground', 'hit', 'down', 'attack', 'crouch', 'air', 'land']);
export const IDEAL_RANGE = 4.9; // 踏み込みで詰める間合い（リグ単位）。これより近づかない
// 空中攻撃（叩きつけ）。ジャンプ中に攻撃を押すと、前方斜め下へ一瞬で突っ込み、着地点のまわりを攻撃する
export const AIR_SLAM = {
  minHeight: 0.8,   // これより低いと出せない（リグ単位）
  windup: 0.05,     // 振りかぶる時間（秒）。ほぼ一瞬
  diveSpeed: 75,    // 落ちる速さ（リグ単位/秒）。一瞬で地面に届く
  forward: 6.5,     // 相手がいないとき、前方へ突っ込む距離（リグ単位）
  maxForward: 13,   // 相手へ向かって突っ込める最大距離
  stopShort: 3.2,   // 相手の手前これだけの位置に着地する
  radius: 14,       // 着地時の攻撃範囲の半径（リグ単位）
  cooldown: 0.8,    // 次に出せるようになるまでの秒数（着地から数える）
  reach: 2.2,       // 範囲の中心はキャラの前方これだけ先（剣が地面を叩く位置）
};
// コンボ技（掴み上げ）。通常攻撃の3段目を当てた直後、ジャンプボタンで出せる
export const FINISHER = {
  window: 1.0,      // 3段目の命中からこの秒数だけ受け付ける
  range: 12,        // 相手がこの距離以内なら掴める（リグ単位）
  holdDist: 2.1,    // 掴んでいる間の相手との間隔
  dash: 0.1,        // 相手の目の前まで詰める時間（秒）
  grip: 0.26,       // 胸ぐらを掴み、沈み込んで跳ぶ力をためる時間
  rise: 0.5,        // 持ち上げて跳ぶ時間
  height: 15,       // 跳び上がる高さ（リグ単位。身長の約3倍）
  throwTime: 0.32,  // 空中で振りかぶって投げ下ろす動きの長さ
  release: 0.17,    // そのうち、手を離す瞬間
  fall: 0.14,       // 相手が地面に届くまでの時間
  throwDist: 3.6,   // 相手を叩きつける地点（自分の真下から前方へ）
  pause: 0.14,      // 相手が地面に当たってから、剣で追撃に入るまでの間
};
// スキル1: 剣を振り回して投げ、刺さった相手を引き寄せ、両手で連打し、剣を引き抜いて蹴り飛ばす（全体で約5秒）
export const SKILL1 = {
  cooldown: 6,       // 次に使えるまでの秒数（終わってから数える）
  range: 45,         // この距離以内の相手を狙う（リグ単位）。いなければ前方へ投げて剣が戻ってくる
  spin: 0.3,         // 剣を振り回す時間（秒）
  throwTime: 0.28,   // 投げる動きの長さ
  release: 0.13,     // そのうち、手を離す瞬間
  flight: 0.26,      // 剣が相手に届くまでの時間
  stuck: 0.4,        // 刺さって相手がよろめく間
  pull: 0.7,         // 手をかざして引き寄せる時間
  holdDist: 2.7,     // 引き寄せた相手との間隔（拳が届く距離）
  flurry: 1.7,       // 連打の時間
  punchRate: 3.7,    // 1秒あたりの左右1往復の回数（= 毎秒 約7発）
  pullOut: 0.5,      // 剣を引き抜く動きの長さ
  kick: 0.6,         // 蹴りの動きの長さ
  kickHit: 0.42,     // そのうち、足が当たる瞬間（0〜1）
  missDist: 16,      // 相手がいないとき、剣が飛ぶ距離
  embed: 1.7,        // 刺さった剣の柄が、相手の胸からどれだけ手前にあるか
};
// スキル2: 剣を地面に突き刺して力を込め、地割れを起こして周囲を広く攻撃する
export const SKILL2 = {
  cooldown: 8,       // 次に使えるまでの秒数（終わってから数える）
  stab: 0.5,         // 跳び上がって突き刺し、押し込むまでの動きの長さ（秒）。刺さるのはその74%の時点
  charge: 0.4,       // 押し込んでから地割れが噴き上がるまでの時間
  hold: 0.4,         // 解放したあと、そのままの姿勢でいる時間
  pull: 0.5,         // 剣を引き抜いて立ち上がる時間
  radius: 24,        // 攻撃範囲の半径（リグ単位。叩きつけの約1.7倍）
  reach: 2.0,        // 範囲の中心はキャラの前方これだけ先（剣を刺した位置）
  stun: 4,           // 当てた相手に付ける気絶の秒数（吹き飛んでいる間も含む）
};
// 必殺技: ゲージがたまると使える。小剣を投げつけ、当たると画面が切り替わって、両手剣で縦横無尽に斬りまくる
export const ULT = {
  draw: 0.55,         // 左手から小剣を取り出す時間（秒）
  throwTime: 0.3,     // 投げる動きの長さ
  release: 0.5,       // そのうち、手を離す瞬間
  flight: 0.2,        // 小剣が相手に届くまで
  freeze: 0.34,       // 命中して、画面が切り替わるまでの間
  range: 220,         // この距離以内の相手に使える（リグ単位。闘技場の端から端まで届く）
  // ムービー中（ゲーム内の秒数）
  tSummon: 1.2,       // 小剣が消えて、両手剣を構え始める
  tBarrage: 2.35,     // 斬りまくりの開始
  slashes: 11,        // 斬撃の回数
  windup: 0.07, dash: 0.085, finish: 0.12, // 1回ぶん: 構え → 飛びかかり → 斬り抜けて止まる
  leapTime: 0.2, holdTime: 0.3, diveTime: 0.13, landTime: 0.95, // 締め: 跳び上がり → ため → 急降下 → 着地
  slowmo: 0.4,        // 締めのため中の時間の流れ
  center: { x: 0, y: 1.5, z: 0 },  // ムービーの舞台の中心（ワールド単位）。相手はここに浮かぶ
  radius: 3.2,        // 斬り抜ける線の長さ（中心から片側）
  playerX: -4.3,      // ムービー開始時の自分の位置（中心から）
};
// 斬り抜ける向き（横・縦・斜めを混ぜる）
const ULT_AXES = [
  [1, 0, 0.1], [0.1, 1, 0.2], [0.7, 0.3, -0.7], [-0.5, -0.55, 0.7], [0, 0, 1], [0.2, -1, 0.2],
  [-1, 0.4, 0.2], [0.6, 0.6, 0.5], [-0.3, 0.2, -1], [1, -0.3, 0.8], [-0.7, -0.2, -0.7],
];
// k 回目の斬撃の通り道（始点・終点・向き）。中心の少し手前から奥へ、体の違う場所を通る
export function ultPath(k) {
  const d = new THREE.Vector3(...ULT_AXES[k % ULT_AXES.length]).normalize();
  const C = ULT.center;
  let R = ULT.radius;
  if (Math.abs(d.y) > 0.01) R = Math.min(R, 1.05 / Math.abs(d.y)); // 高さが地面や天井にはみ出さないように
  const off = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar((((k * 7) % 5) - 2) * 0.09);
  const cy = C.y + (((k * 3) % 4) - 1.5) * 0.08;
  const mid = new THREE.Vector3(C.x, cy, C.z).add(off);
  return { d, mid, start: mid.clone().addScaledVector(d, -R), end: mid.clone().addScaledVector(d, R) };
}

// スキル4: スキル2を使ったあと、同じボタンがこれに変わる（使うとスキル2に戻る）。
// 剣を前へ向けて一瞬で飛びかかり、相手を遠くまで吹き飛ばす
export const SKILL4 = {
  aim: 0.28,         // 剣を前へ向けて構え、ためる時間（秒）
  dash: 0.09,        // 飛びかかる時間（ほぼ一瞬）
  hold: 0.34,        // 突きの姿勢で止まる時間
  recover: 0.4,      // 構え直す時間
  range: 70,         // この距離以内の相手へ飛びかかる（リグ単位）
  maxDash: 62,       // 一度に飛びかかれる最大距離
  noTarget: 32,      // 相手がいないときに進む距離
  stopShort: 3.4,    // 相手の手前これだけの位置で止まる
  reach: 7,          // 飛びかかったあと、この距離以内に相手がいれば命中
  launchSpeed: 82,   // 相手を吹き飛ばす水平の速さ（リグ単位/秒）。着地後に滑る分も合わせて約60離れる
  launchUp: 17,      // 吹き飛ばすときの上向きの速さ
};
// スキル3（ため斬り）: スキル1を使ったあと、同じボタンがこれに変わる。
// ボタンを押している間ためて、離すと飛ぶ斬撃を1つ。最後までためると自動で3つ放つ
export const SKILL3 = {
  maxCharge: 2,      // 最大までためるのにかかる秒数
  shotTime: 0.28,    // 斬撃1つを放つ動きの長さ（秒）
  speed: 110,        // 斬撃の飛ぶ速さ（リグ単位/秒）
  range: 138,        // 飛ぶ距離（初期の3倍）
  radius: 10.2,      // 当たり判定の半径（初期の3倍。ためるほど大きくなる）
  size: 3,           // 斬撃の見た目の大きさの倍率
  aimRange: 140,     // この距離以内の相手へ向き直る
};
export const AIM_ASSIST = { range: 11, angle: 1.1 }; // 近くの相手へ自動で向き直る範囲（リグ単位・ラジアン）

// スキル3で斬撃を放つときに使う振り。from〜to: 攻撃モーションのどこからどこまでを使うか、fire: 斬撃が飛び出す瞬間
const SHOTS = [
  { anim: 'attack1', from: 0.3, to: 0.8, fire: 0.5, time: 1 },    // 袈裟斬り
  { anim: 'attack2', from: 0.28, to: 0.8, fire: 0.5, time: 1 },   // 横薙ぎ
  { anim: 'attack3', from: 0.3, to: 0.85, fire: 0.58, time: 1.5 }, // 跳んで振り下ろす
];

const TWO_PI = Math.PI * 2;
// 気絶中は何も入力できない
const STUN_CMD = { x: 0, z: 0, run: false, jump: false, attack: false, skill: false, skillHold: false, skill2: false, toggleStance: false };
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _Z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const angleDiff = (a, b) => { const d = a - b; return d - TWO_PI * Math.round(d / TWO_PI); };

/**
 * キャラの移動・ジャンプと、それに合わせたモーション切り替え。
 * command = { x, z（ワールドでの進みたい向き。長さ0〜1）, run, jump, attack（押している間 true）, skill（押した瞬間）, toggleStance }
 */
export class CharacterController {
  constructor(character, { bounds } = {}) {
    this.c = character;
    this.bounds = bounds;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    // 自分の行動: 'ground' | 'crouch' | 'air' | 'land' | 'attack' | 'airSlam' | 'finisher' | 'hit'
    // 掴み技を受けている間: 'held'（掴まれている）| 'thrown'（投げ落とされている）| 'down'（倒れている）
    this.state = 'ground';
    this.timer = 0;
    this.idle = 'stand';   // 止まっているときのポーズ: 'stand' | 'fight'
    this.jumpBuffer = 0;
    this.prevAttack = false;  // 前フレームに攻撃が押されていたか（押した瞬間の検出用）
    this.slamT = 0;
    this.slamVx = 0;
    this.slamVz = 0;
    this.slamCooldown = 0;    // 叩きつけを次に出せるまでの残り秒数
    this.victim = null;       // 掴み技の相手（CharacterController）
    this.finisherWindow = 0;  // 掴み技を出せる残り秒数（3段目を当てると入る）
    this.finisherSlam = false; // 今の叩きつけが掴み技の締めか（威力が上がる）
    this.fin = null;          // 掴み技の進行状況
    this.downTimer = 0;
    this.skillCooldown = 0;   // スキル1を次に使えるまでの残り秒数
    this.sk = null;           // スキル1の進行状況
    this.tether = null;       // 引き寄せ中の光の綱 { from, to }（描画用）
    this.skill2Cooldown = 0;  // スキル2を次に使えるまでの残り秒数
    this.skill4Ready = false; // スキル2のボタンがスキル4に変わっているか（スキル2を使い終えると true）
    this.s4 = null;           // スキル4の進行状況
    this.status = character.status; // 状態異常（気絶など）
    this.attacks = ATTACKS;         // 通常攻撃のテーブル（武器ごとに差し替える）
    this.weaponId = 'sword';
    this.health = new Health();     // HP
    this.gauge = new Gauge();       // 必殺技ゲージ
    this.ult = null;                // 必殺技の進行状況
    this.skill3Ready = false; // スキル1のボタンがスキル3に変わっているか（スキル1を使うと true）
    this.s3 = null;           // スキル3の進行状況 { phase, t, charge, count, shot }
    this.s2 = null;           // スキル2の進行状況 { phase, t, charge, x, z }

    this.target = null;       // 攻撃時に自動で向く相手（Character）
    this.attackIndex = 0;     // 今出している攻撃の番号
    this.attackT = 0;         // その攻撃の進み具合 0 → 1
    this.attackActive = false; // 剣が当たる区間か
    this.hitDone = false;     // この一振りで既に当てたか
    this.aimYaw = 0;
    this.hitDuration = 0.4;
    this.events = [];         // { type: 'attackStart' | 'swing', index } 演出用。毎フレーム読む側が空にする
  }

  startAttack(index, cmd) {
    const { group, animator } = this.c;
    this.state = 'attack';
    this.attackIndex = index;
    this.attackT = 0;
    this.attackActive = false;
    this.hitDone = false;
    this.tossed = false;
    animator.attackT = 0;
    animator.play(this.attacks[index].anim, index === 0 ? 0.08 : 0.1);

    // 向き: 移動しながらのときは、今キャラが向いている方向で斬る（向きを変えたり、相手へ吸い付いたりしない）。
    // 止まっているときだけ、近くに相手がいればそちらを優先して向き直る
    this.aimYaw = group.rotation.y;
    if (Math.hypot(cmd.x, cmd.z) <= 0.01 && this.target) {
      const dx = this.target.group.position.x - group.position.x;
      const dz = this.target.group.position.z - group.position.z;
      const yaw = Math.atan2(dx, dz);
      if (Math.hypot(dx, dz) < AIM_ASSIST.range * this.c.scale && Math.abs(angleDiff(yaw, this.aimYaw)) < AIM_ASSIST.angle) {
        this.aimYaw = yaw;
      }
    }
    this.events.push({ type: 'attackStart', index });
  }

  // 空中攻撃（叩きつけ）を始める。inputYaw: 入力している向き（なければ null）
  startAirSlam(inputYaw) {
    const { group, animator, scale: S } = this.c;
    this.state = 'airSlam';
    this.slamT = 0;
    this.vy = 0;
    // 向き: 入力があればその方向。近くに相手がいればそちらを優先し、その手前に着地する
    if (inputYaw != null) group.rotation.y = inputYaw;
    let forwardDist = AIR_SLAM.forward * S;
    if (this.target) {
      const dx = this.target.group.position.x - group.position.x;
      const dz = this.target.group.position.z - group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < (AIR_SLAM.maxForward + AIR_SLAM.stopShort) * S) {
        group.rotation.y = Math.atan2(dx, dz);
        forwardDist = Math.max(0, d - AIR_SLAM.stopShort * S);
      }
    }
    // 地面に届くまでの時間で、ちょうど forwardDist 進む速さ
    const fall = Math.max(0.05, group.position.y / (AIR_SLAM.diveSpeed * S));
    this.slamVx = (Math.sin(group.rotation.y) * forwardDist) / fall;
    this.slamVz = (Math.cos(group.rotation.y) * forwardDist) / fall;
    animator.attackT = 0;
    animator.play('airSlam', 0.06);
    this.events.push({ type: 'airSlamStart', index: 2 });
  }

  // ============================================================
  // 吹き飛ばし（遠くまで飛んで、倒れて滑る）
  // ============================================================
  // 闘技場の壁に当たったら位置を戻して速度を消す。当たったら true
  slamIntoWall() {
    if (!this.bounds) return false;
    const { group, scale: S } = this.c;
    const r = 0.5 * S * RIG.chest[0];
    const b = this.bounds;
    const cx = Math.min(b.maxX - r, Math.max(b.minX + r, group.position.x));
    const cz = Math.min(b.maxZ - r, Math.max(b.minZ + r, group.position.z));
    const hit = cx !== group.position.x || cz !== group.position.z;
    if (hit) {
      const speed = Math.hypot(this.vx, this.vz) / S;
      group.position.x = cx;
      group.position.z = cz;
      if (speed > 12) this.events.push({ type: 'wallSlam', x: cx, z: cz, speed });
      this.vx = this.vz = 0;
    }
    return hit;
  }

  // (dx, dz) の向きへ、speed（リグ単位/秒）で up の高さへ打ち上げる
  launch(dx, dz, speed, up) {
    const { group, animator, scale: S } = this.c;
    const len = Math.hypot(dx, dz) || 1;
    this.vx = (dx / len) * speed * S;
    this.vz = (dz / len) * speed * S;
    this.vy = up * S;
    if (this.s4) { this.s4 = null; this.skill4Ready = false; }
    if (this.s3) { this.s3 = null; this.skill3Ready = false; }
    if (this.s2) { this.s2 = null; this.skill2Cooldown = SKILL2.cooldown; this.events.push({ type: 'skill2Cancel' }); }
    this.state = 'launched';
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    group.position.y = Math.max(group.position.y, 0.02 * S);
    group.rotation.y = Math.atan2(-dx, -dz); // 攻撃してきた方を向いたまま、背中から飛ぶ
    animator.play('thrown', 0.05);
    this.events.push({ type: 'launched' });
  }

  updateLaunched(dt) {
    const { group, animator, scale: S } = this.c;
    this.vy -= MOVE.gravity * S * dt;
    const drag = Math.exp(-0.6 * dt);
    this.vx *= drag;
    this.vz *= drag;
    group.position.x += this.vx * dt;
    group.position.z += this.vz * dt;
    group.position.y += this.vy * dt;
    group.rotation.x += (-1.2 - group.rotation.x) * (1 - Math.exp(-11 * dt)); // 背中をそらして飛ぶ
    this.slamIntoWall();
    if (group.position.y <= 0 && this.vy < 0) {
      group.position.y = 0;
      this.vy = 0;
      this.vx *= 0.75;
      this.vz *= 0.75;
      group.rotation.x = -Math.PI / 2;
      this.state = 'down';
      this.downTimer = 1.4;
      animator.play('down', 0.05);
      this.events.push({ type: 'launchLand', x: group.position.x, z: group.position.z, speed: Math.hypot(this.vx, this.vz) / S });
    }
  }

  // ============================================================
  // スキル4: 剣を前へ向けて一瞬で飛びかかり、相手を遠くまで吹き飛ばす
  // ============================================================
  startSkill4() {
    const { group, animator, scale: S } = this.c;
    const v = this.victim;
    let hasTarget = false;
    if (v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down')) {
      const dx = v.c.group.position.x - group.position.x;
      const dz = v.c.group.position.z - group.position.z;
      hasTarget = Math.hypot(dx, dz) < SKILL4.range * S;
    }
    this.s4 = { phase: 'aim', t: 0, hasTarget, dirX: Math.sin(group.rotation.y), dirZ: Math.cos(group.rotation.y), fromX: 0, fromZ: 0, toX: 0, toZ: 0, hitDone: false };
    this.state = 'skill4';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('lungeAim', 0.1);
    this.events.push({ type: 'skill4Start' });
  }

  updateSkill4(dt) {
    const { group, animator, scale: S } = this.c;
    const K = SKILL4;
    const k = this.s4;
    const v = this.victim;
    k.t += dt;

    if (k.phase === 'aim') {
      // 構えている間も相手を狙い続ける
      if (k.hasTarget) {
        const dx = v.c.group.position.x - group.position.x;
        const dz = v.c.group.position.z - group.position.z;
        const d = Math.hypot(dx, dz) || 1;
        k.dirX = dx / d;
        k.dirZ = dz / d;
      }
      group.rotation.y += angleDiff(Math.atan2(k.dirX, k.dirZ), group.rotation.y) * (1 - Math.exp(-18 * dt));
      animator.attackT = Math.min(1, k.t / K.aim);
      if (k.t >= K.aim) {
        // 飛びかかる距離を決める: 相手がいれば、その手前まで。いなければ前方へ
        let len = K.noTarget * S;
        if (k.hasTarget) {
          const dx = v.c.group.position.x - group.position.x;
          const dz = v.c.group.position.z - group.position.z;
          len = Math.min(K.maxDash * S, Math.max(0, Math.hypot(dx, dz) - K.stopShort * S));
        }
        k.fromX = group.position.x;
        k.fromZ = group.position.z;
        k.toX = k.fromX + k.dirX * len;
        k.toZ = k.fromZ + k.dirZ * len;
        if (this.bounds) {
          const b = this.bounds;
          k.toX = Math.min(b.maxX - 0.2, Math.max(b.minX + 0.2, k.toX));
          k.toZ = Math.min(b.maxZ - 0.2, Math.max(b.minZ + 0.2, k.toZ));
        }
        k.phase = 'dash';
        k.t = 0;
        animator.attackT = 0;
        animator.trailOn = true;
        animator.play('lungeDash', 0.03);
        this.events.push({ type: 'skill4Dash', fromX: k.fromX, fromZ: k.fromZ, toX: k.toX, toZ: k.toZ });
      }
    } else if (k.phase === 'dash') {
      const f = Math.min(1, k.t / K.dash);
      const e = 1 - (1 - f) * (1 - f); // 飛び出しは速く、着く直前に少し緩む
      group.position.x = k.fromX + (k.toX - k.fromX) * e;
      group.position.z = k.fromZ + (k.toZ - k.fromZ) * e;
      if (f >= 1) {
        k.phase = 'hold';
        k.t = 0;
        animator.attackT = 0;
        animator.play('lungeStrike', 0.03);
        // 命中: 目の前に相手がいれば、遠くまで吹き飛ばす
        const hittable = v && (v.state === 'ground' || v.state === 'hit' || v.state === 'down');
        if (hittable) {
          const dx = v.c.group.position.x - group.position.x;
          const dz = v.c.group.position.z - group.position.z;
          if (Math.hypot(dx, dz) < K.reach * S) {
            k.hitDone = true;
            const d = Math.hypot(dx, dz) || 1;
            v.launch(dx / d, dz / d, K.launchSpeed, K.launchUp);
            this.events.push({ type: 'skill4Hit', dirX: dx / d, dirZ: dz / d });
          }
        }
      }
    } else if (k.phase === 'hold') {
      animator.trailOn = k.t < 0.12;
      if (k.t >= K.hold) {
        k.phase = 'recover';
        k.t = 0;
        animator.trailOn = false;
      }
    } else if (k.phase === 'recover') {
      animator.attackT = Math.min(1, k.t / K.recover);
      if (k.t >= K.recover) {
        this.s4 = null;
        this.state = 'ground';
        this.skill4Ready = false; // スキル2のボタンに戻る（クールタイムはスキル2を使い終えたときから進んでいる）
      }
    }
  }

  // ============================================================
  // スキル3: ため斬り（押している間ためる → 離すと斬撃1つ / 最大までためると3つ）
  // ============================================================
  startSkill3() {
    const { animator } = this.c;
    this.s3 = { phase: 'charge', t: 0, charge: 0, count: 0, shot: 0, fired: false, full: false };
    this.state = 'skill3';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('chargeStance', 0.16);
    this.events.push({ type: 'skill3Start' });
  }

  updateSkill3(dt, cmd) {
    const { group, animator, scale: S } = this.c;
    const K = SKILL3;
    const k = this.s3;
    k.t += dt;

    // 向き: 近くに相手がいればそちらへ。いなければ入力した方向へ向き直れる
    let aim = Math.hypot(cmd.x, cmd.z) > 0.01 ? Math.atan2(cmd.x, cmd.z) : group.rotation.y;
    if (this.target) {
      const dx = this.target.group.position.x - group.position.x;
      const dz = this.target.group.position.z - group.position.z;
      if (Math.hypot(dx, dz) < K.aimRange * S) aim = Math.atan2(dx, dz);
    }
    group.rotation.y += angleDiff(aim, group.rotation.y) * (1 - Math.exp(-10 * dt));

    if (k.phase === 'charge') {
      k.charge = Math.min(1, k.t / K.maxCharge);
      animator.attackT = k.charge;
      if (k.charge >= 1 && !k.full) { k.full = true; this.events.push({ type: 'skill3Full' }); }
      if (!cmd.skillHold || k.charge >= 1) {
        // 離した（または最大までたまった）: 斬撃を放つ
        k.phase = 'release';
        k.count = k.charge >= 1 ? 3 : 1;
        k.shot = 0;
        k.t = 0;
        k.fired = false;
        this.skill3Ready = false; // ボタンはスキル1に戻る
        animator.attackT = SHOTS[0].from;
        animator.play(SHOTS[0].anim, 0.07);
      }
    } else {
      // 斬撃を放つ動き: 通常攻撃の振りを、振りかぶりを省いて素早く使う
      const sh = SHOTS[k.shot];
      const f = Math.min(1, k.t / (K.shotTime * sh.time));
      animator.attackT = sh.from + (sh.to - sh.from) * f;
      animator.trailOn = animator.attackT < sh.fire + 0.15;
      if (!k.fired && animator.attackT >= sh.fire) {
        k.fired = true;
        this.events.push({ type: 'skill3Shot', index: k.shot, count: k.count, charge: k.charge, last: k.shot === k.count - 1 });
      }
      if (f >= 1) {
        animator.trailOn = false;
        if (k.shot < k.count - 1) {
          k.shot++;
          k.t = 0;
          k.fired = false;
          animator.attackT = SHOTS[k.shot].from;
          animator.play(SHOTS[k.shot].anim, 0.07);
        } else {
          this.s3 = null;
          this.state = 'ground';
        }
      }
    }
  }

  // ============================================================
  // 必殺技: 小剣を投げる → 命中で画面が切り替わる → 両手剣で縦横無尽に斬りまくる → 元の画面に戻る
  // ============================================================
  canUlt() {
    const v = this.victim;
    if (!this.c.sword || !this.gauge.full || !v) return false;
    if (!ULT_TARGET_STATES.has(v.state)) return false;
    const dx = v.c.group.position.x - this.c.group.position.x;
    const dz = v.c.group.position.z - this.c.group.position.z;
    return Math.hypot(dx, dz) < ULT.range * this.c.scale;
  }

  startUlt() {
    const { animator } = this.c;
    this.gauge.reset();
    this.ult = { phase: 'draw', t: 0, daggerShown: false, released: false, hit: false, fly: null, timeScale: 1, k: -1, kick: new THREE.Vector3(), saved: null };
    this.state = 'ult';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.play('ultDraw', 0.1);
    this.events.push({ type: 'ultStart' });
  }

  // 小剣を左手の元の位置に戻して消す
  resetDagger() {
    const { dagger, joints, scale } = this.c;
    joints.lWrist.add(dagger);
    dagger.position.set(0, -RIG.hand / 2, 0);
    dagger.quaternion.identity();
    dagger.scale.setScalar(0.55);
    dagger.visible = false;
  }

  updateUlt(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    u.t += dt;

    // 相手のほうを向く（投げる前まで）
    if (u.phase === 'draw' || u.phase === 'throw') {
      const dx = vg.position.x - group.position.x;
      const dz = vg.position.z - group.position.z;
      group.rotation.y += angleDiff(Math.atan2(dx, dz), group.rotation.y) * (1 - Math.exp(-14 * dt));
    }

    if (u.phase === 'draw') {
      animator.attackT = Math.min(1, u.t / ULT.draw);
      if (!u.daggerShown && animator.attackT >= 0.3) {
        u.daggerShown = true;
        this.c.dagger.visible = true; // 左手に小剣が現れる
        this.events.push({ type: 'ultDagger' });
      }
      if (u.t >= ULT.draw) { u.phase = 'throw'; u.t = 0; animator.attackT = 0; animator.play('ultThrow', 0.08); }
    } else if (u.phase === 'throw') {
      const f = Math.min(1, u.t / ULT.throwTime);
      animator.attackT = f;
      const dagger = this.c.dagger;
      if (!u.released && f >= ULT.release) {
        // 手を離す: 小剣をワールドへ移して、相手へ向けて飛ばす
        u.released = true;
        group.parent.attach(dagger);
        u.fly = { t: 0, from: dagger.position.clone() };
        this.events.push({ type: 'ultThrow' });
      }
      if (u.released && !u.hit) {
        u.fly.t += dt;
        const k = Math.min(1, u.fly.t / ULT.flight);
        // 狙う点: 相手の胸の正面（体の表面）。のけぞりなどで姿勢が変わっても、毎回同じ位置になるよう
        // 相手の向きと位置だけから決める（関節の位置は使わない）
        const chestH = 3.0 * S;
        _b.set(vg.position.x, vg.position.y + chestH, vg.position.z);
        _c.subVectors(_b, u.fly.from).setY(0).normalize(); // 飛んでくる水平の向き（P1 → 相手）
        u.fly.dir = u.fly.dir ?? _c.clone();
        const dirH = u.fly.dir;
        // 体の表面（胸の厚みの手前）で止まる。刃は水平。柄が手前、切っ先が胸へ向く
        _d.copy(_b).addScaledVector(dirH, -0.52 * S);
        _c.set(_d.x - u.fly.from.x, _d.y - u.fly.from.y, _d.z - u.fly.from.z);
        _a.copy(u.fly.from).addScaledVector(_c, k);
        // 飛んでいる間は縦に回転。着く直前には回転を止めて、水平な向きに揃える
        const spin = (1 - k) * (1 - k) * u.fly.t * 40;
        this.placeSword(_a, _c.x, _c.y, _c.z, spin, dagger);
        if (k >= 1) {
          // 命中: 胸の正面に水平に刺さる。向きは「相手→自分」の線に沿って固定（柄が自分の側）
          u.hit = true;
          u.phase = 'freeze';
          u.t = 0;
          u.stuckDir = dirH.clone();
          this.placeSword(_d, dirH.x, 0, dirH.z, 0, dagger);
          // 相手の体（関節ではなく、位置と向きだけの親）に付ける。のけぞりや揺れのポーズに引きずられず、毎回同じ位置に刺さる
          vg.attach(dagger);
          v.state = 'held';
          v.vx = v.vz = v.vy = 0;
          v.attackActive = false;
          v.c.animator.play('impaled', 0.05);
          v.c.animator.jolt = 1;
          this.events.push({ type: 'ultHit' });
        }
      }
    } else if (u.phase === 'freeze') {
      if (u.t >= ULT.freeze) this.startUltCine();
    } else if (u.phase === 'cine') {
      this.updateUltCine(dt);
    }
  }

  // 画面が切り替わる: 自分と相手を、ムービーの舞台へ移す
  startUltCine() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const C = ULT.center;
    u.saved = { px: group.position.x, pz: group.position.z, yaw: group.rotation.y, ex: vg.position.x, ez: vg.position.z, eyaw: vg.rotation.y };
    u.phase = 'cine';
    u.t = 0;
    u.k = -1;
    u.summoned = false;
    u.finalStart = false;
    u.finalFired = false;
    group.position.set(C.x + ULT.playerX, 0, C.z);
    group.rotation.set(0, Math.PI / 2, 0);
    vg.position.set(C.x, C.y - 0.5, C.z);
    vg.rotation.set(0, -Math.PI / 2, 0);
    animator.play('stand', 0.01);
    v.c.animator.play('impaled', 0.01);
    this.events.push({ type: 'ultCineStart', center: C });
  }

  updateUltCine(dt) {
    const { group, animator, scale: S } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const C = ULT.center;
    const T = u.t;
    const cyc = ULT.windup + ULT.dash + ULT.finish;
    const tFinal = ULT.tBarrage + ULT.slashes * cyc;

    // 相手は浮かんだまま。斬られるたびに押されて、すこしずつ回る
    u.kick.multiplyScalar(Math.exp(-9 * dt));
    const hover = C.y - 0.5 + 0.05 * Math.sin(T * 8);
    if (!u.finalFired) {
      vg.position.set(C.x + u.kick.x, hover + u.kick.y, C.z + u.kick.z);
      vg.rotation.x = 0.2 * Math.sin(T * 5.5) + u.kick.length() * 0.8;
    }

    if (T < ULT.tSummon) {
      // 導入: 相手の胸に小剣が刺さったまま。自分は離れた所に立っている
      animator.play('stand', 0.2);
    } else if (T < ULT.tBarrage) {
      if (!u.summoned) {
        u.summoned = true;
        this.c.dagger.visible = false;                 // 小剣は光になって消え、
        this.c.equip('great');                         // 両手剣が現れる
        animator.attackT = 0;
        animator.play('ultSummon', 0.05);
        v.c.animator.play('thrown', 0.2);
        this.events.push({ type: 'ultSummon' });
      }
      animator.attackT = (T - ULT.tSummon) / (ULT.tBarrage - ULT.tSummon);
    } else if (T < tFinal) {
      // 斬りまくり: 一瞬で別の場所へ移り、相手を通り抜けて斬る。縦・横・斜めに繰り返す
      const k = Math.floor((T - ULT.tBarrage) / cyc);
      const lu = T - ULT.tBarrage - k * cyc;
      const path = ultPath(k);
      if (k !== u.k) {
        u.k = k;
        u.fired = false;
        this.events.push({ type: 'ultBlink', from: group.position.clone(), to: path.start.clone(), k });
      }
      const heading = Math.atan2(path.d.x, path.d.z);
      const pitch = -Math.asin(THREE.MathUtils.clamp(path.d.y, -1, 1));
      group.rotation.y = heading;
      if (lu < ULT.windup) {
        group.position.copy(path.start);
        group.rotation.x = pitch;
        animator.trailOn = false;
        animator.play('ultWindup', 0.03);
      } else if (lu < ULT.windup + ULT.dash) {
        const f = (lu - ULT.windup) / ULT.dash;
        group.position.lerpVectors(path.start, path.end, f);
        group.rotation.x = pitch;
        animator.trailOn = true;
        animator.play('ultDash', 0.02);
        if (!u.fired && f >= 0.5) {
          u.fired = true;
          const side = k % 2 === 0 ? 1 : -1;
          v.c.animator.jolt = 1;
          v.c.animator.joltSide = side;
          u.kick.copy(path.d).multiplyScalar(0.4);
          vg.rotation.y += 0.6 * side;
          this.events.push({ type: 'ultSlash', k, d: path.d.clone(), mid: path.mid.clone(), start: path.start.clone(), end: path.end.clone() });
        }
      } else {
        group.position.copy(path.end);
        group.rotation.x += (0 - group.rotation.x) * (1 - Math.exp(-18 * dt));
        animator.trailOn = false;
        animator.play('ultFinish', 0.04);
      }
    } else {
      // 締め: 高く跳び上がり、ゆっくりため（スロー）、相手へ一気に急降下
      const Tf = T - tFinal;
      const holdEnd = ULT.leapTime + ULT.holdTime;
      const P0 = _a.set(C.x - 1.8, C.y + 2.2, C.z);
      const P1 = _b.set(C.x + 1.8, 0, C.z);
      if (!u.finalStart) {
        u.finalStart = true;
        u.timeScale = ULT.slowmo;
        group.rotation.set(0, Math.PI / 2, 0);
        animator.trailOn = false;
        animator.play('ultLeap', 0.04);
        this.events.push({ type: 'ultLeap' });
      }
      if (Tf < holdEnd) {
        group.position.set(P0.x, P0.y + 0.25 * Tf, P0.z);
        group.rotation.x += (0 - group.rotation.x) * (1 - Math.exp(-20 * dt));
      } else if (Tf < holdEnd + ULT.diveTime) {
        const f = (Tf - holdEnd) / ULT.diveTime;
        group.position.lerpVectors(_c.set(P0.x, P0.y + 0.25 * holdEnd, P0.z), P1, f);
        _d.subVectors(P1, P0).normalize();
        group.rotation.x = -Math.asin(_d.y);
        animator.trailOn = true;
        animator.play('ultDash', 0.02);
        if (!u.finalFired && f >= 0.5) {
          u.finalFired = true;
          u.timeScale = 1;
          // 相手は斜め下へ叩き落とされ、地面に倒れる
          vg.position.set(C.x + 0.5, 0.06, C.z);
          vg.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
          v.c.animator.play('down', 0.03);
          this.events.push({ type: 'ultFinal', pos: new THREE.Vector3(C.x + 0.4, 0, C.z), from: P0.clone(), to: P1.clone() });
        }
      } else {
        group.position.copy(P1);
        group.rotation.x += (0 - group.rotation.x) * (1 - Math.exp(-14 * dt));
        animator.trailOn = false;
        animator.play('ultLand', 0.05);
        if (Tf >= holdEnd + ULT.diveTime + ULT.landTime) this.endUlt();
      }
    }
  }

  // ムービーが終わる: 自分も相手も、元の画面の元の位置へ戻る
  endUlt() {
    const { group, animator } = this.c;
    const u = this.ult;
    const v = this.victim;
    const vg = v.c.group;
    const sv = u.saved;
    this.c.equip('normal');
    this.resetDagger();
    group.position.set(sv.px, 0, sv.pz);
    group.rotation.set(0, sv.yaw, 0);
    animator.trailOn = false;
    animator.play('stand', 0.01);
    this.state = 'ground';
    this.vx = this.vz = 0;
    // 相手は倒れた姿勢のまま、元の位置へ。しばらくして起き上がる
    vg.position.set(sv.ex, 0, sv.ez);
    vg.rotation.set(-Math.PI / 2, sv.eyaw, 0);
    v.state = 'down';
    v.downTimer = 1.5;
    v.vx = v.vz = v.vy = 0;
    v.c.animator.play('down', 0.01);
    v.c.animator.jolt = 0;
    this.ult = null;
    this.events.push({ type: 'ultCineEnd', saved: sv });
  }

  // ============================================================
  // スキル2: 剣を地面に突き刺す → 力を込める → 地割れで周囲を攻撃 → 引き抜く
  // ============================================================
  startSkill2() {
    const { group, animator, scale: S } = this.c;
    const h = group.rotation.y;
    this.s2 = {
      phase: 'stab', t: 0, charge: 0,
      x: group.position.x + Math.sin(h) * SKILL2.reach * S, // 剣を刺す位置 = 地割れの中心
      z: group.position.z + Math.cos(h) * SKILL2.reach * S,
    };
    this.state = 'skill2';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.attackT = 0;
    animator.jolt = 0;
    animator.play('groundStab', 0.1);
    this.events.push({ type: 'skill2Start' });
  }

  updateSkill2(dt) {
    const { animator } = this.c;
    const K = SKILL2;
    const k = this.s2;
    k.t += dt;
    if (k.phase === 'stab') {
      animator.attackT = Math.min(1, k.t / K.stab);
      animator.trailOn = animator.attackT > 0.55 && animator.attackT < STAB_IMPACT; // 突き下ろす間だけ軌跡
      if (!k.stabbed && animator.attackT >= STAB_IMPACT) {
        k.stabbed = true; // 刺さった瞬間。ここからひびが走り始める
        this.events.push({ type: 'skill2Stab' });
      }
      if (k.stabbed) k.charge = Math.min(1, (k.t - K.stab * STAB_IMPACT) / (K.stab * (1 - STAB_IMPACT) + K.charge));
      if (k.t >= K.stab) {
        k.phase = 'charge';
        k.t = 0;
        animator.trailOn = false;
        animator.attackT = k.charge;
        animator.play('stabCharge', 0.08);
      }
    } else if (k.phase === 'charge') {
      const pushIn = K.stab * (1 - STAB_IMPACT); // 押し込んでいる間から、ひびは伸び始めている
      k.charge = Math.min(1, (k.t + pushIn) / (K.charge + pushIn));
      animator.attackT = k.charge;
      if (k.t >= K.charge) {
        k.phase = 'hold';
        k.t = 0;
        animator.jolt = 1;
        this.events.push({ type: 'skill2Burst' });
      }
    } else if (k.phase === 'hold') {
      if (k.t >= K.hold) {
        k.phase = 'pull';
        k.t = 0;
        animator.attackT = 0;
        animator.play('stabPull', 0.12);
      }
    } else if (k.phase === 'pull') {
      animator.attackT = Math.min(1, k.t / K.pull);
      if (k.t >= K.pull) {
        this.s2 = null;
        this.state = 'ground';
        this.skill2Cooldown = K.cooldown;
        this.skill4Ready = true; // スキル2を使い終えたので、ボタンがスキル4に変わる
      }
    }
  }

  // ============================================================
  // スキル1: 剣投げ → 引き寄せ → 連打 → 引き抜き → 蹴り
  // ============================================================
  startSkill() {
    const { group, animator, scale: S } = this.c;
    const v = this.victim;
    let hasTarget = false;
    if (v && (v.state === 'ground' || v.state === 'hit')) {
      const dx = v.c.group.position.x - group.position.x;
      const dz = v.c.group.position.z - group.position.z;
      hasTarget = Math.hypot(dx, dz) < SKILL1.range * S;
    }
    this.sk = {
      phase: 'spin', t: 0, hasTarget, released: false, arrived: false, flyT: 0, flyFrom: new THREE.Vector3(),
      punches: 0, pulled: false, kicked: false, vFrom: new THREE.Vector3(), dirX: Math.sin(group.rotation.y), dirZ: Math.cos(group.rotation.y),
      home: null, // 剣を手に戻すための元の親と位置
    };
    this.state = 'skill';
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    animator.leanTarget = animator.bankTarget = 0;
    animator.spin = 0;
    animator.play('spinUp', 0.1);
    this.events.push({ type: 'skillStart' });
  }

  // 相手の胸の位置（ワールド）
  victimChest(out) {
    const vg = this.victim.c.group;
    return out.set(vg.position.x, vg.position.y + 3.3 * this.c.scale, vg.position.z);
  }

  // 手を離れた剣を、位置 pos に・刃を dir の向きへ向けて置く。roll: 縦回転の角度
  placeSword(pos, dirX, dirY, dirZ, roll, sword = this.c.sword) {
    sword.position.copy(pos);
    _dir.set(dirX, dirY, dirZ).normalize();
    sword.quaternion.setFromUnitVectors(_Z, _dir);
    if (roll) sword.quaternion.multiply(_q.setFromAxisAngle(_X, roll));
  }

  // 剣を手に戻す
  returnSword() {
    const sword = this.c.sword;
    const h = this.sk.home;
    if (!h) return;
    h.parent.add(sword);
    sword.position.copy(h.position);
    sword.quaternion.copy(h.quaternion);
    sword.scale.copy(h.scale);
    this.sk.home = null;
  }

  endSkill() {
    this.returnSword();
    this.tether = null;
    this.sk = null;
    this.state = 'ground';
    this.skillCooldown = SKILL1.cooldown;
    this.skill3Ready = true; // スキル1を使ったので、ボタンがスキル3に変わる
    const v = this.victim;
    if (v && v.state === 'held') { v.state = 'ground'; v.c.group.position.y = 0; }
  }

  updateSkill(dt) {
    const { group, animator, scale: S, sword } = this.c;
    const K = SKILL1;
    const k = this.sk;
    const v = this.victim;
    const vg = v ? v.c.group : null;
    k.t += dt;

    // 狙う向き: 相手がいれば常に相手へ（掴んでいる間も向き合う）
    if (k.hasTarget) {
      const dx = vg.position.x - group.position.x;
      const dz = vg.position.z - group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      k.dirX = dx / d;
      k.dirZ = dz / d;
      group.rotation.y += angleDiff(Math.atan2(dx, dz), group.rotation.y) * (1 - Math.exp(-16 * dt));
    }

    // ---- 手を離れた剣の動き ----
    if (k.released && !k.pulled) {
      if (!k.arrived) {
        // 飛んでいる: 縦に回転しながら一直線に
        k.flyT += dt;
        const f = Math.min(1, k.flyT / K.flight);
        if (k.hasTarget) {
          this.victimChest(_a).addScaledVector(_b.set(k.dirX, 0, k.dirZ), -K.embed * S);
        } else {
          _a.copy(k.flyFrom).addScaledVector(_b.set(k.dirX, 0, k.dirZ), K.missDist * S);
        }
        _c.lerpVectors(k.flyFrom, _a, f);
        this.placeSword(_c, k.dirX, 0, k.dirZ, f < 1 ? f * Math.PI * 6 : 0);
        if (f >= 1) {
          k.arrived = true;
          if (k.hasTarget) {
            // 刺さった
            k.phase = 'stuck';
            k.t = 0;
            v.state = 'held';
            v.vx = v.vz = v.vy = 0;
            vg.rotation.y = Math.atan2(-k.dirX, -k.dirZ);
            v.c.animator.jolt = 0;
            v.c.animator.play('impaled', 0.06);
            k.vFrom.copy(vg.position);
            this.events.push({ type: 'skillStick' });
          } else {
            k.phase = 'recall';
            k.t = 0;
            k.flyFrom.copy(sword.position);
          }
        }
      } else if (k.hasTarget) {
        // 刺さっている: 相手の胸に付いて動く（殴られるたびに少し揺れる）
        const j = v.c.animator.jolt;
        this.victimChest(_a).addScaledVector(_b.set(k.dirX, 0, k.dirZ), -(K.embed - 0.25 * j) * S);
        this.placeSword(_a, k.dirX, -0.08 + 0.1 * j, k.dirZ, 0);
      }
    }

    switch (k.phase) {
      case 'spin': {
        // 剣を頭上で振り回す。だんだん速く
        const f = Math.min(1, k.t / K.spin);
        animator.spin += (22 + 26 * f) * dt;
        animator.trailOn = f > 0.1;
        if (f >= 1) {
          k.phase = 'throw';
          k.t = 0;
          animator.attackT = 0;
          animator.play('throwSword', 0.12);
        }
        break;
      }
      case 'throw':
      case 'stuck': {
        if (k.phase === 'throw') {
          animator.attackT = Math.min(1, k.t / K.throwTime);
          if (!k.released && k.t >= K.release) {
            // 手を離す: 剣を手から切り離して、ワールドに置く
            k.released = true;
            animator.trailOn = false;
            k.home = { parent: sword.parent, position: sword.position.clone(), quaternion: sword.quaternion.clone(), scale: sword.scale.clone() };
            group.parent.attach(sword);
            k.flyFrom.copy(sword.position);
            this.events.push({ type: 'skillThrow' });
          }
        } else {
          // よろめいて少し後ずさる
          const f = Math.min(1, k.t / K.stuck);
          vg.position.x = k.vFrom.x + k.dirX * 0.9 * S * (1 - (1 - f) * (1 - f));
          vg.position.z = k.vFrom.z + k.dirZ * 0.9 * S * (1 - (1 - f) * (1 - f));
          if (f >= 1) {
            k.phase = 'pull';
            k.t = 0;
            k.vFrom.copy(vg.position);
            animator.attackT = 0;
            animator.play('beckon', 0.18);
            v.c.animator.play('dragged', 0.2);
            this.events.push({ type: 'skillPull' });
          }
        }
        break;
      }
      case 'recall': {
        // 外れた: 剣が回りながら手元へ戻る
        const f = Math.min(1, k.t / 0.45);
        this.c.joints.rWrist.getWorldPosition(_a);
        _c.lerpVectors(k.flyFrom, _a, f * f);
        this.placeSword(_c, -k.dirX, 0, -k.dirZ, f * Math.PI * 6);
        if (f >= 1) this.endSkill();
        break;
      }
      case 'pull': {
        // 手をかざして、剣ごと相手を引き寄せる。最初は手をかざす間があり、そこから加速して手元で減速
        const f = Math.min(1, k.t / K.pull);
        animator.attackT = f;
        const m = Math.max(0, (f - 0.22) / 0.78);
        const e = m * m * (3 - 2 * m);
        const toX = group.position.x + k.dirX * K.holdDist * S;
        const toZ = group.position.z + k.dirZ * K.holdDist * S;
        vg.position.set(
          k.vFrom.x + (toX - k.vFrom.x) * e,
          Math.sin(Math.PI * e) * 1.3 * S, // 宙を引きずられる
          k.vFrom.z + (toZ - k.vFrom.z) * e,
        );
        vg.rotation.x = 0.35 * Math.sin(Math.PI * e); // 胸から引っぱられて前のめり
        // 光の綱: かざした左手 → 剣の柄
        this.c.joints.lWrist.getWorldPosition(_a);
        this.tether = this.tether || { from: new THREE.Vector3(), to: new THREE.Vector3(), power: 0 };
        this.tether.from.copy(_a);
        this.tether.to.copy(sword.position);
        this.tether.power = Math.min(1, f / 0.2) * (f < 0.95 ? 1 : (1 - f) / 0.05);
        if (f >= 1) {
          vg.position.y = 0;
          vg.rotation.x = 0;
          this.tether = null;
          k.phase = 'flurry';
          k.t = 0;
          k.lastHalf = -1;
          animator.phase = 0;
          animator.play('flurry', 0.14);
          v.c.animator.play('pummeled', 0.12);
        }
        break;
      }
      case 'flurry': {
        // 両手で連打。打つたびに相手が弾かれ、2人とも少しずつ前へ押し込む
        const f = Math.min(1, k.t / K.flurry);
        const speedUp = 0.75 + 0.5 * f; // だんだん速く
        animator.phase += TWO_PI * K.punchRate * speedUp * dt;
        // 拳が伸びきる瞬間（位相が π/2, 3π/2 を通過）で1発
        const half = Math.floor((animator.phase - Math.PI / 2) / Math.PI);
        if (half > k.lastHalf && animator.fade >= 1) {
          k.lastHalf = half;
          k.punches++;
          const side = half % 2 === 0 ? 1 : -1; // 左拳が先
          v.c.animator.jolt = 1;
          v.c.animator.joltSide = side;
          this.events.push({ type: 'skillPunch', side, count: k.punches });
        }
        const push = 1.1 * S * dt;
        group.position.x += k.dirX * push;
        group.position.z += k.dirZ * push;
        vg.position.x = group.position.x + k.dirX * (K.holdDist + 0.25 * v.c.animator.jolt) * S;
        vg.position.z = group.position.z + k.dirZ * (K.holdDist + 0.25 * v.c.animator.jolt) * S;
        if (f >= 1) {
          k.phase = 'pullOut';
          k.t = 0;
          animator.attackT = 0;
          animator.play('pullOut', 0.16);
          v.c.animator.play('impaled', 0.2);
        }
        break;
      }
      case 'pullOut': {
        const f = Math.min(1, k.t / K.pullOut);
        animator.attackT = f;
        if (!k.pulled && f >= 0.55) {
          // 一気に引き抜く: 剣が手に戻り、相手は前へ引っぱられる
          k.pulled = true;
          this.returnSword();
          v.c.animator.jolt = 1;
          this.events.push({ type: 'skillPullOut' });
        }
        if (f >= 1) {
          k.phase = 'kick';
          k.t = 0;
          animator.attackT = 0;
          animator.play('kick', 0.14);
        }
        break;
      }
      case 'kick': {
        const f = Math.min(1, k.t / K.kick);
        animator.attackT = f;
        if (!k.kicked && f >= K.kickHit) {
          k.kicked = true;
          v.hit(k.dirX, k.dirZ, 3); // 吹き飛ばす
          this.events.push({ type: 'skillKick' });
        }
        if (f >= 1) this.endSkill();
        break;
      }
    }

    // 闘技場の外へは出ない
    if (this.bounds && vg && v.state === 'held') {
      const b = this.bounds;
      vg.position.x = Math.min(b.maxX - 0.2, Math.max(b.minX + 0.2, vg.position.x));
      vg.position.z = Math.min(b.maxZ - 0.2, Math.max(b.minZ + 0.2, vg.position.z));
    }
  }

  // ============================================================
  // コンボ技: 掴み上げ → 跳躍 → 投げ落とし → 剣で叩きつけ
  // ============================================================
  canGrab() {
    const v = this.victim;
    if (!v || !this.c.sword || this.c.group.position.y > 0.001) return false;
    if (v.state !== 'ground' && v.state !== 'hit') return false;
    const dx = v.c.group.position.x - this.c.group.position.x;
    const dz = v.c.group.position.z - this.c.group.position.z;
    return Math.hypot(dx, dz) < FINISHER.range * this.c.scale;
  }

  startFinisher() {
    const { group, animator, scale: S } = this.c;
    const v = this.victim;
    const vg = v.c.group;
    const dx = vg.position.x - group.position.x;
    const dz = vg.position.z - group.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d;
    const fz = dz / d;
    this.fin = {
      phase: 'dash', t: 0, fx, fz, released: false, crashed: false, crashT: 0,
      fromX: group.position.x, fromZ: group.position.z,
      // 相手の目の前（掴める間隔）まで詰める
      toX: vg.position.x - fx * FINISHER.holdDist * S, toZ: vg.position.z - fz * FINISHER.holdDist * S,
      throwFrom: null, throwTo: null, throwT: 0,
    };
    this.state = 'finisher';
    this.finisherWindow = 0;
    this.vx = this.vz = this.vy = 0;
    this.attackActive = false;
    animator.trailOn = false;
    group.rotation.y = Math.atan2(fx, fz);
    animator.play('grab', 0.06);

    v.state = 'held';
    v.vx = v.vz = v.vy = 0;
    v.attackActive = false;
    vg.rotation.y = Math.atan2(-fx, -fz); // 掴まれた側は相手の方を向く
    v.c.animator.play('struggle', 0.08);
    this.events.push({ type: 'finisherGrab' });
  }

  // 掴んでいる相手を、自分の左手の先（胸ぐらの高さ）に付けて動かす
  carryVictim(lift) {
    const { group, scale: S } = this.c;
    const vg = this.victim.c.group;
    const f = this.fin;
    vg.position.set(
      group.position.x + f.fx * FINISHER.holdDist * S,
      group.position.y + lift * S,
      group.position.z + f.fz * FINISHER.holdDist * S,
    );
    // もがいて体ごと暴れる
    const t = this.victim.c.animator.time;
    vg.rotation.x = 0.16 * Math.sin(t * 17);
    vg.rotation.z = 0.13 * Math.sin(t * 12.3 + 1);
  }

  updateFinisher(dt) {
    const { group, animator, scale: S } = this.c;
    const F = FINISHER;
    const f = this.fin;
    const v = this.victim;
    const vg = v.c.group;
    f.t += dt;

    if (f.phase === 'dash') {
      // 一瞬で間合いを詰めて掴む
      const k = Math.min(1, f.t / F.dash);
      group.position.x = f.fromX + (f.toX - f.fromX) * k;
      group.position.z = f.fromZ + (f.toZ - f.fromZ) * k;
      if (k >= 1) { f.phase = 'grip'; f.t = 0; this.events.push({ type: 'finisherGrip' }); }
    } else if (f.phase === 'grip') {
      // 胸ぐらを掴んで少し持ち上げる
      this.carryVictim(0.7 * Math.min(1, f.t / (F.grip * 0.5)));
      if (f.t >= F.grip * 0.35) animator.play('liftCrouch', 0.14); // 掴んだまま沈み込む
      if (f.t >= F.grip) {
        f.phase = 'rise';
        f.t = 0;
        animator.play('carry', 0.12);
        this.events.push({ type: 'finisherJump' });
      }
    } else if (f.phase === 'rise') {
      // 相手ごと高く跳び上がる（勢いよく飛び出して、頂点で止まる）
      const k = Math.min(1, f.t / F.rise);
      group.position.y = F.height * S * (1 - (1 - k) * (1 - k));
      this.carryVictim(0.7);
      if (k >= 1) {
        f.phase = 'throw';
        f.t = 0;
        animator.attackT = 0;
        animator.play('throw', 0.1);
      }
    } else if (f.phase === 'throw') {
      animator.attackT = Math.min(1, f.t / F.throwTime);
      if (!f.released) {
        this.carryVictim(0.7);
        if (f.t >= F.release) {
          // 手を離す: 相手は前方の地面へ一直線に落ちる
          f.released = true;
          f.throwFrom = vg.position.clone();
          f.throwTo = { x: group.position.x + f.fx * F.throwDist * S, z: group.position.z + f.fz * F.throwDist * S };
          if (this.bounds) {
            const b = this.bounds;
            f.throwTo.x = Math.min(b.maxX - 0.3, Math.max(b.minX + 0.3, f.throwTo.x));
            f.throwTo.z = Math.min(b.maxZ - 0.3, Math.max(b.minZ + 0.3, f.throwTo.z));
          }
          vg.rotation.z = 0;
          v.state = 'thrown';
          v.c.animator.play('thrown', 0.05);
          this.events.push({ type: 'finisherThrow' });
        }
      } else if (!f.crashed) {
        f.throwT += dt;
        const k = Math.min(1, f.throwT / F.fall);
        const lie = 0.4 * S; // 倒れたときの体の高さ
        vg.position.set(
          f.throwFrom.x + (f.throwTo.x - f.throwFrom.x) * k,
          f.throwFrom.y + (lie - f.throwFrom.y) * k * k,
          f.throwFrom.z + (f.throwTo.z - f.throwFrom.z) * k,
        );
        vg.rotation.x = -Math.PI / 2 * Math.min(1, k * 1.6); // 背中から落ちる
        if (k >= 1) {
          f.crashed = true;
          v.state = 'down';
          v.downTimer = 1.6;
          v.c.animator.play('down', 0.04);
          this.events.push({ type: 'finisherCrash', x: f.throwTo.x, z: f.throwTo.z });
        }
      } else {
        f.crashT += dt;
        if (f.crashT >= F.pause && f.t >= F.throwTime) {
          // 締め: 倒れた相手へ剣で叩きつける
          this.fin = null;
          this.finisherSlam = true;
          this.startAirSlam(null);
        }
      }
    }
  }

  // 攻撃を受けた: (dx, dz) の向きへ吹き飛び、のけぞる
  hit(dx, dz, power = 1) {
    const { group, animator, scale } = this.c;
    const len = Math.hypot(dx, dz) || 1;
    const speed = (power > 2 ? 24 : power > 1 ? 13 : 8) * scale;
    this.vx = (dx / len) * speed;
    this.vz = (dz / len) * speed;
    this.vy = 0;
    group.position.y = 0;
    if (this.s4) { this.s4 = null; this.skill4Ready = false; }
    if (this.s3) { this.s3 = null; this.skill3Ready = false; }
    if (this.s2) { this.s2 = null; this.skill2Cooldown = SKILL2.cooldown; this.events.push({ type: 'skill2Cancel' }); }
    this.state = 'hit';
    this.hitDuration = power > 2 ? 0.9 : power > 1 ? 0.6 : 0.4;
    this.attackActive = false;
    animator.trailOn = false;
    animator.hitT = 0;
    animator.play('hit', 0.04);
  }

  update(dt, cmd) {
    const { group, animator, scale } = this.c;
    const S = scale;
    this.status.update(dt);
    // 気絶中は、立っているだけの状態になり、入力は受け付けない
    if (this.status.has('stun') && this.state === 'ground') cmd = STUN_CMD;
    const moving = Math.hypot(cmd.x, cmd.z) > 0.01;
    const topSpeed = (cmd.run ? MOVE.runSpeed : MOVE.walkSpeed) * S * (this.status.has('slow') ? 0.5 : 1) * (this.status.has('haste') ? 1.5 : 1); // 鈍足: 移動速度 50% / 加速: 150%

    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.finisherWindow = Math.max(0, this.finisherWindow - dt);
    // 倒れた姿勢からは自然に起き上がる
    if (this.state !== 'held' && this.state !== 'thrown' && this.state !== 'down' && group.rotation.x !== 0) {
      group.rotation.x *= Math.exp(-9 * dt);
      group.rotation.z *= Math.exp(-9 * dt);
      if (Math.abs(group.rotation.x) < 0.01) { group.rotation.x = 0; group.rotation.z = 0; }
    }

    // 掴まれている・投げられている間は、相手側が位置と姿勢を動かす
    if (this.state === 'held' || this.state === 'thrown') return;
    if (this.state === 'launched') {
      this.updateLaunched(dt);
      return;
    }
    if (this.state === 'down') {
      this.downTimer -= dt;
      // 吹き飛ばされた勢いで、倒れたまま滑る
      if (Math.hypot(this.vx, this.vz) > 0.01) {
        const k = Math.exp(-4.5 * dt);
        this.vx *= k;
        this.vz *= k;
        group.position.x += this.vx * dt;
        group.position.z += this.vz * dt;
        this.slamIntoWall();
      }
      if (this.downTimer <= 0) { this.state = 'ground'; group.position.y = 0; this.vx = this.vz = 0; }
      return;
    }
    if (this.state === 'finisher') {
      this.updateFinisher(dt);
      return;
    }
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    if (this.state === 'skill') {
      this.updateSkill(dt);
      return;
    }
    this.skill2Cooldown = Math.max(0, this.skill2Cooldown - dt);
    if (this.state === 'skill2') {
      this.updateSkill2(dt);
      return;
    }
    if (this.state === 'skill3') {
      this.updateSkill3(dt, cmd);
      return;
    }
    if (this.state === 'skill4') {
      this.updateSkill4(dt);
      return;
    }
    if (this.state === 'ult') {
      this.updateUlt(dt);
      return;
    }
    // コンボ技: 3段目を当てた直後にジャンプを押すと、相手を掴み上げる
    if (cmd.jump && this.finisherWindow > 0 && this.canGrab()) {
      this.startFinisher();
      return;
    }

    if (cmd.toggleStance) {
      this.idle = this.idle === 'stand' ? 'fight' : 'stand';
    }
    this.jumpBuffer = cmd.jump ? 0.12 : Math.max(0, this.jumpBuffer - dt); // 着地直前の入力も拾う
    const attackPressed = cmd.attack && !this.prevAttack;
    this.prevAttack = cmd.attack;

    // ---- 水平移動 ----
    const control = this.state === 'air' ? MOVE.airControl : this.state === 'ground' || (this.state === 'attack' && moving) ? 1 : 0.5;
    let tx = moving ? cmd.x * topSpeed : 0;
    let tz = moving ? cmd.z * topSpeed : 0;
    const braking = !moving && animator.name === 'brake';
    let rate = (moving ? MOVE.accel : braking ? MOVE.brakeDecel : MOVE.decel) * S * control * dt;
    const pvx = this.vx;
    const pvz = this.vz;
    const pYaw = group.rotation.y;
    if (this.state === 'attack' && !moving) {
      // 止まって攻撃しているときだけ、踏み込みの区間で向いている方へ進む
      // （移動入力があるときは止まらず、そのまま歩き・走りの速さで動き続ける）
      const [from, to, lungeSpeed] = this.attacks[this.attackIndex].lunge;
      let v = this.attackT >= from && this.attackT <= to ? lungeSpeed * S : 0;
      // 正面に相手がいるときは、剣がちょうど届く間合いまで詰めて止まる（体が重ならない・空振りしにくい）
      if (this.target && v > 0) {
        const ddx = this.target.group.position.x - group.position.x;
        const ddz = this.target.group.position.z - group.position.z;
        const ahead = Math.sin(group.rotation.y) * ddx + Math.cos(group.rotation.y) * ddz;
        const dist = Math.hypot(ddx, ddz);
        if (ahead > 0 && dist < AIM_ASSIST.range * S) {
          // 斬る瞬間（踏み込みの終わり）にちょうど間合いへ着く速さ。離れていれば速く、近ければ止まる
          const gap = dist - IDEAL_RANGE * S;
          const remaining = Math.max(dt, (to - this.attackT) * this.attacks[this.attackIndex].duration);
          v = Math.max(0, Math.min(lungeSpeed * 2.6 * S, gap / remaining));
        }
      }
      tx = Math.sin(group.rotation.y) * v;
      tz = Math.cos(group.rotation.y) * v;
      rate = 160 * S * dt;
    } else if (this.state === 'airSlam') {
      // 振りかぶりの一瞬は止まり、そのあと前方斜め下へ一気に突っ込む
      const diving = this.slamT >= AIR_SLAM.windup;
      tx = diving ? this.slamVx : 0;
      tz = diving ? this.slamVz : 0;
      rate = 1e6;
    } else if (this.state === 'hit') {
      tx = 0;
      tz = 0;
      rate = 38 * S * dt; // 吹き飛びの減速
    }
    const dx = tx - this.vx;
    const dz = tz - this.vz;
    const dist = Math.hypot(dx, dz);
    if (dist <= rate) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / dist) * rate; this.vz += (dz / dist) * rate; }

    group.position.x += this.vx * dt;
    group.position.z += this.vz * dt;
    if (this.bounds) {
      const r = 0.5 * S * RIG.chest[0];
      const b = this.bounds;
      // 壁に当たったら、その向きの速度を消す（壁際で走り続けない）
      const cx = Math.min(b.maxX - r, Math.max(b.minX + r, group.position.x));
      const cz = Math.min(b.maxZ - r, Math.max(b.minZ + r, group.position.z));
      if (cx !== group.position.x) { group.position.x = cx; this.vx = 0; }
      if (cz !== group.position.z) { group.position.z = cz; this.vz = 0; }
    }

    // 進む向きへなめらかに振り向く（攻撃中は振りかぶりの間だけ、狙った向きへ素早く）
    if (this.state === 'attack' && !moving) {
      if (this.attackT < this.attacks[this.attackIndex].active[0]) {
        group.rotation.y += angleDiff(this.aimYaw, group.rotation.y) * (1 - Math.exp(-MOVE.turnRate * 2 * dt));
      }
    } else if (moving && this.state !== 'hit') {
      const want = Math.atan2(cmd.x, cmd.z);
      group.rotation.y += angleDiff(want, group.rotation.y) * (1 - Math.exp(-MOVE.turnRate * dt));
    }

    const speed = Math.hypot(this.vx, this.vz) / S; // リグ単位

    // 慣性の傾き: 地上で加速すると前のめり、減速するとのけぞり、曲がると内側へ倒れる
    if (this.state === 'ground' && dt > 0) {
      const fwdX = Math.sin(group.rotation.y);
      const fwdZ = Math.cos(group.rotation.y);
      const accel = ((this.vx - pvx) * fwdX + (this.vz - pvz) * fwdZ) / dt / S; // リグ単位/秒²
      animator.leanTarget = Math.max(-0.3, Math.min(0.3, accel / MOVE.accel * 0.26));
      const turn = angleDiff(group.rotation.y, pYaw) / dt;
      animator.bankTarget = Math.max(-0.28, Math.min(0.28, turn * 0.022 * Math.min(1, speed / MOVE.walkSpeed)));
    } else {
      animator.leanTarget = 0;
      animator.bankTarget = 0;
    }
    const running = speed > MOVE.walkSpeed * 1.25;
    // 移動しながらの通常攻撃: 下半身は歩き・走りのサイクルで動かす（足が滑って見えないように）
    animator.locoTarget = this.state === 'attack' && moving ? 1 : 0;
    animator.runTarget = running ? 1 : 0;

    // 歩き・走りの位相は進んだ距離に比例して進める
    const stride = running ? MOVE.runStride : MOVE.walkStride;
    animator.phase = (animator.phase + (TWO_PI * speed * dt) / stride) % TWO_PI;

    // ---- 状態ごとの処理 ----
    switch (this.state) {
      case 'ground': {
        if (this.status.has('stun')) {
          animator.play('stunned', 0.18); // 気絶: ふらふら立っている
        } else if (this.jumpBuffer > 0) {
          this.jumpBuffer = 0;
          this.state = 'crouch';
          this.timer = MOVE.crouchTime;
          animator.play('crouch', 0.07);
        } else if (cmd.ult && this.canUlt()) {
          this.startUlt();
        } else if (cmd.skill && this.c.sword && this.skill3Ready) {
          this.startSkill3();
        } else if (cmd.skill && this.c.sword && this.skillCooldown <= 0) {
          this.startSkill();
        } else if (cmd.skill2 && this.c.sword && this.skill4Ready) {
          this.startSkill4();
        } else if (cmd.skill2 && this.c.sword && this.skill2Cooldown <= 0) {
          this.startSkill2();
        } else if (cmd.attack && this.c.sword) {
          this.startAttack(0, cmd);
        } else if (!moving && speed > 0.4 && (animator.name === 'run' || animator.name === 'brake')) {
          // 走りから入力を離した: 足を突っ張って滑りながら止まる
          if (animator.name !== 'brake') this.events.push({ type: 'brake' });
          animator.play('brake', 0.1);
        } else if (speed > 0.4) {
          if (animator.name === 'stand' || animator.name === 'fight') animator.phase = 0; // 歩き出しは左足から
          animator.play(running ? 'run' : 'walk', animator.name === 'brake' ? 0.12 : 0.18);
        } else {
          // 立ちへ戻る。攻撃・着地・急停止のあとは、ゆっくり構え直して少し揺り戻す
          const from = animator.name;
          const recover = from.startsWith('attack') || from === 'land' || from === 'brake' || from === 'hit' || from === 'kick' || from === 'throwSword' || from === 'stabPull' || from === 'stunned' || from === 'lungeStrike';
          animator.play(this.idle, recover ? 0.38 : 0.22, recover);
        }
        break;
      }
      case 'crouch': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.vy = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight) * S;
          this.state = 'air';
          animator.airU = 1;
          animator.play('air', 0.09);
        }
        break;
      }
      case 'air': {
        this.vy -= MOVE.gravity * S * dt;
        group.position.y += this.vy * dt;
        const v0 = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight) * S;
        animator.airU = this.vy / v0;
        if (attackPressed && this.c.sword && this.slamCooldown <= 0 && group.position.y > AIR_SLAM.minHeight * S) {
          this.startAirSlam(moving ? Math.atan2(cmd.x, cmd.z) : null);
        } else if (group.position.y <= 0 && this.vy < 0) {
          group.position.y = 0;
          this.vy = 0;
          this.state = 'land';
          this.timer = moving ? MOVE.landTime * 0.6 : MOVE.landTime; // 走りながらなら素早く立て直す
          animator.play('land', 0.06);
        }
        break;
      }
      case 'airSlam': {
        this.slamT += dt;
        this.vy = this.slamT < AIR_SLAM.windup ? 0 : -AIR_SLAM.diveSpeed * S; // 一瞬止まってから、一気に落ちる
        group.position.y += this.vy * dt;
        animator.attackT = Math.min(1, this.slamT / (AIR_SLAM.windup + 0.04));
        animator.trailOn = this.slamT >= AIR_SLAM.windup;
        if (group.position.y <= 0) {
          group.position.y = 0;
          this.vy = 0;
          this.vx = 0;
          this.vz = 0;
          // 着地: 兜割りの「着地〜残心」へつなぐ（そのまま地上の連続斬りにも入れる）
          this.state = 'attack';
          this.attackIndex = 2;
          this.attackT = 0.72;
          this.attackActive = false;
          this.hitDone = true;
          this.aimYaw = group.rotation.y;
          animator.attackT = this.attackT;
          animator.trailOn = false;
          animator.play('attack3', 0.05);
          this.slamCooldown = AIR_SLAM.cooldown;
          this.events.push({ type: 'airSlamLand', index: 2 });
        }
        break;
      }
      case 'land': {
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'ground';
        break;
      }
      case 'attack': {
        const a = this.attacks[this.attackIndex];
        this.attackT += dt / a.duration;
        animator.attackT = Math.min(1, this.attackT);
        const active = this.attackT >= a.active[0] && this.attackT <= a.active[1];
        if (active && !this.attackActive) {
          this.events.push({ type: 'swing', index: this.attackIndex });
          if (a.ranged) this.events.push({ type: 'batBall', kind: 'normal', power: a.power }); // ボールを打つ攻撃: ここでボールが飛ぶ
        }
        if (a.tossAt !== undefined && !this.tossed && this.attackT >= a.tossAt) {
          this.tossed = true; // ボールを放り上げる（打つまでの秒数を知らせる）
          this.events.push({ type: 'batToss', time: (a.active[0] - a.tossAt) * a.duration });
        }
        if (!active && this.attackActive && a.power > 1) this.events.push({ type: 'slam', index: this.attackIndex }); // 兜割りの着地
        this.attackActive = active;
        // 軌跡は当たり判定より少し早く出し始めて、振り始めから弧が見えるようにする
        animator.trailOn = this.attackT >= a.active[0] - 0.08 && this.attackT <= a.active[1] + 0.03;
        if (this.attackT >= a.chain && cmd.attack) {
          this.startAttack((this.attackIndex + 1) % this.attacks.length, cmd); // 押し続けていれば次の斬撃へ
        } else if (this.attackT >= 1) {
          this.attackActive = false;
          animator.trailOn = false;
          this.state = 'ground';
        }
        break;
      }
      case 'hit': {
        animator.hitT = Math.min(1, animator.hitT + dt / this.hitDuration);
        if (animator.hitT >= 1) this.state = 'ground';
        break;
      }
    }
  }
}
