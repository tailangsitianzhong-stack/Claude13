// ローカル通信対戦の「相手」の扱い。
//
// 【しくみ】（1対1）
//  ・自分のキャラは、自分の端末が全部決める（位置・動き・体力・当たり判定）。
//  ・相手のキャラは「レプリカ」: 相手と同じ武器の、本物のコントローラを、こちらの端末でも動かす。
//      相手が操作を始めたとき（攻撃・スキル・必殺技など）に「act」が届くので、こちらのレプリカも同じ技を始める。
//      動く向きは、0.033 秒ごとの知らせ（snap）に入っている。技の進み方は、時間で決まるので、あとは同じように進む。
//      → 技のモーションも、飛んでいく球・文字・必殺技のムービーも、こちらの画面で（相手と同じものが）再現される。
//      → 相手の技は、届いたとき（通信の遅れだけ遅れて）すぐ始まるので、「当たった」の知らせとずれない。
//  ・位置・状態・体力・状態異常は、snap で定期的に合わせる（ずれたら、少しずつ直す。大きくずれたら、いきなり合わせる）。
//  ・技が当たったかは、当てたほうの端末が決める（当てるほうの画面が基準）。当たったら hit / launch / status / dmg を相手へ知らせ、
//      同時に、こちらのレプリカにもすぐ反映する（予測）。相手の端末も、同じように自分のキャラに反映する。
//  ・掴む技など、こちらが相手を動かす間（state が held / thrown）は、こちらが相手の位置・姿勢を送りつける（force）。
//  ・体力が 0 になったほうが ko を送り、負けになる。

const VIS_KEYS = ['sword', 'bat', 'fist', 'claws', 'clawsL', 'fangs', 'dagger', 'great', 'swordModel', 'armSticker', 'sawL', 'legSawL', 'legSawR', 'headSaw', 'gearL', 'gearR'];
const r3 = (v) => Math.round(v * 1000) / 1000;
const wrapAngle = (d) => d - Math.PI * 2 * Math.round(d / (Math.PI * 2));

// 状態を大きく分けたもの（レプリカと本人の状態が、同じ種類かを見るため）
const FREE = new Set(['ground', 'crouch', 'air', 'land']);
const REACT = new Set(['hit', 'launched', 'down']);
const HELD = new Set(['held', 'thrown']);
export const HURTABLE = new Set(['ground', 'crouch', 'air', 'land', 'attack', 'hit']); // 攻撃を受ける状態（技・必殺技・投げの最中は受けない）
export function stateKind(st) {
  if (FREE.has(st)) return 'free';
  if (st === 'attack' || st === 'airSlam') return 'atk';
  if (REACT.has(st)) return 'react';
  if (HELD.has(st)) return 'held';
  return 'move';   // skill / skill2〜4 / bskillN / ult / finisher
}
export const moveLocked = (k) => { const s = k.state; return s === 'ult' || s === 'skill' || s === 'skill2' || s === 'skill3' || s === 'skill4' || s === 'airSlam' || s === 'finisher' || s.startsWith('bskill'); }; // 技の最中は、相手の技を受けない
const CANCELS = ['cancelBat', 'cancelFang', 'cancelArrow', 'cancelOnom', 'cancelSaw'];
// 技の途中でやめる（コントローラごとの後始末を呼ぶ）
export function cancelMoves(k) {
  for (const fn of CANCELS) if (typeof k[fn] === 'function') k[fn]();
  k.sk = null; k.s2 = null; k.s3 = null; k.s4 = null; if ('bs' in k) k.bs = null;
  k.attackActive = false; k.c.animator.trailOn = false;
}

// 必殺技を途中でやめる（ムービーの前でも、安全に: 元の位置へ戻して、必殺技の状態を片づける）
export function abortUlt(ctl) {
  const u = ctl.ult;
  if (!u) return;
  const g = ctl.c.group;
  const vg = ctl.victim ? ctl.victim.c.group : null;
  if (!u.saved) u.saved = { px: g.position.x, pz: g.position.z, py: 0, yaw: g.rotation.y, ex: vg ? vg.position.x : 0, ez: vg ? vg.position.z : 0, eyaw: vg ? vg.rotation.y : 0 };
  try { ctl.endUlt(); } catch (e) { ctl.ult = null; ctl.state = 'ground'; }
}

