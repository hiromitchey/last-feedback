// 中ボス：壊れてから生まれた歪んだもの。面を追うごとに歪む
// 倒すと、抱えていた母船の記録（メッセージ）が出る。メッセージが出るのはここだけ
import { CFG, COL } from './config.js';
import { state, spawnParticle } from './world.js';
import * as sched from './sched.js';
import { needle, ring, fan, bigOrb, phrase } from './bullets.js';
import { spawnItem } from './items.js';
import { fxRng } from './rng.js';
import { spawnEnemy } from './enemies.js';
import { showLine } from './story.js';
import { STORY, MID_TEXT } from './text.js';

// ---- 中ボスごとの攻撃（普通の弾。声は母船だけ） ----
// 1：少しだけ歪んだ試作品。047 に近い形。攻撃は素直
function* mid1(m) {
  yield* sched.wait(40);
  while (true) {
    yield* sched.charge(m);
    for (let i = 0; i < 3; i++) { needle(m, 2.8, COL.PINK, (i - 1) * 0.12); yield* sched.wait(6); }
    yield* sched.wait(50);
    // 声：ﾊｲｼﾞｮ！ハイジョ！（自機の高さに流す）
    yield* sched.charge(m);
    say(m, COL.VIOLET);
    yield* sched.wait(50);
    yield* sched.charge(m);
    ring(m, 8, 1.8, COL.VIOLET);
    yield* sched.wait(60);
    m.sweep = 1;                              // 上下に動きながら扇
    for (let k = 0; k < 3; k++) {
      yield* sched.charge(m, 20);
      fan(m, 4, Math.PI, 1.0, 2.0, COL.CYAN);
      yield* sched.wait(40);
    }
    m.sweep = 0;
    bigOrb(m.x - 50, m.y, {});                // でか玉（かけら・エネルギーの補給源）
    yield* sched.wait(40);
    yield* sched.charge(m);
    say(m, COL.VIOLET, 140);                  // 2本目は間を空けて
    yield* sched.wait(60);
  }
}

// 中ボスの声を1本流す。off を渡すと自機の高さから上下にずらす（逃げ道を残す）
function say(m, col, off = 0) {
  const list = MID_TEXT[m.kind];
  m.sayIdx = (m.sayIdx ?? -1) + 1;
  const py = state.player.y;
  const y = off ? py + (py > CFG.H / 2 ? -off : off) : py;
  phrase(m, list[m.sayIdx % list.length], { y: Math.max(60, Math.min(CFG.H - 60, y)), col, max: 2 });
}

// 2：修理機（継ぎ接ぎの塊）。前に部品が2つ付いていて、自弾は部品で止まる
// 部品を壊しても、しばらくすると色の合わない部品が飛んできて付け直される（何度でも）
function* mid2(m) {
  yield* sched.wait(40);
  while (true) {
    yield* sched.charge(m);
    say(m, COL.VIOLET);
    yield* sched.wait(70);
    yield* sched.charge(m);
    ring(m, 8, 1.8, COL.VIOLET);
    yield* sched.wait(70);
    bigOrb(m.x - 50, m.y, {});
    yield* sched.wait(30);
    yield* sched.charge(m);
    say(m, COL.VIOLET, 150);
    yield* sched.wait(80);
  }
}
function* partUpper(p) {
  yield* sched.wait(50);
  while (true) {
    yield* sched.charge(p, 24);
    needle(p, 2.8, COL.PINK, -0.08); needle(p, 2.8, COL.PINK, 0.08);
    yield* sched.wait(90);
  }
}
function* partLower(p) {
  yield* sched.wait(100);
  while (true) {
    yield* sched.charge(p, 24);
    fan(p, 3, 'aim', 0.9, 2.0, COL.CYAN);
    yield* sched.wait(110);
  }
}

