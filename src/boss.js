// ボス：部位2つ（上下のコア）+ 3形態（設計書 6章 / 技術設計書 3・5章）
// 部位は本体からのオフセットで持つ。「壊すと攻撃が止まる」は部位のコルーチンが止まるだけで実現する
import { CFG, COL } from './config.js';
import { state, popup, flash, spawnParticle } from './world.js';
import * as sched from './sched.js';
import { needle, fan, bigOrb, laserWarn, hLaser, phrase } from './bullets.js';
import { spawnItem } from './items.js';
import { fxRng, gameRng } from './rng.js';
import { BOSS_TEXT as T } from './text.js';
import { afterBoss } from './story.js';

const B = () => CFG.boss;

function makeBoss(form, cores) {
  const hpMax = B().body * state.diff.hp;
  const th = B().formThresholds.map(t => t * state.diff.hp);
  const hp = form === 1 ? hpMax : th[form - 2];
  const coreHp = B().core * state.diff.hp;
  const b = {
    x: CFG.W + 200, y: CFG.H / 2, r: B().bodyR, hp, maxhp: hpMax, th, form,
    alive: true, hitFlash: 0, glow: 0, id: -1,
    weakenRate: 1.0, formT: 0, t: 0, entering: true, trans: 0, dying: 0,
    body: null,   // 本体の攻撃コルーチンの持ち主（形態が変わるたびに作り直す）
    parts: [-1, 1].map((s, i) => ({
      id: -2 - i, dx: -10, dy: s * B().coreOffsetY, r: B().coreR,
      hp: cores ? cores[i].hp : coreHp, maxhp: coreHp, dead: cores ? cores[i].dead : false,
      x: 0, y: 0, glow: 0, hitFlash: 0, which: i === 0 ? 'upper' : 'lower',
    })),
  };
  return b;
}

function syncParts(b) {
  for (const p of b.parts) { p.x = b.x + p.dx; p.y = b.y + p.dy; }
}

// ---- 部位の攻撃 ----
function* upperCore(p) {
  // はり弾 狙い×2（ピンク）／120f
  yield* sched.wait(40);
  while (true) {
    yield* sched.charge(p);
    needle(p, 2.8, COL.PINK, -0.1);
    needle(p, 2.8, COL.PINK, 0.1);
    yield* sched.wait(90);
  }
}
function* lowerCore(p) {
  // 4way扇（シアン）／120f、上と60fずらす
  yield* sched.wait(100);
  while (true) {
    yield* sched.charge(p);
    fan(p, 4, 'aim', 1.2, 2.0, COL.CYAN);
    yield* sched.wait(90);
  }
}

// ---- 本体の攻撃（形態ごと） ----
// 声：言葉のかたまりを波に乗せて流す。1本目は自機の高さ、2本目以降は間を空けて上下どちらかに
// （上下に逃げ道を残す。原則5）
function* voiceLoop(b, count, period, col, max) {
  yield* sched.wait(60);
  const list = T.voice[b.form];
  let idx = 0;
  while (true) {
    yield* sched.charge(b);
    const py = state.player.y;
    const ys = [py];
    for (let i = 1; i < count; i++) {
      const up = py > CFG.H / 2 ? -1 : 1;
      ys.push(py + up * (150 + i * 40) * (gameRng.rnd() < 0.2 ? -1 : 1));
    }
    ys.forEach((y, i) => {
      const yc = Math.max(60, Math.min(CFG.H - 60, y));
      phrase(b, list[idx % list.length], { y: yc, col, ph: gameRng.rnd() * 6, max });
      idx++;
    });
    yield* sched.wait(period - CFG.warn.shot);
  }
}
function* laserLoop(b, count, period) {
  yield* sched.wait(60);
  while (true) {
    const c = count === 2 && b.weakenRate >= 1.6 ? 1 : count;   // 45秒続いたら1本に
    yield* laserWarn(b, c);
    // ボムで予告線が消されたら、そのビームは撃たない（予告なしのビームを出さない。原則3）
    if (!b.pendingLaser) { yield* sched.wait(period - CFG.laser.warn); continue; }
    const list = T.beam[b.form];
    hLaser(b, list[(b.beamIdx = (b.beamIdx ?? -1) + 1) % list.length]);
    yield* sched.wait(period - CFG.laser.warn);
  }
}
function* orbLoop(b, count, period) {
  yield* sched.wait(120);
  while (true) {
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : (i / (count - 1) - 0.5) * 0.7;
      bigOrb(b.x - 60, b.y, { boss: true, slow: true, angle: a });
    }
    yield* sched.wait(period);
  }
}
function* needleLoop(b, period) {
  yield* sched.wait(30);
  while (true) {
    yield* sched.charge(b, 20);
    needle(b, 3.2, COL.PINK);
    yield* sched.wait(period - 20);
  }
}

