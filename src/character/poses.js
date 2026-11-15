// ポーズ定義。各関数は「その瞬間の全関節の角度」を pose オブジェクトに書き込む。
//
// 角度の向き（ラジアン、左右共通の「体の動き」として書く）:
//   xxxSwing  : 前へ振る +          xxxOut   : 体の外側へ開く +
//   xxxTwist  : 腕=内側へねじる + / 脚=つま先を外へ +
//   Elbow/Knee: 曲げる +            Ankle    : つま先を上げる +
//   Flat      : 1 で靴底を地面と平行に保つ（接地中）、0 でスネに従う
//   hips/waist/neck Pitch: 前に倒す + / Yaw: 上から見て反時計回り + / Roll: 左側を上げる +
//   ground    : 1 で足が地面に着くよう腰の高さを自動調整、0 で空中
//   swordTilt : 剣先を腕の延長線の方へ倒す +（0 で前腕と直角、π/2 で一直線）
//   swordTwist: 前腕をひねって刃の向きを変える
//   lift      : 接地位置からさらに持ち上げる量（走りの滞空）
//   hipsFree  : 空中での腰の高さの補正

const { sin, cos, PI, max, min, abs } = Math;

const LIMB = [
  'ShoulderSwing', 'ShoulderOut', 'ShoulderTwist', 'Elbow',
  'HipSwing', 'HipOut', 'HipTwist', 'Knee', 'Ankle', 'Flat',
];
export const FIELDS = [
  'hipsX', 'hipsFree', 'lift', 'ground',
  'hipsPitch', 'hipsYaw', 'hipsRoll',
  'waistPitch', 'waistYaw', 'waistRoll',
  'neckPitch', 'neckYaw', 'neckRoll',
  'swordTilt', 'swordTwist', 'swordRoll',
  ...LIMB.map((f) => 'l' + f),
  ...LIMB.map((f) => 'r' + f),
];

export function makePose() {
  const p = {};
  for (const f of FIELDS) p[f] = 0;
  p.ground = 1;
  return p;
}

export function resetPose(p) {
  for (const f of FIELDS) p[f] = 0;
  p.ground = 1;
  return p;
}

export function lerpPose(out, a, b, t) {
  for (const f of FIELDS) out[f] = a[f] + (b[f] - a[f]) * t;
  return out;
}

export function copyPose(out, a) {
  for (const f of FIELDS) out[f] = a[f];
  return out;
}

// ---- 波形の部品 ----
const wrap = (x) => x - 2 * PI * Math.round(x / (2 * PI)); // [-π, π]
const clamp01 = (x) => min(1, max(0, x));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
// center を頂点に、±half でゼロになるなめらかな山
const lobe = (x, center, half) => {
  const t = min(1, abs(wrap(x - center)) / half);
  return 0.5 + 0.5 * cos(PI * t);
};
// center ± half の区間で 1、端は soft の幅でなめらかに 0 へ
const plateau = (x, center, half, soft) => 1 - smooth((abs(wrap(x - center)) - (half - soft)) / soft);

// 左脚は位相そのまま、右脚は半周期ずらす
const SIDES = [['l', 0], ['r', PI]];

// ============================================================
// 立ちポーズ: 力を抜いた自然な直立。呼吸・重心のゆっくりした移動・視線の動き
// ============================================================
function stand(ctx, o) {
  const t = ctx.time;
  const breath = sin(t * 1.6);        // 呼吸（約4秒周期）
  const sway = sin(t * 0.55);         // 左右への体重移動（約11秒周期）
  const drift = sin(t * 0.37) * 0.7 + sin(t * 0.83 + 1.3) * 0.3;

  o.hipsX = 0.05 * sway;
  o.hipsRoll = -0.02 * sway;
  o.waistRoll = 0.028 * sway;
  o.neckRoll = -0.012 * sway;
  o.hipsPitch = 0.01;
  o.waistPitch = 0.025 + 0.014 * breath;
  o.neckPitch = -0.03 - 0.012 * breath;
  o.neckYaw = 0.13 * drift;
  o.waistYaw = 0.025 * drift;

  for (const [k, off] of SIDES) {
    const sign = off === 0 ? 1 : -1;
    o[k + 'ShoulderOut'] = 0.07 + 0.014 * breath;
    o[k + 'ShoulderSwing'] = 0.03 + 0.02 * sway * sign;
    o[k + 'ShoulderTwist'] = 0.2;
    o[k + 'Elbow'] = 0.16 + 0.025 * breath;
    o[k + 'HipOut'] = 0.055;
    o[k + 'HipTwist'] = 0.12;
    o[k + 'HipSwing'] = 0.03;
    o[k + 'Knee'] = 0.05 + 0.02 * breath + 0.03 * max(0, -sway * sign); // 体重が乗っていない側の膝が少し緩む
    o[k + 'Flat'] = 1;
  }
}

