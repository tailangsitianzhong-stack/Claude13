import { WEAPONS, DEFAULT_WEAPON } from '../game/weapons.js';

// 試合前の武器選択画面。選ぶと閉じて、onSelect(武器 id) が呼ばれる。
// WEAPONS に武器が増えれば、カードが自動で並ぶ。

const CSS = `
#weapon-select { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 16px; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  background: radial-gradient(ellipse at 50% 30%, #2a4a8a 0%, #101a38 62%, #060a18 100%); color: #fff; font-family: system-ui, sans-serif;
  padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  -webkit-user-select: none; user-select: none; touch-action: pan-y; transition: opacity 0.35s; }
/* 画面が低いときは、上下にスライドして全部見られる。中身が少ないときは、真ん中に寄せる（上の余白と下の余白を自動で等しくする） */
#weapon-select > :first-child { margin-top: auto; }
#weapon-select > :last-child { margin-bottom: auto; }
#weapon-select > * { flex-shrink: 0; }
/* ページ全体は touch-action: none（拡大・スクロールの防止）。この画面だけは、上下のスライドを許す。
   タップした場所（カードや文字）にも指定しないと、スライドが効かない（touch-action は、触った要素から親までのすべてで許されている必要がある） */
#weapon-select, #weapon-select * { touch-action: pan-y; }
#weapon-select.wait { display: none; }
#weapon-select.out { opacity: 0; pointer-events: none; }
#weapon-select h1 { margin: 0; font: 900 min(7vw, 36px)/1 system-ui, sans-serif; letter-spacing: 0.3em; text-shadow: 0 0 18px #4fd8ff, 0 3px 0 #04203d; }
#weapon-select .sub { margin-top: -6px; font-size: 12px; letter-spacing: 0.3em; color: #9fd4ff; }
#weapon-select .cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; width: 100%; max-width: 1200px; }
@media (max-width: 760px) { #weapon-select .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 480px) { #weapon-select .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
#weapon-select .card { box-sizing: border-box; min-width: 0; padding: 12px 12px 14px; border-radius: 14px; text-align: center; cursor: pointer; position: relative;
  background: linear-gradient(#1b3366, #0f1c40); border: 3px solid rgba(255,255,255,0.35); box-shadow: 0 6px 0 #040a1c, 0 8px 18px rgba(0,0,0,0.45);
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
#weapon-select .card.sel { border-color: #ffd54a; transform: translateY(-3px) scale(1.03); box-shadow: 0 6px 0 #040a1c, 0 0 0 4px rgba(255,213,74,0.35), 0 0 26px 6px rgba(255,200,60,0.55); }
#weapon-select .card .icon { height: min(22vh, 110px); display: grid; place-items: center; }
#weapon-select .card .icon svg { height: 100%; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); }
#weapon-select .card .name { font: 900 22px/1 system-ui, sans-serif; letter-spacing: 0.3em; margin: 4px 0 6px 0.3em; }
#weapon-select .card .desc { font-size: 11px; line-height: 1.5; color: #c8dcff; min-height: 3em; }
#weapon-select .card .stats { margin-top: 6px; display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 10px; color: #9fc4ff; text-align: left; }
#weapon-select .card .bar { display: flex; gap: 2px; align-items: center; }
#weapon-select .card .bar i { width: 100%; max-width: 16px; height: 6px; border-radius: 2px; background: rgba(255,255,255,0.18); }
#weapon-select .card .bar i.on { background: #ffd54a; }
#weapon-select .go { margin-top: 2px; padding: 11px 44px; border: 0; border-radius: 999px; cursor: pointer; font: 900 18px/1 system-ui, sans-serif; letter-spacing: 0.4em; text-indent: 0.4em;
  color: #5a1a00; background: linear-gradient(#fff59d, #ff9800); box-shadow: 0 5px 0 #8a1c10, 0 0 18px 4px rgba(255,160,40,0.6); transition: transform 0.08s; }
#weapon-select .go:active { transform: translateY(3px); box-shadow: 0 2px 0 #8a1c10; }
#weapon-select .note { font-size: 10px; color: #7f9cd0; letter-spacing: 0.1em; }
@media (max-height: 420px) { #weapon-select { gap: 8px; } #weapon-select .card .icon { height: 70px; } #weapon-select .card .desc { min-height: 0; } #weapon-select .card .stats { display: none; } }
`;

