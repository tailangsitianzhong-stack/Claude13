import * as THREE from 'three';
import { RIG } from './rig.js';
import { STAB_IMPACT } from './poses.js';

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
};
// スキル3（ため斬り）: スキル1を使ったあと、同じボタンがこれに変わる。
// ボタンを押している間ためて、離すと飛ぶ斬撃を1つ。最後までためると自動で3つ放つ
export const SKILL3 = {
  maxCharge: 5,      // 最大までためるのにかかる秒数
  shotTime: 0.28,    // 斬撃1つを放つ動きの長さ（秒）
  speed: 62,         // 斬撃の飛ぶ速さ（リグ単位/秒）
  range: 46,         // 飛ぶ距離
  radius: 3.4,       // 当たり判定の半径（ためるほど大きくなる）
  aimRange: 50,      // この距離以内の相手へ向き直る
};
export const AIM_ASSIST = { range: 11, angle: 1.1 }; // 近くの相手へ自動で向き直る範囲（リグ単位・ラジアン）

// スキル3で斬撃を放つときに使う振り。from〜to: 攻撃モーションのどこからどこまでを使うか、fire: 斬撃が飛び出す瞬間
const SHOTS = [
  { anim: 'attack1', from: 0.3, to: 0.8, fire: 0.5, time: 1 },    // 袈裟斬り
  { anim: 'attack2', from: 0.28, to: 0.8, fire: 0.5, time: 1 },   // 横薙ぎ
  { anim: 'attack3', from: 0.3, to: 0.85, fire: 0.58, time: 1.5 }, // 跳んで振り下ろす
];

const TWO_PI = Math.PI * 2;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _Z = new THREE.Vector3(0, 0, 1);
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
    animator.attackT = 0;
    animator.play(ATTACKS[index].anim, index === 0 ? 0.08 : 0.1);

    // 向き: 入力があればその方向、なければ今の向き。近くに相手がいればそちらを優先
    this.aimYaw = Math.hypot(cmd.x, cmd.z) > 0.01 ? Math.atan2(cmd.x, cmd.z) : group.rotation.y;
    if (this.target) {
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
  placeSword(pos, dirX, dirY, dirZ, roll) {
    const sword = this.c.sword;
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
    const moving = Math.hypot(cmd.x, cmd.z) > 0.01;
    const topSpeed = (cmd.run ? MOVE.runSpeed : MOVE.walkSpeed) * S;

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
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) { this.state = 'ground'; group.position.y = 0; }
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
    const control = this.state === 'air' ? MOVE.airControl : this.state === 'ground' ? 1 : 0.5;
    let tx = moving ? cmd.x * topSpeed : 0;
    let tz = moving ? cmd.z * topSpeed : 0;
    const braking = !moving && animator.name === 'brake';
    let rate = (moving ? MOVE.accel : braking ? MOVE.brakeDecel : MOVE.decel) * S * control * dt;
    const pvx = this.vx;
    const pvz = this.vz;
    const pYaw = group.rotation.y;
    if (this.state === 'attack') {
      // 攻撃中は歩けない。踏み込みの区間だけ、向いている方へ進む
      const [from, to, lungeSpeed] = ATTACKS[this.attackIndex].lunge;
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
          const remaining = Math.max(dt, (to - this.attackT) * ATTACKS[this.attackIndex].duration);
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
    if (this.state === 'attack') {
      if (this.attackT < ATTACKS[this.attackIndex].active[0]) {
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

    // 歩き・走りの位相は進んだ距離に比例して進める
    const stride = running ? MOVE.runStride : MOVE.walkStride;
    animator.phase = (animator.phase + (TWO_PI * speed * dt) / stride) % TWO_PI;

    // ---- 状態ごとの処理 ----
    switch (this.state) {
      case 'ground': {
        if (this.jumpBuffer > 0) {
          this.jumpBuffer = 0;
          this.state = 'crouch';
          this.timer = MOVE.crouchTime;
          animator.play('crouch', 0.07);
        } else if (cmd.skill && this.c.sword && this.skill3Ready) {
          this.startSkill3();
        } else if (cmd.skill && this.c.sword && this.skillCooldown <= 0) {
          this.startSkill();
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
          const recover = from.startsWith('attack') || from === 'land' || from === 'brake' || from === 'hit' || from === 'kick' || from === 'throwSword' || from === 'stabPull';
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
        const a = ATTACKS[this.attackIndex];
        this.attackT += dt / a.duration;
        animator.attackT = Math.min(1, this.attackT);
        const active = this.attackT >= a.active[0] && this.attackT <= a.active[1];
        if (active && !this.attackActive) this.events.push({ type: 'swing', index: this.attackIndex });
        if (!active && this.attackActive && a.power > 1) this.events.push({ type: 'slam', index: this.attackIndex }); // 兜割りの着地
        this.attackActive = active;
        // 軌跡は当たり判定より少し早く出し始めて、振り始めから弧が見えるようにする
        animator.trailOn = this.attackT >= a.active[0] - 0.08 && this.attackT <= a.active[1] + 0.03;
        if (this.attackT >= a.chain && cmd.attack) {
          this.startAttack((this.attackIndex + 1) % ATTACKS.length, cmd); // 押し続けていれば次の斬撃へ
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
