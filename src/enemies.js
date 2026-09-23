// 敵の挙動。M2 では ぷに のみ（もこ・びゅん は Step 11）
import { CFG, COL } from './config.js';
import { state, nextId, spawnParticle, popup } from './world.js';
import * as sched from './sched.js';
import { needle } from './bullets.js';
import { spawnItem } from './items.js';
import { gameRng, fxRng } from './rng.js';

// opt: { move: 'straight' | 'wave', vx, amp, freq, phase, shoot, group }
export function spawnEnemy(type, x, y, opt = {}) {
  const E = CFG.enemy[type];
  const e = {
    id: nextId(), type, x, y, y0: y, t: 0,
    vx: opt.vx ?? -E.speed, vy: 0,
    hp: E.hp * state.diff.hp, maxhp: E.hp * state.diff.hp, r: E.r,
    alive: true, hitFlash: 0, glow: 0,
    move: opt.move ?? 'straight', amp: opt.amp ?? 0, freq: opt.freq ?? 0.04, phase: opt.phase ?? 0,
    group: opt.group ?? null,
  };
  state.enemies.push(e);
  if (opt.shoot) sched.add(puniShot(e), e);
  return e;
}

// ぷに：画面に入ってから時々、自機狙いの針を1発（予告30f付き）
function* puniShot(e) {
  yield* sched.waitUntil(() => e.x < CFG.W - 40);
  yield* sched.wait(20 + ((gameRng.rnd() * 80) | 0));
  // 自機より十分右にいるときだけ撃つ（背後から撃たない）
  if (e.x < state.player.x + 160) return;
  yield* sched.charge(e);
  needle(e, 2.8, COL.PINK);
}

export function moveEnemies() {
  for (const e of state.enemies) {
    e.t++;
    e.x += e.vx;
    if (e.move === 'wave') e.y = e.y0 + Math.sin(e.phase + e.t * e.freq) * e.amp;
    if (e.hitFlash) e.hitFlash--;
    // 画面左端に到達したらそのまま消える（撃ち漏らしの代償は点だけ。原則6）
    if (e.x < -e.r - 30) {
      e.alive = false;
      if (e.group) e.group.escaped++;
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
  const cols = ['#fff', '#FF9E3D', '#FFD54F', '#FF5C8A'];
  for (let i = 0; i < 18; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 1.5 + fxRng.rnd() * 4;
    spawnParticle(e.x, e.y, Math.cos(a) * s - 1, Math.sin(a) * s, 18 + fxRng.rnd() * 18, fxRng.pick(cols), 3 + fxRng.rnd() * 3);
  }
  popup(fxRng.pick(['ポン！', 'ポン！', 'パン！']), e.x, e.y - 10, { size: 20, col: '#fff', life: 30 });
  // 編隊を全滅させたら、最後の1体がパワーを落とす（M2の仮ルール。PLAN.md）
  const g = e.group;
  if (g) {
    g.killed++;
    if (g.killed === g.total && g.escaped === 0 && g.dropPower) spawnItem('power', e.x, e.y, 1.5, 0);
  }
}