// ============================================================
// 構えポーズ: 左足・左手が前のオーソドックス。小さく弾むステップ
// ============================================================
function fight(ctx, o) {
  const t = ctx.time;
  const bounce = sin(t * 5.2);
  const slow = sin(t * 2.6);

  o.hipsYaw = -0.52;                 // 体を半身に
  o.waistYaw = -0.12;
  o.neckYaw = 0.6;                   // 顔は相手へ
  o.hipsPitch = 0.04;
  o.waistPitch = 0.17 + 0.02 * slow;
  o.neckPitch = 0.02;
  o.hipsX = 0.03 * slow;

  // 前足（左）: つま先を相手へ。後足（右）: かかとを浮かせる
  o.lHipSwing = 0.3;
  o.lHipOut = 0.2;
  o.lHipTwist = 0.42;
  o.lKnee = 0.42 + 0.07 * bounce;
  o.lFlat = 1;
  o.rHipSwing = -0.12;
  o.rHipOut = 0.24;
  o.rHipTwist = 0.05;
  o.rKnee = 0.55 + 0.07 * bounce;
  o.rFlat = 0.45;

  // 前手（左）: あごの前に出す。後手（右）: あごの横に引きつける
  o.lShoulderSwing = 1.0 + 0.04 * bounce;
  o.lShoulderOut = 0.18;
  o.lShoulderTwist = 0.5;
  o.lElbow = 1.75 - 0.05 * bounce;
  o.rShoulderSwing = 0.5 - 0.03 * bounce;
  o.rShoulderOut = 0.22;
  o.rShoulderTwist = 0.75;
  o.rElbow = 2.2 + 0.04 * bounce;
}

// ============================================================
// 歩き: 1周期 = 左右1歩ずつ。位相0で左脚が体の真下を前へ通過
// ============================================================
function walk(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  const cL = cos(p);

  for (const [k, off] of SIDES) {
    const q = p + off;
    const s = sin(q);
    // 脚: 股関節を前後に振り、遊脚（前へ運ぶ間）は膝を曲げて足を浮かせる
    o[k + 'HipSwing'] = 0.04 + 0.5 * s;
    o[k + 'Knee'] = 0.06
      + 1.05 * lobe(q, -0.75, 1.75)  // 蹴り出しから遊脚にかけての膝曲げ
      + 0.14 * lobe(q, 2.3, 0.8);    // かかと着地直後の衝撃吸収
    // 立脚中は靴底を地面に。着地はかかとから、蹴り出しはつま先で。遊脚の途中はつま先を引き上げて地面を擦らない
    o[k + 'Flat'] = max(plateau(q, 2.85, 1.75, 1.1), 0.8 * lobe(q, 0.2, 1.5));
    o[k + 'HipOut'] = 0.03;
    o[k + 'HipTwist'] = 0.06;
    // 腕: 反対の脚と一緒に前へ。前に出るとき肘が曲がる
    const a = -s;
    o[k + 'ShoulderSwing'] = 0.04 + 0.46 * a;
    o[k + 'Elbow'] = 0.3 + 0.26 * a;
    o[k + 'ShoulderOut'] = 0.06;
    o[k + 'ShoulderTwist'] = 0.2;
  }

  // 骨盤は前に出る脚の側が前へ回り、胸は逆へねじれる。頭は正面を保つ
  o.hipsYaw = -0.1 * sL;
  o.waistYaw = 0.23 * sL;
  o.neckYaw = -(o.hipsYaw + o.waistYaw) * 0.85;
  // 遊脚側の骨盤が少し下がり、体重は立脚側へ寄る
  o.hipsRoll = -0.04 * cL;
  o.waistRoll = 0.055 * cL;
  o.hipsX = -0.06 * cL;
  o.hipsPitch = 0.03;
  o.waistPitch = 0.05 + 0.015 * cos(2 * p);
  o.neckPitch = -0.06;
}

