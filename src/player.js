// 自機：移動・ショット・グレード・被弾
import { CFG, GRADE_COL } from './config.js';
import { state, popup, flash, spawnParticle, nextId } from './world.js';
import { input, held, BTN } from './input.js';
import { scatter } from './items.js';
import { fxRng } from './rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function movePlayer() {
  const p = state.player;
  const P = CFG.player;
  const sp = held(BTN.SLOW) ? P.slowSpeed : P.speed;

  if (input.mode === 'pointer') {
    const dx = input.tx - p.x, dy = input.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.5) {                       // 速度上限。これが無いとマウスは瞬間移動する
      const s = Math.min(d, sp);
      p.x += dx / d * s;
      p.y += dy / d * s;
    }
  } else {
    let vx = input.dx, vy = input.dy;
    const m = Math.sqrt(vx * vx + vy * vy);
    if (m > 1) { vx /= m; vy /= m; }     // 斜めが速くならないよう正規化
    p.x += vx * sp;
    p.y += vy * sp;
  }
  p.x = clamp(p.x, P.xMin, P.xMax);
  p.y = clamp(p.y, P.yMin, P.yMax);

  if (p.invincible > 0) p.invincible--;
  if (p.gradeFx > 0) p.gradeFx--;
}

export function shoot() {
  const p = state.player;
  if (p.shotCd > 0) { p.shotCd--; }
  // 既定は手動（押している間だけ）。オートショットは設定の逃げ道（技術設計書 6章）
  const want = state.autoShot || held(BTN.SHOT);
  if (!want || p.shotCd > 0) return;
  p.shotCd = CFG.player.shotInterval;
  const g = CFG.grade[p.grade];
  const sp = CFG.player.shotSpeed;
  for (let i = 0; i < g.ways; i++) {
    const a = (i - (g.ways - 1) / 2) * g.spread;   // 隣り合う弾の角度差が spread
    state.pBullets.push({
      x: p.x + 22, y: p.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: a,
      dmg: g.dmg, pierce: g.pierce, hitIds: g.pierce ? new Set() : null,
      alive: true, id: nextId(),
    });
  }
}

export function gainPower() {
  const p = state.player;
  if (p.grade >= CFG.grade.length - 1) {
    state.score += CFG.score.overPower;
    popup('+' + CFG.score.overPower, p.x, p.y - 24, { col: '#FFD54F', size: 16, life: 30 });
    return;
  }
  p.power++;
  if (p.power >= CFG.gradeCost[p.grade]) {
    p.power = 0;
    p.grade++;
    gradeUpFx(p);
  }
}

function gradeUpFx(p) {
  const col = GRADE_COL[p.grade];
  flash(col, 14);
  p.gradeFx = 40;
  popup('グレードアップ！', CFG.W / 2, CFG.H / 2 - 20, { big: true, size: 54, col, life: 70 });
  popup('G' + (p.grade + 1) + (CFG.grade[p.grade].pierce ? '  貫通！' : ''), CFG.W / 2, CFG.H / 2 + 38,
    { big: true, size: 30, col: '#fff', life: 70 });
}

export function damagePlayer() {
  const p = state.player;
  if (p.invincible > 0 || state.debugInvincible) return;
  // オートボム（Step 14）はここ。被弾を確定させる前にボムを見る
  p.lives--;
  p.invincible = CFG.player.invincible;
  state.shake = 14;
  flash('#FF5C8A', 10);
  for (let i = 0; i < 40; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 1 + fxRng.rnd() * 6;
    spawnParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, 30 + fxRng.rnd() * 30,
      fxRng.pick(['#fff', '#FF5C8A', '#FFD54F']), 3 + fxRng.rnd() * 4);
  }
  // 敵弾全消去
  for (const b of state.eBullets) b.alive = false;
  // グレード −1。落ちたぶんはパワーをばら撒いて、無敵中に拾えば戻れるようにする
  if (p.grade > 0) p.grade--;
  p.power = 0;
  // 前（右）へ散らす。左へ流れて戻ってくるので無敵中に拾える
  scatter('power', CFG.scatterOnHit, p.x + 20, p.y, 2.0, 4.5, 0);
  popup('ドカーン！', p.x, p.y - 30, { col: '#FF5C8A', size: 28, life: 50 });
  if (p.lives < 0) { p.dead = true; state.mode = 'over'; state.overT = 0; }
}
