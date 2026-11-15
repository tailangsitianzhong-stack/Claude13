import { RIG } from './rig.js';

// 速さ・ジャンプの設定（単位は「リグ単位」= キャラの縮尺を掛ける前。身長が約5）
export const MOVE = {
  walkSpeed: 4.6,     // 毎秒
  runSpeed: 12,
  accel: 45,          // 加速
  decel: 60,          // 減速
  airControl: 0.35,   // 空中での加減速の効き
  turnRate: 14,       // 向きを変える速さ
  walkStride: 3.9,    // 歩き1周期（2歩）で進む距離 → 足が滑って見えないよう位相を距離に同期
  runStride: 9.0,
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
// 空中攻撃（叩きつけ）。ジャンプ中に攻撃を押すと、一瞬ためてから真下へ急降下し、着地点のまわりを攻撃する
export const AIR_SLAM = {
  minHeight: 0.8,   // これより低いと出せない（リグ単位）
  windup: 0.16,     // 空中で振りかぶる時間（秒）。この間はほぼ落ちない
  diveSpeed: 34,    // 急降下の速さ（リグ単位/秒）
  radius: 7,        // 着地時の攻撃範囲の半径（リグ単位）
  reach: 2.2,       // 範囲の中心はキャラの前方これだけ先（剣が地面を叩く位置）
};
export const AIM_ASSIST = { range: 11, angle: 1.1 }; // 近くの相手へ自動で向き直る範囲（リグ単位・ラジアン）

const TWO_PI = Math.PI * 2;
const angleDiff = (a, b) => { const d = a - b; return d - TWO_PI * Math.round(d / TWO_PI); };

/**
 * キャラの移動・ジャンプと、それに合わせたモーション切り替え。
 * command = { x, z（ワールドでの進みたい向き。長さ0〜1）, run, jump, attack（押している間 true）, toggleStance }
 */
export class CharacterController {
  constructor(character, { bounds } = {}) {
    this.c = character;
    this.bounds = bounds;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.state = 'ground'; // 'ground' | 'crouch' | 'air' | 'land' | 'attack' | 'airSlam' | 'hit'
    this.timer = 0;
    this.idle = 'stand';   // 止まっているときのポーズ: 'stand' | 'fight'
    this.jumpBuffer = 0;
    this.prevAttack = false;  // 前フレームに攻撃が押されていたか（押した瞬間の検出用）
    this.slamT = 0;

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

  // 攻撃を受けた: (dx, dz) の向きへ吹き飛び、のけぞる
  hit(dx, dz, power = 1) {
    const { group, animator, scale } = this.c;
    const len = Math.hypot(dx, dz) || 1;
    const speed = (power > 1 ? 13 : 8) * scale;
    this.vx = (dx / len) * speed;
    this.vz = (dz / len) * speed;
    this.vy = 0;
    group.position.y = 0;
    this.state = 'hit';
    this.hitDuration = power > 1 ? 0.6 : 0.4;
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
    let rate = (moving ? MOVE.accel : MOVE.decel) * S * control * dt;
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
      tx = 0;
      tz = 0;
      rate = 40 * S * dt; // 横の勢いを殺して、ほぼ真下へ落ちる
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
        } else if (cmd.attack && this.c.sword) {
          this.startAttack(0, cmd);
        } else if (speed > 0.4) {
          if (animator.name === 'stand' || animator.name === 'fight') animator.phase = 0; // 歩き出しは左足から
          animator.play(running ? 'run' : 'walk', 0.18);
        } else {
          animator.play(this.idle, 0.22);
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
        if (attackPressed && this.c.sword && group.position.y > AIR_SLAM.minHeight * S) {
          // 空中攻撃: 近くに相手がいればそちらを向き、剣を振りかぶる
          this.state = 'airSlam';
          this.slamT = 0;
          this.vy = Math.max(this.vy * 0.3, 3 * S);
          if (this.target) {
            const dx = this.target.group.position.x - group.position.x;
            const dz = this.target.group.position.z - group.position.z;
            if (Math.hypot(dx, dz) < AIM_ASSIST.range * S) group.rotation.y = Math.atan2(dx, dz);
          }
          animator.attackT = 0;
          animator.play('airSlam', 0.06);
          this.events.push({ type: 'airSlamStart', index: 2 });
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
        if (this.slamT < AIR_SLAM.windup) {
          this.vy -= MOVE.gravity * 0.2 * S * dt; // ためている間はふわっと浮く
        } else {
          this.vy = -AIR_SLAM.diveSpeed * S;      // 一気に急降下
        }
        group.position.y += this.vy * dt;
        animator.attackT = Math.min(1, this.slamT / (AIR_SLAM.windup + 0.06));
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