// ============================================================
// 走り: 前傾、大きな腕振り、蹴り上げた足を畳んで前へ運ぶ。両足が浮く滞空あり
// ============================================================
function run(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  const cL = cos(p);

  for (const [k, off] of SIDES) {
    const q = p + off;
    const s = sin(q);
    o[k + 'HipSwing'] = 0.28 + 0.85 * s; // もも上げは高く、後ろへの蹴りは控えめ
    o[k + 'Knee'] = 0.32
      + 1.3 * lobe(q, -0.55, 1.45)   // 蹴った後、かかとを尻へ引きつける
      + 0.55 * lobe(q, 0.85, 1.2);   // もも上げ中もスネは畳んだまま
    // 接地は体の真下で短く。前へ運ぶ間はつま先を引き上げて地面を擦らない
    o[k + 'Flat'] = max(0.85 * lobe(q, PI + 0.2, 1.0), 0.6 * lobe(q, 0.6, 1.3));
    o[k + 'Ankle'] = -0.25 * lobe(q, -1.2, 1.0); // 蹴り出しでつま先を伸ばす
    o[k + 'HipOut'] = 0.02;
    const a = -s;
    o[k + 'ShoulderSwing'] = 0.12 + 0.95 * a;
    o[k + 'Elbow'] = 1.5 + 0.32 * a;   // 肘は約90度に固定ぎみ
    o[k + 'ShoulderOut'] = 0.1;
    o[k + 'ShoulderTwist'] = 0.35;
  }

  o.hipsYaw = -0.16 * sL;
  o.waistYaw = 0.4 * sL;
  o.neckYaw = -(o.hipsYaw + o.waistYaw) * 0.9;
  o.hipsRoll = -0.05 * cL;
  o.waistRoll = 0.07 * cL;
  o.hipsX = -0.04 * cL;
  o.hipsPitch = 0.12;
  o.waistPitch = 0.24 + 0.035 * cos(2 * p);
  o.neckPitch = -0.24;
  // 片足が体の真下にある短い間だけ接地し、それ以外は両足が浮いて放物線を描く
  o.ground = max(plateau(p, 0.2, 0.75, 0.3), plateau(p, 0.2 + PI, 0.75, 0.3));
  o.hipsFree = -0.05 + 0.3 * (lobe(p, 1.77, 1.1) + lobe(p, 1.77 + PI, 1.1));
}

// ============================================================
// ジャンプ
// ============================================================
// 踏み切り前のしゃがみ: 膝を深く曲げ、腕を後ろへ引いて力をためる
function crouch(ctx, o) {
  o.hipsPitch = 0.2;
  o.waistPitch = 0.5;
  o.neckPitch = -0.4;
  for (const [k] of SIDES) {
    o[k + 'HipSwing'] = 0.95;
    o[k + 'Knee'] = 1.45;
    o[k + 'HipOut'] = 0.08;
    o[k + 'HipTwist'] = 0.1;
    o[k + 'Flat'] = 1;
    o[k + 'ShoulderSwing'] = -0.95;
    o[k + 'ShoulderOut'] = 0.18;
    o[k + 'Elbow'] = 0.35;
  }
}

// 上昇: 全身を伸ばし、腕を振り上げる
function airRise(o) {
  o.waistPitch = -0.1;
  o.neckPitch = -0.15;
  o.hipsPitch = -0.04;
  o.lHipSwing = 0.05; o.lKnee = 0.12;
  o.rHipSwing = -0.22; o.rKnee = 0.2;
  for (const [k] of SIDES) {
    o[k + 'Ankle'] = -0.55; // つま先まで伸ばす
    o[k + 'HipOut'] = 0.04;
    o[k + 'ShoulderSwing'] = 2.3;
    o[k + 'ShoulderOut'] = 0.22;
    o[k + 'ShoulderTwist'] = 0.2;
    o[k + 'Elbow'] = 0.3;
  }
}

