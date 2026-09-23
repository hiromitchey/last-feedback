// 発射プリミティブ — 設計書の原則をここで機械的に守らせる（技術設計書 7章）
// 弾を生む場所はここの関数だけ：needle / ring / fan / bigOrb / laserWarn+hLaser（formation は formation.js）
import { CFG, COL, SPEED_OK, DEBUG } from './config.js';
import { state } from './world.js';
import { gameRng } from './rng.js';
import * as sched from './sched.js';

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

// 水平レーザー。必ず laserWarn（予告80f）を経る。2本なら間に80px以上（原則3・5）
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
  const ys = pickLaserYs(count);
  src.pendingLaser = ys;
  const warns = ys.map(y => ({ y, t: CFG.laser.warn, alive: true }));
  state.laserWarns.push(...warns);
  yield* sched.wait(CFG.laser.warn);
  for (const w of warns) w.alive = false;
}

export function hLaser(src) {
  if (!src.pendingLaser) throw new Error('laserWarn を経ていない');
  for (const y of src.pendingLaser) state.lasers.push({ y, w: 0, t: 0, alive: true });
  src.pendingLaser = null;
}

export function moveLasers() {
  const L = CFG.laser;
  for (const l of state.lasers) {
    l.t++;
    // 太くなって、しばらく照射して、細くなる
    const u = l.t / L.fire;
    l.w = L.width * Math.min(1, Math.min(u * 5, (1 - u) * 5));
    if (l.t >= L.fire) l.alive = false;
  }
  for (const w of state.laserWarns) if (--w.t <= 0) w.alive = false;
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
  if (b) { b.id = orbId++; b.boss = boss; }
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
