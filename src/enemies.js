// 敵の挙動：ぷに・もこ・びゅん（設計書 5章）
import { CFG, COL } from './config.js';
import { state, nextId, spawnParticle } from './world.js';
import * as sched from './sched.js';
import { needle, ring, bigOrb } from './bullets.js';
import { spawnItem } from './items.js';
import { gameRng, fxRng } from './rng.js';
import { nextHullNumber, nextBrokenNumber } from './story.js';

// opt:
//   move  : 'straight' | 'wave' | 'converge' | 'uturn' | 'moko' | 'byun'
//   shoot : ぷにが自機狙いを1発撃つ
//   carry : 倒すと落とすアイテム（'power' など）。道中のパワーは固定配置
//   orb   : もこがでか玉を吐く
export function spawnEnemy(type, x, y, opt = {}) {
  const E = CFG.enemy[type];
  const e = {
    id: nextId(), type, x, y, y0: y, t: 0,
    vx: opt.vx ?? -E.speed, vy: opt.vy ?? 0,
    hp: E.hp * state.diff.hp, maxhp: E.hp * state.diff.hp, r: E.r,
    alive: true, hitFlash: 0, glow: 0, ang: Math.PI,
    move: opt.move ?? (type === 'puni' ? 'straight' : type),
    amp: opt.amp ?? 0, freq: opt.freq ?? 0.04, phase: opt.phase ?? 0,
    ty: opt.ty ?? 270, dy: opt.dy ?? 0, phaseN: 0,
    carry: opt.carry ?? null,
    // 正常な個体（ぷに・びゅん）には船体番号。壊れてから作られた もこ には無い
    // 兄弟（ぷに・びゅん・子機）は正しい番号、壊れかけ（もこ・ゆがみ）は化けた番号
    num: type === 'moko' || type === 'guni' ? nextBrokenNumber() : nextHullNumber(),
    broken: type === 'moko' || type === 'guni',
    // ゆがみは1体ずつ動きがばらばら（揺れの周期・止まるタイミング）
    wob: type === 'guni' ? { a1: gameRng.range(20, 60), f1: gameRng.range(0.02, 0.06), a2: gameRng.range(5, 20),
      f2: gameRng.range(0.1, 0.2), p: gameRng.rnd() * 6, stopAt: 60 + ((gameRng.rnd() * 120) | 0), rot: 0 } : null,
  };
  state.enemies.push(e);
  if (opt.shoot && type === 'puni') sched.add(puniShot(e), e);
  if (type === 'moko') { e.orbPending = !!opt.orb; e.frag = opt.frag ?? null; sched.add(mokoAttack(e, opt), e); }
  return e;
}

// ぷに：画面に入ってから時々、自機狙いの針を1発（予告30f付き）
function* puniShot(e) {
  yield* sched.waitUntil(() => e.x < CFG.W - 40);
  yield* sched.wait(20 + ((gameRng.rnd() * 80) | 0));
  if (e.x < state.player.x + 160) return;   // 背後から撃たない
  yield* sched.charge(e);
  needle(e, 2.8, COL.PINK);
}

// もこ：定位置に滞留している間、8wayリング（シアン）とでか玉
function* mokoAttack(e, opt) {
  yield* sched.waitUntil(() => e.phaseN === 1);
  yield* sched.wait(20);
  yield* sched.charge(e);
  ring(e, 8, 1.9, COL.CYAN);
  if (e.orbPending) {
    yield* sched.wait(50);
    e.orbPending = false;
    bigOrb(e.x - 30, e.y, { frag: e.frag });
  }
  yield* sched.wait(60);
  yield* sched.charge(e);
  ring(e, 8, 1.9, COL.CYAN);
}