// 頂点: 膝を抱え込み、腕は横に開いてバランス
function airApex(o) {
  o.waistPitch = 0.14;
  o.neckPitch = -0.05;
  o.lHipSwing = 1.4; o.lKnee = 1.75;
  o.rHipSwing = 0.95; o.rKnee = 1.85;
  for (const [k] of SIDES) {
    o[k + 'Ankle'] = -0.2;
    o[k + 'HipOut'] = 0.1;
    o[k + 'ShoulderSwing'] = 1.25;
    o[k + 'ShoulderOut'] = 0.75;
    o[k + 'Elbow'] = 0.7;
  }
}

// 落下: 足を地面へ伸ばして着地に備え、腕は上へ流れる
function airFall(o) {
  o.waistPitch = 0.16;
  o.neckPitch = 0.12;
  o.hipsPitch = 0.04;
  o.lHipSwing = 0.38; o.lKnee = 0.5;
  o.rHipSwing = 0.12; o.rKnee = 0.3;
  for (const [k] of SIDES) {
    o[k + 'Ankle'] = -0.3;
    o[k + 'HipOut'] = 0.12;
    o[k + 'ShoulderSwing'] = 0.45;
    o[k + 'ShoulderOut'] = 1.25;
    o[k + 'ShoulderTwist'] = 0.3;
    o[k + 'Elbow'] = 0.55;
  }
}

const tmpA = makePose();
const tmpB = makePose();

// 空中: 縦の速度 u（+1 = 踏み切り直後, 0 = 頂点, -1 = 着地直前）でポーズを切り替える
function air(ctx, o) {
  const u = max(-1, min(1, ctx.airU));
  resetPose(tmpA);
  resetPose(tmpB);
  airApex(tmpA);
  if (u >= 0) airRise(tmpB); else airFall(tmpB);
  lerpPose(o, tmpA, tmpB, smooth(abs(u)));
  o.ground = 0;
  o.hipsFree = 0;
}

// 着地: 深く沈んで衝撃を吸収。腕は前下へ出してバランスを取る
function land(ctx, o) {
  o.hipsPitch = 0.16;
  o.waistPitch = 0.42;
  o.neckPitch = -0.3;
  for (const [k] of SIDES) {
    o[k + 'HipSwing'] = 0.85;
    o[k + 'Knee'] = 1.3;
    o[k + 'HipOut'] = 0.14;
    o[k + 'HipTwist'] = 0.12;
    o[k + 'Flat'] = 1;
    o[k + 'ShoulderSwing'] = 0.55;
    o[k + 'ShoulderOut'] = 0.5;
    o[k + 'Elbow'] = 0.75;
  }
}

// ============================================================
// 剣を持っているときの右腕の上書き（攻撃以外のモーション用）
// ============================================================
export function carrySword(name, ctx, o) {
  switch (name) {
    case 'stand': // 剣先を斜め前の地面へ向けて下げる
      o.rShoulderSwing = 0.1 + (o.rShoulderSwing - 0.03) * 0.5;
      o.rShoulderOut += 0.1;
      o.rShoulderTwist = 0.0;
      o.rElbow += 0.2;
      o.swordTilt = 1.0;
      o.swordTwist = -0.35;
      break;
    case 'fight': // 右肩の前に剣を立てて構える
      o.rShoulderSwing = 0.55;
      o.rShoulderOut = 0.2;
      o.rShoulderTwist = 0.25;
      o.rElbow = 1.7 + 0.04 * sin(ctx.time * 5.2);
      o.swordTilt = 0.75;
      o.swordTwist = 0.25;
      break;
    case 'walk': // 腕の振りを抑えて、剣先は前下へ
      o.rShoulderSwing = 0.12 + (o.rShoulderSwing - 0.04) * 0.4;
      o.rShoulderOut = 0.14;
      o.rShoulderTwist = 0.0;
      o.rElbow = 0.42 + (o.rElbow - 0.3) * 0.4;
      o.swordTilt = 0.95;
      o.swordTwist = -0.3;
      break;
    case 'run': // 剣を後ろへ流して走る
      o.rShoulderSwing = -0.7 + (o.rShoulderSwing - 0.12) * 0.22;
      o.rShoulderOut = 0.3;
      o.rShoulderTwist = 0.0;
      o.rElbow = 0.22;
      o.swordTilt = 2.2;
      o.swordTwist = -0.25;
      break;
    case 'crouch':
      o.swordTilt = 1.9;
      break;
    case 'air':
      o.swordTilt = 0.9;
      break;
    case 'land':
      o.swordTilt = 1.2;
      o.swordTwist = -0.3;
      break;
    default:
      break;
  }
}

