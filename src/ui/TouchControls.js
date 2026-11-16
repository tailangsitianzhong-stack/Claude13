// スマホ横画面用の操作UI。
//  - 左半分: 触れた場所に出るスティック。倒した量で歩く速さが変わり、外周まで倒し切ると走る
//  - 右下  : 攻撃ボタン（押している間は連続斬り）。その左にジャンプ、真上にスキル1、左斜め上にスキル2（いずれも一回り小さい。使うとスキル3・スキル4に切り替わる）
// 画面のそれ以外の場所（右上側）をドラッグするとカメラが回る（OrbitControls が担当）。

const RUN_THRESHOLD = 0.92; // これ以上倒すと走る
const DEAD_ZONE = 0.12;

const CSS = `
#touch-ui { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#touch-ui.hidden { display: none; }
#stick-zone { position: absolute; left: 0; top: 30%; bottom: 0; width: 45%;
  pointer-events: auto; touch-action: none; }
#stick-base { position: absolute; width: var(--stick); height: var(--stick); margin: calc(var(--stick) / -2) 0 0 calc(var(--stick) / -2);
  border-radius: 50%; background: rgba(20, 30, 45, 0.28); border: 3px solid rgba(255, 255, 255, 0.55);
  box-sizing: border-box; transition: opacity 0.15s, border-color 0.1s, background 0.1s; opacity: 0.55; }
#stick-base.active { opacity: 1; }
#stick-base.run { border-color: #ffb43a; background: rgba(255, 150, 30, 0.22); }
#stick-base::after { /* 走りになる境目の目安 */
  content: ''; position: absolute; inset: 8%; border-radius: 50%; border: 2px dashed rgba(255, 255, 255, 0.25); }
#stick-knob { position: absolute; left: 50%; top: 50%; width: 44%; height: 44%; margin: -22% 0 0 -22%;
  border-radius: 50%; background: rgba(255, 255, 255, 0.9); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
#stick-base.run #stick-knob { background: #ffd27a; }
#run-label { position: absolute; left: 50%; top: -1.6em; transform: translateX(-50%);
  font: 700 13px/1 system-ui, sans-serif; color: #ffd27a; text-shadow: 0 1px 2px #000a;
  opacity: 0; transition: opacity 0.1s; white-space: nowrap; }
#stick-base.run #run-label { opacity: 1; }

#attack-btn { position: absolute; width: var(--btn); height: var(--btn);
  right: calc(28px + env(safe-area-inset-right)); bottom: calc(26px + env(safe-area-inset-bottom));
  border-radius: 50%; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle at 50% 35%, rgba(255, 110, 90, 0.95), rgba(200, 40, 30, 0.95));
  border: 4px solid rgba(255, 255, 255, 0.85); box-sizing: border-box;
  box-shadow: 0 4px 0 rgba(90, 10, 5, 0.6), 0 6px 14px rgba(0, 0, 0, 0.3);
  display: grid; place-items: center; transition: transform 0.05s, box-shadow 0.05s; }
#attack-btn.pressed { transform: translateY(3px) scale(0.94); box-shadow: 0 1px 0 rgba(90, 10, 5, 0.6), 0 2px 6px rgba(0, 0, 0, 0.3); }
#attack-btn svg { width: 56%; height: 56%; }

/* ジャンプ: 攻撃ボタンの左に、一回り小さく */
#jump-btn { position: absolute; width: var(--btn2); height: var(--btn2);
  right: calc(28px + env(safe-area-inset-right) + var(--btn) + 16px); bottom: calc(26px + env(safe-area-inset-bottom));
  border-radius: 50%; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle at 50% 35%, rgba(90, 170, 255, 0.95), rgba(30, 100, 210, 0.95));
  border: 4px solid rgba(255, 255, 255, 0.85); box-sizing: border-box;
  box-shadow: 0 4px 0 rgba(5, 40, 110, 0.6), 0 6px 14px rgba(0, 0, 0, 0.3);
  display: grid; place-items: center; transition: transform 0.05s, box-shadow 0.05s; }
#jump-btn.pressed { transform: translateY(3px) scale(0.94); box-shadow: 0 1px 0 rgba(5, 40, 110, 0.6), 0 2px 6px rgba(0, 0, 0, 0.3); }
#jump-btn svg { width: 54%; height: 54%; }
/* 必殺技: ゲージがたまると、ジャンプボタンの左に出てくる */
#ult-btn { position: absolute; width: var(--btn2); height: var(--btn2);
  right: calc(28px + env(safe-area-inset-right) + var(--btn) + 16px + var(--btn2) + 12px);
  bottom: calc(26px + env(safe-area-inset-bottom));
  border-radius: 50%; touch-action: none; box-sizing: border-box; display: grid; place-items: center;
  border: 4px solid #fff; background: radial-gradient(circle at 50% 35%, #fff59d, #ff9800 55%, #e53935);
  box-shadow: 0 4px 0 #8a1c10, 0 0 0 5px rgba(255, 214, 80, 0.55), 0 0 22px 8px rgba(255, 150, 30, 0.85);
  opacity: 0; transform: scale(0.2) rotate(-40deg); pointer-events: none;
  transition: opacity 0.12s, transform 0.3s cubic-bezier(0.2, 1.7, 0.4, 1); }
#ult-btn.show { opacity: 1; transform: scale(1) rotate(0); pointer-events: auto; animation: ult-glow 0.45s ease-in-out infinite alternate; }
#ult-btn.pressed { transform: scale(0.92); }
#ult-btn svg { width: 66%; height: 66%; }
@keyframes ult-glow { from { box-shadow: 0 4px 0 #8a1c10, 0 0 0 5px rgba(255, 214, 80, 0.4), 0 0 16px 5px rgba(255, 150, 30, 0.7); }
  to { box-shadow: 0 4px 0 #8a1c10, 0 0 0 8px rgba(255, 230, 120, 0.7), 0 0 30px 12px rgba(255, 170, 40, 1); } }

/* スキルボタン: ジャンプボタンと同じ大きさ。攻撃ボタンのまわりに並べる */
.skill-btn { position: absolute; width: var(--btn2); height: var(--btn2);
  border-radius: 50%; pointer-events: auto; touch-action: none; overflow: hidden;
  border: 4px solid rgba(255, 255, 255, 0.85); box-sizing: border-box;
  display: grid; place-items: center; transition: transform 0.05s, box-shadow 0.05s, filter 0.15s; }
.skill-btn.pressed { transform: translateY(3px) scale(0.94); }
.skill-btn svg { width: 60%; height: 60%; grid-area: 1 / 1; }
/* スキル1: 攻撃ボタンの真上 */
#skill-btn { right: calc(28px + env(safe-area-inset-right) + (var(--btn) - var(--btn2)) / 2);
  bottom: calc(26px + env(safe-area-inset-bottom) + var(--btn) + 14px);
  background: radial-gradient(circle at 50% 35%, rgba(190, 120, 255, 0.95), rgba(110, 40, 200, 0.95));
  box-shadow: 0 4px 0 rgba(50, 10, 100, 0.6), 0 6px 14px rgba(0, 0, 0, 0.3); }
/* 使ったあとにボタンが切り替わる（スキル1 → スキル3、スキル2 → スキル4）。切り替わっている間は .alt が付く */
.skill-btn .icon-alt { display: none; }
.skill-btn.alt .icon-main { display: none; }
.skill-btn.alt .icon-alt { display: block; }
/* スキル3: 水色。押している間は金色の輪でため具合を示す */
#skill-btn.alt { background: radial-gradient(circle at 50% 35%, rgba(120, 235, 255, 0.97), rgba(10, 130, 200, 0.97));
  box-shadow: 0 4px 0 rgba(0, 60, 110, 0.6), 0 0 0 4px rgba(120, 230, 255, 0.4), 0 0 18px 5px rgba(90, 220, 255, 0.7); }
/* スキル4: 赤紫 */
#skill2-btn.alt { background: radial-gradient(circle at 50% 35%, rgba(255, 120, 150, 0.97), rgba(200, 20, 70, 0.97));
  box-shadow: 0 4px 0 rgba(100, 0, 30, 0.6), 0 0 0 4px rgba(255, 130, 160, 0.4), 0 0 18px 5px rgba(255, 70, 110, 0.7); }
.skill-btn .charge-ring { grid-area: 1 / 1; width: 100%; height: 100%; border-radius: 50%; display: none;
  background: conic-gradient(#ffd54a calc(var(--charge, 0) * 360deg), rgba(0, 0, 0, 0.35) 0);
  -webkit-mask: radial-gradient(circle, transparent 56%, #000 58%); mask: radial-gradient(circle, transparent 56%, #000 58%); }
.skill-btn.charging .charge-ring { display: block; }
.skill-btn.charging { transform: scale(1.06); }
.skill-btn.charged { animation: grab-pulse 0.18s ease-in-out infinite alternate; }

/* スキル2: 攻撃ボタンの左斜め上（中心から45度の方向） */
#skill2-btn { --off: calc((var(--btn) / 2 + var(--btn2) / 2 + 27px) * 0.7071);
  right: calc(28px + env(safe-area-inset-right) + (var(--btn) - var(--btn2)) / 2 + var(--off));
  bottom: calc(26px + env(safe-area-inset-bottom) + (var(--btn) - var(--btn2)) / 2 + var(--off));
  background: radial-gradient(circle at 50% 35%, rgba(255, 190, 90, 0.95), rgba(190, 95, 15, 0.95));
  box-shadow: 0 4px 0 rgba(95, 45, 0, 0.6), 0 6px 14px rgba(0, 0, 0, 0.3); }
/* 使用中・クールタイム中: 暗くなり、残り時間ぶんの扇形が覆う。残り秒数を表示 */
.skill-btn.cooling, .skill-btn.busy { filter: saturate(0.35) brightness(0.8); }
.skill-btn .cd-cover { grid-area: 1 / 1; width: 100%; height: 100%; border-radius: 50%;
  background: conic-gradient(rgba(10, 10, 25, 0.72) calc(var(--cd, 0) * 360deg), transparent 0); }
.skill-btn .cd-num { grid-area: 1 / 1; z-index: 1; color: #fff; font: 800 calc(var(--btn2) * 0.36)/1 system-ui, sans-serif;
  text-shadow: 0 2px 3px #000a; display: none; }
.skill-btn.cooling .cd-num { display: block; }
.skill-btn.cooling svg { opacity: 0.35; }
.skill-btn.ready-pop { animation: skill-ready 0.35s ease-out; }
@keyframes skill-ready { 0% { transform: scale(1.3); filter: brightness(1.8); } 100% { transform: scale(1); } }

/* コンボ技を出せる間: 金色に変わって脈打つ「掴み」ボタンになる */
#jump-btn .icon-grab { display: none; }
#jump-btn.special { background: radial-gradient(circle at 50% 35%, #ffe27a, #ff9d00);
  border-color: #fff; box-shadow: 0 4px 0 #a85f00, 0 0 0 6px rgba(255, 200, 60, 0.45), 0 0 24px 8px rgba(255, 190, 40, 0.8);
  animation: grab-pulse 0.25s ease-in-out infinite alternate; }
#jump-btn.special .icon-jump { display: none; }
#jump-btn.special .icon-grab { display: block; width: 70%; height: 70%; }
@keyframes grab-pulse { from { transform: scale(1.12); } to { transform: scale(1.28); } }

#rotate-hint { position: fixed; inset: 0; z-index: 20; display: none; place-items: center; text-align: center;
  background: rgba(20, 30, 45, 0.9); color: #fff; font: 600 18px/1.6 system-ui, sans-serif; }
@media (orientation: portrait) { #rotate-hint.touch { display: grid; } }
`;

