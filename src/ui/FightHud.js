import * as THREE from 'three';

// 対戦の表示: 画面上部の自分の HP バー（相手の HP は表示しない）、自分の必殺技ゲージ、ダメージ数字、KO などの大きな文字。

const CSS = `
#fight-hud { position: fixed; top: 30px; left: 0; right: 0; z-index: 6; display: flex; gap: 10px; padding: 0 max(12px, env(safe-area-inset-left)) 0 max(12px, env(safe-area-inset-right));
  pointer-events: none; font: 700 12px/1 system-ui, sans-serif; color: #fff; transition: opacity 0.2s; }
#fight-hud .side { flex: 0 1 min(46%, 380px); min-width: 0; }
#fight-hud .mid { align-self: flex-start; padding: 2px 8px; border-radius: 6px; background: rgba(20,24,40,0.75); font-size: 11px; letter-spacing: 1px; }
#fight-hud .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; text-shadow: 0 1px 2px #000a; }
#fight-hud .right .top { flex-direction: row-reverse; }
#fight-hud .name { font-size: 13px; letter-spacing: 1px; }
#fight-hud .num { font-variant-numeric: tabular-nums; opacity: 0.9; }
#fight-hud .hp { position: relative; height: 13px; border-radius: 4px; background: rgba(10,12,24,0.7); border: 2px solid rgba(255,255,255,0.85); overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.35); }
#fight-hud .hp i { position: absolute; top: 0; bottom: 0; left: 0; width: 100%; transform-origin: left; }
#fight-hud .right .hp i { left: auto; right: 0; transform-origin: right; }
#fight-hud .hp .ghost { background: #ffcf5a; }
#fight-hud .hp .fill { background: linear-gradient(#7dff8a, #1fbf3a); }
#fight-hud .hp.low .fill { background: linear-gradient(#ff8a7d, #e0301f); }
#fight-hud .gauge { position: relative; margin-top: 5px; height: 9px; width: 70%; border-radius: 4px; background: rgba(10,12,24,0.7); border: 2px solid rgba(255,255,255,0.7); overflow: hidden; }
#fight-hud .gauge i { position: absolute; inset: 0; transform-origin: left; transform: scaleX(0); background: linear-gradient(90deg, #ffb300, #ff6d00); }
#fight-hud .gauge.full i { background: linear-gradient(90deg, #fff176, #ffb300, #fff176); background-size: 200% 100%; animation: gauge-full 0.7s linear infinite; }
#fight-hud .glabel { margin-top: 3px; font-size: 10px; color: #ffd27a; text-shadow: 0 1px 2px #000a; height: 11px; }
#fight-hud .glabel.full { color: #fff176; animation: blink 0.5s ease-in-out infinite alternate; }
@keyframes gauge-full { from { background-position: 0 0; } to { background-position: -200% 0; } }
@keyframes blink { from { opacity: 1; } to { opacity: 0.45; } }
#dmg-layer { position: fixed; inset: 0; z-index: 12; pointer-events: none; overflow: hidden; }
#dmg-layer .dmg { position: absolute; transform: translate(-50%, -50%); font: 900 20px/1 system-ui, sans-serif; color: #fff; paint-order: stroke fill;
  -webkit-text-stroke: 4px #1b1b30; text-shadow: 0 2px 0 #1b1b30; white-space: nowrap; }
#dmg-layer .dmg.big { font-size: 30px; color: #ffe066; }
#dmg-layer .dmg.huge { font-size: 42px; color: #ff6a3d; }
#dmg-layer .dmg.heal { font-size: 26px; color: #7dff9a; -webkit-text-stroke: 4px #0b3a1a; text-shadow: 0 2px 0 #0b3a1a; }
#fight-banner { position: fixed; left: 50%; top: 52%; transform: translate(-50%, -50%) scale(1); z-index: 14; pointer-events: none; text-align: center;
  font: 900 min(15vw, 64px)/1 system-ui, sans-serif; color: #fff; -webkit-text-stroke: 5px #b3261e; paint-order: stroke fill; letter-spacing: 4px;
  text-shadow: 0 6px 0 #5a0f0a; opacity: 0; }
#fight-banner.show { animation: banner-pop 1.6s ease-out forwards; }
#fight-banner small { display: block; margin-top: 10px; font-size: 18px; -webkit-text-stroke: 0; color: #fff; letter-spacing: 2px; text-shadow: 0 2px 4px #000a; }
@keyframes banner-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(2.2); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } }
body.pre-match #fight-hud, body.pre-match .status-hud, body.pre-match #touch-ui, body.pre-match #hud, body.pre-match #combo-prompt, body.pre-match #ult-prompt { visibility: hidden; }
body.cine-on #dmg-layer .dmg { font-size: 15px; -webkit-text-stroke: 3px #04203d; opacity: 0.9; }
body.cine-on #dmg-layer .dmg.big { font-size: 20px; }
body.cine-on #dmg-layer .dmg.huge { font-size: 34px; }
body.cine-on #fight-hud, body.cine-on .status-hud, body.cine-on #touch-ui, body.cine-on #combo-prompt, body.cine-on #ult-prompt { opacity: 0 !important; pointer-events: none !important; }
`;