// ---- 自分の操作を、相手へ知らせる（中継）----
// 「技を始める」メソッドを包んで、呼ばれたら相手へ知らせる。内側から呼ばれたもの（技の中で別の開始メソッドを呼ぶ）は、知らせない。
export const ACT_NAMES = ['startAttack', 'startAirSlam', 'startSkill', 'startSkill2', 'startSkill3', 'startSkill4', 'startFinisher', 'startUlt',
  'startBatSkill', 'startFangSkill', 'startAirClaws', 'startNeckBite', 'startArrowSkill', 'startPress', 'startOnomSkill', 'startSawSkill', 'startSawStab'];
const ACT_SET = new Set(ACT_NAMES);
export function installRelay(ctl, relay) {
  for (const name of ACT_NAMES) {
    const orig = ctl[name];
    if (typeof orig !== 'function') continue;
    ctl[name] = function relayed(...args) {
      const top = relay.depth === 0;
      relay.depth++;
      try {
        if (top && relay.on && relay.send) relay.send({ k: 'act', m: name, a: args });
        return orig.apply(this, args);
      } finally { relay.depth--; }
    };
  }
}

// 位置・動き・体力など（0.033 秒ごとに送る、小さな知らせ）
export function takeState(ctl, c) {
  const g = c.group;
  return {
    x: r3(g.position.x), y: r3(g.position.y), z: r3(g.position.z), ry: r3(g.rotation.y),
    vx: r3(ctl.vx), vz: r3(ctl.vz), vy: r3(ctl.vy), st: ctl.state, hp: Math.round(ctl.health.hp), w: c.weapon,
    sts: ctl.status.list().map((s) => [s.name, r3(s.left)]),
  };
}

// 全身の姿勢（force 用: こちらが相手を動かすときに送る）
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

// 姿勢（モーション・見た目）を、force のとおりにする
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

const passThrough = (t, k) => { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; };

export class Replica {
  /**
   * @param {object} o
   *   npc: { c }（相手として表示するキャラ）
   *   makeCtl(weaponId, char): 武器のコントローラを作る
   *   onError(label, err)
   */
  constructor(o) {
    this.c = o.npc.c;
    this.makeCtl = o.makeCtl;
    this.onError = o.onError ?? (() => {});
    this.ctls = new Map();     // 武器 → コントローラ
    this.ctl = null;           // 今のレプリカ（本物のコントローラ）
    this.victim = null;        // こちらの攻撃が触る窓口（Proxy）: 当たったら相手へ知らせ、レプリカにも反映する
    this.ghost = null;         // レプリカの攻撃が触る、こちらのキャラ（Proxy）: 見た目の動きだけ通し、ダメージ・のけぞりは通さない
    this.localChar = null;
    this.localCtl = null;
    this.weaponId = null;
    this.active = false;
    this.net = null;
    this.snap = null;
    this.snapAt = 0;
    this.lastT = -1;           // 最後に受けた snap の時刻（古いものを捨てる）
    this.placed = false;
    this.cmd = { x: 0, z: 0, run: false, jump: false, attack: false, skill: false, skillHold: false, skill2: false, ult: false, toggleStance: false };
    this.mismatchT = 0;
    this.forceDirty = false;
    this.forceAcc = 0;
    this.predicted = new Map(); // 状態異常 → 予測で付けた時刻（あいての答えが来るまで、消さない）
    this.guard = null;          // (m) => bool: この act を受け付けるか
    this.stats = { acts: 0, actErr: 0, resync: 0, snaps: 0, hits: 0, late: 0 };
  }

