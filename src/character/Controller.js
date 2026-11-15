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

const TWO_PI = Math.PI * 2;

/**
 * キャラの移動・ジャンプと、それに合わせたモーション切り替え。
 * command = { x, z（ワールドでの進みたい向き。長さ0〜1）, run, jump, toggleStance }
 */
export class CharacterController {
  constructor(character, { bounds } = {}) {
    this.c = character;
    this.bounds = bounds;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.state = 'ground'; // 'ground' | 'crouch' | 'air' | 'land'
    this.timer = 0;
    this.idle = 'stand';   // 止まっているときのポーズ: 'stand' | 'fight'
    this.jumpBuffer = 0;
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

    // ---- 水平移動 ----
    const control = this.state === 'air' ? MOVE.airControl : this.state === 'ground' ? 1 : 0.5;
    const tx = moving ? cmd.x * topSpeed : 0;
    const tz = moving ? cmd.z * topSpeed : 0;
    const rate = (moving ? MOVE.accel : MOVE.decel) * S * control * dt;
    const dx = tx - this.vx;
    const dz = tz - this.vz;
    const dist = Math.hypot(dx, dz);
    if (dist <= rate) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / dist) * rate; this.vz += (dz / dist) * rate; }

    group.position.x += this.vx * dt;
    group.position.z += this.vz * dt;
    if (this.bounds) {
      const r = 0.5 * S * RIG.chest[0];
      const b = this.bounds;
      group.position.x = Math.min(b.maxX - r, Math.max(b.minX + r, group.position.x));
      group.position.z = Math.min(b.maxZ - r, Math.max(b.minZ + r, group.position.z));
    }

    // 進む向きへなめらかに振り向く
    if (moving) {
      const want = Math.atan2(cmd.x, cmd.z);
      let diff = want - group.rotation.y;
      diff -= TWO_PI * Math.round(diff / TWO_PI);
      group.rotation.y += diff * (1 - Math.exp(-MOVE.turnRate * dt));
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
        if (group.position.y <= 0 && this.vy < 0) {
          group.position.y = 0;
          this.vy = 0;
          this.state = 'land';
          this.timer = moving ? MOVE.landTime * 0.6 : MOVE.landTime; // 走りながらなら素早く立て直す
          animator.play('land', 0.06);
        }
        break;
      }
      case 'land': {
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'ground';
        break;
      }
    }
  }
}