export function moveEnemies() {
  for (const e of state.enemies) {
    e.t++;
    switch (e.move) {
      case 'straight':
        e.x += e.vx;
        break;
      case 'wave':
        e.x += e.vx;
        e.y = e.y0 + Math.sin(e.phase + e.t * e.freq) * e.amp;
        break;
      case 'converge': {
        // 挟み：上下の端から中央に寄りながら左へ
        e.x += e.vx;
        const u = Math.min(1, Math.max(0, (CFG.W + 30 - e.x) / 620));
        e.y = e.y0 + (e.ty - e.y0) * u * u * (3 - 2 * u);
        break;
      }
      case 'uturn':
        // 左端まで行って高さを変え、直線で戻る（弾は撃たない。軌道は読める）
        if (e.phaseN === 0) { e.x += e.vx; if (e.x <= 70) e.phaseN = 1; }
        else if (e.phaseN === 1) {
          const d = e.y0 + e.dy - e.y;
          e.y += Math.sign(d) * Math.min(Math.abs(d), 3);
          if (Math.abs(d) < 0.5) e.phaseN = 2;
        } else e.x += -e.vx;
        break;
      case 'moko': {
        const M = CFG.enemy.moko;
        if (e.phaseN === 0) {                  // 進入：減速しながら定位置へ
          e.x += Math.max(-4, Math.min(-0.6, (M.stopX - e.x) * 0.05));
          if (e.x <= M.stopX + 1) { e.phaseN = 1; e.stayT = M.stay; }
        } else if (e.phaseN === 1) {           // 滞留
          e.y = e.y0 + Math.sin(e.t * 0.05) * 10;
          if (--e.stayT <= 0) e.phaseN = 2;
        } else e.x += Math.min(3, (e.x - M.stopX) * 0.05 + 0.5);   // 右へ退出
        break;
      }
      case 'guni': {
        // 揃わない。揺れ方も速さもばらばら、ときどき止まる（兄弟の編隊と正反対）
        const w = e.wob;
        const stopped = e.t % 200 > w.stopAt && e.t % 200 < w.stopAt + 30;
        if (!stopped) e.x += e.vx * (0.7 + 0.5 * Math.sin(e.t * 0.05 + w.p));
        e.y = e.y0 + Math.sin(e.t * w.f1 + w.p) * w.a1 + Math.sin(e.t * w.f2) * w.a2;
        w.rot = Math.sin(e.t * 0.09 + w.p) * 0.4;
        break;
      }
      case 'launch':
        // 子機：母船の口元から扇状に飛び出し、勢いが落ちたらまっすぐ左へ
        e.x += e.vx; e.y += e.vy;
        e.vy *= 0.96;
        e.vx += (-CFG.enemy.chibi.speed - e.vx) * 0.05;
        if (e.y < 30 || e.y > CFG.H - 30) e.vy = -e.vy;
        break;
      case 'byun':
        // 高速で左へ。上下の壁で反射。進行方向に回す
        e.x += e.vx; e.y += e.vy;
        if (e.y < 30 && e.vy < 0) e.vy = -e.vy;
        if (e.y > CFG.H - 30 && e.vy > 0) e.vy = -e.vy;
        e.ang = Math.atan2(e.vy, e.vx);
        break;
    }
    if (e.hitFlash) e.hitFlash--;
    // 画面外に出たら消える（撃ち漏らしの代償は点だけ。原則6）
    // 右へ去るのは Uターンの帰りと もこの退出だけ（入ってくる途中の個体を消さない）
    const leavingRight = (e.move === 'uturn' || e.move === 'moko') && e.phaseN === 2;
    if (e.x < -e.r - 30 || (leavingRight && e.x > CFG.W + e.r + 30)) {
      e.alive = false;
      if (state.seg) state.seg.escaped++;
    }
  }
}

export function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.hitFlash = 4;
  state.score += CFG.score.hit;
  if (e.hp <= 0 && e.alive) killEnemy(e);
}

function killEnemy(e) {
  e.alive = false;
  const E = CFG.enemy[e.type];
  state.score += E.score;
  const big = e.type === 'moko';
  const cols = ['#fff', '#FF9E3D', '#FFD54F', '#FF5C8A'];
  for (let i = 0; i < (big ? 40 : 18); i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 1.5 + fxRng.rnd() * (big ? 6 : 4);
    spawnParticle(e.x, e.y, Math.cos(a) * s - 1, Math.sin(a) * s, 18 + fxRng.rnd() * 18, fxRng.pick(cols), 3 + fxRng.rnd() * 3);
  }
  if (big) state.shake = Math.max(state.shake, 6);
  if (e.carry) spawnItem(e.carry, e.x, e.y, 1.5, 0);
  // もこが玉を吐く前に倒されたら、抱えていた玉を落とす（断片を取りこぼさないように）
  if (e.orbPending) bigOrb(e.x - 10, e.y, { frag: e.frag });
}
