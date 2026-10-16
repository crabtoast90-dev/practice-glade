// npm run check: build, open the game headless, play a scripted run on the
// test clock, save screenshots, and fail on console errors or a frozen state.
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  await touch('pointermove', cx, cy - 60);
  await advance(page, 1500);
  await shot(page, name, '1-mid-walk');
  const walking = await state(page);
  if (walking.player.animation !== 'walk') failures.push(`[${name}] expected walk while moving, got ${walking.player.animation}`);
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