// 西洋剣のアイコン（斜めに構えた剣）
const SWORD_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <g transform="rotate(45 32 32)">
    <polygon points="29,6 35,6 35,40 32,46 29,40" fill="#f2f5f8" stroke="#5a1a14" stroke-width="2" stroke-linejoin="round"/>
    <rect x="31" y="9" width="2" height="26" fill="#aeb7c2"/>
    <rect x="20" y="44" width="24" height="5" rx="1" fill="#e8c14a" stroke="#5a1a14" stroke-width="2"/>
    <rect x="29" y="49" width="6" height="9" fill="#7a4a28" stroke="#5a1a14" stroke-width="2"/>
    <rect x="28" y="57" width="8" height="5" rx="1" fill="#e8c14a" stroke="#5a1a14" stroke-width="2"/>
  </g>
</svg>`;

// ジャンプのアイコン（上向きの二重矢印）
const JUMP_SVG = `
<svg class="icon-jump" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="14,34 32,14 50,34" stroke="#0a2f73" stroke-width="13"/>
  <polyline points="14,52 32,32 50,52" stroke="#0a2f73" stroke-width="13"/>
  <polyline points="14,34 32,14 50,34" stroke="#ffffff" stroke-width="7"/>
  <polyline points="14,52 32,32 50,52" stroke="#ffffff" stroke-width="7"/>