  // 相手の武器のコントローラを用意する（ロード中に作る物がある武器は、ここで作っておく）
  use(id) {
    this.c.setWeapon(id);
    let ctl = this.ctls.get(id);
    if (!ctl) {
      ctl = this.makeCtl(id, this.c);
      ctl.idle = 'fight';
      this.ctls.set(id, ctl);
      if (typeof ctl.preload === 'function') ctl.preload();
      if (typeof ctl.ensureIron === 'function') ctl.ensureIron();
    }
    this.ctl = ctl;
    this.weaponId = id;
    this.victim = this.makeVictim(ctl);
    if (this.ghost) { ctl.victim = this.ghost; ctl.target = this.localChar; }
    return ctl;
  }

  // レプリカの攻撃が触る、こちらのキャラ（自分のコントローラの窓口）
  bindLocal(localCtl, localChar) {
    const statusP = new Proxy(localCtl.status, { get: (t, k) => (k === 'apply' ? () => {} : passThrough(t, k)) });
    const healthP = new Proxy(localCtl.health, { get: (t, k) => (k === 'damage' ? () => 0 : passThrough(t, k)), set: (t, k, v) => { t[k] = v; return true; } });
    this.ghost = new Proxy(localCtl, {
      get: (t, k) => {
        if (k === 'hit' || k === 'launch') return () => {};   // のけぞり・吹き飛ばしは、相手の端末が決めて知らせてくる（hit / launch）
        if (k === 'status') return statusP;
        if (k === 'health') return healthP;
        return passThrough(t, k);
      },
      set: (t, k, v) => {
        // つかむ・運ぶ・ムービーでの状態と位置は、通す。ただし、自分が技・必殺技の最中のとき、つかまれる（held / thrown）ことはない。
        // 離す・倒す（held / thrown から別の状態へ）は、つかまれている間だけ通す（のけぞり中などを、上書きしない）
        if (k === 'state') {
          if (v === 'held' || v === 'thrown') { if (moveLocked(t) || t.state === 'ult') return true; }
          else if (!HELD.has(t.state)) return true;
        }
        t[k] = v;
        return true;
      },
    });
    this.localChar = localChar;
    this.localCtl = localCtl;
    for (const ctl of this.ctls.values()) { ctl.victim = this.ghost; ctl.target = localChar; }
  }

  makeVictim(raw) {
    const self = this;
    const statusP = new Proxy(raw.status, { get: (t, k) => (k === 'apply' ? (name, d) => self.onStatus(name, d) : passThrough(t, k)) });
    const healthP = new Proxy(raw.health, { get: (t, k) => (k === 'damage' ? (n) => self.onDamage(n) : passThrough(t, k)), set: (t, k, v) => { t[k] = v; return true; } });
    return new Proxy(raw, {
      get(t, k) {
        if (k === 'hit') return (dx, dz, power = 1) => self.onHit(dx, dz, power);
        if (k === 'launch') return (dx, dz, speed, up) => self.onLaunch(dx, dz, speed, up);
        if (k === 'status') return statusP;
        if (k === 'health') return healthP;
        if (k === '__raw') return t;
        return passThrough(t, k);
      },
      set(t, k, v) {
        t[k] = v;
        if (k === 'state' && self.active) self.forceDirty = true;   // こちらの技が、相手の state を書き換えた（掴む・離す・倒す）: 相手へ知らせる
        return true;
      },
    });
  }

  send(m) { if (this.net) this.net.send(m); }

  // ---- こちらの攻撃が当たった ----
  onHit(dx, dz, power) {
    const raw = this.ctl;
    if (!this.active) return raw.hit(dx, dz, power);
    this.stats.hits++;
    this.send({ k: 'hit', dx: r3(dx), dz: r3(dz), power });
    if (HURTABLE.has(raw.state)) raw.hit(dx, dz, power);        // 予測: すぐ、のけぞらせる（相手の答えは、あとから合わせる）
  }

  onLaunch(dx, dz, speed, up) {
    const raw = this.ctl;
    if (!this.active) return raw.launch(dx, dz, speed, up);
    this.send({ k: 'launch', dx: r3(dx), dz: r3(dz), speed, up });
    if (!moveLocked(raw) && !HELD.has(raw.state)) raw.launch(dx, dz, speed, up);
  }

