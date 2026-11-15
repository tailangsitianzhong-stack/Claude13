import * as THREE from 'three';

// ロブロックス風の低コストテクスチャ: 16x16px をキャンバスで生成し、
// NearestFilter で拡大してドット感を残す。画像ファイル不要。

const SIZE = 16;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function pick(rand, palette) {
  return palette[Math.floor(rand() * palette.length)];
}

// 草: 緑のドットノイズ + 中央にロブロックス風スタッド（ポッチ）
export function grassTexture(seed = 1) {
  const rand = mulberry32(seed);
  const palette = ['#4caf3a', '#55b941', '#47a535', '#5cc047', '#3f9a30'];
  return makeCanvas((ctx) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = pick(rand, palette);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // 草の葉っぽい明るい点
    ctx.fillStyle = '#7ad65e';
    for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1, 1);
    // ブロックの境目を薄く
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, SIZE, 1);
    ctx.fillRect(0, 0, 1, SIZE);
  });
}

// 土（床の側面）: 上端に草のフチ
export function dirtSideTexture(seed = 2) {
  const rand = mulberry32(seed);
  const dirt = ['#8a5a32', '#7d5029', '#94633a', '#74492a'];
  const grass = ['#4caf3a', '#55b941', '#47a535'];
  return makeCanvas((ctx) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const fringe = y < 3 || (y === 3 && rand() < 0.5);
        ctx.fillStyle = pick(rand, fringe ? grass : dirt);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, 1, SIZE);
  });
}

export function dirtTexture(seed = 3) {
  const rand = mulberry32(seed);
  const dirt = ['#8a5a32', '#7d5029', '#94633a', '#74492a'];
  return makeCanvas((ctx) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = pick(rand, dirt);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

// 石ブロック: 灰色ノイズ + 縁取り + ひび
export function stoneTexture(seed = 4) {
  const rand = mulberry32(seed);
  const palette = ['#8e8e8e', '#979797', '#858585', '#9e9e9e', '#8a8a8a'];
  return makeCanvas((ctx) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = pick(rand, palette);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // ブロックの縁（明るい上左 / 暗い下右）でブロック感を出す
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, SIZE, 1);
    ctx.fillRect(0, 0, 1, SIZE);
    ctx.fillStyle = '#5e5e5e';
    ctx.fillRect(0, SIZE - 1, SIZE, 1);
    ctx.fillRect(SIZE - 1, 0, 1, SIZE);
    // ひび
    ctx.fillStyle = '#6c6c6c';
    let x = 3 + Math.floor(rand() * 10);
    for (let y = 3; y < 11; y++) {
      ctx.fillRect(x, y, 1, 1);
      x += Math.floor(rand() * 3) - 1;
    }
  });
}

// 海: 青のドット + 白い波頭
export function waterTexture(seed = 5) {
  const rand = mulberry32(seed);
  const palette = ['#2f86d6', '#3390e0', '#2a7ccb', '#3a97e6'];
  return makeCanvas((ctx) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = pick(rand, palette);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = '#9fd3ff';
    for (let i = 0; i < 4; i++) {
      const sx = Math.floor(rand() * SIZE);
      const sy = Math.floor(rand() * SIZE);
      ctx.fillRect(sx, sy, 3, 1);
    }
  });
}
