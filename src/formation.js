// 編隊。出現予告24fをここで必ず出す（原則3）
// M2 では 連なり / 波 / 階段 / 玉 のみ。残り（挟み・追い越し・玉吐き・Uターン・玉の雨）と道中2区間は Step 11
import { CFG } from './config.js';
import { state } from './world.js';
import * as sched from './sched.js';
import { spawnEnemy } from './enemies.js';
import { bigOrb } from './bullets.js';

function warn(ys) {
  for (const y of ys) state.warnings.push({ y, t: CFG.warn.spawn, alive: true });
}

export function moveWarnings() {
  for (const w of state.warnings) if (--w.t <= 0) w.alive = false;
}

const X0 = CFG.W + 30;   // 画面右端の外

export function* formation(kind, n, opt = {}) {
  const group = { total: n, killed: 0, escaped: 0, dropPower: opt.dropPower ?? true };
  const shoot = opt.shoot ?? false;

  if (kind === '連なり') {
    // 同じ高さで一列。G4の貫通で一掃できる見せ場
    const y = opt.y ?? 270;
    warn([y]);
    yield* sched.wait(CFG.warn.spawn);
    for (let i = 0; i < n; i++) spawnEnemy('puni', X0 + i * 56, y, { group, shoot: shoot && i === 0 });
  } else if (kind === '波') {
    // 上下にうねりながら左へ。全員が完全に同期する（物語：命令通りの個体）
    const y0 = opt.y0 ?? 270, amp = opt.amp ?? 110;
    warn([y0]);
    yield* sched.wait(CFG.warn.spawn);
    for (let i = 0; i < n; i++) {
      spawnEnemy('puni', X0 + i * 64, y0, { group, move: 'wave', amp, freq: 0.045, phase: -i * 0.6, shoot: shoot && i % 3 === 0 });
    }
  } else if (kind === '階段') {
    // 斜めにずれて並ぶ
    const y0 = opt.y0 ?? 120, dy = opt.dy ?? 70;
    const ys = Array.from({ length: n }, (_, i) => y0 + i * dy);
    warn(ys);
    yield* sched.wait(CFG.warn.spawn);
    ys.forEach((y, i) => spawnEnemy('puni', X0 + i * 48, y, { group, shoot: shoot && i === n - 1 }));
  } else if (kind === '玉') {
    // でか玉（高さ違い・時間差）
    const ys = opt.ys ?? [270];
    for (let i = 0; i < ys.length; i++) {
      warn([ys[i]]);
      yield* sched.wait(CFG.warn.spawn);
      bigOrb(X0, ys[i], { slow: opt.slow });
      if (i < ys.length - 1) yield* sched.wait(opt.gap ?? 50);
    }
  }
}

// M2 の確認用ループ。道中2区間（Step 11）に置き換わる
export function* demoStage() {
  yield* sched.wait(60);
  let lap = 0;
  while (true) {
    const shoot = lap > 0;
    yield* formation('連なり', 5, { y: 200, shoot });
    yield* sched.waitCleared(60);
    yield* formation('玉', 1, { ys: [300], slow: true });      // 初対面は1個だけ、ゆっくり
    yield* sched.wait(150);
    yield* formation('波', 6, { y0: 270, amp: 120, shoot });
    yield* sched.waitCleared(60);
    yield* formation('階段', 5, { y0: 110, dy: 75, shoot });
    yield* sched.waitCleared(40);
    yield* formation('玉', 2, { ys: [150, 400] });
    yield* sched.wait(120);
    yield* formation('連なり', 5, { y: 380, shoot });
    yield* sched.wait(40);
    yield* formation('連なり', 5, { y: 140, shoot });
    yield* sched.waitCleared(90);
    lap++;
  }
}