  onStatus(name, d) {
    const raw = this.ctl;
    if (!this.active) return raw.status.apply(name, d);
    this.send({ k: 'status', name, d });
    raw.status.apply(name, d);
    this.predicted.set(name, performance.now() + 600);
  }

  onDamage(n) {
    const raw = this.ctl;
    const h = raw.health;
    if (!this.active) return h.damage(n);
    const d = Math.min(h.hp, Math.max(0, n));
    if (d <= 0 || h.invulnerable) return 0;
    h.hp -= d;                       // 先に減らして見せる（本当の体力は、相手から届く）
    this.send({ k: 'dmg', n: d });
    return d;
  }

  // ---- 始める・止める ----
  start(net) {
    this.net = net;
    this.active = true;
    this.reset();
  }
  stop() { this.active = false; this.net = null; }

  reset() {
    this.snap = null; this.lastT = -1; this.placed = false; this.mismatchT = 0;
    this.forceDirty = false; this.forceAcc = 0;
    this.predicted.clear();
    const c = this.cmd;
    c.x = c.z = 0; c.run = c.jump = c.skillHold = c.toggleStance = false;
  }

  // ---- 相手から届いたもの ----
  // act: 相手が技を始めた（または、ジャンプなど）。こちらのレプリカも、同じように始める
  onAct(m) {
    if (!this.active || !this.ctl) return;
    if (m.p) { if (m.p === 'jump') this.cmd.jump = true; else if (m.p === 'stance') this.cmd.toggleStance = true; return; }
    if (!ACT_SET.has(m.m)) return;
    if (this.guard && !this.guard(m)) return;
    const fn = this.ctl[m.m];
    if (typeof fn !== 'function') return;
    this.stats.acts++;
    try { fn.apply(this.ctl, m.a ?? []); } catch (e) { this.stats.actErr++; this.onError('act ' + m.m, e); }
  }

  // snap: 位置・状態・体力・状態異常と、動かしている向き
  onSnap(s) {
    if (!this.active || !this.ctl) return;
    if (s.t <= this.lastT) { this.stats.late++; return; }   // 追い越された古い知らせは、捨てる
    this.lastT = s.t;
    this.stats.snaps++;
    this.snap = s;
    this.snapAt = performance.now();
    const cmd = this.cmd;
    cmd.x = s.cx; cmd.z = s.cz; cmd.run = !!s.cr; cmd.skillHold = !!(s.ch & 2);
    const ctl = this.ctl;
    ctl.health.hp = s.hp;
    // 状態異常: 相手の側にあるものに合わせる（こちらが今つけたものは、答えが来るまで残す）
    const now = performance.now();
    const have = new Set(s.sts.map((e) => e[0]));
    for (const [name, left] of s.sts) {
      if (!ctl.status.has(name)) ctl.status.apply(name, left);
      else { const e = ctl.status.active.get(name); if (e) e.left = left; }
    }
    for (const name of [...ctl.status.active.keys()]) {
      if (have.has(name)) continue;
      if ((this.predicted.get(name) ?? 0) > now) continue;
      ctl.status.remove(name);
    }
    if (!this.placed) {
      this.c.group.position.set(s.x, s.y, s.z);
      this.c.group.rotation.y = s.ry;
      this.placed = true;
    }
  }

  // 相手の端末が自分の位置・姿勢を決める（force）が、必要かどうか: レプリカが、すでにこちらを動かしているなら不要
  holdingLocal() {
    const ctl = this.ctl;
    if (!ctl) return false;
    const st = ctl.state;
    return st.startsWith('bskill') || st === 'ult' || st === 'finisher' || st === 'skill' || st === 'skill2' || st === 'skill3' || st === 'skill4'
      || !!(ctl.nb || ctl.pn || ctl.stab);
  }

  // ---- 毎フレーム ----
  update(dt) {
    const ctl = this.ctl;
    if (!ctl || !this.active) return;
    const cmd = this.cmd;
    ctl.update(dt, cmd);
    cmd.jump = false; cmd.toggleStance = false;
    this.reconcile(dt);
  }