// ============================================================
// 攻撃（3連の斬撃がループする）
//   attack1: 右上から左下への袈裟斬り
//   attack2: 左から右への横薙ぎ
//   attack3: 跳び込みながらの兜割り（振り下ろし）
// 各攻撃は「振りかぶり → 斬る瞬間 → 振り抜き → 残心」のキーポーズを
// ctx.attackT（0→1）でつなぐ。斬る区間だけ加速させて、ためと速さの差を出す。
// ============================================================
const EASE = {
  lin: (t) => t,
  in: (t) => t * t,                      // ゆっくり → 速く（斬り始め）
  out: (t) => 1 - (1 - t) * (1 - t),     // 速く → ゆっくり（振り抜き）
  inout: smooth,
};

// keys: [{ t, pose(o), ease }]。ease はそのキーへ「入ってくる」区間のかかり方
function keyed(t, keys, o) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const u = clamp01((t - k0.t) / (k1.t - k0.t));
  resetPose(tmpA);
  resetPose(tmpB);
  k0.pose(tmpA);
  k1.pose(tmpB);
  lerpPose(o, tmpA, tmpB, EASE[k1.ease ?? 'inout'](u));
}

// --- 攻撃1: 袈裟斬り ---
const A1 = [
  { t: 0, pose: (o) => { // 振りかぶり: 体を右へひねり、剣を右肩の上へ
    o.hipsYaw = -0.3; o.waistYaw = -0.6; o.neckYaw = 0.75;
    o.waistPitch = 0.02; o.waistRoll = -0.08;
    o.lHipSwing = 0.3; o.lKnee = 0.35; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.5; o.rHipOut = 0.14; o.rFlat = 0.7;
    o.rShoulderSwing = 2.05; o.rShoulderOut = 0.7; o.rElbow = 1.55;
    o.swordTilt = 0.15;
    o.lShoulderSwing = 0.95; o.lShoulderOut = 0.1; o.lElbow = 0.85;
  } },
  { t: 0.3, ease: 'out', pose: (o) => { // ため: さらに沈んでひねる
    o.hipsYaw = -0.4; o.waistYaw = -0.75; o.neckYaw = 0.95;
    o.waistPitch = 0.0; o.waistRoll = -0.1;
    o.lHipSwing = 0.35; o.lKnee = 0.5; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.65; o.rHipOut = 0.14; o.rFlat = 0.7;
    o.rShoulderSwing = 2.25; o.rShoulderOut = 0.8; o.rElbow = 1.75;
    o.swordTilt = -0.05;
    o.lShoulderSwing = 1.1; o.lShoulderOut = 0.05; o.lElbow = 0.7;
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 斬る瞬間: 右足を踏み込み、腕が伸びきる
    o.hipsYaw = 0.1; o.waistYaw = 0.15; o.neckYaw = -0.2;
    o.waistPitch = 0.2; o.hipsPitch = 0.05;
    o.rHipSwing = 0.62; o.rKnee = 0.55; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.4; o.lKnee = 0.3; o.lHipOut = 0.1; o.lFlat = 0.3;
    o.rShoulderSwing = 1.35; o.rShoulderOut = 0.0; o.rElbow = 0.25;
    o.swordTilt = 1.1;
    o.lShoulderSwing = -0.3; o.lShoulderOut = 0.45; o.lElbow = 0.6;
  } },
  { t: 0.66, ease: 'out', pose: (o) => { // 振り抜き: 剣は左腰の下へ
    o.hipsYaw = 0.4; o.waistYaw = 0.75; o.neckYaw = -0.95;
    o.waistPitch = 0.4; o.hipsPitch = 0.08; o.waistRoll = 0.1;
    o.rHipSwing = 0.78; o.rKnee = 0.85; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.55; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 0.25;
    o.rShoulderSwing = 0.6; o.rShoulderOut = -0.75; o.rShoulderTwist = 0.4; o.rElbow = 0.45;
    o.swordTilt = 0.8;
    o.lShoulderSwing = -0.65; o.lShoulderOut = 0.6; o.lElbow = 0.5;
  } },
  { t: 1, ease: 'out', pose: (o) => { // 残心
    o.hipsYaw = 0.42; o.waistYaw = 0.8; o.neckYaw = -1.0;
    o.waistPitch = 0.34; o.hipsPitch = 0.06; o.waistRoll = 0.08;
    o.rHipSwing = 0.72; o.rKnee = 0.75; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.5; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 0.3;
    o.rShoulderSwing = 0.6; o.rShoulderOut = -0.8; o.rShoulderTwist = 0.45; o.rElbow = 0.6;
    o.swordTilt = 0.8;
    o.lShoulderSwing = -0.55; o.lShoulderOut = 0.55; o.lElbow = 0.55;
  } },
];

