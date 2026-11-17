import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';

// base を相対にして、ビルド結果（dist）をサブフォルダに置いても動くようにする。
// 通信対戦の部屋に入るときだけ読み込む vendor/peerjs.min.js は、動的に読むので、ここで dist へコピーする
export default defineConfig({
  base: './',
  plugins: [{
    name: 'copy-peerjs',
    closeBundle() {
      mkdirSync('dist/vendor', { recursive: true });
      copyFileSync('vendor/peerjs.min.js', 'dist/vendor/peerjs.min.js');
    },
  }],
});
