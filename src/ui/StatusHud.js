import { STATUS_DEFS } from '../character/StatusEffects.js';

// 状態異常の表示枠。画面上部の中央に、相手にかかっている状態異常を並べる（種類・残り秒数・残り時間バー）。
// STATUS_DEFS に追加した状態異常は、そのまま自動でここに出る。

const CSS = `
#status-hud { position: fixed; top: 74px; left: 50%; transform: translateX(-50%); z-index: 6; display: flex; gap: 6px;
  pointer-events: none; font: 700 13px/1 system-ui, sans-serif; }
#status-hud .st { display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 8px; border-radius: 999px;
  background: rgba(20, 24, 40, 0.78); color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid var(--c);
  animation: st-pop 0.18s ease-out; }
#status-hud .who { opacity: 0.7; font-size: 11px; }
#status-hud .ic { color: var(--c); font-size: 16px; }
#status-hud .bar { width: 46px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.2); overflow: hidden; }
#status-hud .bar i { display: block; height: 100%; width: 100%; background: var(--c); transform-origin: left; }
#status-hud .tm { min-width: 2.4em; text-align: right; font-variant-numeric: tabular-nums; }
@keyframes st-pop { from { transform: scale(1.35); opacity: 0; } to { transform: scale(1); opacity: 1; } }
`;

export class StatusHud {
  constructor(label = 'P2') {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'status-hud';
    document.body.appendChild(this.root);
    this.label = label;
    this.rows = new Map(); // name → { el, bar, time }
  }

  // status: StatusEffects。毎フレーム呼ぶ
  update(status) {
    const list = status.list();
    for (const st of list) {
      let row = this.rows.get(st.name);
      if (!row) {
        const el = document.createElement('div');
        el.className = 'st';
        el.style.setProperty('--c', STATUS_DEFS[st.name].color);
        el.innerHTML = `<span class="who">${this.label}</span><span class="ic">${st.icon}</span><span>${st.label}</span><div class="bar"><i></i></div><span class="tm"></span>`;
        this.root.appendChild(el);
        row = { el, bar: el.querySelector('i'), time: el.querySelector('.tm') };
        this.rows.set(st.name, row);
      }
      row.bar.style.transform = `scaleX(${Math.max(0, st.ratio).toFixed(3)})`;
      row.time.textContent = `${Math.max(0, st.left).toFixed(1)}s`;
    }
    for (const [name, row] of this.rows) {
      if (!status.has(name)) { row.el.remove(); this.rows.delete(name); }
    }
  }
}