</svg>`;

// 掴みのアイコン（握りこぶし + 上向きの矢印）
const GRAB_SVG = `
<svg class="icon-grab" viewBox="0 0 64 64" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <path d="M18 60 V44 L12 36 V26 a4 4 0 0 1 8 0 V22 a4 4 0 0 1 8 0 V20 a4 4 0 0 1 8 0 V22 a4 4 0 0 1 8 0 V30 l4 -5 a4 4 0 0 1 6 5 L44 44 V60 Z"
    fill="#fff" stroke="#6b3a00" stroke-width="4"/>
  <path d="M20 26 V34 M28 22 V34 M36 22 V34" fill="none" stroke="#6b3a00" stroke-width="3"/>
  <polyline points="22,12 32,3 42,12" fill="none" stroke="#6b3a00" stroke-width="5"/>
</svg>`;

// スキル1のアイコン（回転する剣）
const SKILL_SVG = `
<svg class="icon-main" viewBox="0 0 64 64" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 30 A22 22 0 0 1 50 18" fill="none" stroke="#fff" stroke-width="5"/>
  <polygon points="52,8 55,23 41,19" fill="#fff"/>
  <path d="M54 34 A22 22 0 0 1 14 46" fill="none" stroke="#fff" stroke-width="5"/>
  <polygon points="12,56 9,41 23,45" fill="#fff"/>
  <g transform="rotate(45 32 32)">
    <polygon points="29.5,12 34.5,12 34.5,36 32,41 29.5,36" fill="#f2f5f8" stroke="#3a0f6e" stroke-width="2"/>
    <rect x="24" y="40" width="16" height="4" rx="1" fill="#e8c14a" stroke="#3a0f6e" stroke-width="2"/>
    <rect x="30" y="44" width="4" height="7" fill="#7a4a28" stroke="#3a0f6e" stroke-width="2"/>
  </g>
