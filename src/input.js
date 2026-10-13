// Keyboard, mouse drag-to-look, and touch (left joystick, right drag-to-look).
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight', 'KeyE'],
};
const LOOK_SPEED = 0.005; // radians per pixel dragged
const JOY_RADIUS = 50;

export function createInput(canvas, joystickEl, stickEl) {
  const down = new Set();
  const input = {
    move: { x: 0, y: 0 }, // x = strafe right, y = forward
    turn: 0, // -1..1 from keys
    lookDelta: { x: 0, y: 0 }, // accumulated drag pixels, consumed each step
    touchUsed: false,
    consumeLook() {
      const d = { ...this.lookDelta };
      this.lookDelta.x = 0;
      this.lookDelta.y = 0;
      return { yaw: -d.x * LOOK_SPEED, pitch: -d.y * LOOK_SPEED };
    },
    update() {
      const has = (k) => KEYS[k].some((c) => down.has(c));
      let x = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
      let y = (has('forward') ? 1 : 0) - (has('back') ? 1 : 0);
      if (joy.active) {
        x = joy.x;
        y = joy.y;
      }
      this.move.x = x;
      this.move.y = y;
      this.turn = (has('turnRight') ? 1 : 0) - (has('turnLeft') ? 1 : 0);
    },
  };

  window.addEventListener('keydown', (e) => down.add(e.code));
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  // Pointer handling: one pointer may drive the joystick, any other drags the view.
  const joy = { active: false, id: null, x: 0, y: 0 };
  const lookers = new Map();

  function joyCenter() {
    const r = joystickEl.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  function setJoy(e) {
    const { cx, cy } = joyCenter();
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    joy.x = dx / JOY_RADIUS;
    joy.y = -dy / JOY_RADIUS;
    stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      input.touchUsed = true;
      joystickEl.hidden = false;
      if (!joy.active && e.clientX < window.innerWidth * 0.4) {
        joy.active = true;
        joy.id = e.pointerId;
        setJoy(e);
        return;
      }
    }
    lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (joy.active && e.pointerId === joy.id) return setJoy(e);
    const last = lookers.get(e.pointerId);
    if (!last) return;
    input.lookDelta.x += e.clientX - last.x;
    input.lookDelta.y += e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
  });
  const end = (e) => {
    if (joy.active && e.pointerId === joy.id) {
      joy.active = false;
      joy.x = joy.y = 0;
      stickEl.style.transform = '';
    }
    lookers.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return input;
}
