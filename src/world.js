// 状態の箱・リセット・掃除・パーティクルのプール（技術設計書 3〜4章）
import { CFG } from './config.js';

export const state = {
  mode: 'title',            // title | play | pause | over
  frame: 0,
  scroll: 0,
  diff: CFG.diff.easy,      // 既定は「やさしい」
  score: 0,
  flash: null,              // { col, t, max } 画面フラッシュ
  shake: 0,

  player: null,
  enemies: [],
  eBullets: [],             // 上限30（でか玉は weight 3）
  pBullets: [],
  items: [],
  warnings: [],             // 出現予告の「▶」
  phrases: [],              // ボスの声（言葉のかたまり）とビーム
  laserWarns: [],           // レーザーの予告線
  popups: [],
  boss: null,
  seg: null,                // 道中の区間 { index, t, escaped }
  segCap: null,             // 区間ごとの同時弾上限
};

let idSeq = 1;
export const nextId = () => idSeq++;

export function resetWorld() {
  const P = CFG.player;
  state.frame = 0;
  state.scroll = 0;
  state.score = 0;
  state.flash = null;
  state.shake = 0;
  state.player = {
    x: P.startX, y: P.startY,
    lv: { way: 0, pow: 0 },      // ワイド（弾の数）とパワー（1発のダメージ）の段階 0〜3
    stock: { way: 0, pow: 0 },   // 次の段階までに拾った数
    invincible: 0, shotCd: 0, lives: state.diff.lives, bombs: state.diff.bombs,
    dead: false, gradeFx: 0,
    energy: CFG.energy.max, empty: false, idle: 0,
  };
  state.enemies.length = 0;
  state.eBullets.length = 0;
  state.pBullets.length = 0;
  state.items.length = 0;
  state.warnings.length = 0;
  state.phrases.length = 0;
  state.laserWarns.length = 0;
  state.popups.length = 0;
  state.boss = null;
  state.seg = null;
  state.segCap = null;
  state.checkpoint = null;   // コンティニューで戻る場所 { seg: 0|1|'boss', form, lv, cores }
  state.bossWarn = 0;
  state.bombFx = 0;
  state.bossResult = null;
  state.autoBomb = CFG.autoBomb;
  state.logLine = null;      // でか玉の断片・撃破後の一言
  state.logQueue = [];
  state.mission = null;
  state.quiet = false;       // 撃破後：自機も撃たない
  state.blackout = null;
  for (const p of particles) p.alive = false;
}

// splice を毎フレーム回さない。alive フラグで詰める
export function sweep(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i].alive) arr[w++] = arr[i];
  arr.length = w;
}

// ---- パーティクル（判定に関与しない。満杯なら諦める） ----
const PMAX = 512;
export const particles = Array.from({ length: PMAX }, () =>
  ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, col: '#fff', sz: 0 }));
let pIdx = 0;

export function spawnParticle(x, y, vx, vy, life, col, sz) {
  for (let n = 0; n < PMAX; n++) {
    const p = particles[(pIdx + n) % PMAX];
    if (!p.alive) {
      pIdx = (pIdx + n + 1) % PMAX;
      p.alive = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.col = col; p.sz = sz;
      return p;
    }
  }
  return null;
}

export function moveParticles() {
  for (const p of particles) {
    if (!p.alive) continue;
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.95; p.vy *= 0.95;
    if (--p.life <= 0) p.alive = false;
  }
}

export const particleCount = () => particles.reduce((n, p) => n + (p.alive ? 1 : 0), 0);

// ---- ポップアップ（オノマトペ・グレードアップ表示など） ----
export function popup(text, x, y, opt = {}) {
  state.popups.push({
    text, x, y, t: 0, life: opt.life ?? 40, col: opt.col ?? '#fff',
    size: opt.size ?? 22, big: !!opt.big, vy: opt.vy ?? -0.8, alive: true,
  });
}

export function movePopups() {
  for (const p of state.popups) {
    p.t++;
    if (!p.big) p.y += p.vy;
    if (p.t >= p.life) p.alive = false;
  }
}

export function flash(col, t = 12) { state.flash = { col, t, max: t }; }
