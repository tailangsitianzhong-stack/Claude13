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
  window: 0.5,      // 3段目の命中からこの秒数だけ受け付ける
  range: 12,        // 相手がこの距離以内なら掴める（リグ単位）
  holdDist: 2.1,    // 掴んでいる間の相手との間隔
  dash: 0.1,        // 相手の目の前まで詰める時間（秒）
  grip: 0.16,       // 胸ぐらを掴んで止まる時間
  rise: 0.5,        // 持ち上げて跳ぶ時間
  height: 15,       // 跳び上がる高さ（リグ単位。身長の約3倍）
  throwTime: 0.22,  // 空中で投げ下ろす動きの長さ
  release: 0.1,     // そのうち、手を離す瞬間
  fall: 0.14,       // 相手が地面に届くまでの時間
  throwDist: 3.6,   // 相手を叩きつける地点（自分の真下から前方へ）
  pause: 0.1,       // 相手が地面に当たってから、剣で追撃に入るまでの間
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
    v.c.animator.play('limp', 0.08);
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
      this.carryVictim(0.7 * Math.min(1, f.t / F.grip));
      if (f.t >= F.grip) {
        f.phase = 'rise';
        f.t = 0;
        animator.play('carry', 0.08);
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
        animator.play('throw', 0.05);
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
      if (Math.abs(group.rotation.x) < 0.01) group.rotation.x = 0;
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
