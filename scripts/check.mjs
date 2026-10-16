// npm run check: build, open the game headless, play a scripted run on the
// test clock, save screenshots, and fail on console errors or a frozen state.
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNS = 'check-output';
const KEEP = 5;
const OUT = join(RUNS, new Date().toISOString().replace(/[:.]/g, '-')); // one folder per run
const URL_ARG = process.argv.find((a) => a.startsWith('--url='))?.slice(6); // check a deployed build instead

// Browser: CHROME_PATH, else the cloud's preinstalled Chromium, else Playwright's own.
// If none exists: npx @puppeteer/browsers install chrome@stable, then set CHROME_PATH.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  return undefined;
}

const failures = [];
const log = [];

mkdirSync(OUT, { recursive: true });
// Keep the newest KEEP runs (timestamped names sort oldest-first); delete the rest.
for (const old of readdirSync(RUNS).sort().slice(0, -KEEP)) rmSync(join(RUNS, old), { recursive: true, force: true });

let server;
let base = URL_ARG;
if (!base) {
  await build({ logLevel: 'warn' });
  server = await preview({ preview: { port: 4317, strictPort: false }, logLevel: 'warn' });
  base = server.resolvedUrls.local[0];
}

const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function run(name, contextOptions, script) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.on('console', (msg) => {
    const line = `[${name}] console.${msg.type()}: ${msg.text()}`;
    log.push(line);
    if (msg.type() === 'error') failures.push(line);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) log.push(`[${name}] HTTP ${res.status()} ${res.url()}`);
  });
  page.on('pageerror', (err) => {
    const line = `[${name}] page error: ${err.message}`;
    log.push(line);
    failures.push(line);
  });
  const url = new URL(base);
  url.searchParams.set('test', '');
  await page.goto(url.href.replace('test=', 'test'));
  await page.waitForFunction(() => window.__game);
  await page.waitForFunction(() => window.__game.state().player.animation !== 'loading'); // character model loaded
  await script(page, name);
  await context.close();
}

const shot = (page, name, step) => page.screenshot({ path: join(OUT, `${name}-${step}.png`) });
const state = (page) => page.evaluate(() => window.__game.state());
const advance = (page, ms) => page.evaluate((t) => window.__game.advance(t), ms);
async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await advance(page, ms);
  await page.keyboard.up(key);
}

const summaries = [];

// Laptop: keyboard and mouse.
await run('laptop', { viewport: { width: 1280, height: 720 } }, async (page, name) => {
  await advance(page, 100);
  await shot(page, name, '1-start-screen');
  const before = await state(page);
  await page.click('#start');
  await advance(page, 100);
  const idle = await state(page);
  await page.keyboard.down('KeyW');
  await advance(page, 1500); // walk forward
  await shot(page, name, '2-mid-walk');
  const walking = await state(page);
  await page.keyboard.up('KeyW');
  await advance(page, 600);
  const stopped = await state(page);
  await shot(page, name, '2b-stopped');
  if (idle.player.animation !== 'idle') failures.push(`[${name}] expected idle at start, got ${idle.player.animation}`);
  if (walking.player.animation !== 'walk') failures.push(`[${name}] expected walk while moving, got ${walking.player.animation}`);
  if (stopped.player.animation !== 'idle') failures.push(`[${name}] expected idle after stopping, got ${stopped.player.animation}`);
  // turn: drag the mouse to the left
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(400, 360, { steps: 10 });
  await page.mouse.up();
  await advance(page, 100);
  await hold(page, 'KeyW', 1500); // walk again
  await shot(page, name, '3-turned-and-walked');
  const after = await state(page);
  const text = await page.evaluate(() => window.__game.stateText());
  summaries.push(`## ${name}\n${text}`);
  if (JSON.stringify(before.player) === JSON.stringify(after.player)) failures.push(`[${name}] player did not move`);
  if (before.screen === after.screen) failures.push(`[${name}] screen did not change`);
  if (after.cameraYawDeg === before.cameraYawDeg) failures.push(`[${name}] camera did not turn`);
});

