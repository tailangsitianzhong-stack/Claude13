// ローカル通信対戦の「相手」の扱い。
//
// しくみ（1対1）:
//  - 自分のキャラは、自分の端末が全部決める（位置・動き・体力）。その様子を、0.05 秒ごとに相手へ送る（snap）。
//  - 相手のキャラ（Puppet）は、届いた snap のとおりに動かす（なめらかに補間）。見た目の動き（モーション）は、モーション名と進み具合で再現する。
//  - 自分の技が相手に当たったかは、自分の端末で調べる（当たったほうが決める）。当たったら「当たった」（hit / launch / status / dmg）を相手へ送り、
//    相手の端末が、自分のキャラに反映する（のけぞる・ダメージ・体力）。
//  - 掴む技など、こちらが相手のキャラを動かす間（state が held / thrown）は、こちらが相手の位置・姿勢を送りつける（force）。
//  - 体力が 0 になったほうが ko を送り、負けになる。
// 【できないこと】相手の技の演出（飛んでいく球・文字・ムービー）は、相手の画面にだけ出る。こちらには、モーションと「当たったときの反応」が出る。

const VIS_KEYS = ['sword', 'bat', 'fist', 'claws', 'clawsL', 'fangs', 'dagger', 'great', 'swordModel', 'armSticker', 'sawL', 'legSawL', 'legSawR', 'headSaw', 'gearL', 'gearR'];
const r3 = (v) => Math.round(v * 1000) / 1000;
const wrapAngle = (d) => d - Math.PI * 2 * Math.round(d / (Math.PI * 2));

export function takeSnapshot(ctl, c) {
  const g = c.group;
  const a = c.animator;
  let vis = 0;
  VIS_KEYS.forEach((k, i) => { const o = k === 'sword' ? c.sword : c[k]; if (o && o.visible) vis |= 1 << i; });
  return {
    x: r3(g.position.x), y: r3(g.position.y), z: r3(g.position.z), ry: r3(g.rotation.y), rx: r3(g.rotation.x), rz: r3(g.rotation.z),
    vx: r3(ctl.vx), vz: r3(ctl.vz), vy: r3(ctl.vy), dt: r3(ctl.downTimer ?? 0),
    st: ctl.state, an: a.name, at: r3(a.attackT), ht: r3(a.hitT), au: r3(a.airU), ph: r3(a.phase), sp: r3(a.spin),
    ln: r3(a.lean), bk: r3(a.bank), tr: a.trailOn ? 1 : 0, w: c.weapon, hp: Math.round(ctl.health.hp),
    sts: ctl.status.list().map((s) => [s.name, r3(s.left)]), vis,
  };
}

// 姿勢（モーション・見た目）を、snap のとおりにする。hard: 補間せず、いきなり合わせる
function applyLook(c, s) {
  const a = c.animator;
  if (c.weapon !== s.w) c.setWeapon(s.w);
  if (a.name !== s.an) a.play(s.an, 0.06);
  a.airU = s.au; a.spin = s.sp;
  a.lean = a.leanTarget = s.ln; a.bank = a.bankTarget = s.bk; a.leanV = a.bankV = 0;
  a.trailOn = !!s.tr;
  c.group.rotation.x = s.rx; c.group.rotation.z = s.rz;
  VIS_KEYS.forEach((k, i) => { const o = k === 'sword' ? c.sword : c[k]; if (o && o.visible !== undefined) o.visible = !!(s.vis & (1 << i)); });
}

// 相手の技で自分が「つかまれる・投げられる」ときなど、相手が自分の位置・姿勢を決める（force を受け取った側）
export function applyForce(ctl, c, s) {
  const g = c.group;
  g.position.set(s.x, s.y, s.z);
  g.rotation.y = s.ry;
  applyLook(c, s);
  const a = c.animator;
  a.attackT = s.at; a.hitT = s.ht; a.phase = s.ph;
  ctl.state = s.st;
  ctl.vx = s.vx; ctl.vz = s.vz; ctl.vy = s.vy;
  ctl.downTimer = s.dt;
}

export class Puppet {
  // npc: { c, ctl }（相手として表示するキャラ）。active が false の間は、普通のキャラのまま（練習・バトルモード）
  constructor(npc) {
    this.c = npc.c;
    this.ctl = npc.ctl;
    this.active = false;
    this.net = null;
    this.driven = false;     // こちらが相手を動かしている（掴んでいる）間
    this.snap = null;
    this.snapAt = 0;
    this.rate = { at: 0, ht: 0, ph: 0 };
    this.at = 0; this.ht = 0; this.ph = 0;
    this.forceAcc = 0;
    this.applying = false;
    this.hits = 0;           // 確認用の数え
    this.install();
  }

  send(m) { if (this.net) this.net.send(m); }

