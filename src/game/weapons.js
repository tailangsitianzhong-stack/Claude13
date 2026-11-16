// 武器の一覧。武器選択画面は、ここに並んだものを選択肢として出す。
//
// 【メモ】今は「剣」と「バット」。ほかの武器は、あとから追加していく予定（まだ追加しない）。
// 追加するときは、この配列に1件足し、武器ごとのモデル・モーション・技・コントローラ（BatController のように）を用意する。
export const WEAPONS = [
  {
    id: 'sword',
    name: '剣',
    desc: 'バランスのよい西洋剣。連続斬り・スキル・必殺技が使える。',
    stats: { power: 3, speed: 3, reach: 3 }, // 表示用の目安（1〜5）
  },
  {
    id: 'bat',
    name: 'バット',
    desc: '木製バット。横殴り→一回転→ボールを打って遠距離から当てる。ボールを打つ技が得意。',
    stats: { power: 3, speed: 4, reach: 5 },
  },
];

export const DEFAULT_WEAPON = 'sword';
export const getWeapon = (id) => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
