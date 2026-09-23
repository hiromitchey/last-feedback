// 発射プリミティブ — 設計書の原則をここで機械的に守らせる（技術設計書 7章）
// 弾を生む場所はここの関数だけ：needle / ring / fan / bigOrb / laserWarn+hLaser（formation は formation.js）
import { CFG, COL, SPEED_OK, DEBUG } from './config.js';
import { state } from './world.js';
import { gameRng } from './rng.js';
import * as sched from './sched.js';
import { parsePhrase } from './text.js';

const weightOf = arr => arr.reduce((n, b) => n + (b.hp ? CFG.bullet.orbWeight : 1), 0);
// 同時弾の上限。道中は区間ごとにさらに低い（A 10 / B 16）
export const bulletCap = () => Math.min(CFG.bullet.cap, state.segCap ?? CFG.bullet.cap);

function push(x, y, ang, speed, col, opt = {}) {
  const w = opt.hp ? CFG.bullet.orbWeight : 1;
  if (weightOf(state.eBullets) + w > bulletCap()) return null;             // 原則4
  const sp = Math.min(speed * state.diff.speed, CFG.bullet.speedMax);       // 原則2
  if (DEBUG && SPEED_OK[col]) console.assert(SPEED_OK[col](sp), `色${col}に速度${sp}は不正`);
  const b = {
    x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    r: opt.r ?? 5.5, col, ang, alive: true,
    curve: opt.curve ?? 0, acc: opt.acc ?? 0,
    hp: opt.hp, maxhp: opt.hp, spin: 0, spinV: opt.spinV ?? 0,
    needle: !!opt.needle, id: 0, kind: opt.kind,
    ch: opt.ch ?? null, px: opt.px ?? 0,   // 文字の弾（叩きつけた言葉が崩れたもの）
  };
  state.eBullets.push(b);
  return b;
}

// 自機狙いの針。速度は 3.4 で頭打ち
export function needle(src, speed, col = COL.PINK, off = 0) {
  const p = state.player;
  const ang = Math.atan2(p.y - src.y, p.x - src.x) + off;
  return push(src.x, src.y, ang, Math.min(speed, CFG.bullet.speedMax), col, { r: 4, needle: true });
}

// リング。way数は10で頭打ち（原則1・4）。隙間が自機に向くよう位相を取る（原則5）
export function ring(src, n, speed, col, offset = null) {
  n = Math.min(n, CFG.bullet.ringMax);
  n = Math.max(6, Math.round(n * state.diff.count));
  const p = state.player;
  const toP = Math.atan2(p.y - src.y, p.x - src.x);
  const base = offset ?? toP + Math.PI / n;   // 自機方向がちょうど弾と弾の間になる
  for (let i = 0; i < n; i++) push(src.x, src.y, base + i * Math.PI * 2 / n, speed, col);
}

// 扇。隣り合う弾の角度差が下限を割るなら n を減らす（原則1）
const FAN_MIN_ANG = CFG.bullet.minGap / 180;   // 発射から約100px先で隙間64px
export function fan(src, n, dir, spread, speed, col) {
  n = Math.max(2, Math.round(n * state.diff.count));
  while (n > 2 && spread / (n - 1) < FAN_MIN_ANG) n--;
  if (dir === 'aim') dir = Math.atan2(state.player.y - src.y, state.player.x - src.x);
  for (let i = 0; i < n; i++) push(src.x, src.y, dir + (i / (n - 1) - 0.5) * spread, speed, col);
}

// 水平ビーム。必ず laserWarn（予告80f）を経る。2本なら間に80px以上（原則3・5）
// 予告線のあと、文字の列が横一直線に高速で飛んでくる。1文字ずつ当たり判定がある
// いま流れている声・ビーム・ビームの予告線が占めている上下の帯
const LANE_GAP = 6;
function occupiedBands() {
  const bands = [];
  for (const q of state.phrases) if (q.alive && q.kind !== 'col') bands.push([q.y0 - q.half, q.y0 + q.half]);
  const wh = CFG.laser.width / 2 + CFG.phrase.base * CFG.laser.maxTextSize / 2;
  for (const w of state.laserWarns) if (w.alive) bands.push([w.y - wh, w.y + wh]);
  return bands;
}
// 狙った高さ y に、上下 half の帯が他と重ならずに置けるか。置けなければ一番近い空いている高さ（無ければ null）
export function freeY(y, half, bands = occupiedBands()) {
  const lo = half + 8, hi = CFG.H - half - 8;
  const ok = yy => yy >= lo && yy <= hi && bands.every(([a, b]) => yy + half + LANE_GAP < a || yy - half - LANE_GAP > b);
  for (let d = 0; d <= CFG.H; d += 8) {
    if (ok(y + d)) return y + d;
    if (d && ok(y - d)) return y - d;
  }
  return null;
}