// 3：原型をとどめないもの。ときどきノイズが走って瞬間移動する（移動先に残像を先に出す＝予告）
function* mid3(m) {
  yield* sched.wait(40);
  let k = 0;
  while (true) {
    yield* sched.charge(m);
    say(m, COL.CYAN);
    yield* sched.wait(40);
    yield* sched.charge(m);
    ring(m, 10, 1.9, COL.CYAN);
    yield* sched.wait(50);
    for (let i = 0; i < 2; i++) {
      yield* sched.charge(m, 20);
      needle(m, 3.0, COL.PINK, -0.15); needle(m, 3.0, COL.PINK, 0); needle(m, 3.0, COL.PINK, 0.15);
      yield* sched.wait(40);
    }
    // 瞬間移動：残像 → ノイズ → 跳ぶ。跳んでいる間は撃たない
    yield* teleport(m);
    if (k++ % 2 === 0) bigOrb(m.x - 50, m.y, {});
    yield* sched.charge(m);
    say(m, COL.CYAN, 150);
    yield* sched.wait(50);
    // 歪んだ小さなものを吐き出す
    for (let i = 0; i < 3; i++) {
      spawnEnemy('guni', m.x - 40, m.y + (i - 1) * 50, { move: 'guni' });
      yield* sched.wait(10);
    }
    yield* sched.wait(60);
  }
}
function* teleport(m) {
  const py = state.player.y;
  const to = Math.max(110, Math.min(CFG.H - 110, py > CFG.H / 2 ? py - 170 : py + 170));
  m.ghost = { y: to, t: CFG.midboss.teleWarn };
  yield* sched.wait(CFG.midboss.teleWarn);
  m.ghost = null;
  m.glitch = 24;
  m.homeY = to; m.y = to;
  yield* sched.wait(30);
}

const KINDS = {
  1: { gen: mid1, frags: ['A0', 'A1'] },
  3: { gen: mid3, frags: ['B1', 'B2', 'B3', 'B4'] },
  2: { gen: mid2, frags: ['A2', 'A3', 'B0'], parts: [
    { dx: -46, dy: -62, gen: partUpper }, { dx: -46, dy: 62, gen: partLower },
  ] },
};

const PART_COLS = ['#8d8398', '#a0875e', '#5c6b7a', '#7a5aa8', '#6d5c4a'];

function startPart(p) {
  p.atk = { alive: true };
  sched.add(p.gen(p), p.atk);
}

export function* midbossFight(kind) {
  const M = CFG.midboss;
  const K = KINDS[kind];
  state.bossWarn = 70;
  yield* sched.wait(70);
  const hp = M.hp[kind - 1] * state.diff.hp;
  const m = {
    kind, x: CFG.W + 120, y: CFG.H / 2, r: M.r, hp, maxhp: hp,
    alive: true, hitFlash: 0, glow: 0, id: -10, t: 0, entering: true, dying: 0, sweep: 0,
  };
  m.parts = (K.parts ?? []).map((d, i) => ({
    ...d, id: -20 - i, r: M.partR, hp: M.partHp * state.diff.hp, maxhp: M.partHp * state.diff.hp,
    dead: false, x: 0, y: 0, glow: 0, hitFlash: 0, col: 0, repairT: 0, fly: null,
  }));
  state.mid = m;
  syncMidParts(m);
  while (m.x > M.x + 0.5) { m.x += (M.x - m.x) * 0.06 - 0.3; syncMidParts(m); yield; }
  m.x = M.x; m.entering = false;
  m.atk = { alive: true };                  // 攻撃の持ち主。倒した瞬間に止める
  sched.add(K.gen(m), m.atk);
  for (const p of m.parts) startPart(p);
  yield* sched.waitUntil(() => m.dying > 0);
  // 静かに崩れる → 一瞬スロー → 記録が1行ずつ → 読み終わってから再開
  for (const b of state.eBullets) b.alive = false;
  state.slowT = 60;
  yield* sched.wait(50);
  state.mid = null;
  spawnItem('bomb', m.x, m.y, -2, 0);
  yield* sched.wait(30);
  for (const f of K.frags) showLine(STORY.frags[f], { y: CFG.H / 2, size: 28 });
  yield* sched.waitUntil(() => !state.logLine);
  yield* sched.wait(40);
}

