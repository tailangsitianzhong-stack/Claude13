import * as THREE from 'three';

// 擬音の「文字」: 漫画の効果音のような、ふちどりつきの大きな文字。キャンバスに描いた絵を、板（スプライト）にして出す。
// 文字ごとに色が違う。絵は1回だけ作って使い回す（ロードで、全部作っておく）。
export const WORDS = {
  don: { text: 'ドン', color: ['#fff27a', '#ffb81f'], stroke: '#7a1d00' },
  guragura: { text: 'グラグラ', color: ['#e8b97a', '#b07a3a'], stroke: '#3a1f08' },
  meramera: { text: 'メラメラ', color: ['#ffd24a', '#ff4a1a'], stroke: '#6a0f00' },
  dokan: { text: 'ドカン', color: ['#ffb08a', '#ff2a1a'], stroke: '#4a0000' },
  suu: { text: 'スー', color: ['#c9f4ff', '#4cc8ff'], stroke: '#04334a' },
  guruguru: { text: 'グルグル', color: ['#e6c8ff', '#a05cff'], stroke: '#2a0a52' },
  dokidoki: { text: 'ドキドキ', color: ['#ffc4e4', '#ff4aa0'], stroke: '#5a0a35' },
  dorodoro: { text: 'ドロドロ', color: ['#c9ad7a', '#7a5a2a'], stroke: '#2a1c08' },
  zudon: { text: 'ズドン', color: ['#fff9a0', '#ffc21a'], stroke: '#5a2a00' },
  banban: { text: 'バンバン', color: ['#ffffff', '#c8d0dc'], stroke: '#1a1a22' },
  ban: { text: 'バン', color: ['#ffffff', '#c8d0dc'], stroke: '#1a1a22' },
};

const FONT = '"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Meiryo",system-ui,sans-serif';
const cache = {};

export function wordTexture(key) {
  if (cache[key]) return cache[key];
  const W = WORDS[key];
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  let size = 190;
  g.font = `900 ${size}px ${FONT}`;
  const w = g.measureText(W.text).width;
  if (w > 440) { size = Math.floor(size * 440 / w); g.font = `900 ${size}px ${FONT}`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.translate(256, 132);
  g.rotate(-0.07);                                  // 少し傾けて、勢いを出す
  g.lineWidth = size * 0.26; g.strokeStyle = W.stroke; g.strokeText(W.text, 0, 0);        // 外側の濃いふち
  g.lineWidth = size * 0.12; g.strokeStyle = '#ffffff'; g.strokeText(W.text, 0, 0);       // 白いふち
  const grad = g.createLinearGradient(0, -size / 2, 0, size / 2);
  grad.addColorStop(0, W.color[0]); grad.addColorStop(1, W.color[1]);
  g.fillStyle = grad; g.fillText(W.text, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache[key] = t;
  return t;
}

// ロードで、全部の文字の絵を作っておく
export function preloadWords() { for (const k of Object.keys(WORDS)) wordTexture(k); }
export function allWordTextures() { return Object.keys(WORDS).map((k) => wordTexture(k)); }

// 文字の板（常にカメラを向く）。width: 横幅（ワールド単位）
export function createWordSprite(key = 'don') {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture(key), transparent: true, depthWrite: false, fog: false }));
  s.userData.key = key;
  s.visible = false;
  s.renderOrder = 5;
  return s;
}
export function setWord(sprite, key, width) {
  if (sprite.userData.key !== key) { sprite.material.map = wordTexture(key); sprite.userData.key = key; }
  sprite.scale.set(width, width * 0.5, 1);
}

// 地面に寝かせた文字（スー）。文字の上が前（+Z）を向く
export function createFlatWord(key = 'suu') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 1).rotateX(Math.PI / 2 * 1), new THREE.MeshBasicMaterial({ map: wordTexture(key), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.visible = false;
  return m;
}
