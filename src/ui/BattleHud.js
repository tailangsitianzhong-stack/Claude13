// バトルモードの表示: 画面上の「残り N 人」と、試合が終わったときの結果（もう一度 / モード選択へ）。
const CSS = `
#battle-hud { position: fixed; top: 6px; left: 50%; transform: translateX(-50%); z-index: 6; display: none; padding: 3px 14px; border-radius: 999px; pointer-events: none;
  background: rgba(20,24,40,0.78); color: #fff; font: 800 13px/1.3 system-ui, sans-serif; letter-spacing: 0.08em; text-shadow: 0 1px 2px #000a; }
#battle-hud.on { display: block; }
#battle-hud b { color: #ffd54a; font-size: 16px; }
body.pre-match #battle-hud, body.cine-on #battle-hud { visibility: hidden; }
#battle-result { position: fixed; inset: 0; z-index: 30; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(6,10,24,0.62); color: #fff; font-family: system-ui, sans-serif; -webkit-user-select: none; user-select: none; }
#battle-result.on { display: flex; }
#battle-result h2 { margin: 0; font: 900 min(14vw, 64px)/1 system-ui, sans-serif; letter-spacing: 0.12em; -webkit-text-stroke: 5px #1b1b30; paint-order: stroke fill; text-shadow: 0 6px 0 #0a0a1c; }
#battle-result.win h2 { color: #ffe066; }
#battle-result.lose h2 { color: #ff8a7d; }
#battle-result .row { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
#battle-result button { padding: 11px 26px; border: 0; border-radius: 999px; cursor: pointer; font: 900 16px/1 system-ui, sans-serif; letter-spacing: 0.2em; text-indent: 0.2em;
  color: #5a1a00; background: linear-gradient(#fff59d, #ff9800); box-shadow: 0 5px 0 #8a1c10, 0 0 16px 3px rgba(255,160,40,0.55); }
#battle-result button.sub { color: #12305a; background: linear-gradient(#e3f2ff, #7fb6ff); box-shadow: 0 5px 0 #1b3a78, 0 0 16px 3px rgba(100,170,255,0.5); }
#battle-result button:active { transform: translateY(3px); }
`;

export class BattleHud {
  constructor() {
    if (!document.getElementById('battle-hud-style')) {
      const style = document.createElement('style');
      style.id = 'battle-hud-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.count = document.createElement('div');
    this.count.id = 'battle-hud';
    document.body.appendChild(this.count);
    this.result = document.createElement('div');
    this.result.id = 'battle-result';
    this.result.innerHTML = '<h2></h2><div class="row"><button type="button" data-act="retry">もう一度</button><button type="button" class="sub" data-act="menu">モード選択へ</button></div>';
    document.body.appendChild(this.result);
    this.cb = null;
    this.result.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act && this.cb) { const f = this.cb[act]; this.hideResult(); f && f(); }
    });
  }

  // 残り人数（自分を含む）。on=false で隠す
  setRemaining(n, total, on = true) {
    this.count.classList.toggle('on', on);
    if (on) this.count.innerHTML = `残り <b>${n}</b> / ${total} 人`;
  }

  showResult(win, cb) {
    this.cb = cb;
    this.result.classList.toggle('win', win);
    this.result.classList.toggle('lose', !win);
    this.result.querySelector('h2').textContent = win ? 'YOU WIN!' : 'YOU LOSE';
    this.result.classList.add('on');
  }

  hideResult() { this.result.classList.remove('on'); }
  get resultShown() { return this.result.classList.contains('on'); }
}