function syncMidParts(m) {
  for (const p of m.parts) { p.x = m.x + p.dx; p.y = m.y + p.dy; }
}

// 壊れた部品の付け直し：待つ → 画面の外から部品が飛んでくる → 留まる → 復活（色が変わる）
function repairStep(m, p) {
  if (!p.dead) return;
  if (p.repairT > 0) { p.repairT--; if (p.repairT === 0) p.fly = { t: 0, x: CFG.W + 40, y: p.y - 80 }; return; }
  if (!p.fly) return;
  const f = p.fly, T = 40;
  f.t++;
  f.x += (p.x - f.x) * 0.12; f.y += (p.y - f.y) * 0.12;
  if (f.t >= T) {
    p.fly = null; p.dead = false; p.hp = p.maxhp; p.col = (p.col + 1) % PART_COLS.length;
    m.repairs = (m.repairs ?? 0) + 1;
    showRepair(p.x - 20, p.y - 30);
    state.shake = Math.max(state.shake, 5);
    crumble(p, 10);
    startPart(p);
  }
}

function showRepair(x, y) {
  state.popups.push({ text: 'ｼｭｳｾｲ', x, y, t: 0, life: 50, col: '#FFD54F', size: 20, big: false, vy: -0.5, alive: true });
}

export const PART_COLORS = PART_COLS;

export function moveMid() {
  const m = state.mid;
  if (!m) return;
  m.t++;
  if (m.hitFlash) m.hitFlash--;
  if (m.dying) {
    m.dying++;
    if (m.dying % 8 === 0) crumble(m, 8);
    return;
  }
  if (m.glitch > 0) m.glitch--;
  if (!m.entering) {
    const amp = m.sweep ? 150 : 40;
    m.y += ((m.homeY ?? CFG.H / 2) + Math.sin(m.t * (m.sweep ? 0.03 : 0.015)) * amp - m.y) * 0.05;
  }
  syncMidParts(m);
  for (const p of m.parts) { if (p.hitFlash) p.hitFlash--; repairStep(m, p); }
}

export function damageMidPart(p, dmg) {
  if (p.dead) return;
  p.hp -= dmg; p.hitFlash = 3;
  state.score += CFG.score.hit;
  if (p.hp <= 0) {
    p.dead = true;
    if (p.atk) p.atk.alive = false;
    p.repairT = CFG.midboss.repairWait;
    state.score += CFG.midboss.partScore;
    crumble(p, 24);
  }
}

export const midTargetable = () => state.mid && !state.mid.entering && !state.mid.dying;

export function damageMid(dmg) {
  const m = state.mid;
  m.hp -= dmg; m.hitFlash = 3;
  state.score += CFG.score.hit;
  if (m.hp <= 0) {
    m.hp = 0; m.dying = 1;
    if (m.atk) m.atk.alive = false;
    for (const p of m.parts) { if (p.atk) p.atk.alive = false; p.dead = true; p.fly = null; p.repairT = 0; }
    m.ghost = null;
    for (const e of state.enemies) if (e.type === 'guni' && m.kind === 3) e.alive = false;
    for (const b of state.eBullets) b.alive = false;
    for (const q of state.phrases) q.alive = false;
    state.score += CFG.midboss.score;
    crumble(m, 40);
  }
}

function crumble(m, n) {
  for (let i = 0; i < n; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 0.5 + fxRng.rnd() * 3;
    spawnParticle(m.x + fxRng.range(-30, 30), m.y + fxRng.range(-30, 30), Math.cos(a) * s, Math.sin(a) * s,
      30 + fxRng.rnd() * 30, fxRng.pick(['#fff', '#8d8398', '#cfd3dc', '#FF5C8A']), 3 + fxRng.rnd() * 4);
  }
}
