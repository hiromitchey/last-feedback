// 物語の進行：冒頭のミッション、でか玉の断片、撃破後の沈黙と最後の一枚（doc/ポップショット_物語.md）
// 説明はしない。書かないことは書かない
import { CFG } from './config.js';
import { state } from './world.js';
import * as sched from './sched.js';
import { STORY } from './text.js';

const TYPE = 4;       // タイプライター：1文字あたりのフレーム
const PART_GAP = 45;  // 繰り返す行の、次の繰り返しまでの間
const HOLD = 150;     // 出し切ってから消えるまで
const FADE = 30;

// ---- 断片の1行表示（画面上部。戦いの邪魔をしない位置） ----
// 表示中なら順番待ち（続けて割っても上書きしない）
export function showLine(parts, opt = {}) {
  const L = { parts, t: 0, y: opt.y ?? 96, size: opt.size ?? 22 };
  if (state.logLine && !opt.now) state.logQueue.push(L);
  else state.logLine = L;
}

const lineTotal = L => L.parts.reduce((s, p) => s + [...p].length * TYPE, 0) + (L.parts.length - 1) * PART_GAP;

// 何文字目まで見えているか。繰り返す行は、前の部分を出し切ってから間を置いて次へ
export function lineProgress(L) {
  let t = L.t, shown = [], done = true;
  for (let i = 0; i < L.parts.length; i++) {
    const n = [...L.parts[i]].length;
    const need = n * TYPE;
    if (t < need) { shown.push([...L.parts[i]].slice(0, Math.floor(t / TYPE)).join('')); done = false; break; }
    shown.push(L.parts[i]);
    t -= need;
    if (i < L.parts.length - 1) { if (t < PART_GAP) { done = false; break; } t -= PART_GAP; }
  }
  const total = lineTotal(L);
  const alpha = L.t < total + HOLD ? 1 : Math.max(0, 1 - (L.t - total - HOLD) / FADE);
  return { text: shown.join('　'), alpha, done, over: L.t >= total + HOLD + FADE };
}

export function moveStory() {
  const L = state.logLine;
  if (L) {
    L.t++;
    // 次が待っていれば、出し切った時点で早めに切り上げる
    const pr = lineProgress(L);
    if (pr.over || (state.logQueue.length && pr.done && L.t > lineTotal(L) + 90)) state.logLine = state.logQueue.shift() ?? null;
  }
  if (state.mission) { state.mission.t++; }
}

// でか玉が割れたとき
export function onOrbBroken(o) {
  if (o.frag && STORY.frags[o.frag]) showLine(STORY.frags[o.frag]);
}

// 敵の船体番号（正常な個体だけ）。1回のプレイで同じ番号は二度出さない。047 は無い
// 最初は 047 の前後から（その列の中に自分の番号がある）。残りは 001〜299 を決まった順に混ぜたもの
const HULL_POOL = (() => {
  const first = STORY.hullNumbers;
  const rest = [];
  for (let n = 1; n <= 299; n++) {
    const s = String(n).padStart(3, '0');
    if (s !== '047' && !first.includes(s)) rest.push(s);
  }
  let seed = 0x5eed;
  for (let i = rest.length - 1; i > 0; i--) {         // 固定の並び（ゲームの乱数は使わない）
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...first, ...rest];
})();
let numIdx = 0;
export const resetHullNumbers = () => { numIdx = 0; };
export function nextHullNumber() {
  const n = HULL_POOL[numIdx % HULL_POOL.length];
  numIdx++;
  return n;
}

// ---- 冒頭のミッション表示。プレイヤーは疑わない ----
export function* mission() {
  state.mission = { t: 0 };
  yield* sched.wait(200);
  state.mission = null;
}

// ---- 撃破後：攻撃が止まる → 動きが止まる → 灯が、ひとつずつ消える → 静かになる → 一言 → 暗転 → 最後の一枚 ----
export const LIGHTS = 6;
export function* afterBoss(b) {
  state.quiet = true;                        // 自機も撃たない。ずっと定型だった画面が、最後に黙る
  b.lights = LIGHTS;
  yield* sched.wait(60);
  while (b.lights > 0) { b.lights--; yield* sched.wait(40); }
  yield* sched.wait(90);                     // 静かになる
  state.logQueue.length = 0;
  showLine([STORY.final], { y: CFG.H / 2 + 150, size: 24, now: true });
  yield* sched.waitUntil(() => !state.logLine);
  yield* sched.wait(40);
  state.blackout = { t: 0 };                 // 暗転
  yield* sched.wait(90);
  state.mode = 'ending';
  state.endT = 0;
}
