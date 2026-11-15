// ステージの寸法設定（単位: ブロック）
export const STAGE_CONFIG = {
  blockSize: 2,        // 1ブロックのワールドサイズ
  floorBlocks: 16,     // 床の一辺のブロック数（外周1列が壁になる）
  floorThickness: 2,   // 床（島）の厚み（ブロック数）
  wallHeight: 3,       // 壁の高さ（ブロック数）
  battlements: true,   // 壁の上に凸凹（胸壁）を付ける
  seaLevel: -1.2,      // 海面の高さ（床の上面が y=0）
  seaSize: 400,        // 海の広さ
  seed: 1337,          // テクスチャ・色ムラ用の乱数シード
};