</svg>`;

// スキル3のアイコン（3つ並んで飛ぶ三日月の斬撃）
const SKILL3_SVG = `
<svg class="icon-alt" viewBox="0 0 64 64" aria-hidden="true" stroke-linejoin="round">
  <path d="M10 8 Q34 32 10 56 Q22 32 10 8 Z" fill="#fff" stroke="#00406b" stroke-width="2.5"/>
  <path d="M26 8 Q50 32 26 56 Q38 32 26 8 Z" fill="#fff" stroke="#00406b" stroke-width="2.5"/>
  <path d="M42 8 Q66 32 42 56 Q54 32 42 8 Z" fill="#fff" stroke="#00406b" stroke-width="2.5"/>
</svg>`;

// スキル4のアイコン（剣を前へ向けて突っ込む。後ろへ流れる速度線）
const SKILL4_SVG = `
<svg class="icon-alt" viewBox="0 0 64 64" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 22 H24 M2 32 H20 M4 42 H24" fill="none" stroke="#fff" stroke-width="4" opacity="0.9"/>
  <polygon points="26,28 52,28 62,32 52,36 26,36" fill="#f2f5f8" stroke="#5a0a25" stroke-width="2.2"/>
  <rect x="22" y="23" width="5" height="18" rx="1" fill="#ffe08a" stroke="#5a0a25" stroke-width="2"/>
  <rect x="12" y="29.5" width="10" height="5" fill="#7a4a28" stroke="#5a0a25" stroke-width="2"/>
</svg>`;

// スキル2のアイコン（地面に突き刺した剣と、広がるひび）
const SKILL2_SVG = `
<svg class="icon-main" viewBox="0 0 64 64" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="4,46 16,44 24,48 32,45" fill="none" stroke="#fff" stroke-width="4"/>
  <polyline points="32,45 40,49 48,44 60,47" fill="none" stroke="#fff" stroke-width="4"/>
  <polyline points="20,58 26,52 32,46 39,53 45,59" fill="none" stroke="#fff" stroke-width="4"/>
  <polygon points="29.5,14 34.5,14 34.5,40 32,46 29.5,40" fill="#f2f5f8" stroke="#5a2a00" stroke-width="2"/>
  <rect x="23" y="10" width="18" height="4.5" rx="1" fill="#ffe08a" stroke="#5a2a00" stroke-width="2"/>
  <rect x="30" y="3" width="4" height="7" fill="#7a4a28" stroke="#5a2a00" stroke-width="2"/>
</svg>`;

// 必殺技のアイコン（交差する2本の剣と、はじける光）
const ULT_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">
  <g transform="rotate(45 32 32)"><polygon points="29.5,4 34.5,4 34.5,40 32,46 29.5,40" fill="#fff" stroke="#6a1200" stroke-width="2.4"/>
    <rect x="23" y="39" width="18" height="5" rx="1" fill="#ffd54f" stroke="#6a1200" stroke-width="2.4"/><rect x="30" y="44" width="4" height="12" fill="#7a4a28" stroke="#6a1200" stroke-width="2"/></g>
  <g transform="rotate(-45 32 32)"><polygon points="29.5,4 34.5,4 34.5,40 32,46 29.5,40" fill="#fff" stroke="#6a1200" stroke-width="2.4"/>
    <rect x="23" y="39" width="18" height="5" rx="1" fill="#ffd54f" stroke="#6a1200" stroke-width="2.4"/><rect x="30" y="44" width="4" height="12" fill="#7a4a28" stroke="#6a1200" stroke-width="2"/></g>
  <polygon points="32,10 35,25 50,22 38,31 46,45 32,37 18,45 26,31 14,22 29,25" fill="#fff59d" stroke="#6a1200" stroke-width="2"/>
</svg>`;

