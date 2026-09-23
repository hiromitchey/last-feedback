// 起動・ループ・状態機械（技術設計書 2章）
import { CFG, DEBUG } from './config.js';
import { state, resetWorld, sweep, moveParticles, movePopups } from './world.js';
import { input, initInput, sample, pressed, syncTarget, BTN } from './input.js';
import * as sched from './sched.js';
import { movePlayer, shoot } from './player.js';
import { moveBullets } from './bullets.js';
import { moveEnemies } from './enemies.js';
import { moveItems } from './items.js';
import { moveWarnings, demoStage } from './formation.js';
import { collide } from './collide.js';
import { initRender, render } from './render.js';
import { prebuild } from './sprites.js';
import { dbg, handleKey, tickFps, drawDebug } from './debug.js';

const cv = document.getElementById('cv');
initRender(cv);
initInput(cv);
prebuild();
resetWorld();

function startGame() {
  resetWorld();
  sched.clear();
  sched.add(demoStage());
  syncTarget(state.player.x, state.player.y);
  state.mode = 'play';
}

function stepPlay() {
  sched.step();                 // 出現・発射
  movePlayer();
  shoot();
  moveBullets();
  moveEnemies();
  moveItems();
  moveWarnings();
  collide();                    // 撃破が先、被弾が後
  sweep(state.enemies);
  sweep(state.eBullets);
  sweep(state.pBullets);
  sweep(state.items);
  sweep(state.warnings);
  state.scroll += CFG.scroll;
}

function step() {
  state.frame++;
  sample();
  if (DEBUG) while (input.fkeys.length) handleKey(input.fkeys.shift());
  else input.fkeys.length = 0;
  if (input.toggleAuto) { state.autoShot = !state.autoShot; input.toggleAuto = false; }

  switch (state.mode) {
    case 'title':
      if (input.tapped) startGame();
      break;
    case 'play':
      if (pressed(BTN.PAUSE)) { state.mode = 'pause'; break; }
      stepPlay();
      break;
    case 'pause':
      if (pressed(BTN.PAUSE) || input.tapped) state.mode = 'play';
      break;
    case 'over':
      state.overT++;
      if (state.overT > 60 && input.tapped) startGame();
      break;
  }
  input.tapped = false;

  if (state.mode !== 'pause') {
    moveParticles();
    movePopups();
    sweep(state.popups);
    if (state.flash && --state.flash.t <= 0) state.flash = null;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 1);
  }
}

// 固定タイムステップ。dt は掛けない。最大4回で追いつきを打ち切る
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  acc += dt;
  let steps = 0;
  const t0 = performance.now();
  while (acc >= CFG.STEP && steps < 4) {
    step();
    acc -= CFG.STEP;
    steps++;
  }
  if (acc > CFG.STEP) acc = 0;
  const t1 = performance.now();
  render(dbg);
  drawDebug();
  const t2 = performance.now();
  if (steps) dbg.stepMs = (t1 - t0) / steps;
  dbg.renderMs = t2 - t1;
  tickFps(now);
}
requestAnimationFrame(frame);

// タブ復帰の瞬間に被弾するのは理不尽なのでポーズする
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'play') state.mode = 'pause';
});

// デバッグ用にコンソールから触れるように
if (DEBUG) window.__pop = { state, CFG, input, startGame };