function pickLaserYs(count) {
  const py = state.player.y;
  if (count === 1) return [py];
  const L = CFG.laser;
  const gap = L.minGap + L.width * 0.68 + 2 * CFG.player.r + 10;   // 帯の外側どうしで80px以上
  // 自機の高さを挟むように置き、どちらかは必ず画面内に収める
  let y1 = py - gap / 2 - 30, y2 = y1 + gap + 60;
  if (y1 < 40) { y1 = 40; y2 = y1 + gap + 60; }
  if (y2 > CFG.H - 40) { y2 = CFG.H - 40; y1 = y2 - gap - 60; }
  return [y1, y2];
}

export function* laserWarn(src, count) {
  // ビームも、流れている声と重ならない高さにずらす。置けない分は撃たない
  const L = CFG.laser;
  const half = Math.max(L.width / 2, CFG.phrase.base * L.maxTextSize / 2);
  const bands = occupiedBands(), ys = [];
  for (const want of pickLaserYs(count)) {
    const y = freeY(want, half, bands);
    if (y === null) continue;
    if (ys.length && Math.abs(y - ys[0]) < L.minGap + L.width) continue;   // 2本なら間を空ける（原則5）
    ys.push(y);
    bands.push([y - half, y + half]);
  }
  src.pendingLaser = ys;
  // 予告線はビームが出るまで残す（寿命で先に消えると、そのすき間に別の声が入り込む）
  // ボスが弱って待ちが延びる（weakenRate）ぶんも含めて残す
  const waitFrames = Math.round(CFG.laser.warn * (state.boss ? state.boss.weakenRate : 1));
  const warns = ys.map(y => ({ y, t: waitFrames + 5, alive: true }));
  state.laserWarns.push(...warns);
  yield* sched.wait(CFG.laser.warn);
  for (const w of warns) w.alive = false;
}

// ビーム：帯が出ている間、その中をボスの声が程よい速さで流れる（電光掲示板のように）
// 当たり判定は帯。文字は帯の中の飾り
export function hLaser(src, text) {
  if (!src.pendingLaser) throw new Error('laserWarn を経ていない');
  const L = CFG.laser;
  for (const y of src.pendingLaser) {
    const q = phrase(src, text, { y, speed: L.textSpeed, amp: 0, col: COL.YELLOW, beam: true, maxSize: L.maxTextSize });
    q.life = 0; q.w = 0; q.srcX = src.x - 80;
  }
  src.pendingLaser = null;
}

// ---- ボスの「声」：言葉のかたまりが波打ちながら横に流れてくる ----
// 文字は同じ波の上を列車のように続いて進む（だから読める）。1文字ずつ判定がある
// 大きい言葉ほど判定も大きい。上限は形態ごとの同時フレーズ数（原則4の代わり）
export function phrase(src, text, opt = {}) {
  const F = CFG.phrase;
  if (!opt.beam && state.phrases.filter(q => !q.beam).length >= (opt.max ?? F.max)) return null;
  const chars = parsePhrase(text, () => gameRng.rnd());
  // ビームの文字は帯からはみ出しすぎない大きさまで
  if (opt.sizeMul) for (const c of chars) c.size *= opt.sizeMul;
  if (opt.maxSize) for (const c of chars) c.size = Math.min(c.size, opt.maxSize);
  // 横に並べる。文字幅は大きさに比例、言葉の間に少し隙間
  let x = 0, prevWord = 0;
  for (const c of chars) {
    const w = F.base * c.size * (c.space ? 0.5 : c.half ? 0.55 : 0.95);
    if (c.word !== prevWord) { x += F.base * 0.25; prevWord = c.word; }
    c.dx = x + w / 2;
    c.px = Math.round(F.base * c.size);
    c.r = c.space ? 0 : F.base * c.size * F.hitRatio;
    x += w;
    // 言葉ごとに少し傾ける（強調は大きく）
    c.tilt = c.big ? (c.word % 2 ? 0.14 : -0.12) : (c.word % 2 ? 0.05 : -0.06);
  }
  // 文字どうしを重ねない：この声が占める上下の帯を決め、空いている高さにずらす（空きが無ければ出さない）
  const maxPx = Math.max(...chars.map(c => c.px));
  const amp = opt.amp ?? F.amp;
  const half = opt.beam ? Math.max(CFG.laser.width / 2, maxPx / 2) : maxPx / 2 + amp + 3;
  let y0 = opt.y ?? src.y;
  if (!opt.beam) {
    y0 = freeY(y0, half);
    if (y0 === null) return null;
  }
  const q = {
    chars, width: x, half,
    x: src.x - 80, y0,
    v: (opt.speed ?? F.speed) * (opt.beam ? 1 : state.diff.speed),
    amp, k: Math.PI * 2 / F.wavelength, ph: opt.ph ?? 0,
    col: opt.col ?? COL.VIOLET, beam: !!opt.beam, t: 0, alive: true,
  };
  layoutPhrase(q);
  state.phrases.push(q);
  return q;
}

