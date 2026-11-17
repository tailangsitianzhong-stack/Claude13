// ローカル通信対戦の通信部分（案B: WebRTC ＋ 公開の仲介サーバー）。
// PeerJS（vendor/peerjs.min.js）を使う。部屋コードを知っている人どうしが、仲介サーバー（PeerJS Cloud）を通って
// お互いを見つけ、そのあとは端末どうしが直接（WebRTC のデータ通路）やりとりする。仲介サーバーに送るのは、部屋コードだけ。
// 確認用: ?peerhost=localhost&peerport=9000 などで、自分で立てた仲介サーバーを使える。

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字（I O 0 1）は使わない
const PREFIX = 'bfight-';
const CODE_LEN = 5;

let libPromise = null;
// PeerJS は、部屋をつくる・入るときに初めて読み込む（普段のロードを重くしない）
function loadPeerLib() {
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    if (window.peerjs && window.peerjs.Peer) { resolve(window.peerjs.Peer); return; }
    const s = document.createElement('script');
    s.src = './vendor/peerjs.min.js';
    s.onload = () => (window.peerjs && window.peerjs.Peer ? resolve(window.peerjs.Peer) : reject(new Error('PeerJS が読み込めません')));
    s.onerror = () => { libPromise = null; reject(new Error('PeerJS のファイルが読み込めません')); };
    document.head.appendChild(s);
  });
  return libPromise;
}

function peerOptions() {
  const q = new URLSearchParams(location.search);
  const o = { debug: 0 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport') || 9000);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  return o;
}

const randomCode = () => Array.from({ length: CODE_LEN }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, CODE_LEN);

export class Net {
  constructor() {
    this.role = null;        // 'host'（部屋をつくった側）| 'guest'
    this.code = '';
    this.peer = null;
    this.conn = null;
    this.open = false;
    this.handlers = new Map(); // メッセージの種類 k → [fn]
    this.onStatus = () => {};  // (text, kind) 状態の表示用
    this.onOpen = () => {};    // つながった
    this.onClose = () => {};   // 切れた・つながらなかった（理由）
    this.lastRecv = 0;
    this.closed = false;
    this.pingTimer = null;
  }

  on(k, fn) { if (!this.handlers.has(k)) this.handlers.set(k, []); this.handlers.get(k).push(fn); }
  emit(k, m) { for (const fn of this.handlers.get(k) ?? []) fn(m); }
  send(m) { if (this.open && this.conn) { try { this.conn.send(m); } catch (e) { /* 切れたら onClose が来る */ } } }

  // 部屋をつくる: コードを決めて、相手が入ってくるのを待つ
  async host() {
    this.role = 'host';
    this.onStatus('じゅんび中…', 'wait');
    let Peer;
    try { Peer = await loadPeerLib(); } catch (e) { this.fail(e.message); return; }
    const tryOpen = (n) => {
      this.code = randomCode();
      const peer = new Peer(PREFIX + this.code, peerOptions());
      this.peer = peer;
      peer.on('open', () => this.onStatus('相手を待っています…', 'wait', this.code));
      peer.on('connection', (c) => {
        if (this.conn) { c.close(); return; } // 1対1: 2人目は断る
        this.attach(c);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && n < 5) { peer.destroy(); tryOpen(n + 1); return; } // コードが使われていたら、つくり直す
        this.fail(this.describe(err));
      });
      peer.on('disconnected', () => { if (!this.open && !this.closed) { try { peer.reconnect(); } catch (e) { /* 再接続できないときは、そのまま */ } } });
    };
    tryOpen(0);
  }

  // 部屋に入る
  async join(code) {
    this.role = 'guest';
    this.code = normalizeCode(code);
    if (this.code.length !== CODE_LEN) { this.fail('コードは ' + CODE_LEN + ' 文字です'); return; }
    this.onStatus('つないでいます…', 'wait');
    let Peer;
    try { Peer = await loadPeerLib(); } catch (e) { this.fail(e.message); return; }
    const peer = new Peer(undefined, peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      const c = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      this.attach(c);
      setTimeout(() => { if (!this.open && !this.closed) this.fail('つながりません。コードをたしかめて、もう一度ためしてください'); }, 15000);
    });
    peer.on('error', (err) => this.fail(this.describe(err)));
  }

  describe(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return 'その部屋は見つかりません。コードをたしかめてください';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '仲介サーバーにつながりません。ネットワークをたしかめてください';
    return '通信エラー: ' + (t || (err && err.message) || err);
  }

  attach(c) {
    this.conn = c;
    c.on('open', () => {
      this.open = true;
      this.lastRecv = performance.now();
      // 切れたことに早く気づくための、見張り（2 秒ごとに ping、7 秒なにも届かなければ切れたとみなす）
      this.pingTimer = setInterval(() => {
        this.send({ k: 'ping' });
        if (performance.now() - this.lastRecv > 7000) this.fail('あいてとの通信が切れました');
      }, 2000);
      this.onStatus('つながりました！', 'ok');
      this.onOpen();
    });
    c.on('data', (m) => {
      this.lastRecv = performance.now();
      if (m && m.k && m.k !== 'ping') this.emit(m.k, m);
    });
    c.on('close', () => this.fail('あいてとの通信が切れました'));
    c.on('error', (e) => this.fail(this.describe(e)));
  }

  fail(reason) {
    if (this.closed) return;
    this.close();
    this.onClose(reason);
  }

  close() {
    this.closed = true;
    this.open = false;
    clearInterval(this.pingTimer);
    try { this.conn && this.conn.close(); } catch (e) { /* 閉じるだけ */ }
    try { this.peer && this.peer.destroy(); } catch (e) { /* 閉じるだけ */ }
  }
}
