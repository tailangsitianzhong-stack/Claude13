import { Net, normalizeCode } from '../net/Net.js';

// ローカル通信対戦の「つなぐ」画面。部屋をつくる（コードが出る）か、部屋に入る（コードを入れる）。
// つながったら onConnected(net)。「もどる」で onBack()。
const CSS = `
#lobby { position: fixed; inset: 0; z-index: 41; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 14px; overflow-y: auto; overflow-x: hidden;
  background: radial-gradient(ellipse at 50% 30%, #2a4a8a 0%, #101a38 62%, #060a18 100%); color: #fff; font-family: system-ui, sans-serif;
  padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  -webkit-user-select: none; user-select: none; transition: opacity 0.35s; }
#lobby, #lobby * { touch-action: pan-y; }
#lobby > :first-child { margin-top: auto; }
#lobby > :last-child { margin-bottom: auto; }
#lobby > * { flex-shrink: 0; }
#lobby.out { opacity: 0; pointer-events: none; }
#lobby h1 { margin: 0; font: 900 min(7vw, 34px)/1 system-ui, sans-serif; letter-spacing: 0.25em; text-shadow: 0 0 18px #4fd8ff, 0 3px 0 #04203d; }
#lobby .sub { margin-top: -6px; font-size: 12px; letter-spacing: 0.3em; color: #9fd4ff; }
#lobby .row { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; align-items: center; }
#lobby button { padding: 12px 26px; border-radius: 999px; border: 3px solid rgba(255,255,255,0.4); background: #14275a; color: #fff; font: 800 16px/1 system-ui, sans-serif; letter-spacing: 0.1em; cursor: pointer; }
#lobby button.main { border: 0; color: #5a1a00; background: linear-gradient(#fff59d, #ff9800); box-shadow: 0 5px 0 #8a1c10, 0 0 18px 4px rgba(255,160,40,0.55); }
#lobby button:active { transform: translateY(3px); }
#lobby button[disabled] { opacity: 0.45; pointer-events: none; }
#lobby .code { font: 900 min(14vw, 64px)/1 ui-monospace, Menlo, monospace; letter-spacing: 0.25em; text-indent: 0.25em; padding: 8px 18px; border-radius: 14px; background: rgba(255,255,255,0.1); border: 3px dashed #ffd54a; color: #ffe27a; }
#lobby input { width: 7.2em; text-align: center; text-transform: uppercase; font: 900 32px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.2em; padding: 8px 10px; border-radius: 12px; border: 3px solid #7fb6ff; background: #0d1a40; color: #fff; -webkit-user-select: text; user-select: text; }
#lobby .msg { min-height: 1.4em; font-size: 14px; color: #cfe6ff; text-align: center; }
#lobby .msg.err { color: #ff9a8a; font-weight: 700; }
#lobby .msg.ok { color: #8dffb0; font-weight: 700; }
#lobby .note { max-width: 520px; text-align: center; font-size: 10px; line-height: 1.6; color: #7f9cd0; letter-spacing: 0.05em; }
#lobby .hide { display: none !important; }
`;

export class Lobby {
  constructor({ onConnected, onBack }) {
    if (!document.getElementById('lobby-style')) {
      const style = document.createElement('style');
      style.id = 'lobby-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.onConnected = onConnected;
    this.onBack = onBack;
    this.net = null;
    this.root = document.createElement('div');
    this.root.id = 'lobby';
    this.root.innerHTML = `<h1>ローカル通信対戦</h1><div class="sub">ONLINE 1 vs 1</div>
      <div class="row" data-part="choose"><button type="button" class="main" data-act="host">部屋をつくる</button><button type="button" data-act="join">部屋に入る</button></div>
      <div class="code hide" data-part="code"></div>
      <div class="row hide" data-part="enter"><input type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE"><button type="button" class="main" data-act="go">つなぐ</button></div>
      <div class="msg" data-part="msg"></div>
      <div class="row"><button type="button" data-act="back">もどる</button></div>
      <div class="note">あいての端末に、部屋コードを伝えてください（2台とも、インターネットにつながっている必要があります）。<br>つなぐ手伝いに、無料の公開サービス（PeerJS Cloud）を使います。送られるのは、部屋コードだけです。つながったあとは、端末どうしが直接やりとりします。</div>`;
    document.body.appendChild(this.root);
    this.q = (s) => this.root.querySelector(s);
    this.root.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act === 'host') this.startHost();
      else if (act === 'join') this.showEnter();
      else if (act === 'go') this.startJoin();
      else if (act === 'back') this.back();
    });
    this.input = this.q('input');
    this.input.addEventListener('input', () => { this.input.value = normalizeCode(this.input.value); });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.startJoin(); e.stopPropagation(); });
  }

  setMsg(text, kind = '') {
    const m = this.q('[data-part="msg"]');
    m.textContent = text;
    m.className = 'msg ' + kind;
  }

  makeNet() {
    this.disposeNet();
    const net = new Net();
    net.onStatus = (text, kind, code) => {
      this.setMsg(text, kind === 'ok' ? 'ok' : '');
      if (code) { const c = this.q('[data-part="code"]'); c.textContent = code; c.classList.remove('hide'); }
    };
    net.onOpen = () => { this.net = null; this.close(); this.onConnected(net); };
    net.onClose = (reason) => { this.setMsg(reason, 'err'); this.q('[data-part="choose"]').classList.remove('hide'); this.q('[data-part="code"]').classList.add('hide'); this.setBusy(false); };
    this.net = net;
    return net;
  }
  disposeNet() { if (this.net) { this.net.onClose = () => {}; this.net.close(); this.net = null; } }
  setBusy(b) { for (const el of this.root.querySelectorAll('[data-act="host"],[data-act="join"],[data-act="go"]')) el.disabled = b; }

  startHost() {
    this.q('[data-part="enter"]').classList.add('hide');
    this.q('[data-part="code"]').classList.add('hide');
    this.setBusy(true);
    this.makeNet().host();
  }
  showEnter() {
    this.disposeNet();
    this.q('[data-part="code"]').classList.add('hide');
    this.q('[data-part="enter"]').classList.remove('hide');
    this.setMsg('部屋をつくった人に、コードを教えてもらってください');
    this.setBusy(false);
    this.input.focus();
  }
  startJoin() {
    if (this.input.value.length < 5) { this.setMsg('コードは 5 文字です', 'err'); return; }
    this.setBusy(true);
    this.makeNet().join(this.input.value);
  }
  back() { this.disposeNet(); this.close(); this.onBack(); }
  close() { this.root.classList.add('out'); setTimeout(() => this.root.remove(), 400); }
}