// 各文字の位置・傾き・出てくるときの弾み（ポンと出る）
function layoutPhrase(q) {
  if (q.kind === 'slam') return layoutSlam(q);
  if (q.kind === 'col') return layoutCol(q);
  for (let i = 0; i < q.chars.length; i++) {
    const c = q.chars[i];
    c.x = q.x + c.dx;
    const a = q.k * c.x + q.ph;
    c.y = q.y0 + Math.sin(a) * q.amp + Math.sin(q.t * 0.09 + c.word) * 2;
    c.rot = c.tilt + Math.atan(Math.cos(a) * q.amp * q.k) * 0.6;   // 波の坂に合わせて傾く
    const u = q.beam ? 1 : Math.min(1, Math.max(0, (q.t - i * 3) / 14));
    const e = u - 1, back = 2.2;
    c.sc = u <= 0 ? 0 : 1 + (back + 1) * e * e * e + back * e * e;   // easeOutBack
  }
}

export function movePhrases() {
  const L = CFG.laser;
  for (const q of state.phrases) {
    q.t++;
    if (q.kind === 'slam') { layoutSlam(q); if (q.t >= q.shatterAt) shatter(q); continue; }
    if (q.kind === 'col') {
      q.y += q.dir * q.v;
      layoutCol(q);
      if (q.dir > 0 ? q.y > CFG.H + 40 : q.y + q.height < -40) q.alive = false;
      continue;
    }
    q.x -= q.v;
    layoutPhrase(q);
    if (q.beam) {
      // 太くなって、しばらく出ていて、細くなる
      q.life++;
      const u = q.life / L.fire;
      q.w = L.width * Math.min(1, u * 8, (1 - u) * 8);
      if (q.life >= L.fire) q.alive = false;
    } else if (q.x + q.width < -40) q.alive = false;
  }
}

export function moveLasers() {
  for (const w of state.laserWarns) if (--w.t <= 0) w.alive = false;
  for (const w of state.colWarns) if (--w.t <= 0) w.alive = false;
}

// ---- 叩きつけ：言葉が画面にドンと叩きつけられ、少し止まって読ませたあと、1文字ずつ崩れて弾になる ----
// 叩きつけた文字そのものには当たらない（読ませるための予告）。崩れた文字の弾が攻撃
export function slam(src, text, opt = {}) {
  const F = CFG.phrase, S = CFG.slam;
  const chars = parsePhrase(text, () => gameRng.rnd());
  let x = 0, prevWord = 0;
  for (const c of chars) {
    c.size *= S.sizeMul;
    const w = F.base * c.size * (c.space ? 0.5 : c.half ? 0.55 : 0.95);
    if (c.word !== prevWord) { x += F.base * 0.3; prevWord = c.word; }
    c.dx = x + w / 2; c.px = Math.round(F.base * c.size); c.r = 0;
    c.tilt = (gameRng.rnd() - 0.5) * 0.2;
    x += w;
  }
  const maxPx = Math.max(...chars.map(c => c.px));
  const half = maxPx / 2 + 6;
  const y0 = freeY(opt.y ?? CFG.H / 2, half);
  if (y0 === null) return null;
  const q = { kind: 'slam', chars, width: x, half, sx: opt.x ?? 480, y0, col: opt.col ?? COL.VIOLET,
    t: 0, shatterAt: S.stamp + S.hold, alive: true };
  layoutSlam(q);
  state.phrases.push(q);
  state.shake = Math.max(state.shake, 8);
  return q;
}
function layoutSlam(q) {
  const S = CFG.slam;
  const u = Math.min(1, q.t / S.stamp), e = 1 - (1 - u) ** 3;
  const sc = 2.4 - 1.4 * e;                                   // 大きく出て、縮んで止まる
  if (q.t === S.stamp) state.shake = Math.max(state.shake, 10); // ドン
  for (const c of q.chars) {
    c.x = q.sx - q.width / 2 + c.dx; c.y = q.y0;
    c.rot = c.tilt * (1 - e * 0.5);
    c.sc = sc;
  }
}
// 崩れる：1文字ずつ、その場から自機へ向かう文字の弾になる
function shatter(q) {
  q.alive = false;
  const S = CFG.slam, p = state.player;
  q.chars.forEach((c, i) => {
    if (c.space) return;
    const a = Math.atan2(p.y - c.y, p.x - c.x) + (i - (q.chars.length - 1) / 2) * S.spread;
    push(c.x, c.y, a, S.speed, q.col, { ch: c.ch, px: Math.min(c.px, S.bulletPx), r: S.bulletR });
  });
}

