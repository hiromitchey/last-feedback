// 起動・ループ・状態機械（技術設計書 2章）
import { CFG, DEBUG } from './config.js';
import { state, resetWorld, sweep, moveParticles, movePopups, moveBooms, moveSignals, moveTitleMeteor, sendSignal, receiverXY } from './world.js';
import { input, initInput, sample, pressed, syncTarget, BTN } from './input.js';
import * as sched from './sched.js';
import { movePlayer, shoot, fireBomb } from './player.js';
import { moveBoss, skipForm } from './boss.js';
import { moveMid } from './midboss.js';
import { moveStory, resetHullNumbers, showLine } from './story.js';
import { STORY } from './text.js';
import { moveBullets, moveLasers, movePhrases } from './bullets.js';
import { moveEnemies } from './enemies.js';
import { moveItems } from './items.js';
import { moveWarnings, startStage } from './formation.js';
import { collide } from './collide.js';
import { initRender, render, onPlanet, ZOOM_FRAMES, RUINS_LINE_AT, RUINS_RECEIVE, RUINS_PULSES, RUINS_WAIT } from './render.js';
import { prebuild, BOSS_WINDOW } from './sprites.js';
import { dbg, handleKey, tickFps, drawDebug } from './debug.js';
import { sim } from './autoplay.js';
import { unlockMusic, syncMusic, getMusicVolume, setMusicVolume } from './music.js';
import { getSfxVolume, setSfxVolume, unlockSfx, playSfx } from './sfx.js';

const cv = document.getElementById('cv');
initRender(cv);
initInput(cv);
cv.addEventListener('pointerdown', () => { unlockMusic(); unlockSfx(); });
window.addEventListener('keydown', e => { if (!e.repeat) { unlockMusic(); unlockSfx(); } });
const volumeControl = document.getElementById('volume-control');
for (const [inputId, outputId, getVolume, setVolume] of [
  ['bgm-volume', 'volume-value', getMusicVolume, setMusicVolume],
  ['sfx-volume', 'sfx-volume-value', getSfxVolume, setSfxVolume],
]) {
  const slider = document.getElementById(inputId), value = document.getElementById(outputId);
  slider.value = Math.round(getVolume() * 100);
  value.value = slider.value + '%';
  slider.addEventListener('input', () => {
    setVolume(Number(slider.value) / 100);
    value.value = slider.value + '%';
  });
}
// スライダー操作のキーを移動・射撃・開始操作として受け取らない。
volumeControl.addEventListener('keydown', e => e.stopPropagation());
document.getElementById('sfx-test').addEventListener('click', async () => {
  await unlockSfx();
  playSfx(document.getElementById('sfx-pick').value);   // 聞き比べ用の候補も選べる
});
prebuild();
resetWorld();

function updateMusic() {
  const inGame = state.mode === 'play' || state.mode === 'pause';
  const track = inGame && !state.quiet
    ? (state.seg?.stage === 2 && state.seg.part === 2 ? 'boss' : 'stage')
    : null;
  syncMusic(track, state.mode === 'pause');
}

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
  for (const a of [state.enemies, state.eBullets, state.pBullets, state.items, state.warnings, state.phrases, state.laserWarns, state.colWarns]) a.length = 0;
  state.boss = null;
  state.mid = null;
  state.bossWarn = 0;
  state.slowT = 0;
  state.warp = null;
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

// 母船から惑星への信号（見た目だけ）。面が進むほど間隔が短い。ボス戦は母船そのものから
let signalT = 120;
function signalTick() {
  if (state.quiet || state.warp || state.boss?.dying) return;
  if (--signalT > 0) return;
  signalT = CFG.signalEvery[state.stage ?? 0];
  const [tx, ty] = receiverXY();
  const b = state.boss;
  if (b && !b.entering && !b.dying) sendSignal(b.x + 20 + BOSS_WINDOW.x, b.y + BOSS_WINDOW.y, tx, ty);
  else sendSignal(CFG.W + 40, 300 + (state.frame % 120), tx, ty);
}

// 最後の一枚でも自機はマウス（キー）についてくる。速さの上限は戦闘中と同じ。範囲は画面全体
function moveEndPlayer() {
  const P = CFG.player;
  const E = state.endPlayer ?? (state.endPlayer = { x: 250, y: 280 });
  let vx, vy;
  if (input.mode === 'pointer') {
    const dx = input.tx - E.x, dy = input.ty - E.y, d = Math.hypot(dx, dy);
    if (d <= 0.5) return;
    const s = Math.min(d, P.speed) / d;
    vx = dx * s; vy = dy * s;
  } else {
    const m = Math.max(1, Math.hypot(input.dx, input.dy));
    vx = input.dx / m * P.speed; vy = input.dy / m * P.speed;
  }
  // 戦闘中の移動範囲（右端 xMax まで）には縛らない。惑星のところまで行ける
  const M = 20;
  E.x = Math.max(M, Math.min(CFG.W - M, E.x + vx));
  E.y = Math.max(M, Math.min(CFG.H - M, E.y + vy));
}

// ワープ中は背景が速く流れる（立ち上がって、ピーク、また戻る）
function warpSpeed() {
  if (!state.warp) return 1;
  const u = ++state.warp.t / CFG.warpFrames;
  return 1 + 14 * Math.sin(Math.PI * Math.min(1, u));
}

