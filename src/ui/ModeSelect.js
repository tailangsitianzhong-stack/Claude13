// モード選択画面（武器選択の前に出る）。
//   練習モード      : 立っている相手（サンドバッグ）を相手に、技を試す。反撃はない
//   バトルモード    : NPC と対戦。自分を入れて 2〜4 人（最後まで立っていた人の勝ち）
// 【メモ】ローカル通信対戦モードは、方法を決めてから作る（まだ作らない）。
const CSS = `
#mode-select { position: fixed; inset: 0; z-index: 41; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 16px; overflow-y: auto; overflow-x: hidden;
  -webkit-overflow-scrolling: touch; overscroll-behavior: contain; background: radial-gradient(ellipse at 50% 30%, #2a4a8a 0%, #101a38 62%, #060a18 100%); color: #fff; font-family: system-ui, sans-serif;
  padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  -webkit-user-select: none; user-select: none; transition: opacity 0.35s; }
#mode-select, #mode-select * { touch-action: pan-y; }
#mode-select > :first-child { margin-top: auto; }
#mode-select > :last-child { margin-bottom: auto; }
#mode-select > * { flex-shrink: 0; }
#mode-select.wait { display: none; }
#mode-select.out { opacity: 0; pointer-events: none; }
#mode-select h1 { margin: 0; font: 900 min(7vw, 36px)/1 system-ui, sans-serif; letter-spacing: 0.3em; text-shadow: 0 0 18px #4fd8ff, 0 3px 0 #04203d; }
#mode-select .sub { margin-top: -6px; font-size: 12px; letter-spacing: 0.3em; color: #9fd4ff; }
#mode-select .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; width: 100%; max-width: 640px; }
#mode-select .card { box-sizing: border-box; min-width: 0; padding: 14px 14px 16px; border-radius: 14px; text-align: center; cursor: pointer; position: relative;
  background: linear-gradient(#1b3366, #0f1c40); border: 3px solid rgba(255,255,255,0.35); box-shadow: 0 6px 0 #040a1c, 0 8px 18px rgba(0,0,0,0.45);
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
#mode-select .card.sel { border-color: #ffd54a; transform: translateY(-3px) scale(1.03); box-shadow: 0 6px 0 #040a1c, 0 0 0 4px rgba(255,213,74,0.35), 0 0 26px 6px rgba(255,200,60,0.55); }
#mode-select .card .icon { font-size: 40px; line-height: 1.2; }
#mode-select .card .name { font: 900 20px/1.2 system-ui, sans-serif; letter-spacing: 0.15em; margin: 4px 0 6px; }
#mode-select .card .desc { font-size: 11px; line-height: 1.5; color: #c8dcff; min-height: 3em; }
#mode-select .count { display: none; align-items: center; gap: 10px; font-size: 13px; color: #cfe6ff; }
#mode-select .count.show { display: flex; }
#mode-select .count button { padding: 9px 18px; border-radius: 999px; border: 3px solid rgba(255,255,255,0.4); background: #14275a; color: #fff; font: 800 15px/1 system-ui, sans-serif; cursor: pointer; }
#mode-select .count button.sel { border-color: #ffd54a; background: #3a3a10; color: #ffe27a; box-shadow: 0 0 12px rgba(255,200,60,0.55); }
#mode-select .go { padding: 11px 44px; border: 0; border-radius: 999px; cursor: pointer; font: 900 18px/1 system-ui, sans-serif; letter-spacing: 0.4em; text-indent: 0.4em;
  color: #5a1a00; background: linear-gradient(#fff59d, #ff9800); box-shadow: 0 5px 0 #8a1c10, 0 0 18px 4px rgba(255,160,40,0.6); }
#mode-select .go:active { transform: translateY(3px); box-shadow: 0 2px 0 #8a1c10; }
#mode-select .note { font-size: 10px; color: #7f9cd0; letter-spacing: 0.1em; }
@media (max-height: 420px) { #mode-select { gap: 8px; } #mode-select .card .icon { font-size: 28px; } #mode-select .card .desc { min-height: 0; } }
`;

export const MODES = [
  { id: 'practice', name: '練習モード', icon: '🎯', desc: '立っている相手を相手に、技を試す。反撃はなく、倒しても復活する。' },
  { id: 'battle', name: 'バトルモード', icon: '⚔', desc: 'NPC と対戦。自分を入れて 2〜4 人で戦い、最後まで立っていた人の勝ち。NPC どうしも戦う。' },
];

export class ModeSelect {
  // onDone({ mode, players })
  constructor(onDone, { hold = true } = {}) {
    if (!document.getElementById('mode-select-style')) {
      const style = document.createElement('style');
      style.id = 'mode-select-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.onDone = onDone;
    this.mode = 'practice';
    this.players = 3;
    this.held = hold;
    this.done = false;
    this.root = document.createElement('div');
    this.root.id = 'mode-select';
    if (hold) this.root.classList.add('wait');
    this.root.innerHTML = `<h1>モード選択</h1><div class="sub">SELECT MODE</div><div class="cards"></div>
      <div class="count"><span>対戦人数（自分を入れて）</span><button type="button" data-n="2">2人</button><button type="button" data-n="3">3人</button><button type="button" data-n="4">4人</button></div>
      <button class="go" type="button">決 定</button><div class="note">次に、武器を選びます</div>`;
    document.body.appendChild(this.root);
    const cards = this.root.querySelector('.cards');
    for (const m of MODES) {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = m.id;
      el.innerHTML = `<div class="icon">${m.icon}</div><div class="name">${m.name}</div><div class="desc">${m.desc}</div>`;
      el.addEventListener('click', () => this.select(m.id));
      cards.appendChild(el);
    }
    for (const b of this.root.querySelectorAll('.count button')) b.addEventListener('click', () => this.setPlayers(Number(b.dataset.n)));
    this.root.querySelector('.go').addEventListener('click', () => this.confirm());
    this.select(this.mode);
    this.setPlayers(this.players);
    // Enter / Space で決定（同じキー入力が、次に出る画面にも届かないようにする）
    this.onKey = (e) => { if (!this.held && !this.done && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); e.stopImmediatePropagation(); this.confirm(); } };
    addEventListener('keydown', this.onKey, true);
  }

  show() { this.held = false; this.root.classList.remove('wait'); }

  select(id) {
    this.mode = id;
    for (const el of this.root.querySelectorAll('.card')) el.classList.toggle('sel', el.dataset.id === id);
    this.root.querySelector('.count').classList.toggle('show', id === 'battle');
  }

  setPlayers(n) {
    this.players = n;
    for (const b of this.root.querySelectorAll('.count button')) b.classList.toggle('sel', Number(b.dataset.n) === n);
  }

  confirm() {
    if (this.done || this.held) return;
    this.done = true;
    removeEventListener('keydown', this.onKey, true);
    this.root.classList.add('out');
    setTimeout(() => this.root.remove(), 400);
    this.onDone({ mode: this.mode, players: this.mode === 'battle' ? this.players : 2 });
  }
}