// ---- バット用のアイコン ----
const svgWrap = (cls, inner) => `<svg ${cls ? `class="${cls}" ` : ''}viewBox="0 0 64 64" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
const BAT_SHAPE = (fill, edge) => `<path d="M30 8 Q30 5 33 5 Q36 5 36 8 L37 38 L34 46 L31 46 L28 38 Z" fill="${fill}" stroke="${edge}" stroke-width="2.4"/><rect x="30" y="45" width="5" height="12" rx="1" fill="#242424" stroke="${edge}" stroke-width="2"/><rect x="28.5" y="56" width="8" height="5" rx="2" fill="#a56e32" stroke="${edge}" stroke-width="2"/>`;
const BALL = (cx, cy, r, fill = '#fff') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#3a4560" stroke-width="2"/><path d="M${cx - r * 0.6} ${cy - r * 0.5} Q${cx} ${cy} ${cx - r * 0.6} ${cy + r * 0.5} M${cx + r * 0.6} ${cy - r * 0.5} Q${cx} ${cy} ${cx + r * 0.6} ${cy + r * 0.5}" fill="none" stroke="#d9302a" stroke-width="1.5"/>`;
const BAT_ICONS = {
  attack: svgWrap('', `<g transform="rotate(40 32 32)">${BAT_SHAPE('#c98d4a', '#4a2c10')}</g>`),
  // スキル1: 金属のバットと、強い光のボール
  skill1: svgWrap('icon-main', `<g transform="rotate(-35 28 34)">${BAT_SHAPE('#dde6f2', '#2c3a52')}</g><circle cx="50" cy="16" r="9" fill="#e8f4ff" stroke="#2c6ea8" stroke-width="2.2"/><path d="M50 2 V8 M50 24 V30 M36 16 H42 M58 16 H62" stroke="#fff" stroke-width="3"/>`),
  // スキル3: ボールを連打
  skill3: svgWrap('icon-alt', `${BALL(16, 40, 8)}${BALL(34, 30, 8)}${BALL(52, 20, 8)}<path d="M2 48 H10 M20 38 H28 M38 28 H46" stroke="#fff" stroke-width="3"/>`),
  // スキル2: 投げたバットと、殴る拳
  skill2: svgWrap('icon-main', `<g transform="rotate(70 36 28)">${BAT_SHAPE('#c98d4a', '#4a2c10')}</g><path d="M6 20 Q12 12 20 16 M4 30 Q10 24 18 27" fill="none" stroke="#fff" stroke-width="3"/><rect x="8" y="40" width="16" height="14" rx="4" fill="#fff" stroke="#5a2a00" stroke-width="2.4"/>`),
  // スキル4: 空中で回るバット
  skill4: svgWrap('icon-alt', `<g transform="rotate(30 32 32)">${BAT_SHAPE('#c98d4a', '#4a2c10')}</g><path d="M10 26 A24 24 0 0 1 36 8 M54 38 A24 24 0 0 1 28 56" fill="none" stroke="#fff" stroke-width="4"/><polygon points="38,2 40,14 28,10" fill="#fff"/><polygon points="26,62 24,50 36,54" fill="#fff"/>`),
  // 必殺技: 鉄球
  ult: svgWrap('', `<circle cx="32" cy="34" r="18" fill="#3b4150" stroke="#6a1200" stroke-width="3"/><ellipse cx="32" cy="34" rx="18" ry="6" fill="none" stroke="#aab6c8" stroke-width="3"/><circle cx="25" cy="27" r="4" fill="#fff" opacity="0.7"/><polygon points="32,2 35,12 46,8 40,17 52,20 41,24 50,32 38,29 32,40" fill="#fff59d" stroke="#6a1200" stroke-width="2" opacity="0.95"/>`),
};

