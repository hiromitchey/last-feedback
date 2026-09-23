// デバッグ機能（技術設計書 10章）。いまは F1 / F2 / F3 / F7 のみ。F4〜F6・F8 は Step 10
import { CFG } from './config.js';
import { state, particleCount } from './world.js';
import { bulletWeight } from './bullets.js';
import * as sched from './sched.js';
import { checks } from './collide.js';
import { drawStats } from './render.js';
import { popup } from './world.js';

export const dbg = { hitbox: false, stats: false, stepMs: 0, renderMs: 0, fps: 60 };

export function handleKey(code) {
  if (code === 'F1') dbg.hitbox = !dbg.hitbox;
  if (code === 'F2') {
    state.debugInvincible = !state.debugInvincible;
    popup('無敵 ' + (state.debugInvincible ? 'ON' : 'OFF'), CFG.W / 2, 80, { size: 18, life: 50 });
  }
  if (code === 'F3' && state.player) {
    const p = state.player;
    p.grade = (p.grade + 1) % CFG.grade.length; p.power = 0;
    popup('G' + (p.grade + 1), CFG.W / 2, 80, { size: 18, life: 50 });
  }
  if (code === 'F7') dbg.stats = !dbg.stats;
}

let fpsN = 0, fpsLast = performance.now();
export function tickFps(now) {
  fpsN++;
  if (now - fpsLast >= 500) { dbg.fps = fpsN * 1000 / (now - fpsLast); fpsN = 0; fpsLast = now; }
}

export function drawDebug() {
  if (!dbg.stats) return;
  drawStats([
    `fps ${dbg.fps.toFixed(1)}   step ${dbg.stepMs.toFixed(2)}ms   render ${dbg.renderMs.toFixed(2)}ms`,
    `bullets ${bulletWeight()}/${CFG.bullet.cap}   enemies ${state.enemies.length}   particles ${particleCount()}/512`,
    `collide ${checks} checks   sched ${sched.count()} tasks   pShots ${state.pBullets.length}`,
  ]);
}
