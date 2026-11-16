// ムービー用の画面効果（HTML）: 上下の黒帯（シネマスコープ）、全画面の閃光、集中線、タイトル文字。
// すべて数値で毎フレーム更新するので、時間のスローや早送りの影響を受けない。

const CSS = `
#cine-overlay { position: fixed; inset: 0; z-index: 10; pointer-events: none; overflow: hidden; }
#cine-overlay .bar { position: absolute; left: 0; right: 0; height: 13vh; background: #000; }
#cine-overlay .bar.top { top: 0; transform-origin: top; }
#cine-overlay .bar.bottom { bottom: 0; transform-origin: bottom; }
#cine-overlay .vig { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, transparent 52%, rgba(0,0,12,0.7) 100%); }
#cine-overlay .lines { position: absolute; inset: -40%; opacity: 0; mix-blend-mode: screen;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0) 0deg 2.6deg, rgba(170,225,255,0.55) 2.9deg, rgba(255,255,255,0) 3.4deg 5.2deg);
  -webkit-mask: radial-gradient(circle, transparent 24%, #000 66%); mask: radial-gradient(circle, transparent 24%, #000 66%); }
#cine-overlay .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
#cine-overlay .title { position: absolute; left: 0; right: 0; top: 38%; text-align: center; opacity: 0; color: #fff;
  font: 900 min(14vw, 96px)/1 system-ui, sans-serif; letter-spacing: 0.12em; -webkit-text-stroke: 5px #0a3a6b; paint-order: stroke fill;
  text-shadow: 0 0 24px #4fd8ff, 0 6px 0 #04203d; }
#cine-overlay .title small { display: block; margin-top: 12px; font-size: min(3.6vw, 24px); letter-spacing: 0.5em; -webkit-text-stroke: 0; color: #bfeaff; text-shadow: 0 0 10px #4fd8ff; }
`;

export class CineOverlay {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'cine-overlay';
    this.root.innerHTML = '<div class="vig"></div><div class="lines"></div><div class="bar top"></div><div class="bar bottom"></div><div class="title"></div><div class="flash"></div>';
    document.body.appendChild(this.root);
    const q = (s) => this.root.querySelector(s);
    this.el = { top: q('.bar.top'), bottom: q('.bar.bottom'), vig: q('.vig'), lines: q('.lines'), flash: q('.flash'), title: q('.title') };
    this.bars = 0;        // 黒帯の出具合（0〜1）
    this.barsTarget = 0;
    this.flashLevel = 0;
    this.linesTarget = 0;
    this.linesLevel = 0;
    this.titleT = -1;
    this.spin = 0;
    this.render();
  }

  setOn(on) { this.barsTarget = on ? 1 : 0; if (!on) this.linesTarget = 0; }
  setLines(on) { this.linesTarget = on ? 1 : 0; }
  // 全画面を白く光らせる（level 1 で真っ白）。そこから消えていく
  flash(level = 1) { this.flashLevel = Math.max(this.flashLevel, level); }
  title(main, sub = '', duration = 1.6) {
    this.el.title.innerHTML = sub ? `${main}<small>${sub}</small>` : main;
    this.titleDuration = duration;
    this.titleT = 0;
  }

  update(dt) {
    this.bars += (this.barsTarget - this.bars) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.bars - this.barsTarget) < 0.002) this.bars = this.barsTarget;
    this.flashLevel = Math.max(0, this.flashLevel - dt * 2.6);
    this.linesLevel += (this.linesTarget - this.linesLevel) * (1 - Math.exp(-14 * dt));
    this.spin += dt;
    if (this.titleT >= 0) { this.titleT += dt; if (this.titleT > this.titleDuration) this.titleT = -1; }
    this.render();
  }

  render() {
    const e = this.el;
    e.top.style.transform = `scaleY(${this.bars.toFixed(3)})`;
    e.bottom.style.transform = `scaleY(${this.bars.toFixed(3)})`;
    e.vig.style.opacity = (this.bars * 0.9).toFixed(3);
    e.flash.style.opacity = Math.min(1, this.flashLevel).toFixed(3);
    e.lines.style.opacity = (this.linesLevel * 0.85).toFixed(3);
    e.lines.style.transform = `rotate(${(Math.floor(this.spin * 18) * 7) % 360}deg) scale(${1 + 0.06 * Math.sin(this.spin * 30)})`;
    if (this.titleT >= 0) {
      const k = this.titleT / this.titleDuration;
      const pop = this.titleT < 0.15 ? 2.2 - this.titleT / 0.15 * 1.2 : 1 + 0.04 * k; // 最初にどんと出る
      e.title.style.opacity = String(k < 0.08 ? k / 0.08 : k > 0.8 ? (1 - k) / 0.2 : 1);
      e.title.style.transform = `scale(${pop.toFixed(3)})`;
    } else e.title.style.opacity = '0';
  }
}