// ---- 吸血牙用のアイコン ----
const BATWING = (cx, cy, k, fill = '#2a1230', edge = '#ffd1d8') => `<g transform="translate(${cx} ${cy}) scale(${k})"><path d="M0 -2 L-14 -10 L-12 -1 L-8 -3 L-5 3 L-2 1 L0 6 L2 1 L5 3 L8 -3 L12 -1 L14 -10 Z" fill="${fill}" stroke="${edge}" stroke-width="2"/><circle cx="-1.6" cy="-1" r="0.9" fill="#ff3050"/><circle cx="1.6" cy="-1" r="0.9" fill="#ff3050"/></g>`;
const FANG_ICONS = {
  // 通常攻撃: 牙をむいた口
  attack: svgWrap('', `<path d="M6 26 Q32 6 58 26 L52 36 L46 30 L40 40 L34 32 L32 44 L30 32 L24 40 L18 30 L12 36 Z" fill="#fff" stroke="#5a0010" stroke-width="2.6"/><path d="M12 36 Q32 56 52 36 L46 30 L40 40 L34 32 L32 44 L30 32 L24 40 L18 30 Z" fill="#c0172c" stroke="#5a0010" stroke-width="2.6"/>`),
  // スキル1: 赤い三本の爪痕
  skill1: svgWrap('icon-main', `<path d="M14 6 Q26 30 22 58 M30 4 Q42 30 38 60 M46 8 Q56 32 52 58" fill="none" stroke="#ff2a44" stroke-width="7"/><path d="M14 6 Q26 30 22 58 M30 4 Q42 30 38 60 M46 8 Q56 32 52 58" fill="none" stroke="#fff" stroke-width="2.4"/>`),
  // スキル3: 小さな体（蝙蝠の群れ）
  skill3: svgWrap('icon-alt', `${BATWING(18, 20, 0.9)}${BATWING(46, 16, 0.8)}${BATWING(32, 38, 1.1)}${BATWING(14, 52, 0.7)}${BATWING(52, 50, 0.75)}`),
  // スキル2: 巨大蝙蝠
  skill2: svgWrap('icon-main', `${BATWING(32, 32, 2.0, '#35123f', '#ffd1d8')}`),
  // スキル4: 足の蝙蝠化と回転
  skill4: svgWrap('icon-alt', `<path d="M10 28 A22 22 0 0 1 48 16 M54 36 A22 22 0 0 1 16 48" fill="none" stroke="#ff4a5e" stroke-width="5"/><polygon points="50,8 52,22 38,17" fill="#ff4a5e"/><polygon points="14,56 12,42 26,47" fill="#ff4a5e"/>${BATWING(32, 32, 1.15)}`),
  // 必殺技: 赤い宝石
  ult: svgWrap('', `<polygon points="32,4 50,24 32,60 14,24" fill="#d1062a" stroke="#4a0010" stroke-width="3"/><polygon points="32,4 50,24 14,24" fill="#ff5a70" stroke="#4a0010" stroke-width="2.4"/><polygon points="32,24 50,24 32,60" fill="#9a0420"/><polygon points="22,18 28,12 30,20" fill="#fff" opacity="0.8"/>`),
};