// 剣のアイコン（斜めに構えた西洋剣）
const SWORD_ICON = `
<svg viewBox="0 0 64 110" aria-hidden="true" stroke-linejoin="round">
  <polygon points="28,4 36,4 36,70 32,78 28,70" fill="#eef2f7" stroke="#3a4560" stroke-width="2"/>
  <rect x="31" y="10" width="2" height="54" fill="#b9c3d1"/>
  <rect x="14" y="74" width="36" height="8" rx="2" fill="#e8c14a" stroke="#5a4210" stroke-width="2.4"/>
  <rect x="28" y="82" width="8" height="18" fill="#7a4a28" stroke="#3b2210" stroke-width="2"/>
  <rect x="25" y="99" width="14" height="8" rx="2" fill="#e8c14a" stroke="#5a4210" stroke-width="2.4"/>
</svg>`;
// バットのアイコン（斜めのバットと、野球ボール）
const BAT_ICON = `
<svg viewBox="0 0 64 110" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <g transform="rotate(18 32 50)">
    <path d="M27 6 Q27 4 32 4 Q37 4 37 6 L38 62 L35 78 L29 78 L26 62 Z" fill="#c98d4a" stroke="#4a2c10" stroke-width="2.4"/>
    <rect x="29" y="76" width="6" height="22" rx="1" fill="#242424" stroke="#000" stroke-width="2"/>
    <rect x="27" y="97" width="10" height="7" rx="3" fill="#a56e32" stroke="#4a2c10" stroke-width="2"/>
  </g>
  <circle cx="14" cy="90" r="9" fill="#fff" stroke="#3a4560" stroke-width="2.2"/>
  <path d="M8 86 Q14 90 8 95 M20 86 Q14 90 20 95" fill="none" stroke="#d9302a" stroke-width="1.6"/>
</svg>`;
// 吸血牙のアイコン（牙をむいた口と、爪）
const FANG_ICON = `
<svg viewBox="0 0 64 110" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <path d="M6 28 Q32 8 58 28 L52 40 L46 33 L40 46 L34 36 L32 52 L30 36 L24 46 L18 33 L12 40 Z" fill="#fff" stroke="#3a0a14" stroke-width="2.4"/>
  <path d="M12 40 Q32 62 52 40 L46 33 L40 46 L34 36 L32 52 L30 36 L24 46 L18 33 Z" fill="#c0172c" stroke="#3a0a14" stroke-width="2.4"/>
  <path d="M10 66 Q14 88 22 104 M26 64 Q30 88 36 106 M42 66 Q46 88 52 104" fill="none" stroke="#e8e0d0" stroke-width="5"/>
  <path d="M10 66 Q14 88 22 104 M26 64 Q30 88 36 106 M42 66 Q46 88 52 104" fill="none" stroke="#c0172c" stroke-width="1.6"/>
</svg>`;
// 矢印のアイコン（上向き・右向きの矢印と、拳）
const ARROW_ICON = `
<svg viewBox="0 0 64 110" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <path d="M26 66 L38 66 L38 30 L52 30 L32 4 L12 30 L26 30 Z" fill="#3dff7a" stroke="#0b4a22" stroke-width="2.6"/>
  <rect x="6" y="74" width="30" height="26" rx="7" fill="#fff" stroke="#3a4560" stroke-width="2.4"/>
  <path d="M40 80 L58 80 L58 74 L70 87 L58 100 L58 94 L40 94 Z" fill="#ffc21a" stroke="#5a3a10" stroke-width="2.2" transform="translate(-8 0) scale(0.9)"/>
</svg>`;
// 擬音のアイコン（吹き出しと、文字）
const ONOM_ICON = `
<svg viewBox="0 0 64 110" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <path d="M4 14 Q4 6 14 6 H50 Q60 6 60 14 V50 Q60 58 50 58 H34 L24 74 L26 58 H14 Q4 58 4 50 Z" fill="#fff" stroke="#5a2a00" stroke-width="2.6"/>
  <text x="32" y="40" text-anchor="middle" font-family="'Hiragino Maru Gothic ProN','Yu Gothic',system-ui,sans-serif" font-weight="900" font-size="23" fill="#ff7a00" stroke="#5a2a00" stroke-width="1">ドン</text>
  <text x="32" y="92" text-anchor="middle" font-family="'Hiragino Maru Gothic ProN','Yu Gothic',system-ui,sans-serif" font-weight="900" font-size="15" fill="#ff3a1a" stroke="#4a0000" stroke-width="0.8" transform="rotate(-8 32 92)">メラメラ</text>
</svg>`;
// チェンソーのアイコン（オレンジの本体と、歯のある刃）
const SAW_ICON = `
<svg viewBox="0 0 64 110" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <g transform="rotate(-20 32 56)">
    <rect x="22" y="2" width="20" height="62" rx="5" fill="#9aa3ad" stroke="#2a3138" stroke-width="2.4"/>
    <rect x="26" y="6" width="12" height="54" rx="3" fill="#cfd6dd"/>
    <path d="M20 4 H24 M20 12 H24 M20 20 H24 M20 28 H24 M20 36 H24 M20 44 H24 M20 52 H24 M40 4 H44 M40 12 H44 M40 20 H44 M40 28 H44 M40 36 H44 M40 44 H44 M40 52 H44" stroke="#1c1f24" stroke-width="3"/>
    <rect x="14" y="62" width="36" height="30" rx="5" fill="#e8590c" stroke="#5a2204" stroke-width="2.6"/>
    <rect x="20" y="92" width="24" height="12" rx="4" fill="#1c1f24" stroke="#000" stroke-width="2"/>
    <circle cx="32" cy="76" r="5" fill="#fff" stroke="#5a2204" stroke-width="2"/>
  </g>
  <path d="M6 26 L14 22 M4 36 L12 34 M54 14 L60 8" stroke="#ffd54a" stroke-width="3"/>
</svg>`;
const ICONS = { sword: SWORD_ICON, bat: BAT_ICON, fang: FANG_ICON, arrow: ARROW_ICON, onom: ONOM_ICON, saw: SAW_ICON };
const STAT_LABELS = { power: '攻撃力', speed: '速さ', reach: 'リーチ' };

