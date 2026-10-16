// Keyboard, mouse drag-to-look, and touch (left joystick, right drag-to-look).
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight', 'KeyE'],
  sprint: ['ShiftLeft', 'ShiftRight'],
};
const LOOK_MOUSE = 0.0032; // radians per pixel dragged with a mouse
const LOOK_TOUCH = 0.0055; // finger drags cover less screen, so they turn faster
const JOY_RADIUS = 50;
const DEAD_ZONE = 0.18; // joystick travel ignored near the centre
const SPRINT_PUSH = 0.92; // joystick pushed this far counts as sprint

export function createInput(canvas, joystickEl, stickEl) {
  const down = new Set();
  const coarse = matchMedia('(pointer: coarse)').matches;
  const startEl = document.getElementById('start');

  // Phone jump button, bottom right (made here so the page markup stays untouched).
  const jumpBtn = document.createElement('button');
  jumpBtn.id = 'jump';
  jumpBtn.type = 'button';
  jumpBtn.textContent = 'Jump';
  jumpBtn.hidden = true;
  jumpBtn.style.cssText =
    'position:fixed;right:24px;bottom:max(36px,env(safe-area-inset-bottom));width:84px;height:84px;border-radius:50%;' +
    'border:2px solid rgba(255,244,220,.45);background:rgba(255,244,220,.18);color:rgba(255,244,220,.9);' +
    'font:600 15px system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;';
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    input.touchUsed = true;
    input.jumpQueued = true;
  });
  document.body.appendChild(jumpBtn);
  const input = {
    move: { x: 0, y: 0 }, // x = strafe right, y = forward
    turn: 0, // -1..1 from keys
    lookDelta: { x: 0, y: 0 }, // accumulated drag, already in radians, consumed each step
    touchUsed: false,
    sprint: false,
    jumpQueued: false, // a jump was asked for since the last step
    consumeLook() {
      const d = { yaw: -this.lookDelta.x, pitch: -this.lookDelta.y };
      this.lookDelta.x = 0;
      this.lookDelta.y = 0;
      return d;
    },
    consumeJump() {
      const j = this.jumpQueued;
      this.jumpQueued = false;
      return j;
    },
    update() {
      const has = (k) => KEYS[k].some((c) => down.has(c));
      let x = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
      let y = (has('forward') ? 1 : 0) - (has('back') ? 1 : 0);
      let pushed = false;
      if (joy.active) {
        const len = Math.hypot(joy.x, joy.y);
        // Dead zone in the middle; beyond it the push is rescaled so speed still ramps from 0 to 1.
        const k = len < DEAD_ZONE ? 0 : (len - DEAD_ZONE) / (1 - DEAD_ZONE) / len;
        x = joy.x * k;
        y = joy.y * k;
        pushed = len >= SPRINT_PUSH;
      }
      this.sprint = has('sprint') || pushed;
      jumpBtn.hidden = !((input.touchUsed || coarse) && startEl && startEl.hidden);
      this.move.x = x;
      this.move.y = y;
      this.turn = (has('turnRight') ? 1 : 0) - (has('turnLeft') ? 1 : 0);
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) input.jumpQueued = true;
    }
    down.add(e.code);
  });
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
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer already gone (or synthetic); dragging still works without capture.
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (joy.active && e.pointerId === joy.id) return setJoy(e);
    const last = lookers.get(e.pointerId);
    if (!last) return;
    const speed = e.pointerType === 'touch' ? LOOK_TOUCH : LOOK_MOUSE;
    input.lookDelta.x += (e.clientX - last.x) * speed;
    input.lookDelta.y += (e.clientY - last.y) * speed;
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
