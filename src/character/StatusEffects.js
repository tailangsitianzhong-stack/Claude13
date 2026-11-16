// 状態異常の「枠」。キャラごとに1つ持ち、種類（name）ごとに残り時間を管理する。
// 新しい状態異常は STATUS_DEFS に1行足して、効果の中身は Controller / Character 側で has(name) を見て作る。

export const STATUS_DEFS = {
  stun: { label: '気絶', icon: '★', color: '#ffd54a' }, // 動けず、攻撃もできない。頭上に星が回る
  slow: { label: '鈍足', icon: '▼', color: '#4ca8ff' }, // 移動速度が50%になる（矢印のスキル4）。胸に青い矢印が貼られる
};

export class StatusEffects {
  constructor() {
    this.active = new Map(); // name → { left, total }
    this.listeners = [];     // (name, on) => void。付いた・切れたときに呼ばれる
  }

  onChange(fn) { this.listeners.push(fn); }

  // duration 秒の状態異常を付ける。すでに付いていれば、残り時間が長いほうを採用する
  apply(name, duration) {
    if (!STATUS_DEFS[name]) throw new Error(`unknown status: ${name}`);
    const cur = this.active.get(name);
    if (cur) {
      if (duration > cur.left) { cur.left = duration; cur.total = duration; }
      return;
    }
    this.active.set(name, { left: duration, total: duration });
    for (const fn of this.listeners) fn(name, true);
  }

  has(name) { return this.active.has(name); }

  remove(name) {
    if (!this.active.delete(name)) return;
    for (const fn of this.listeners) fn(name, false);
  }

  clear() { for (const name of [...this.active.keys()]) this.remove(name); }

  update(dt) {
    for (const [name, st] of this.active) {
      st.left -= dt;
      if (st.left <= 0) this.remove(name);
    }
  }

  // 表示用: [{ name, label, icon, color, left, ratio }]
  list() {
    return [...this.active].map(([name, st]) => ({ ...STATUS_DEFS[name], name, left: st.left, ratio: st.left / st.total }));
  }
}