// Phone: touch joystick and drag to look.
await run('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async (page, name) => {
  await advance(page, 100);
  const before = await state(page);
  await page.tap('#start');
  await advance(page, 100);
  // Push the joystick up (forward) with a synthetic touch pointer.
  const box = await page.locator('#joystick').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const touch = (type, x, y) =>
    page.dispatchEvent('#game', type, { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, isPrimary: true, bubbles: true });
  await touch('pointerdown', cx, cy);
  await touch('pointermove', cx, cy - 35); // a gentle push walks; a full push sprints
  await advance(page, 1500);
  await shot(page, name, '1-mid-walk');
  const walking = await state(page);
  if (walking.player.animation !== 'walk') failures.push(`[${name}] expected walk while moving, got ${walking.player.animation}`);
  // Second finger on the right drags the view while the joystick is still held.
  const touch2 = (type, x, y) =>
    page.dispatchEvent('#game', type, { pointerType: 'touch', pointerId: 8, clientX: x, clientY: y, isPrimary: false, bubbles: true });
  const yawBefore = (await state(page)).cameraYawDeg;
  await touch2('pointerdown', 300, 400);
  for (let i = 1; i <= 8; i++) {
    await touch2('pointermove', 300 - i * 15, 400);
    await advance(page, 100);
  }
  const both = await state(page);
  await shot(page, name, '2-two-touches');
  await touch2('pointerup', 180, 400);
  await touch('pointermove', cx, cy - 35);
  if (both.cameraYawDeg === yawBefore) failures.push(`[${name}] second finger did not turn the view`);
  if (!both.player.moving) failures.push(`[${name}] joystick stopped working while the second finger dragged`);
  // Joystick dead zone: a tiny nudge must not move the player.
  await touch('pointermove', cx, cy);
  await advance(page, 200);
  await touch('pointermove', cx + 6, cy);
  const nudged = await state(page);
  await advance(page, 500);
  const nudgedLater = await state(page);
  if (nudgedLater.player.x !== nudged.player.x || nudgedLater.player.z !== nudged.player.z) failures.push(`[${name}] a tiny joystick nudge moved the player (no dead zone)`);
  // Full push sprints.
  await touch('pointermove', cx, cy - 60);
  await advance(page, 700);
  const sprintState = await state(page);
  if (!sprintState.player.sprinting || sprintState.player.animation !== 'run') failures.push(`[${name}] full joystick push did not sprint (${sprintState.player.animation})`);
  // Jump button.
  await touch('pointerup', cx, cy - 60);
  await advance(page, 300);
  await page.locator('#jump').waitFor({ state: 'visible' });
  await page.dispatchEvent('#jump', 'pointerdown', { pointerType: 'touch', pointerId: 9, bubbles: true });
  await advance(page, 300);
  const jumped = await state(page);
  await shot(page, name, '3-jump');
  if (!jumped.player.airborne) failures.push(`[${name}] jump button did not make the player jump`);
  await touch('pointerdown', cx, cy);
  await touch('pointermove', cx, cy - 60);
  await advance(page, 200);
  await touch('pointerup', cx, cy - 60);
  const after = await state(page);
  const text = await page.evaluate(() => window.__game.stateText());
  summaries.push(`## ${name}\n${text}`);
  if (JSON.stringify(before.player) === JSON.stringify(after.player)) failures.push(`[${name}] player did not move`);
});

