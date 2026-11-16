// HP と必殺技ゲージ。数値の設定はここにまとめる。

export const FIGHT = {
  maxHp: 1000,
  gaugeMax: 100,
  gaugePerDamage: 0.12, // 攻撃を当てたとき: 与えたダメージ × この値 だけゲージが溜まる（例: ダメージ 55 → 6.6）
  gaugePerSkill: 10,    // スキルを使ったとき: 1回ごとに溜まる量
  koRefillDelay: 3.2,   // KO してから、HP が全回復して再開するまでの秒数
};

// 技ごとのダメージ
export const DAMAGE = {
  attack: [28, 28, 55],           // 通常攻撃（1・2・3段目）
  airSlam: 70,                    // 叩きつけ
  finisherCrash: 60,              // 掴み技: 投げ落とし
  finisherGrip: 20,               // 掴み技: 掴んだ瞬間
  finisherSlam: 120,              // 掴み技: 締めの叩きつけ
  skill1Stick: 30, skill1Punch: 8, skill1PullOut: 20, skill1Kick: 90,
  skill2: 90,
  skill3: { 1: 35, 2: 60, 3: 110 }, // 斬撃の強さ別
  skill4: 100,
  wallSlam: 40,                   // 吹き飛んで壁に激突
  ultDagger: 40,                  // 必殺技: 小剣が刺さる
  ultSlash: 28,                   // 必殺技: 斬撃1回ぶん
  ultFinal: 160,                  // 必殺技: 最後の一撃
};

export class Health {
  constructor(max = FIGHT.maxHp) {
    this.max = max;
    this.hp = max;
    this.invulnerable = false;
  }
  // ダメージを与える。実際に減った量を返す
  damage(n) {
    if (this.invulnerable || this.hp <= 0) return 0;
    const d = Math.min(this.hp, Math.max(0, n));
    this.hp -= d;
    return d;
  }
  refill() { this.hp = this.max; }
  get ratio() { return this.hp / this.max; }
  get ko() { return this.hp <= 0; }
}

export class Gauge {
  constructor(max = FIGHT.gaugeMax) {
    this.max = max;
    this.value = 0;
  }
  add(n) { this.value = Math.min(this.max, this.value + n); }
  reset() { this.value = 0; }
  get full() { return this.value >= this.max - 1e-6; }
  get ratio() { return this.value / this.max; }
}