// ---- 縦書きの言葉：上から降ってくる／下から上がってくる。出る前に、その列に予告の点線 ----
export function* column(src, text, opt = {}) {
  const F = CFG.phrase, C = CFG.col;
  const chars = parsePhrase(text, () => gameRng.rnd());
  let y = 0;
  for (const c of chars) {
    const h = F.base * c.size * (c.space ? 0.5 : 1.0);
    c.dy = y + h / 2; c.px = Math.round(F.base * c.size);
    c.r = c.space ? 0 : F.base * c.size * F.hitRatio;
    c.tilt = (gameRng.rnd() - 0.5) * 0.12;
    y += h;
  }
  const dir = opt.dir ?? 1;
  const x = opt.x;
  const w = { x, t: C.warn, dir, alive: true };
  state.colWarns.push(w);
  yield* sched.wait(C.warn);
  w.alive = false;
  const q = { kind: 'col', chars, height: y, x0: x, dir, y: dir > 0 ? -y - 10 : CFG.H + 10,
    v: (opt.speed ?? C.speed) * state.diff.speed, col: opt.col ?? COL.CYAN, t: 0, alive: true };
  layoutCol(q);
  state.phrases.push(q);
}
function layoutCol(q) {
  for (let i = 0; i < q.chars.length; i++) {
    const c = q.chars[i];
    c.x = q.x0 + Math.sin(q.t * 0.06 + i * 0.5) * 3;
    c.y = q.y + c.dy;
    c.rot = c.tilt;
    c.sc = 1;
  }
}

// でか玉。hp・半径・遅い速度を必ずセットする（原則7）
let orbId = 1;
export function bigOrb(x, y, opt = {}) {
  const boss = !!opt.boss;
  const hp = (boss ? CFG.orb.hpBoss : CFG.orb.hpMid) * state.diff.orbHp;
  const speed = opt.slow ? CFG.orb.slowSpeed : CFG.orb.speed;
  // でか玉は難易度で速くしない（最も遅い、を崩さない）。push を経由しつつ diff.speed を打ち消す
  const b = push(x, y, Math.PI + (opt.angle ?? 0), speed / state.diff.speed, '#fff', {
    hp, r: boss ? CFG.orb.rBoss : CFG.orb.rMid, spinV: 0.02 + gameRng.rnd() * 0.02,
  });
  if (b) { b.id = orbId++; b.boss = boss; b.frag = opt.frag ?? null; }
  return b;
}

export function moveBullets() {
  for (const b of state.eBullets) {
    if (b.curve) {
      const sp = Math.hypot(b.vx, b.vy);
      b.ang += b.curve;
      b.vx = Math.cos(b.ang) * sp; b.vy = Math.sin(b.ang) * sp;
    }
    if (b.acc) { b.vx *= 1 + b.acc; b.vy *= 1 + b.acc; }
    b.x += b.vx; b.y += b.vy;
    b.spin += b.spinV;
    if (b.hitFlash) b.hitFlash--;
    const m = b.r + 20;
    if (b.x < -m || b.x > CFG.W + m || b.y < -m || b.y > CFG.H + m) b.alive = false;
  }
  for (const b of state.pBullets) {
    b.x += b.vx; b.y += b.vy;
    if (b.x > CFG.W + 20 || b.y < -20 || b.y > CFG.H + 20) b.alive = false;
  }
}

export const bulletWeight = () => weightOf(state.eBullets);
