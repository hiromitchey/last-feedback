// 自機：移動・ショット・グレード・被弾
import { CFG } from './config.js';
import { state, popup, flash, spawnParticle, nextId } from './world.js';
import { input, held, BTN } from './input.js';
import { scatter } from './items.js';
import { fxRng } from './rng.js';
import { damageEnemy } from './enemies.js';
import { breakOrb } from './collide.js';
import { bombBoss } from './boss.js';
import { midTargetable, damageMid } from './midboss.js';
import { playSfx } from './sfx.js';

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
  const want = !state.quiet && (state.autoShot || held(BTN.SHOT));   // 撃破後は黙る
  const EN = CFG.energy;
  if (EN.enabled) {
    // 切れたら lock フレームのあいだ撃てない。その間にゲージが満タンまで戻る
    if (p.empty) {
      p.energy = Math.min(EN.max, p.energy + EN.max / EN.lock);
      if (--p.lockT <= 0) { p.empty = false; p.energy = EN.max; }
      return;
    }
    // 撃っていない間だけ回復
    if (want) p.idle = 0; else p.idle++;
    if (p.idle > EN.regenDelay) p.energy = Math.min(EN.max, p.energy + EN.regen);
  }
  if (!want || p.shotCd > 0) return;
  p.shotCd = CFG.player.shotInterval;
  playSfx('shot');
  if (EN.enabled) {
    p.energy -= EN.cost[p.lv.way];
    if (p.energy <= 0) {
      p.energy = 0; p.empty = true; p.lockT = EN.lock;
      popup('エネルギー切れ！', p.x, p.y - 34, { size: 18, col: '#FF9E3D', life: 40 });
    }
  }
  const S = CFG.shot;
  const ways = S.ways[p.lv.way];
  const dmg = S.baseDmg[p.lv.way] * S.powMul[p.lv.pow];
  const pierce = p.lv.pow >= S.pierceAt;
  const sp = CFG.player.shotSpeed;
  for (let i = 0; i < ways; i++) {
    const a = (i - (ways - 1) / 2) * S.spread;   // 隣り合う弾の角度差が spread
    state.pBullets.push({
      x: p.x + 22, y: p.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: a,
      dmg, pierce, hitIds: pierce ? new Set() : null,
      alive: true, id: nextId(),
    });
  }
}

const MAX_LV = 3;
export const LV_NAME = { way: 'ワイド', pow: 'パワー' };
export const LV_COL = { way: '#3FA7F5', pow: '#F0503C' };

// kind: 'way' | 'pow'
export function gainLevel(kind) {
  const p = state.player;
  if (p.lv[kind] >= MAX_LV) {
    state.score += CFG.score.overPower;
    popup('+' + CFG.score.overPower, p.x, p.y - 24, { col: '#FFD54F', size: 16, life: 30 });
    return;
  }
  p.stock[kind]++;
  if (p.stock[kind] >= CFG.lvCost[p.lv[kind]]) {
    p.stock[kind] = 0;
    p.lv[kind]++;
    levelUpFx(p, kind);
  }
}

function levelUpFx(p, kind) {
  playSfx('level');
  const col = LV_COL[kind];
  flash(col, 14);
  p.gradeFx = 40; p.gradeFxCol = col;
  popup(LV_NAME[kind] + 'アップ！', CFG.W / 2, CFG.H / 2 - 20, { big: true, size: 54, col, life: 70 });
  const sub = kind === 'way'
    ? CFG.shot.ways[p.lv.way] + 'way'
    : '×' + CFG.shot.powMul[p.lv.pow].toFixed(1) + (p.lv.pow >= CFG.shot.pierceAt ? '  貫通！' : '');
  popup(sub, CFG.W / 2, CFG.H / 2 + 38, { big: true, size: 30, col: '#fff', life: 70 });
}

// ボム：敵弾とレーザーを消し、でか玉を割り、画面の敵とボスにダメージ。しばらく無敵
export function fireBomb(auto = false) {
  const p = state.player;
  if (p.bombs <= 0) return false;
  p.bombs--;
  playSfx('bomb');
  const BM = CFG.bomb;
  p.invincible = Math.max(p.invincible, BM.invincible);
  for (const b of state.eBullets) { if (b.hp && b.alive) breakOrb(b); else b.alive = false; }
  for (const q of state.phrases) q.alive = false;
  for (const w of state.laserWarns) w.alive = false;
  for (const w of state.colWarns) w.alive = false;
  if (state.boss) state.boss.pendingLaser = null;
  for (const e of state.enemies) if (e.alive && e.x < CFG.W + 10) damageEnemy(e, BM.enemyDmg);
  bombBoss(BM.bossDmg);
  if (midTargetable()) damageMid(BM.bossDmg);
  flash('#fff', 20);
  state.shake = 10;
  state.bombFx = 40;
  popup(auto ? 'オートボム！' : 'ボム！', p.x, p.y - 40, { size: 26, col: '#FF9E3D', life: 50 });
  return true;
}

export function damagePlayer() {
  const p = state.player;
  if (p.invincible > 0 || state.debugInvincible) return;
  // オートボム：被弾を確定させる前にボムを見る（確定してから取り消すと演出が二重に走る）
  if (state.autoBomb && fireBomb(true)) return;
  playSfx('damage');
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
  // 段階の高い方が1段下がる（同じならワイド）。その種類を少しだけ落とす
  const kind = p.lv.pow > p.lv.way ? 'pow' : 'way';
  if (p.lv[kind] > 0) p.lv[kind]--;
  p.stock.way = 0; p.stock.pow = 0;
  // 前（右）へ散らす。左へ流れて戻ってくるので無敵中に拾える
  scatter(kind, CFG.scatterOnHit, p.x + 20, p.y, 2.0, 4.5, 0);
  // 残機が尽きたら CONTINUE?（回数制限なし。物語を最後まで見せる）
  if (p.lives < 0) { p.lives = 0; state.mode = 'continue'; state.contT = CFG.continueCount * 60; }
}
