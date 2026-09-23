// コルーチンスケジューラ（技術設計書 5章）
import { CFG } from './config.js';
import { state } from './world.js';

const tasks = [];   // { gen, owner }

export function add(gen, owner = null) { tasks.push({ gen, owner }); }

export function step() {
  // 追加されたタスクは次のフレームから回す（途中で push されても長さを先に固定）
  const n = tasks.length;
  for (let i = 0; i < n; i++) {
    const t = tasks[i];
    if (!t || t.done) continue;
    // 持ち主が死んだらコルーチンごと破棄（部位破壊で攻撃が止まるのはこれ）
    if (t.owner && (t.owner.dead || t.owner.alive === false)) { t.done = true; continue; }
    if (t.gen.next().done) t.done = true;
  }
  let w = 0;
  for (let i = 0; i < tasks.length; i++) if (!tasks[i].done) tasks[w++] = tasks[i];
  tasks.length = w;
}

export function clear() { tasks.length = 0; }
export const count = () => tasks.length;

// ---- 時間のプリミティブ ----
export function* wait(f) {
  const n = Math.round(f * (state.boss ? state.boss.weakenRate : 1));
  for (let i = 0; i < n; i++) yield;
}

export function* charge(owner, f = CFG.warn.shot) {
  owner.glow = f;
  for (let i = 0; i < f; i++) { owner.glow = f - i; yield; }
  owner.glow = 0;
}

export function* waitUntil(fn) { while (!fn()) yield; }

export function* waitCleared(minFrames) {
  yield* wait(minFrames);
  yield* waitUntil(() => state.enemies.length === 0 && state.warnings.length === 0);
}
