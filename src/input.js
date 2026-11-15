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

export const input = {
  isDown: (...codes) => codes.some((c) => down.has(c)),
  wasPressed: (...codes) => codes.some((c) => pressed.has(c)),
  endFrame: () => pressed.clear(),
};