// ---- デバッグ：場面ジャンプ。何度も周回せずに、見たい場面だけ確かめる ----
// タイトルなどで数字キー、または URL に ?scene=名前 を付けて読み込む
const SCENE_KEYS = {
  Digit1: 'stage1', Digit2: 'stage2', Digit3: 'stage3',
  Digit4: 'mid1', Digit5: 'mid2', Digit6: 'mid3',
  Digit7: 'boss1', Digit8: 'boss2', Digit9: 'boss3',
  Digit0: 'bossdie', Minus: 'ending', Equal: 'ruins',
};
// 場面ごとの強化（その時点の目安）
const SCENE_LV = { 0: [0, 0], 1: [2, 1], 2: [3, 3] };
function jumpTo(scene) {
  startGame();
  sched.clear();
  state.mission = null;
  const lv = (w, p) => { state.player.lv = { way: w, pow: p }; };
  const m = /^(stage|mid|boss)(\d)$/.exec(scene);
  if (m) {
    const n = +m[2];
    if (m[1] === 'stage') { lv(...SCENE_LV[n - 1]); startStage(n - 1, 0); }
    if (m[1] === 'mid') { lv(...(n === 1 ? [2, 1] : n === 2 ? [3, 2] : [3, 3])); startStage(n - 1, 1); }
    if (m[1] === 'boss') { lv(3, 3); startStage(2, 2, n); }
  } else if (scene === 'bossdie') {
    // 母船の形態3を出して、出きったらすぐ倒す
    lv(3, 3); startStage(2, 2, 3);
    sched.add((function* () {
      yield* sched.waitUntil(() => state.boss && !state.boss.entering && state.boss.trans === 0);
      skipForm();
    })());
  } else if (scene === 'ending' || scene === 'ruins') {
    state.mode = 'ending'; state.endT = scene === 'ruins' ? 999 : 0;
    if (scene === 'ruins') state.ruins = { t: 0 };
    return;
  }
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
  sweep(state.colWarns);
  // 母船の撃破後は背景と受信点を止める。最後の信号から最後の一枚まで同じ位置にする。
  if (!state.quiet) state.scroll += CFG.scroll * warpSpeed();
}

function step() {
  state.frame++;
  sample();
  if (DEBUG) while (input.fkeys.length) {
    const k = input.fkeys.shift();
    if (SCENE_KEYS[k]) jumpTo(SCENE_KEYS[k]); else handleKey(k);
  }
  else input.fkeys.length = 0;
  if (input.toggleAuto) { state.autoShot = !state.autoShot; input.toggleAuto = false; }

  switch (state.mode) {
    case 'title':
      if (input.tapped) startGame();
      else moveTitleMeteor();
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
      // 最後の一枚。説明はしない。惑星を触ると、夜側の灯へズームして廃墟の街へ。ほかを触っても何もしない
      state.endT++;
      if (state.ruins) {
        // 信号が1つ届く → 「オウトウ・・・セヨ・・・」が流れる → 暗くなって終わり
        const R = state.ruins;
        R.t++;
        // 受信 → アンテナがほわほわ脈打つ余韻 → ゆっくり「オウトウ・・・セヨ・・・」
        if (R.t === RUINS_WAIT) playSfx('signalFly');                         // 電波がふよふよ降りてくる間：ほよほよ
        if (RUINS_PULSES.includes(R.t - RUINS_RECEIVE)) playSfx('signal');   // アンテナが脈打つたびに小さくホワン
        if (R.t === RUINS_LINE_AT) showLine([STORY.finalCall], { y: CFG.H / 2, size: 30, now: true, type: CFG.finalCallType, hold: CFG.ruinsLineHold });
        if (R.t > RUINS_LINE_AT && !state.logLine && !R.fade) R.fade = 1;
        // 暗転しきったら、真っ暗な画面の真ん中に FIN。クリック（決定）でタイトルへ
        if (R.fade && !R.fin && ++R.fade > CFG.ruinsFade + 30) R.fin = 1;
        if (R.fin) { if (++R.fin > 60 && input.tapped) toTitle(); }
        else if (R.t > 90 && input.tapped) toTitle();
      } else if (state.zoom) {
        if (++state.zoom.t >= ZOOM_FRAMES) { state.zoom = null; state.ruins = { t: 0 }; }
      } else {
        moveEndPlayer();
        if (state.endT > 150 && input.tapped) {
          // 惑星を触ると廃墟へ。何もない所を触っても何も起きない（タイトルへは戻らない）
          // キー・パッドの決定は場所が無いので、そのまま惑星へ（キーだけでも最後まで見られるように）
          if (!input.tapAt || onPlanet(input.tapAt)) state.zoom = { t: 0 };
        }
      }
      break;
  }
  input.tapped = false;

  if (state.mode !== 'pause') {
    moveParticles();
    movePopups();
    moveBooms();
    sweep(state.booms);
    moveSignals();
    sweep(state.signals);
    if (state.mode === 'play' || state.mode === 'title') signalTick();   // タイトルでも、返事のない呼びかけが飛んでいる
    sweep(state.debris);
    moveStory();
    sweep(state.popups);
    if (state.flash && --state.flash.t <= 0) state.flash = null;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 1);
    if (state.bombFx > 0) state.bombFx--;
  }
  updateMusic();
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
  if (document.hidden && state.mode === 'play') {
    state.mode = 'pause';
    updateMusic();
  }
});

// URL の ?scene=名前 で、読み込んだ瞬間にその場面へ（例：?scene=ruins）
if (DEBUG) {
  const sc = new URLSearchParams(location.search).get('scene');
  if (sc) jumpTo(sc);
}

// デバッグ用にコンソールから触れるように
// step は描画なしの早回し用（自動プレイでの通し確認）
if (DEBUG) window.__pop = { state, CFG, input, startGame, step, sim: opt => sim(opt, startGame, step) };