// --- 攻撃2: 横薙ぎ（左 → 右）---
const A2 = [
  { t: 0, pose: (o) => { // 振りかぶり: 体を左へひねり、剣を左脇へ引きつける
    o.hipsYaw = 0.42; o.waistYaw = 0.85; o.neckYaw = -1.05;
    o.waistPitch = 0.28; o.hipsPitch = 0.05;
    o.rHipSwing = 0.65; o.rKnee = 0.75; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.45; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 0.35;
    o.rShoulderSwing = 1.15; o.rShoulderOut = -0.95; o.rShoulderTwist = 0.5; o.rElbow = 1.3;
    o.swordTilt = 0.9; o.swordTwist = 1.4;
    o.lShoulderSwing = 0.2; o.lShoulderOut = 0.5; o.lElbow = 0.8;
  } },
  { t: 0.28, ease: 'out', pose: (o) => {
    o.hipsYaw = 0.5; o.waistYaw = 0.98; o.neckYaw = -1.2;
    o.waistPitch = 0.3; o.hipsPitch = 0.05;
    o.rHipSwing = 0.6; o.rKnee = 0.85; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.4; o.lKnee = 0.5; o.lHipOut = 0.1; o.lFlat = 0.35;
    o.rShoulderSwing = 1.2; o.rShoulderOut = -1.05; o.rShoulderTwist = 0.5; o.rElbow = 1.5;
    o.swordTilt = 0.8; o.swordTwist = 1.4;
    o.lShoulderSwing = 0.35; o.lShoulderOut = 0.4; o.lElbow = 0.9;
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 斬る瞬間: 腕を水平に伸ばして正面を通過
    o.hipsYaw = 0.0; o.waistYaw = -0.05; o.neckYaw = 0.05;
    o.waistPitch = 0.16;
    o.lHipSwing = 0.45; o.lKnee = 0.5; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.1; o.rKnee = 0.4; o.rHipOut = 0.12; o.rFlat = 0.8;
    o.rShoulderSwing = 1.45; o.rShoulderOut = 0.05; o.rElbow = 0.2;
    o.swordTilt = 1.35; o.swordTwist = 1.45;
    o.lShoulderSwing = -0.25; o.lShoulderOut = 0.7; o.lElbow = 0.6;
  } },
  { t: 0.66, ease: 'out', pose: (o) => { // 振り抜き: 剣は右の外へ、左手は後ろへ引く
    o.hipsYaw = -0.45; o.waistYaw = -0.85; o.neckYaw = 1.05;
    o.waistPitch = 0.12; o.waistRoll = -0.08;
    o.lHipSwing = 0.62; o.lKnee = 0.7; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.4; o.rKnee = 0.4; o.rHipOut = 0.14; o.rFlat = 0.35;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 1.2; o.rElbow = 0.15;
    o.swordTilt = 1.4; o.swordTwist = 1.5;
    o.lShoulderSwing = -0.75; o.lShoulderOut = 0.35; o.lElbow = 0.95;
  } },
  { t: 1, ease: 'out', pose: (o) => {
    o.hipsYaw = -0.5; o.waistYaw = -0.9; o.neckYaw = 1.15;
    o.waistPitch = 0.1; o.waistRoll = -0.06;
    o.lHipSwing = 0.58; o.lKnee = 0.62; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.36; o.rKnee = 0.4; o.rHipOut = 0.14; o.rFlat = 0.4;
    o.rShoulderSwing = 1.3; o.rShoulderOut = 1.3; o.rElbow = 0.3;
    o.swordTilt = 1.3; o.swordTwist = 1.5;
    o.lShoulderSwing = -0.65; o.lShoulderOut = 0.35; o.lElbow = 0.9;
  } },
];

