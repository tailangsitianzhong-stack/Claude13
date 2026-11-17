// 武器の一覧。武器選択画面は、ここに並んだものを選択肢として出す。
//
// 【メモ】今は「剣」「バット」「吸血牙」「矢印」「擬音」「チェンソー」。ほかの武器は、あとから追加していく予定（まだ追加しない）。
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
  {
    id: 'fang',
    name: '吸血牙',
    desc: '両手の爪と牙。噛みつき・爪の薙ぎ払い・蝙蝠への変身が得意。斬撃で相手の血を吸い、体力を回復する。',
    stats: { power: 4, speed: 4, reach: 2 },
  },
  {
    id: 'arrow',
    name: '矢印',
    desc: '素手に矢印のステッカーを貼って戦う。加速・砲弾・上向き・下向き・鈍足・引き寄せ。貼る矢印で、動きも技も変わる。',
    stats: { power: 3, speed: 5, reach: 3 },
  },
  {
    id: 'onom',
    name: '擬音',
    desc: '声に出した擬音の文字が、そのまま飛び出す。ドン・グラグラ・メラメラ… 言葉ごとに、効果が変わる。',
    stats: { power: 3, speed: 3, reach: 5 },
  },
  {
    id: 'saw',
    name: 'チェンソー',
    desc: '引き紐を引いてエンジンをかける。斜め斬りで吹っ飛ばし、首に刺し、回転斬り。足や腕にもチェンソーを生やして、出血させる。',
    stats: { power: 5, speed: 3, reach: 2 },
  },
];

export const DEFAULT_WEAPON = 'sword';
export const getWeapon = (id) => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