  // 相手のキャラへの操作（のけぞらせる・吹き飛ばす・状態異常・ダメージ・state の書き換え）を、相手の端末への「知らせ」に差し替える
  install() {
    const ctl = this.ctl;
    const self = this;
    const origHit = ctl.hit.bind(ctl);
    const origLaunch = ctl.launch.bind(ctl);
    ctl.hit = (dx, dz, power = 1) => { if (!self.active) return origHit(dx, dz, power); self.hits++; self.send({ k: 'hit', dx: r3(dx), dz: r3(dz), power }); };
    ctl.launch = (dx, dz, speed, up) => { if (!self.active) return origLaunch(dx, dz, speed, up); self.send({ k: 'launch', dx: r3(dx), dz: r3(dz), speed, up }); };
    const st = ctl.status;
    this.origApply = st.apply.bind(st);
    st.apply = (name, d) => { if (!self.active) return self.origApply(name, d); self.send({ k: 'status', name, d }); };
    const h = ctl.health;
    const origDamage = h.damage.bind(h);
    h.damage = (n) => {
      if (!self.active) return origDamage(n);
      const d = Math.min(h.hp, Math.max(0, n));
      if (d <= 0 || h.invulnerable) return 0;
      h.hp -= d;                       // 先に減らして見せる（本当の体力は、相手から届く）
      self.send({ k: 'dmg', n: d });
      return d;
    };
    this._st = ctl.state;
    Object.defineProperty(ctl, 'state', {
      configurable: true, enumerable: true,
      get() { return self._st; },
      set(v) {
        const prev = self._st;
        self._st = v;
        if (!self.active || self.applying || v === prev) return;
        // こちらの技が、相手の state を書き換えた（掴む・離す・倒す）: 相手へ知らせる
        self.driven = v === 'held' || v === 'thrown';
        self.sendForce();
      },
    });
  }

  sendForce() { this.send({ k: 'force', ...takeSnapshot(this.ctl, this.c) }); }

  start(net) {
    this.net = net;
    this.active = true;
    this.driven = false;
    this.snap = null;
  }
  stop() { this.active = false; this.net = null; this.driven = false; this.snap = null; }

  // 相手から snap が届いた
  onSnap(s) {
    if (!this.active || this.driven) return;
    const now = performance.now();
    const prev = this.snap;
    if (prev && prev.an === s.an && now > this.snapAt) {
      const dt = (now - this.snapAt) / 1000;
      const cl = (v, m) => Math.max(-m, Math.min(m, v));
      this.rate.at = cl((s.at - prev.at) / dt, 4);
      this.rate.ht = cl((s.ht - prev.ht) / dt, 4);
      this.rate.ph = cl(wrapAngle(s.ph - prev.ph) / dt, 40);
      // 予想とのずれは、少しずつ直す（大きく外れたら、いきなり合わせる）
      this.at += (s.at - this.at) * (Math.abs(s.at - this.at) > 0.25 ? 1 : 0.5);
      this.ht += (s.ht - this.ht) * 0.5;
      this.ph += wrapAngle(s.ph - this.ph) * 0.5;
    } else {
      this.rate.at = this.rate.ht = this.rate.ph = 0;
      this.at = s.at; this.ht = s.ht; this.ph = s.ph;
    }
    this.snap = s;
    this.snapAt = now;
    const ctl = this.ctl;
    this.applying = true;
    ctl.state = s.st;
    this.applying = false;
    ctl.vx = s.vx; ctl.vz = s.vz; ctl.vy = s.vy; ctl.downTimer = s.dt;
    ctl.health.hp = s.hp;
    // 状態異常: 相手の側にあるものに合わせる
    const have = new Set(s.sts.map((e) => e[0]));
    for (const [name, left] of s.sts) {
      if (!ctl.status.has(name)) this.origApply(name, left);
      else { const e = ctl.status.active.get(name); if (e) e.left = left; }
    }
    for (const name of [...ctl.status.active.keys()]) if (!have.has(name)) ctl.status.remove(name);
    if (!this.placed) { this.c.group.position.set(s.x, s.y, s.z); this.c.group.rotation.y = s.ry; this.placed = true; }
  }

  // 毎フレーム（相手のキャラを動かす）。ctl.update の代わり
  update(dt) {
    const c = this.c;
    const g = c.group;
    const a = c.animator;
    this.ctl.status.update(dt);
    if (this.driven) {
      // こちらが掴んでいる間: 位置・姿勢を、0.05 秒ごとに相手へ送りつける
      this.forceAcc += dt;
      if (this.forceAcc >= 0.05) { this.forceAcc = 0; this.sendForce(); }
      return;
    }
    const s = this.snap;
    if (!s) return;
    const age = Math.min(0.2, (performance.now() - this.snapAt) / 1000);
    const tx = s.x + s.vx * age;
    const tz = s.z + s.vz * age;
    const far = Math.hypot(tx - g.position.x, tz - g.position.z) > 3;
    const k = far ? 1 : 1 - Math.exp(-22 * dt);
    g.position.x += (tx - g.position.x) * k;
    g.position.z += (tz - g.position.z) * k;
    g.position.y += (s.y - g.position.y) * k;
    g.rotation.y += wrapAngle(s.ry - g.rotation.y) * (1 - Math.exp(-20 * dt));
    applyLook(c, s);
    this.at = Math.min(1, Math.max(0, this.at + this.rate.at * dt));
    this.ht = Math.min(1, Math.max(0, this.ht + this.rate.ht * dt));
    this.ph += this.rate.ph * dt;
    a.attackT = this.at; a.hitT = this.ht; a.phase = this.ph;
  }
}