// Valley: overhead map with the markers, and the walls hold the player in.
await run('valley', { viewport: { width: 1280, height: 720 } }, async (page, name) => {
  await advance(page, 100);
  await page.click('#start');
  await advance(page, 100);
  await page.evaluate(() => window.__game.overhead(true));
  await shot(page, name, '1-overhead');
  await page.evaluate(() => window.__game.overhead(false));
  await hold(page, 'KeyW', 25000); // walk straight at the north wall (-Z)
  const atWall = await state(page);
  await shot(page, name, '2-at-wall');
  await hold(page, 'KeyW', 5000); // keep pushing into it for 5 s
  const pushed = await state(page);
  const limit = Number(/walkable radius (\d+)m/.exec(await page.evaluate(() => window.__game.stateText()))[1]);
  summaries.push(`## ${name}\n${await page.evaluate(() => window.__game.stateText())}`);
  if (pushed.distFromCentre > limit + 0.01) failures.push(`[${name}] player walked past the wall: ${pushed.distFromCentre}m > ${limit}m`);
  if (atWall.distFromCentre < limit - 0.5) failures.push(`[${name}] player never reached the wall (${atWall.distFromCentre}m of ${limit}m)`);
  if (Math.hypot(pushed.player.x - atWall.player.x, pushed.player.z - atWall.player.z) > 0.05) failures.push(`[${name}] player kept sliding while pushed into the wall`);
});

// Lanterns and ending: find all five, then the camera rises to the vista and the end screen appears.
await run('lanterns', { viewport: { width: 1280, height: 720 } }, async (page, name) => {
  await advance(page, 100);
  await page.click('#start');
  await advance(page, 100);
  const text = (p) => p.evaluate(() => window.__game.stateText());
  const counter = (p) => p.textContent('#lanterns');
  const zero = await state(page);
  if (zero.lanterns !== '0/5') failures.push(`[${name}] expected 0/5 at start, got ${zero.lanterns}`);
  for (let id = 1; id <= 5; id++) {
    await page.evaluate((i) => window.__game.teleportToLantern(i), id);
    await advance(page, 100);
    const s = await state(page);
    if (s.lanterns !== `${id}/5`) failures.push(`[${name}] after lantern ${id} expected ${id}/5, got ${s.lanterns}`);
    if (id === 1) {
      await shot(page, name, '1-counter-1of5');
      if (!/^1 \/ 5$/.test(await counter(page))) failures.push(`[${name}] HUD counter not 1 / 5`);
    }
    if (id < 5 && s.screen !== 'playing') failures.push(`[${name}] screen should be playing at ${id}/5, got ${s.screen}`);
  }
  await shot(page, name, '2-counter-5of5');
  const ending = await state(page);
  summaries.push(`## ${name} (just after fifth lantern)\n${await text(page)}`);
  if (ending.screen !== 'ending') failures.push(`[${name}] expected screen: ending, got ${ending.screen}`);
  const stuck = await state(page);
  await page.keyboard.down('KeyW');
  await advance(page, 500); // controls are locked
  await page.keyboard.up('KeyW');
  const locked = await state(page);
  if (locked.player.x !== stuck.player.x || locked.player.z !== stuck.player.z) failures.push(`[${name}] player moved during the ending`);
  await advance(page, 2000);
  await shot(page, name, '3-camera-rising');
  await advance(page, 4500);
  await page.waitForTimeout(2300); // end-screen fade
  await shot(page, name, '4-vista-end');
  const end = await state(page);
  summaries.push(`## ${name} (end)\n${await text(page)}`);
  if (end.screen !== 'end') failures.push(`[${name}] expected screen: end, got ${end.screen}`);
  if (!(await page.isVisible('#ending'))) failures.push(`[${name}] end screen not visible`);
  await page.click('#ending button');
  await advance(page, 100);
  const again = await state(page);
  if (again.screen !== 'playing' || again.lanterns !== '0/5') failures.push(`[${name}] play again did not reset (${again.screen}, ${again.lanterns})`);
});

