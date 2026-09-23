// アイテム（パワー・かけら・ボム）
import { CFG } from './config.js';
import { state } from './world.js';

// kind: 'power' | 'kakera' | 'bomb'
export function spawnItem(kind, x, y, vx = 0, vy = 0) {
  state.items.push({ kind, x, y, vx, vy, t: 0, alive: true });
}

// 扇状に散らす（画面の流れに乗せて左向き）
export function scatter(kind, n, x, y, spread = 1.4, speed = 3, dir = Math.PI) {
  for (let i = 0; i < n; i++) {
    const a = dir + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
    spawnItem(kind, x, y, Math.cos(a) * speed, Math.sin(a) * speed);
  }
}

export function moveItems() {
  const I = CFG.item;
  for (const it of state.items) {
    it.t++;
    // 散った勢いが落ちたら、画面の流れに乗ってゆっくり左へ
    it.vx += (-I.drift - it.vx) * 0.04;
    it.vy *= 0.94;
    it.x += it.vx; it.y += it.vy;
    if (it.y < 16) { it.y = 16; it.vy = Math.abs(it.vy); }
    if (it.y > CFG.H - 16) { it.y = CFG.H - 16; it.vy = -Math.abs(it.vy); }
    if (it.x < -20 || it.t > I.life) it.alive = false;
  }
}
