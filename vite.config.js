import { defineConfig } from 'vite';

// base を相対にして、ビルド結果（dist）をサブフォルダに置いても動くようにする
export default defineConfig({ base: './' });