// Controls: sprint, jump, and a camera that stays out of rocks and terrain.
await run('controls', { viewport: { width: 1280, height: 720 } }, async (page, name) => {
  await advance(page, 100);
  await page.click('#start');
  await advance(page, 100);
  // Sprint covers more ground than walking in the same time.
  const a0 = await state(page);
  await hold(page, 'KeyW', 1000);
  const a1 = await state(page);
  await page.keyboard.down('ShiftLeft');
  await hold(page, 'KeyW', 1000);
  const sprinting = await state(page);
  await shot(page, name, '1-sprint');
  await page.keyboard.up('ShiftLeft');
  const walked = Math.hypot(a1.player.x - a0.player.x, a1.player.z - a0.player.z);
  const ran = Math.hypot(sprinting.player.x - a1.player.x, sprinting.player.z - a1.player.z);
  if (ran < walked * 1.4) failures.push(`[${name}] sprint not faster than walking (${ran.toFixed(1)}m vs ${walked.toFixed(1)}m)`);
  if (sprinting.player.animation !== 'run') failures.push(`[${name}] expected run animation while sprinting, got ${sprinting.player.animation}`);
  // Jump: leaves the ground with Space, lands again.
  await advance(page, 600);
  const g0 = await state(page);
  await page.keyboard.press('Space');
  await advance(page, 350);
  const up = await state(page);
  await shot(page, name, '2-jump');
  await advance(page, 1500);
  const down = await state(page);
  if (!up.player.airborne || up.player.y < g0.player.y + 0.5) failures.push(`[${name}] Space did not lift the player (${g0.player.y} -> ${up.player.y})`);
  if (up.player.animation !== 'jump' && up.player.animation !== 'air') failures.push(`[${name}] expected a jump animation in the air, got ${up.player.animation}`);
  if (down.player.airborne) failures.push(`[${name}] player never landed`);
  // Drag the view into a boulder: stand just behind it and swing the camera around with the mouse.
  await page.evaluate(() => window.__game.teleport(5, 54.5, -60, 6));
  const clear = await state(page);
  await page.mouse.move(700, 360);
  await page.mouse.down();
  await page.mouse.move(700 - 327, 360, { steps: 12 }); // left drag swings the view 60 degrees round, into the boulder
  await page.mouse.up();
  await advance(page, 400);
  const blocked = await state(page);
  await shot(page, name, '3-view-dragged-into-rock');
  summaries.push(`## ${name}\n${await page.evaluate(() => window.__game.stateText())}`);
  if (clear.camera.pulledIn) failures.push(`[${name}] camera pulled in with nothing in the way`);
  if (!blocked.camera.pulledIn || blocked.camera.distance > 4.5) failures.push(`[${name}] camera did not pull in before the rock (distance ${blocked.camera.distance}m)`);
  // Low camera against a slope never ends up under the ground.
  for (const [x, z, yaw] of [[-55, -8, 90], [-30, 0, 270], [60, -60, 0]]) {
    await page.evaluate(([px, pz, py]) => window.__game.teleport(px, pz, py, -20), [x, z, yaw]);
    await advance(page, 300);
    const low = await state(page);
    if (low.camera.y < low.camera.groundBelow) failures.push(`[${name}] camera went under the ground at ${x},${z}`);
  }
  await shot(page, name, '4-low-camera-slope');
});

// Rocks block the player; Shift sprints at about 3x walking speed.
await run('rocks', { viewport: { width: 1280, height: 720 } }, async (page, name) => {
  await advance(page, 100);
  await page.click('#start');
  await advance(page, 100);
  await page.evaluate(() => window.__game.teleport(-23, -12, 0, 10)); // due south of the big rock at (-23, -19)
  await advance(page, 100);
  await hold(page, 'KeyW', 3000); // walk straight at it (north, -Z)
  const s = await state(page);
  await shot(page, name, '1-against-rock');
  const gap = Math.hypot(s.player.x + 23, s.player.z + 19);
  if (gap < 2.0) failures.push(`[${name}] walked into the rock (${gap.toFixed(2)}m from its centre)`);
  if (s.player.z < -17.5) failures.push(`[${name}] walked through the rock to z=${s.player.z}`);
  await page.evaluate(() => window.__game.teleport(0, 0, 0, 10));
  await advance(page, 100);
  const a = await state(page);
  await page.keyboard.down('ShiftLeft');
  await hold(page, 'KeyW', 1000);
  await page.keyboard.up('ShiftLeft');
  const b = await state(page);
  const dist = Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z);
  summaries.push(`## ${name}\nsprint covered ${dist.toFixed(1)}m in 1s; stopped ${gap.toFixed(2)}m from rock centre`);
  if (dist < 11) failures.push(`[${name}] sprint too slow: ${dist.toFixed(1)}m in 1s`);
});

