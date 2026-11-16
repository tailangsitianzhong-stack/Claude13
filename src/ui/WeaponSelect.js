import { WEAPONS, DEFAULT_WEAPON } from '../game/weapons.js';

// 試合前の武器選択画面。選ぶと閉じて、onSelect(武器 id) が呼ばれる。
// WEAPONS に武器が増えれば、カードが自動で並ぶ。

const CSS = `
#weapon-select { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: radial-gradient(ellipse at 50% 30%, #2a4a8a 0%, #101a38 62%, #060a18 100%); color: #fff; font-family: system-ui, sans-serif;
  padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  -webkit-user-select: none; user-select: none; touch-action: none; transition: opacity 0.35s; }
#weapon-select.out { opacity: 0; pointer-events: none; }
#weapon-select h1 { margin: 0; font: 900 min(7vw, 36px)/1 system-ui, sans-serif; letter-spacing: 0.3em; text-shadow: 0 0 18px #4fd8ff, 0 3px 0 #04203d; }
#weapon-select .sub { margin-top: -6px; font-size: 12px; letter-spacing: 0.3em; color: #9fd4ff; }
#weapon-select .cards { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
#weapon-select .card { width: min(44vw, 210px); padding: 12px 12px 14px; border-radius: 14px; text-align: center; cursor: pointer; position: relative;
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
const ICONS = { sword: SWORD_ICON };
const STAT_LABELS = { power: '攻撃力', speed: '速さ', reach: 'リーチ' };

export class WeaponSelect {
  constructor(onSelect) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.onSelect = onSelect;
    this.selected = DEFAULT_WEAPON;
    this.root = document.createElement('div');
    this.root.id = 'weapon-select';
    this.root.innerHTML = `<h1>武器選択</h1><div class="sub">SELECT YOUR WEAPON</div><div class="cards"></div><button class="go" type="button">決 定</button><div class="note">Enter / Space でも決定できます</div>`;
    document.body.appendChild(this.root);
    const cards = this.root.querySelector('.cards');
    for (const w of WEAPONS) {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = w.id;
      const stats = Object.entries(w.stats ?? {}).map(([k, n]) => `<span>${STAT_LABELS[k] ?? k}</span><span class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`).join('');
      el.innerHTML = `<div class="icon">${ICONS[w.id] ?? ''}</div><div class="name">${w.name}</div><div class="desc">${w.desc}</div><div class="stats">${stats}</div>`;
      el.addEventListener('pointerdown', () => this.select(w.id));
      cards.appendChild(el);
    }
    this.select(this.selected);
    this.root.querySelector('.go').addEventListener('click', () => this.confirm());
    this.onKey = (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.confirm(); } };
    addEventListener('keydown', this.onKey);
    this.done = false;
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