function startForm(b) {
  if (b.body) b.body.alive = false;
  b.body = { alive: true };
  const o = b.body;
  state.segCap = B().cap[b.form - 1];
  if (b.form === 1) sched.add(voiceLoop(b, 1, 170, COL.VIOLET, 2), o);
  if (b.form === 2) {
    sched.add(voiceLoop(b, 2, 170, COL.CYAN, 3), o);
    sched.add(laserLoop(b, 1, 240), o);
    sched.add(orbLoop(b, 2, 300), o);
  }
  if (b.form === 3) {
    sched.add(voiceLoop(b, 2, 150, COL.CYAN, 4), o);
    sched.add(needleLoop(b, 60), o);
    sched.add(laserLoop(b, 2, 260), o);
    sched.add(orbLoop(b, 3, 280), o);
  }
  // チェックポイント：この形態の頭から再開できる
  state.checkpoint = {
    ...state.checkpoint, boss: true, form: b.form, lv: { ...state.player.lv },
    cores: b.parts.map(p => ({ hp: p.hp, dead: p.dead })),
  };
}

// ---- ボス戦の流れ（stage から yield* で呼ぶ） ----
export function* bossFight(form = 1, cores = null) {
  state.segCap = B().cap[form - 1];
  // 警告 → 右から大きくスライドイン
  state.bossWarn = 100;
  yield* sched.wait(100);
  const b = makeBoss(form, cores);
  state.boss = b;
  state.bossT0 = state.frame;
  syncParts(b);
  while (b.x > B().x + 0.5) { b.x += (B().x - b.x) * 0.05 - 0.3; syncParts(b); yield; }
  b.x = B().x; b.entering = false;
  // 部位は生きている間だけ攻撃する（dead になったらスケジューラが破棄する）
  if (!b.parts[0].dead) sched.add(upperCore(b.parts[0]), b.parts[0]);
  if (!b.parts[1].dead) sched.add(lowerCore(b.parts[1]), b.parts[1]);
  startForm(b);
  yield* sched.waitUntil(() => b.dying > 0);
  yield* afterBoss(b);
}

export function moveBoss() {
  if (state.bossWarn > 0) state.bossWarn--;   // ボスが出る前から減らす
  const b = state.boss;
  if (!b) return;
  b.t++;
  if (b.hitFlash) b.hitFlash--;
  for (const p of b.parts) if (p.hitFlash) p.hitFlash--;
  if (b.dying) { dyingStep(b); return; }
  if (!b.entering) b.y = CFG.H / 2 + Math.sin(b.t * 0.012) * 50;
  syncParts(b);
  if (b.trans > 0) b.trans--;
  // 形態3が長引くと弱くなる（粘れば必ず倒せる）
  if (b.form === 3 && !b.entering) {
    b.formT++;
    let rate = 1;
    for (const [f, r] of B().weaken) if (b.formT >= f) rate = r;
    b.weakenRate = rate;
  }
}

// 自弾が当たる対象かどうか（部位 → 本体の順で判定される）
export const bossTargetable = () => state.boss && !state.boss.entering && !state.boss.dying && state.boss.trans === 0;

