// キーボード入力。押している間 true のキーと、押した瞬間だけ true のキーを分けて持つ。
const down = new Set();
const pressed = new Set();

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

// マウスの左ボタンは 'Mouse0' というキーとして扱う（攻撃用）
addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.tagName !== 'CANVAS') return;
  pressed.add('Mouse0');
  down.add('Mouse0');
});
addEventListener('pointerup', (e) => { if (e.button === 0) down.delete('Mouse0'); });

export const input = {
  isDown: (...codes) => codes.some((c) => down.has(c)),
  wasPressed: (...codes) => codes.some((c) => pressed.has(c)),
  endFrame: () => pressed.clear(),
};
