import * as THREE from 'three';

// バトルモードの相手（NPC）。見た目・名前札・考える部分（NpcBrain）。
// NPC は、剣で戦う（通常攻撃の3連続）。いちばん近い相手（自分・ほかの NPC）へ近づいて、攻撃する。
export const NPC_LOOKS = [
  { name: 'CPU1', shirt: 0xe53935, pants: 0x3b3b3b, hair: 0x1b1b1b, hairStyle: 'spiky', face: 'angry', sleeves: 'long', tag: '#ff6a6a' },
  { name: 'CPU2', shirt: 0x43a047, pants: 0x2b3a2b, hair: 0x6b3b1a, hairStyle: 'short', face: 'angry', sleeves: 'long', tag: '#7dff8a' },
  { name: 'CPU3', shirt: 0xf9c01a, pants: 0x4a3a1a, hair: 0x222222, hairStyle: 'spiky', face: 'angry', sleeves: 'short', tag: '#ffe27a' },
];

// 頭の上に出す名前札（常にカメラを向く）
// 大きさ・位置は、呼ぶ側（キャラの子にして、身長に合わせる）で決める
export function createNameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 40px system-ui, "Hiragino Sans", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 9; g.strokeStyle = '#101428'; g.strokeText(text, 128, 34);
  g.fillStyle = color; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.visible = false;
  return s;
}

const IDLE = { x: 0, z: 0, run: false, jump: false, attack: false, skill: false, skillHold: false, skill2: false, ult: false, toggleStance: false };
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * NPC の頭脳。毎フレーム think() が、操作（移動の向き・攻撃ボタン）を返す。
 *  近づく（approach）→ 攻撃を続ける（attack。0.6〜1.7秒）→ 少し間をおく（pause）→ また近づく …
 *  aggression: 0〜1。大きいほど、間が短い
 */
export class NpcBrain {
  constructor(aggression = 0.6) {
    this.aggression = aggression;
    this.mode = 'approach';
    this.t = 0;
    this.target = null;      // { c, ctl, alive: () => bool }
    this.retarget = 0;
  }

  // enemies: [{ c, ctl, alive(), weight }]（自分以外）
  think(me, enemies, dt) {
    const g = me.c.group;
    const S = me.c.scale;
    if (me.ctl.state !== 'ground' && me.ctl.state !== 'attack') return IDLE;
    if (me.ctl.status.has('stun')) return IDLE;
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || !this.target.alive()) {
      let best = null; let bd = Infinity;
      for (const e of enemies) {
        if (!e.alive()) continue;
        const d = Math.hypot(e.c.group.position.x - g.position.x, e.c.group.position.z - g.position.z) * (e.weight ?? 1);
        if (d < bd) { bd = d; best = e; }
      }
      this.target = best;
      this.retarget = rnd(0.7, 1.6);
    }
    const t = this.target;
    if (!t) return IDLE;
    me.ctl.target = t.c;
    const dx = t.c.group.position.x - g.position.x;
    const dz = t.c.group.position.z - g.position.z;
    const dist = Math.hypot(dx, dz) / S;      // リグ単位
    const nx = dx / (dist * S || 1);
    const nz = dz / (dist * S || 1);
    this.t -= dt;
    const cmd = { ...IDLE };
    switch (this.mode) {
      case 'approach':
        cmd.x = nx; cmd.z = nz; cmd.run = dist > 20;
        if (dist < 5.6) { this.mode = 'attack'; this.t = rnd(0.6, 1.7); }
        break;
      case 'attack':
        cmd.attack = true;
        if (dist > 9.5) { this.mode = 'approach'; }                   // 離れたら、追う
        else if (this.t <= 0) { this.mode = 'pause'; this.t = rnd(0.3, 1.0) * (1.25 - this.aggression); }
        break;
      default: // pause: 少し間をおく（立って相手のほうを見る。向きは main.js が合わせる）
        if (dist > 10) { this.mode = 'approach'; }
        else if (this.t <= 0) { this.mode = dist < 7 ? 'attack' : 'approach'; this.t = rnd(0.6, 1.5); }
        break;
    }
    return cmd;
  }
}