const v = new THREE.Vector3();

export class FightHud {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'fight-hud';
    this.root.innerHTML = `
      <div class="side left">
        <div class="top"><span class="name">P1</span><span class="num"></span></div>
        <div class="hp"><i class="ghost"></i><i class="fill"></i></div>
        <div class="gauge"><i></i></div><div class="glabel"></div>
      </div>
      `;
    // 相手の HP は表示しない（内部では Health が数えていて、KO や必殺技の判定には使う）
    document.body.appendChild(this.root);

    this.layer = document.createElement('div');
    this.layer.id = 'dmg-layer';
    document.body.appendChild(this.layer);
    this.banner = document.createElement('div');
    this.banner.id = 'fight-banner';
    document.body.appendChild(this.banner);

    const q = (s) => this.root.querySelector(s);
    this.l = { fill: q('.left .fill'), ghost: q('.left .ghost'), num: q('.left .num'), hp: q('.left .hp'), gauge: q('.gauge'), gaugeFill: q('.gauge i'), label: q('.glabel') };
    this.ghostL = 1;
    this.pops = [];
    this.lastFull = false;
  }

  // 毎フレーム呼ぶ。自分と相手の HP、自分のゲージ、ダメージ数字の位置を更新する
  update(dt, camera, me, foe) {
    const set = (side, health, ghostKey) => {
      const r = health.ratio;
      side.fill.style.transform = `scaleX(${r.toFixed(4)})`;
      // 減った分は、黄色いバーがあとからゆっくり追いかける
      this[ghostKey] = Math.max(r, this[ghostKey] - dt * 0.35);
      if (this[ghostKey] < r) this[ghostKey] = r;
      side.ghost.style.transform = `scaleX(${this[ghostKey].toFixed(4)})`;
      side.num.textContent = `${Math.ceil(health.hp)} / ${health.max}`;
      side.hp.classList.toggle('low', r < 0.3);
    };
    set(this.l, me.health, 'ghostL');
    const g = me.gauge;
    this.l.gaugeFill.style.transform = `scaleX(${g.ratio.toFixed(4)})`;
    this.l.gauge.classList.toggle('full', g.full);
    this.l.label.classList.toggle('full', g.full);
    this.l.label.textContent = g.full ? '必殺技 READY' : `必殺技 ${Math.floor(g.ratio * 100)}%`;
    this.lastFull = g.full;

    // ダメージ数字: ワールドの位置を画面へ投影し、上へ浮かせて消す
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t >= p.life) { p.el.remove(); this.pops.splice(i, 1); continue; }
      v.copy(p.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth + p.dx;
      const y = (-v.y * 0.5 + 0.5) * innerHeight - 28 * Math.min(1, p.t / 0.5) - p.t * 22;
      p.el.style.left = `${x}px`;
      p.el.style.top = `${y}px`;
      p.el.style.opacity = v.z > 1 ? 0 : String(Math.min(1, (p.life - p.t) / 0.25));
      p.el.style.transform = `translate(-50%, -50%) scale(${(1 + Math.max(0, 0.35 - p.t * 2.5)).toFixed(3)})`;
    }
  }

  popDamage(pos, amount, kind = '') {
    if (amount <= 0) return;
    const limit = document.body.classList.contains('cine-on') ? 6 : 40;
    while (this.pops.length >= limit) { const old = this.pops.shift(); old.el.remove(); }
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = kind === 'heal' ? '+' + Math.round(amount) : Math.round(amount);
    this.layer.appendChild(el);
    this.pops.push({ el, pos: pos.clone(), t: 0, life: kind === 'huge' ? 1.3 : 0.85, dx: (Math.random() - 0.5) * 40 });
  }

  // 画面中央の大きな文字（KO など）
  showBanner(text, sub = '') {
    this.banner.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }
}