// --- 攻撃3: 跳び込み兜割り ---
const A3 = [
  { t: 0, pose: (o) => { // 沈み込みながら剣を頭上へ回す
    o.hipsYaw = -0.2; o.waistYaw = -0.35; o.neckYaw = 0.5;
    o.waistPitch = 0.1; o.hipsPitch = 0.1;
    o.lHipSwing = 0.7; o.lKnee = 0.95; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 0.35; o.rKnee = 0.95; o.rHipOut = 0.12; o.rFlat = 0.8;
    o.rShoulderSwing = 1.9; o.rShoulderOut = 0.75; o.rElbow = 0.9;
    o.swordTilt = 0.7; o.swordTwist = 0.6;
    o.lShoulderSwing = 0.9; o.lShoulderOut = 0.3; o.lElbow = 0.8;
  } },
  { t: 0.24, ease: 'out', pose: (o) => { // 踏み切り直前: 両手で剣を背中側まで振りかぶる
    o.waistPitch = -0.12; o.hipsPitch = 0.12; o.neckPitch = 0.1;
    o.lHipSwing = 0.85; o.lKnee = 1.2; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 0.75; o.rKnee = 1.25; o.rHipOut = 0.1; o.rFlat = 1;
    o.rShoulderSwing = 2.65; o.rShoulderOut = 0.3; o.rShoulderTwist = 0.2; o.rElbow = 1.35;
    o.swordTilt = -0.1;
    o.lShoulderSwing = 2.5; o.lShoulderOut = 0.05; o.lShoulderTwist = 0.5; o.lElbow = 1.35;
  } },
  { t: 0.44, ease: 'out', pose: (o) => { // 空中の頂点: 体を反らせ、膝を畳む
    o.lift = 1.15;
    o.waistPitch = -0.28; o.hipsPitch = -0.05; o.neckPitch = 0.15;
    o.lHipSwing = 0.9; o.lKnee = 1.5; o.lHipOut = 0.08; o.lAnkle = -0.3;
    o.rHipSwing = 0.2; o.rKnee = 1.55; o.rHipOut = 0.1; o.rAnkle = -0.3;
    o.rShoulderSwing = 2.85; o.rShoulderOut = 0.25; o.rShoulderTwist = 0.2; o.rElbow = 1.1;
    o.swordTilt = -0.25;
    o.lShoulderSwing = 2.7; o.lShoulderOut = 0.0; o.lShoulderTwist = 0.5; o.lElbow = 1.1;
  } },
  { t: 0.58, ease: 'in', pose: (o) => { // 斬る瞬間: 落下しながら真下へ振り下ろす
    o.lift = 0.45;
    o.waistPitch = 0.32; o.hipsPitch = 0.1; o.neckPitch = -0.2;
    o.rHipSwing = 0.75; o.rKnee = 0.5; o.rHipOut = 0.08; o.rAnkle = 0.1;
    o.lHipSwing = -0.1; o.lKnee = 0.9; o.lHipOut = 0.1; o.lAnkle = -0.3;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 0.0; o.rShoulderTwist = 0.25; o.rElbow = 0.25;
    o.swordTilt = 1.15;
    o.lShoulderSwing = 1.3; o.lShoulderOut = -0.15; o.lShoulderTwist = 0.6; o.lElbow = 0.45;
  } },
  { t: 0.7, ease: 'out', pose: (o) => { // 着地: 深く沈み、剣先は地面すれすれ
    o.waistPitch = 0.62; o.hipsPitch = 0.16; o.neckPitch = -0.45;
    o.rHipSwing = 1.0; o.rKnee = 1.15; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.45; o.lKnee = 0.75; o.lHipOut = 0.12; o.lFlat = 0.25;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 0.0; o.rShoulderTwist = 0.25; o.rElbow = 0.3;
    o.swordTilt = 1.12;
    o.lShoulderSwing = 1.3; o.lShoulderOut = -0.12; o.lShoulderTwist = 0.6; o.lElbow = 0.5;
  } },
  { t: 1, ease: 'out', pose: (o) => { // 残心: 少しだけ体を起こす
    o.waistPitch = 0.5; o.hipsPitch = 0.12; o.neckPitch = -0.38;
    o.rHipSwing = 0.9; o.rKnee = 1.0; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.42; o.lKnee = 0.65; o.lHipOut = 0.12; o.lFlat = 0.3;
    o.rShoulderSwing = 1.3; o.rShoulderOut = 0.05; o.rShoulderTwist = 0.2; o.rElbow = 0.4;
    o.swordTilt = 1.3;
    o.lShoulderSwing = 0.9; o.lShoulderOut = 0.15; o.lElbow = 0.6;
  } },
];