  takeEvents() {
    const ctl = this.ctl;
    if (!ctl || ctl.events.length === 0) return null;
    return ctl.events.splice(0);
  }

  reconcile(dt) {
    const s = this.snap;
    if (!s) return;
    const ctl = this.ctl;
    const g = this.c.group;
    const st = ctl.state;
    if (HELD.has(st)) return;                 // こちらが動かしている間は、合わせない
    const mine = stateKind(st);
    const theirs = stateKind(s.st);
    // 状態のずれ: しばらく続いたら、相手に合わせる
    if (theirs === mine || theirs === 'held') this.mismatchT = 0;
    else {
      this.mismatchT += dt;
      if (this.mismatchT > 0.4) { this.mismatchT = 0; this.resync(s, mine, theirs); }
    }
    // 位置: 相手の位置（動いていれば少し先）へ、少しずつ寄せる。技の最中は弱く、ムービーの最中は合わせない
    const cine = st === 'ult' && ctl.ult && ctl.ult.phase === 'cine';
    if (cine) return;
    const age = Math.min(0.15, (performance.now() - this.snapAt) / 1000);
    const tx = s.x + s.vx * age;
    const tz = s.z + s.vz * age;
    const err = Math.hypot(tx - g.position.x, tz - g.position.z);
    const rate = mine === 'move' ? 2.5 : 10;
    const k = err > 3 ? 1 : 1 - Math.exp(-rate * dt);
    g.position.x += (tx - g.position.x) * k;
    g.position.z += (tz - g.position.z) * k;
    if (mine !== 'move' && st !== 'air' && st !== 'launched' && Math.abs(s.y - g.position.y) > 0.4) g.position.y += (s.y - g.position.y) * k;
    if (mine === 'free' || mine === 'react') g.rotation.y += wrapAngle(s.ry - g.rotation.y) * (1 - Math.exp(-6 * dt));
  }

  // 状態の種類が、しばらく食いちがっている: レプリカを、相手に合わせる
  resync(s, mine, theirs) {
    const ctl = this.ctl;
    this.stats.resync++;
    if (mine === 'move' && (theirs === 'free' || theirs === 'atk' || theirs === 'react')) {
      // 相手は、もう技を終えている（または、技が止められた）: レプリカの技も、やめる
      if (ctl.ult && typeof ctl.endUlt === 'function') abortUlt(ctl);
      else cancelMoves(ctl);
      ctl.state = theirs === 'react' ? s.st : 'ground';
      ctl.vx = ctl.vz = 0;
      if (theirs !== 'react') this.c.animator.play('fight', 0.1);
    } else if (theirs === 'react' && (mine === 'free' || mine === 'atk')) {
      // 相手は、のけぞっている・飛ばされている（こちらの知らない理由で）
      if (s.st === 'launched' || s.st === 'down') { ctl.state = s.st; ctl.downTimer = 1.0; this.c.animator.play(s.st === 'down' ? 'down' : 'thrown', 0.05); }
      else ctl.hit(s.vx || 0.01, s.vz || 0.01, 1);
    } else if (mine === 'react' && (theirs === 'free' || theirs === 'atk')) {
      // こちらの予測で、のけぞらせたが、相手には当たっていなかった
      ctl.state = 'ground';
      this.c.animator.play('fight', 0.1);
    }
  }

  // フレームの終わりに: こちらが相手を動かした（state を書き換えた・掴んでいる）なら、その姿勢を相手へ送る
  flush(realDt) {
    if (!this.active || !this.ctl) return;
    const raw = this.ctl;
    const driven = HELD.has(raw.state);
    if (driven) this.forceAcc += realDt; else this.forceAcc = 0;
    if (this.forceDirty || (driven && this.forceAcc >= 0.05)) {
      this.forceDirty = false;
      this.forceAcc = 0;
      this.send({ k: 'force', ...takeSnapshot(raw, this.c) });
    }
  }
}