// Sound: the audio context runs after the start tap and every sound loads.
await run('audio', { viewport: { width: 1280, height: 720 } }, async (page, name) => {
  await advance(page, 100);
  const before = await state(page);
  if (before.audio) failures.push(`[${name}] audio started before the tap`);
  await page.click('#start');
  await page.waitForFunction(() => window.__game.state().audio?.loaded.length === 7, null, { timeout: 15000 }).catch(() => {});
  await advance(page, 100);
  const a = (await state(page)).audio;
  summaries.push(`## ${name}\n${await page.evaluate(() => window.__game.stateText())}`);
  if (!a) failures.push(`[${name}] audio did not start after the tap`);
  else {
    if (a.state !== 'running') failures.push(`[${name}] audio context is ${a.state}, expected running`);
    if (Object.keys(a.failed).length) failures.push(`[${name}] sounds failed to load: ${JSON.stringify(a.failed)}`);
    if (a.loaded.length !== 7) failures.push(`[${name}] only ${a.loaded.length}/7 sounds loaded`);
  }
});

// Look: three camera angles in the style-frame spirit, saved next to the style frame itself.
await run('look', { viewport: { width: 960, height: 540 } }, async (page, name) => {
  await advance(page, 100);
  await page.click('#start');
  await advance(page, 100);
  const angles = [
    ['1-sun-down-the-valley', [0, 4, -32, -8]],
    ['2-rocks-near-the-lantern', [-14, -4, 25, 6]],
    ['3-ridges-from-the-hill', [38, -50, 0, 4]],
  ];
  const files = [];
  for (const [label, [x, z, yaw, pitch]] of angles) {
    await page.evaluate(([a, b, c, d]) => window.__game.teleport(a, b, c, d), [x, z, yaw, pitch]);
    await advance(page, 100);
    await shot(page, name, label);
    files.push(join(OUT, `${name}-${label}.png`));
  }
  const text = await page.evaluate(() => window.__game.stateText());
  summaries.push(`## ${name}\n${text}`);
  if (!/post-processing (full|cheap)/.test(text)) failures.push(`[${name}] post-processing is not running`);
  // Style frame and the three shots in a 2x2 sheet.
  const img = (f) => `data:image/${f.endsWith('.webp') ? 'webp' : 'png'};base64,${readFileSync(f).toString('base64')}`;
  const cells = [join('style-frames', '1-close-to-reference.png'), ...files].map((f) => `<img src="${img(f)}">`).join('');
  const sheet = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:960px 960px;background:#000">${cells.replace(/<img /g, '<img style="width:960px;height:540px;object-fit:cover" ')}</body>`);
  await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
  await sheet.screenshot({ path: join(OUT, 'look-compare.png') });
  await sheet.close();
});

await browser.close();
await server?.close();

const report = [
  `# Check ${failures.length ? 'FAILED' : 'passed'} — ${new Date().toISOString()}`,
  `target: ${base}`,
  '',
  ...summaries,
  '',
  '## failures',
  ...(failures.length ? failures : ['none']),
  '',
  '## console',
  ...(log.length ? log : ['(empty)']),
].join('\n');
writeFileSync(join(OUT, 'summary.txt'), report + '\n');
console.log(report);
console.log(`\nScreenshots and summary in ${OUT}/`);
process.exit(failures.length ? 1 : 0);
