// 状態の箱・リセット・掃除・パーティクルのプール（技術設計書 3〜4章）
import { CFG } from './config.js';
import { fxRng } from './rng.js';

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
  booms: [],                // 爆発（見た目だけ）
  debris: [],               // 破片（見た目だけ）
  signals: [],              // 母船から惑星への信号（見た目だけ）
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
  state.booms.length = 0;
  state.debris.length = 0;
  state.signals.length = 0;
  state.boss = null;
  state.seg = null;
  state.segCap = null;
  state.checkpoint = null;   // コンティニューで戻る場所 { stage, part, lv, boss?, form?, cores? }
  state.bossWarn = 0;
  state.bombFx = 0;
  state.bossResult = null;
  state.autoBomb = CFG.autoBomb;
  state.logLine = null;      // でか玉の断片・撃破後の一言
  state.logQueue = [];
  state.mission = null;
  state.quiet = false;       // 撃破後：自機も撃たない
  state.blackout = null;
  state.mid = null;          // 中ボス
  state.slowT = 0;           // 中ボス撃破のスロー
  state.warp = null;         // 面の区切りのワープ
  state.stage = 0;           // 面（0〜2）
  state.planet = 0.8;        // 奥の惑星の大きさ。面が進むほど近づく
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

// ---- 信号：母船から惑星へ。電波のように飛び、届いても何も返ってこない（見た目だけ） ----
// 背景の惑星の位置（描画と同じ）
export const planetXY = () => [780 - (state.scroll * 0.02) % 40, 120];

export function sendSignal(x, y, tx, ty, weak = false) {
  state.signals.push({ x0: x, y0: y, tx, ty, t: 0, max: weak ? 150 : 90, weak, hit: 0, alive: true });
}
export function moveSignals() {
  for (const s of state.signals) {
    s.t++;
    if (s.t === s.max) s.hit = 1;
    if (s.hit) s.hit++;
    if (s.hit > 50) s.alive = false;
  }
}

// ---- 爆発：広がる火の玉＋リング＋火花（判定に関与しない） ----
export function explode(x, y, size = 40) {
  state.booms.push({ x, y, size, t: 0, max: 26 + size * 0.2, alive: true });
  const n = Math.min(40, 8 + size * 0.5);
  for (let i = 0; i < n; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 1 + fxRng.rnd() * size * 0.12;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 20 + fxRng.rnd() * 30,
      fxRng.pick(['#fff', '#FFD54F', '#FF9E3D', '#FF5C8A']), 3 + fxRng.rnd() * 5);
  }
  state.shake = Math.max(state.shake, Math.min(22, size * 0.2));
}

export function moveBooms() {
  for (const b of state.booms) if (++b.t >= b.max) b.alive = false;
  for (const d of state.debris) {
    d.x += d.vx; d.y += d.vy; d.vx *= 0.985; d.vy = d.vy * 0.985 + 0.04; d.rot += d.vr;
    if (++d.t >= d.max) d.alive = false;
  }
}

// 破片：継ぎ当ての板が回転しながら飛び散る
const DEBRIS_COLS = ['#a0875e', '#5c6b7a', '#8a6f9e', '#6d5c4a', '#d5d2dc', '#556070'];
export function debris(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 2 + fxRng.rnd() * 6;
    state.debris.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, rot: fxRng.rnd() * 6, vr: (fxRng.rnd() - 0.5) * 0.3,
      w: 10 + fxRng.rnd() * 22, h: 8 + fxRng.rnd() * 14, col: fxRng.pick(DEBRIS_COLS), t: 0, max: 80 + fxRng.rnd() * 60, alive: true });
  }
}

// 煙：くすぶる
export function smoke(x, y, n = 8) {
  for (let i = 0; i < n; i++)
    spawnParticle(x + fxRng.range(-20, 20), y + fxRng.range(-20, 20), fxRng.range(-0.4, 0.4), -0.4 - fxRng.rnd() * 0.8,
      60 + fxRng.rnd() * 50, fxRng.pick(['#5a5566', '#6d6878', '#4a4656']), 6 + fxRng.rnd() * 8);
}