export class WeaponSelect {
  // hold: true なら、show() が呼ばれるまで表示しない（タイトル・ロードのあとに出す）
  constructor(onSelect, { hold = false, initial = DEFAULT_WEAPON } = {}) {
    if (!document.getElementById('weapon-select-style')) {
      const style = document.createElement('style');
      style.id = 'weapon-select-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.onSelect = onSelect;
    this.selected = initial;
    this.root = document.createElement('div');
    this.root.id = 'weapon-select';
    this.held = hold;
    if (hold) this.root.classList.add('wait');
    this.root.innerHTML = `<h1>武器選択</h1><div class="sub">SELECT YOUR WEAPON</div><div class="cards"></div><button class="go" type="button">決 定</button><div class="note">Enter / Space でも決定できます</div>`;
    document.body.appendChild(this.root);
    const cards = this.root.querySelector('.cards');
    for (const w of WEAPONS) {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = w.id;
      const stats = Object.entries(w.stats ?? {}).map(([k, n]) => `<span>${STAT_LABELS[k] ?? k}</span><span class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`).join('');
      el.innerHTML = `<div class="icon">${ICONS[w.id] ?? ''}</div><div class="name">${w.name}</div><div class="desc">${w.desc}</div><div class="stats">${stats}</div>`;
      el.addEventListener('click', () => this.select(w.id)); // スライドしたときは選ばない（click は、指を動かすと出ない）
      cards.appendChild(el);
    }
    this.select(this.selected);
    this.root.querySelector('.go').addEventListener('click', () => this.confirm());
    this.onKey = (e) => { if (!this.held && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.confirm(); } };
    addEventListener('keydown', this.onKey);
    this.done = false;
  }

  // 通信が切れたときなど、選ばずに閉じる
  dispose() {
    this.done = true;
    removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  show() {
    this.held = false;
    this.root.classList.remove('wait');
  }

  select(id) {
    this.selected = id;
    for (const el of this.root.querySelectorAll('.card')) el.classList.toggle('sel', el.dataset.id === id);
  }

  confirm() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.onKey);
    this.root.classList.add('out');
    setTimeout(() => this.root.remove(), 400);
    this.onSelect(this.selected);
  }
}