// --- 空中攻撃: 叩きつけ ---
// 空中で剣を頭上へ振りかぶり（attackT 0）、切っ先を下にして真下へ突っ込む（attackT 1）。
// 着地後は attack3 の着地〜残心の部分へつながる
const AIR_SLAM = [
  { t: 0, pose: (o) => { A3[2].pose(o); o.lift = 0; o.ground = 0; } },
  { t: 1, ease: 'in', pose: (o) => {
    o.ground = 0;
    o.hipsPitch = 0.35; o.waistPitch = 0.5; o.neckPitch = -0.5;
    o.lHipSwing = -0.3; o.lKnee = 0.9; o.lHipOut = 0.1; o.lAnkle = -0.4;
    o.rHipSwing = 0.25; o.rKnee = 1.1; o.rHipOut = 0.1; o.rAnkle = -0.4;
    o.rShoulderSwing = 1.5; o.rShoulderOut = 0.0; o.rShoulderTwist = 0.25; o.rElbow = 0.15;
    o.swordTilt = 1.95;
    o.lShoulderSwing = 1.4; o.lShoulderOut = -0.15; o.lShoulderTwist = 0.6; o.lElbow = 0.4;
  } },
];
const airSlam = (ctx, o) => keyed(ctx.attackT, AIR_SLAM, o);

const attack1 = (ctx, o) => keyed(ctx.attackT, A1, o);
const attack2 = (ctx, o) => keyed(ctx.attackT, A2, o);
const attack3 = (ctx, o) => keyed(ctx.attackT, A3, o);

// ============================================================
// 被弾: のけぞって（hitT 0 → 0.25）、持ち直す（→ 1）
// ============================================================
function hit(ctx, o) {
  const t = ctx.hitT;
  const k = t < 0.25 ? EASE.out(t / 0.25) : 1 - smooth((t - 0.25) / 0.75) * 0.75;
  o.hipsPitch = -0.12 * k;
  o.waistPitch = -0.5 * k;
  o.neckPitch = -0.45 * k;
  o.waistYaw = 0.25 * k;
  o.lHipSwing = -0.45 * k; o.lKnee = 0.3 + 0.2 * k; o.lHipOut = 0.12; o.lFlat = 1;
  o.rHipSwing = 0.3 * k; o.rKnee = 0.25 + 0.35 * k; o.rHipOut = 0.14; o.rFlat = 1;
  o.lShoulderSwing = 0.3 + 0.5 * k; o.lShoulderOut = 0.3 + 0.9 * k; o.lElbow = 0.9;
  o.rShoulderSwing = 0.3 - 0.5 * k; o.rShoulderOut = 0.3 + 0.7 * k; o.rElbow = 0.8;
  o.swordTilt = 0.8;
}

export const POSES = { stand, fight, walk, run, crouch, air, land, attack1, attack2, attack3, airSlam, hit };