export class TouchControls {
  constructor() {
    this.x = 0;        // スティックの横（右 +）
    this.y = 0;        // スティックの縦（上 = 前 +）
    this.run = false;
    this.attack = false;
    this.jumpQueued = false; // ジャンプが押された（読み取られるまで保持）
    this.special = false;
    this.enabled = false;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'touch-ui';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div id="stick-zone"><div id="stick-base"><span id="run-label">RUN</span><div id="stick-knob"></div></div></div>
      <div id="ult-btn" role="button" aria-label="必殺技">${ULT_SVG}</div>
      <div id="jump-btn" role="button" aria-label="ジャンプ">${JUMP_SVG}${GRAB_SVG}</div>
      <div id="skill-btn" class="skill-btn" role="button" aria-label="スキル1">${SKILL_SVG}${SKILL3_SVG}<div class="cd-cover"></div><div class="charge-ring"></div><span class="cd-num"></span></div>
      <div id="skill2-btn" class="skill-btn" role="button" aria-label="スキル2">${SKILL2_SVG}${SKILL4_SVG}<div class="cd-cover"></div><span class="cd-num"></span></div>
      <div id="attack-btn" role="button" aria-label="攻撃">${SWORD_SVG}</div>`;
    document.body.appendChild(this.root);

    this.hint = document.createElement('div');
    this.hint.id = 'rotate-hint';
    this.hint.innerHTML = '📱↻<br>横向きにしてプレイしてください';
    document.body.appendChild(this.hint);

    this.zone = this.root.querySelector('#stick-zone');
    this.base = this.root.querySelector('#stick-base');
    this.knob = this.root.querySelector('#stick-knob');
    this.btn = this.root.querySelector('#attack-btn');
    this.jumpBtn = this.root.querySelector('#jump-btn');
    this.ultBtn = this.root.querySelector('#ult-btn');
    this.ultQueued = false;
    this.skills = ['#skill-btn', '#skill2-btn'].map((sel) => {
      const btn = this.root.querySelector(sel);
      return { btn, num: btn.querySelector('.cd-num'), queued: false, cooling: false, held: false, alt: false, charge: 0 };
    });

    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindStick();
    this.bindButton();
    this.bindJump();
    this.bindSkills();
    this.bindUlt();

    // タッチ操作の端末なら表示。PC でも画面に触れたら表示に切り替える
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root.classList.remove('hidden');
    this.resize(); // 表示してから位置を計算する（非表示中は大きさが 0 のため）
    this.hint.classList.add('touch');
    document.getElementById('hud')?.classList.add('touch');
    document.getElementById('combo-prompt')?.classList.add('touch');
    document.getElementById('ult-prompt')?.classList.add('touch');
  }

  // 画面の短い辺に合わせてスティックとボタンの大きさを決める
  resize() {
    const short = Math.min(innerWidth, innerHeight);
    this.stickSize = Math.round(Math.max(110, Math.min(170, short * 0.36)));
    this.root.style.setProperty('--stick', `${this.stickSize}px`);
    const btn = Math.round(Math.max(84, Math.min(130, short * 0.27)));
    this.root.style.setProperty('--btn', `${btn}px`);
    this.root.style.setProperty('--btn2', `${Math.round(btn * 0.76)}px`);
    this.restPos();
  }

  // 触れていないときのスティックの位置（左下）
  restPos() {
    const r = this.zone.getBoundingClientRect();
    this.home = { x: this.stickSize * 0.5 + 40, y: r.height - this.stickSize * 0.5 - 30 };
    if (this.stickId == null) this.placeBase(this.home.x, this.home.y);
  }

  placeBase(x, y) {
    this.origin = { x, y };
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
  }

  bindStick() {
    this.stickId = null;
    const local = (e) => {
      const r = this.zone.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.stickId != null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      // 触れた場所にスティックを出す（画面の端ではみ出さないよう寄せる）
      const p = local(e);
      const r = this.zone.getBoundingClientRect();
      const half = this.stickSize / 2;
      this.placeBase(Math.max(half + 8, Math.min(r.width - half, p.x)), Math.max(half, Math.min(r.height - half - 8, p.y)));
      this.base.classList.add('active');
      this.moveStick(p);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      this.moveStick(local(e));
    });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.x = this.y = 0;
      this.run = false;
      this.knob.style.transform = '';
      this.base.classList.remove('active', 'run');
      this.placeBase(this.home.x, this.home.y);
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  moveStick(p) {
    const radius = this.stickSize * 0.5;
    let dx = p.x - this.origin.x;
    let dy = p.y - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx *= radius / len; dy *= radius / len; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const mag = Math.min(1, len / radius);
    if (mag < DEAD_ZONE) {
      this.x = this.y = 0;
      this.run = false;
    } else {
      // 遊びの分を差し引いて 0〜1 に直す（ゆっくり歩きから使えるように）
      const k = (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / mag;
      this.x = (dx / radius) * k;
      this.y = (-dy / radius) * k;
      this.run = mag >= RUN_THRESHOLD;
    }
    this.base.classList.toggle('run', this.run);
  }

  // 武器に合わせて、ボタンのアイコンを入れ替える（'sword' は最初のまま。'bat' はバット用）
  setWeapon(id) {
    const ICONS = id === 'bat' ? BAT_ICONS : id === 'fang' ? FANG_ICONS : null;
    if (!ICONS) return;
    const swap = (sel, icon, svgSel = 'svg') => {
      const el = this.root.querySelector(sel);
      const old = svgSel === 'svg' ? el.querySelector('svg') : el.querySelector(svgSel);
      if (old) old.outerHTML = icon;
    };
    swap('#attack-btn', ICONS.attack);
    swap('#skill-btn', ICONS.skill1, 'svg.icon-main');
    swap('#skill-btn', ICONS.skill3, 'svg.icon-alt');
    swap('#skill2-btn', ICONS.skill2, 'svg.icon-main');
    swap('#skill2-btn', ICONS.skill4, 'svg.icon-alt');
    swap('#ult-btn', ICONS.ult);
  }

  // 必殺技ボタン: ゲージがたまっている間だけ出す
  setUltReady(on) {
    if (this.ultShown === on) return;
    this.ultShown = on;
    this.ultBtn.classList.toggle('show', on);
    if (on) navigator.vibrate?.([20, 40, 20]);
  }

  takeUlt() {
    const k = this.ultQueued;
    this.ultQueued = false;
    return k;
  }

  bindUlt() {
    this.ultBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.ultBtn.setPointerCapture(e.pointerId);
      this.ultQueued = true;
      this.ultBtn.classList.add('pressed');
      navigator.vibrate?.(20);
    });
    const end = () => this.ultBtn.classList.remove('pressed');
    this.ultBtn.addEventListener('pointerup', end);
    this.ultBtn.addEventListener('pointercancel', end);
    this.ultBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // スキル i（0 = スキル1, 1 = スキル2）が押されていたら true を返し、押された記録を消す
  takeSkill(i = 0) {
    const k = this.skills[i].queued;
    this.skills[i].queued = false;
    return k;
  }

  // スキル i のボタンを押し続けているか（ため用）
  skillHeld(i = 0) {
    return this.skills[i].held;
  }

  // スキル i のボタンを、切り替わったあとの姿にする（0: スキル1 → スキル3、1: スキル2 → スキル4）
  setSkillAlt(i, alt) {
    const sk = this.skills[i];
    if (sk.alt === alt) return;
    sk.alt = alt;
    sk.btn.classList.toggle('alt', alt);
    sk.btn.setAttribute('aria-label', ['スキル1', 'スキル2'][i].replace(/\d/, (n) => (alt ? +n + 2 : n)));
    if (alt) { // 変わった瞬間に光らせる
      sk.btn.classList.remove('ready-pop');
      void sk.btn.offsetWidth;
      sk.btn.classList.add('ready-pop');
      navigator.vibrate?.(12);
    }
  }

  // ため具合（0〜1）を金色の輪で表示。0 で消える
  setSkillCharge(i, charge) {
    const sk = this.skills[i];
    if (charge === sk.charge) return;
    if (charge >= 1 && sk.charge < 1) navigator.vibrate?.(30);
    sk.charge = charge;
    sk.btn.style.setProperty('--charge', charge.toFixed(3));
    sk.btn.classList.toggle('charging', charge > 0);
    sk.btn.classList.toggle('charged', charge >= 1);
  }

  bindSkills() {
    for (const sk of this.skills) {
      sk.btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sk.btn.setPointerCapture(e.pointerId);
        sk.queued = true;
        sk.held = true;
        sk.btn.classList.add('pressed');
        navigator.vibrate?.(8);
      });
      const end = () => { sk.held = false; sk.btn.classList.remove('pressed'); };
      sk.btn.addEventListener('pointerup', end);
      sk.btn.addEventListener('pointercancel', end);
      sk.btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  // スキル i の状態を表示。ratio: 残りクールタイムの割合（0〜1）、seconds: 残り秒数、busy: 使用中
  setSkillCooldown(i, ratio, seconds, busy) {
    const sk = this.skills[i];
    const cooling = ratio > 0;
    sk.btn.style.setProperty('--cd', busy ? 1 : ratio.toFixed(3));
    sk.btn.classList.toggle('busy', busy);
    if (cooling !== sk.cooling) {
      sk.btn.classList.toggle('cooling', cooling);
      if (!cooling) { // 使えるようになった瞬間に光らせる
        sk.btn.classList.remove('ready-pop');
        void sk.btn.offsetWidth;
        sk.btn.classList.add('ready-pop');
        navigator.vibrate?.(12);
      }
      sk.cooling = cooling;
    }
    if (cooling) {
      const n = Math.ceil(seconds);
      if (sk.num.textContent !== String(n)) sk.num.textContent = n;
    }
  }

  // コンボ技を出せる間だけ、ジャンプボタンを「掴み」ボタンの見た目に変える
  setSpecial(on) {
    if (on === this.special) return;
    this.special = on;
    this.jumpBtn.classList.toggle('special', on);
    if (on) navigator.vibrate?.(15);
  }

  // ジャンプが押されていたら true を返し、押された記録を消す（1回の押下で1回だけ跳ぶ）
  takeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  bindJump() {
    const ids = new Set();
    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ids.add(e.pointerId);
      this.jumpBtn.setPointerCapture(e.pointerId);
      this.jumpQueued = true;
      this.jumpBtn.classList.add('pressed');
      navigator.vibrate?.(8);
    });
    const end = (e) => { ids.delete(e.pointerId); if (ids.size === 0) this.jumpBtn.classList.remove('pressed'); };
    this.jumpBtn.addEventListener('pointerup', end);
    this.jumpBtn.addEventListener('pointercancel', end);
    this.jumpBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindButton() {
    const ids = new Set();
    const update = () => {
      this.attack = ids.size > 0;
      this.btn.classList.toggle('pressed', this.attack);
    };
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ids.add(e.pointerId);
      this.btn.setPointerCapture(e.pointerId);
      navigator.vibrate?.(8);
      update();
    });
    const end = (e) => { ids.delete(e.pointerId); update(); };
    this.btn.addEventListener('pointerup', end);
    this.btn.addEventListener('pointercancel', end);
    this.btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
