// 中ボス：壊れてから生まれた歪んだもの。面を追うごとに歪む
// 倒すと、抱えていた母船の記録（メッセージ）が出る。メッセージが出るのはここだけ
import { CFG, COL } from './config.js';
import { state, spawnParticle } from './world.js';
import * as sched from './sched.js';
import { needle, ring, fan, bigOrb, phrase } from './bullets.js';
import { spawnItem } from './items.js';
import { fxRng } from './rng.js';
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

const KINDS = {
  1: { gen: mid1, frags: ['A0', 'A1'] },
};

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
  state.mid = m;
  while (m.x > M.x + 0.5) { m.x += (M.x - m.x) * 0.06 - 0.3; yield; }
  m.x = M.x; m.entering = false;
  m.atk = { alive: true };                  // 攻撃の持ち主。倒した瞬間に止める
  sched.add(K.gen(m), m.atk);
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
  if (!m.entering) {
    const amp = m.sweep ? 150 : 40;
    m.y += (CFG.H / 2 + Math.sin(m.t * (m.sweep ? 0.03 : 0.015)) * amp - m.y) * 0.05;
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
