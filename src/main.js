// 起動・ループ・状態機械（技術設計書 2章）
import { CFG, DEBUG } from './config.js';
import { state, resetWorld, sweep, moveParticles, movePopups } from './world.js';
import { input, initInput, sample, pressed, syncTarget, BTN } from './input.js';
import * as sched from './sched.js';
import { movePlayer, shoot, fireBomb } from './player.js';
import { moveBoss } from './boss.js';
import { moveMid } from './midboss.js';
import { moveStory, resetHullNumbers } from './story.js';
import { moveBullets, moveLasers, movePhrases } from './bullets.js';
import { moveEnemies } from './enemies.js';
import { moveItems } from './items.js';
import { moveWarnings, startStage } from './formation.js';
import { collide } from './collide.js';
import { initRender, render } from './render.js';
import { prebuild } from './sprites.js';
import { dbg, handleKey, tickFps, drawDebug } from './debug.js';
import { sim } from './autoplay.js';

const cv = document.getElementById('cv');
initRender(cv);
initInput(cv);
prebuild();
resetWorld();

function startGame() {
  resetWorld();
  resetHullNumbers();
  sched.clear();
  startStage(0, 0, 1, null, true);   // 最初だけミッション表示
  syncTarget(state.player.x, state.player.y);
  state.mode = 'play';
}

// コンティニュー：回数制限なし。死んだ区間の頭から（ボス戦なら形態の頭から）。スコアはリセット
function doContinue() {
  const cp = state.checkpoint || { stage: 0, part: 0, lv: { way: 0, pow: 0 } };
  for (const a of [state.enemies, state.eBullets, state.pBullets, state.items, state.warnings, state.phrases, state.laserWarns]) a.length = 0;
  state.boss = null;
  state.mid = null;
  state.bossWarn = 0;
  state.slowT = 0;
  state.logLine = null; state.logQueue.length = 0;
  sched.clear();
  const p = state.player;
  p.lives = state.diff.lives; p.bombs = state.diff.bombs;
  p.invincible = 120; p.energy = CFG.energy.max; p.empty = false;
  p.lv = { ...cp.lv }; p.stock = { way: 0, pow: 0 };
  // ボス戦で力尽きたら強化は最低でも W3/P3 で復帰（設計書：G3で復帰）
  if (cp.boss) { p.lv.way = Math.max(p.lv.way, 2); p.lv.pow = Math.max(p.lv.pow, 2); }
  state.score = 0;
  startStage(cp.stage, cp.part, cp.form ?? 1, cp.cores ?? null);
  state.mode = 'play';
}

function toTitle() {
  sched.clear();
  resetWorld();
  state.mode = 'title';
}

function stepPlay() {
  sched.step();                 // 出現・発射
  movePlayer();
  if (pressed(BTN.BOMB)) fireBomb();
  shoot();
  moveBullets();
  moveEnemies();
  moveItems();
  moveWarnings();
  moveLasers();
  movePhrases();
  moveBoss();
  moveMid();
  collide();                    // 撃破が先、被弾が後
  sweep(state.enemies);
  sweep(state.eBullets);
  sweep(state.pBullets);
  sweep(state.items);
  sweep(state.warnings);
  sweep(state.phrases);
  sweep(state.laserWarns);
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
      // 中ボス撃破の直後はスロー（3フレームに1回だけ進める）
      if (state.slowT > 0 && (state.slowT-- % 3)) break;
      stepPlay();
      break;
    case 'pause':
      if (pressed(BTN.PAUSE) || input.tapped) state.mode = 'play';
      break;
    case 'continue':
      state.contT--;
      if (state.contT < CFG.continueCount * 60 - 30 && input.tapped) doContinue();
      else if (state.contT <= 0) toTitle();
      break;
    case 'ending':
      // 最後の一枚。説明はしない。しばらくしたら触ればタイトルへ
      state.endT++;
      if (state.endT > 240 && input.tapped) toTitle();
      break;
  }
  input.tapped = false;

  if (state.mode !== 'pause') {
    moveParticles();
    movePopups();
    moveStory();
    if (state.blackout) state.blackout.t++;
    sweep(state.popups);
    if (state.flash && --state.flash.t <= 0) state.flash = null;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 1);
    if (state.bombFx > 0) state.bombFx--;
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
  if (dbg.stepMode) {
    // F5 コマ送り：「.」を押した分だけ進める
    acc = 0;
    if (dbg.stepOnce > 0) { dbg.stepOnce--; step(); steps = 1; }
    else { sample(); while (input.fkeys.length) handleKey(input.fkeys.shift()); }
  }
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
// step は描画なしの早回し用（自動プレイでの通し確認）
if (DEBUG) window.__pop = { state, CFG, input, startGame, step, sim: opt => sim(opt, startGame, step) };