export function damagePart(p, dmg) {
  if (p.dead) return;
  p.hp -= dmg; p.hitFlash = 3;
  state.score += CFG.score.hit;
  if (p.hp <= 0) {
    p.dead = true;
    state.score += B().coreScore;
    boom(p.x, p.y, 50, 8);
    state.shake = 16;
    popup('コア ブレイク！', p.x - 60, p.y, { size: 30, col: '#FFD54F', life: 70 });
  }
}

export function damageBoss(dmg) {
  const b = state.boss;
  b.hp -= dmg; b.hitFlash = 3;
  state.score += CFG.score.hit;
  if (b.form < 3 && b.hp <= b.th[b.form - 1]) nextForm(b);
  else if (b.hp <= 0) startDying(b);
}

function clearDanger() {
  for (const x of state.eBullets) x.alive = false;
  for (const q of state.phrases) q.alive = false;
  for (const w of state.laserWarns) w.alive = false;
  if (state.boss) state.boss.pendingLaser = null;
}

function nextForm(b) {
  b.hp = b.th[b.form - 1];
  b.form++;
  b.formT = 0; b.weakenRate = 1;
  b.trans = 90;                           // のけぞっている間は撃たない・撃たれない
  if (b.body) b.body.alive = false;
  clearDanger();
  state.score += B().formBonus;
  flash('#fff', 16);
  state.shake = 12;
  confetti(b.x, b.y);
  popup('形態 ' + b.form, CFG.W / 2, CFG.H / 2 - 20, { big: true, size: 48, col: '#fff', life: 80 });
  popup('+' + B().formBonus, CFG.W / 2, CFG.H / 2 + 34, { big: true, size: 24, col: '#FFD54F', life: 80 });
  // パワー2個 + ボム1個（低い方の系統を優先して立て直しやすく）
  const lv = state.player.lv;
  const first = lv.pow < lv.way ? 'pow' : 'way';
  spawnItem(first, b.x - 80, b.y - 30, -2.5, -1);
  spawnItem(first === 'pow' ? 'way' : 'pow', b.x - 80, b.y + 30, -2.5, 1);
  spawnItem('bomb', b.x - 90, b.y, -3, 0);
  // のけぞりが終わってから次の形態の攻撃を始める
  sched.add((function* () { yield* sched.wait(90); startForm(b); })(), b);
}

// 倒しても派手にしない。攻撃が止まり、動きが止まる（物語）
function startDying(b) {
  b.hp = 0;
  b.dying = 1;
  b.weakenRate = 1;
  if (b.body) b.body.alive = false;
  for (const p of b.parts) p.dead = true;
  clearDanger();
  const sec = (state.frame - state.bossT0) / 60;
  const T = B().timeBonus;
  const tb = Math.max(0, T.full - Math.max(0, Math.floor(sec - T.within)) * T.perSec);
  state.score += B().killScore + tb;
  state.bossResult = { sec, timeBonus: tb };
}

// 撃破後は動かない。灯を消していくのは story.js の afterBoss
function dyingStep(b) {
  b.dying++;
}

function boom(x, y, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 1 + fxRng.rnd() * sp;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 20 + fxRng.rnd() * 30,
      fxRng.pick(['#fff', '#FFD54F', '#FF9E3D', '#FF5C8A']), 3 + fxRng.rnd() * 5);
  }
}

function confetti(x, y) {
  for (let i = 0; i < 60; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 2 + fxRng.rnd() * 6;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - 2, 40 + fxRng.rnd() * 40,
      fxRng.pick([COL.CYAN, COL.VIOLET, COL.PINK, COL.YELLOW, '#5BD66B']), 4 + fxRng.rnd() * 3);
  }
}

// F4：次の形態へ
export function skipForm() {
  const b = state.boss;
  if (!b || b.entering || b.dying) return;
  if (b.form < 3) damageBoss(b.hp - b.th[b.form - 1] + 1);
  else damageBoss(b.hp + 1);
}

// ボムは本体・部位にも効く
export function bombBoss(dmg) {
  if (!bossTargetable()) return;
  for (const p of state.boss.parts) damagePart(p, dmg);
  damageBoss(dmg);
}

