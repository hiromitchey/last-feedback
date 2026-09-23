// ボス：部位2つ（上下のコア）+ 3形態（設計書 6章 / 技術設計書 3・5章）
// 部位は本体からのオフセットで持つ。「壊すと攻撃が止まる」は部位のコルーチンが止まるだけで実現する
import { CFG, COL } from './config.js';
import { state, popup, flash, spawnParticle } from './world.js';
import * as sched from './sched.js';
import { needle, fan, bigOrb, laserWarn, hLaser, phrase, slam, column } from './bullets.js';
import { spawnItem } from './items.js';
import { spawnEnemy } from './enemies.js';
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

// 母船が自分を直している間は、コアも撃たない（止まって直す）
function* repairing() { yield* sched.waitUntil(() => !state.boss || state.boss.trans === 0); }

// ---- 部位の攻撃 ----
function* upperCore(p) {
  // はり弾 狙い×2（ピンク）／120f
  yield* sched.wait(40);
  while (true) {
    yield* repairing();
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
    yield* repairing();
    yield* sched.charge(p);
    fan(p, 4, 'aim', 1.2, 2.0, COL.CYAN);
    yield* sched.wait(90);
  }
}

// ---- 本体の攻撃（形態ごと） ----
// 声は「進行役」が1つずつ順番に出す（横に流すだけだと動画のコメントに見えるので、見せ方を混ぜる）
//   slam 叩きつけ → 崩れて弾 / fallN 縦書きがN本降る / riseN 下から上がる / flow 波打って流れる / fast 速い小さい文字
const VOICE_SEQ = {
  1: ['slam', 'flow', 'slam', 'fall1'],
  2: ['slam', 'fall1', 'fast', 'slam', 'rise1', 'flow'],
  3: ['slam', 'fall2', 'fast', 'slam', 'rise2', 'flow', 'slam', 'fall3'],
};
const nonBeam = () => state.phrases.filter(q => !q.beam);
const colsBusy = () => state.colWarns.length > 0 || state.phrases.some(q => q.kind === 'col');
const beamBusy = () => state.laserWarns.length > 0 || state.phrases.some(q => q.beam);

function* voiceDirector(b) {
  yield* sched.wait(60);
  const seq = VOICE_SEQ[b.form];
  const idx = { slam: 0, col: 0, flow: 0, fast: 0 };
  const pick = (list, k) => list[idx[k]++ % list.length];
  for (let i = 0; ; i++) {
    const p = seq[i % seq.length];
    const vertical = p.startsWith('fall') || p.startsWith('rise');
    // 縦の言葉と横の言葉は同時に出さない（重ねない）
    if (vertical) {
      yield* sched.waitUntil(() => nonBeam().length === 0 && !beamBusy() && !colsBusy());
      b.vertPending = true;                 // 縦書きを出すと決めた。ビームはこれが消えるまで待つ
    } else yield* sched.waitUntil(() => !colsBusy() && nonBeam().length <= 1);
    yield* sched.charge(b);
    if (p === 'slam') {
      const text = pick(T.slam[b.form], 'slam');
      const y = state.player.y > CFG.H / 2 ? 150 : CFG.H - 150;   // 自機のいない側に叩きつける
      slam(b, text, { x: 470, y, col: COL.VIOLET });
      order(b, text);
      yield* sched.wait(CFG.slam.stamp + CFG.slam.hold + 40);
    } else if (vertical) {
      const n = +p.slice(4), dir = p.startsWith('fall') ? 1 : -1;
      const px = Math.max(100, Math.min(620, state.player.x));
      const xs = [px];
      for (let k = 1; k < n; k++) xs.push(Math.max(80, Math.min(700, px + (k % 2 ? 190 : -190) * Math.ceil(k / 2))));
      for (const x of xs) {
        sched.add(column(b, pick(T.col[b.form], 'col'), { x, dir }), b.body);
        yield* sched.wait(14);
      }
      yield* sched.wait(80);
      b.vertPending = false;                // 縦書きが出きってから外す（ここから先は colsBusy() が見張る）
    } else if (p === 'flow') {
      const text = pick(T.voice[b.form], 'flow');
      phrase(b, text, { y: state.player.y, col: COL.CYAN, ph: gameRng.rnd() * 6, max: 8 });
      order(b, text);
      yield* sched.wait(90);
    } else if (p === 'fast') {
      for (let k = 0; k < 2; k++) {
        const y = Math.max(40, Math.min(CFG.H - 40, state.player.y + (k ? 110 : -110)));
        phrase(b, pick(T.fast[b.form], 'fast'), { y, col: COL.PINK, speed: CFG.phrase.fastSpeed, amp: 0,
          sizeMul: CFG.phrase.fastMul, max: 8 });
        yield* sched.wait(12);
      }
      yield* sched.wait(60);
    }
  }
}

// 「ハイジョセヨ」と叫んだら、命令に従う小さな兄弟機（子機）が口元から飛び出してくる
function order(b, text) {
  if (!/ハイジョ|ﾊｲｼﾞｮ/.test(text)) return;
  sched.add(minions(b), b.body);
}
function* minions(b) {
  yield* sched.wait(30);
  const C = CFG.enemy.chibi;
  const n = Math.min(C.count[b.form - 1], C.max - state.enemies.filter(e => e.type === 'chibi').length);
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / Math.max(1, n - 1) - 0.5) * 1.6;
    spawnEnemy('chibi', b.x - 80, b.y, { move: 'launch', vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5 });
    yield* sched.wait(4);
  }
}

function* laserLoop(b, count, period) {
  yield* sched.wait(60);
  while (true) {
    const c = count === 2 && b.weakenRate >= 1.6 ? 1 : count;   // 45秒続いたら1本に
    yield* sched.waitUntil(() => !colsBusy() && !b.vertPending);   // 縦書きの言葉とは重ねない
    yield* laserWarn(b, c);
    // ボムで予告線が消されたら、そのビームは撃たない（予告なしのビームを出さない。原則3）
    if (!b.pendingLaser || !b.pendingLaser.length) { b.pendingLaser = null; yield* sched.wait(period - CFG.laser.warn); continue; }
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
  // 声は進行役が1つずつ（叩きつけ・降る・上がる・流れる）
  sched.add(voiceDirector(b), o);
  if (b.form === 2) {
    sched.add(laserLoop(b, 1, 240), o);
    sched.add(orbLoop(b, 2, 300), o);
  }
  if (b.form === 3) {
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
  if (b.repair) repairStep(b);
  // 形態3が長引くと弱くなる（粘れば必ず倒せる）
  if (b.form === 3 && !b.entering) {
    b.formT++;
    let rate = 1;
    for (const [f, r] of B().weaken) if (b.formT >= f) rate = r;
    b.weakenRate = rate;
  }
}

function repairStep(b) {
  const R = b.repair;
  R.t++;
  let allLanded = true;
  for (const p of R.pieces) {
    if (p.landed) continue;
    allLanded = false;
    if (R.t < p.t0) continue;
    const tx = b.x + 20 + p.dx, ty = b.y + p.dy;
    p.x += (tx - p.x) * 0.14; p.y += (ty - p.y) * 0.14;
    if (Math.abs(tx - p.x) < 2 && Math.abs(ty - p.y) < 2) {
      p.landed = true;
      state.shake = Math.max(state.shake, 7);         // ガシャン
      boom(tx, ty, 10, 3);
    }
  }
  if (allLanded && b.drawForm !== b.form) { b.drawForm = b.form; flash('#fff', 6); }
  if (R.t >= REPAIR_LEN) b.repair = null;
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
  for (const e of state.enemies) if (e.type === 'chibi') e.alive = false;
  for (const q of state.phrases) q.alive = false;
  for (const w of state.laserWarns) w.alive = false;
  for (const w of state.colWarns) w.alive = false;
  if (state.boss) state.boss.pendingLaser = null;
}

// 形態変化＝目の前での自己修正（物語：母船は自分を直し続けて壊れた）
// 止まる → 「シュウセイ 13カイメ」 → 色の合わない板が1枚ずつ飛んできて留まる → 継ぎ接ぎの姿で再開
// 中ボス2（修理機）の記録「シュウセイ 12カイメ」の続きの数字
const REPAIR_PIECES = {
  2: [[20, -40, 46, 26, '#a0875e'], [60, 36, 40, 22, '#5c6b7a'], [-10, 88, 30, 20, '#8a6f9e'], [-40, -70, 26, 18, '#6d5c4a']],
  3: [[-20, -2, 54, 30, '#6d5c4a'], [40, -80, 36, 24, '#556070'], [-90, 20, 28, 34, '#7a6a55'], [70, 70, 30, 22, '#8a6f9e'], [0, 60, 34, 20, '#a0875e']],
};
const REPAIR_LEN = 190;

function nextForm(b) {
  b.hp = b.th[b.form - 1];
  b.drawForm = b.form;                    // 板が留まり終わるまでは前の姿
  b.form++;
  b.formT = 0; b.weakenRate = 1;
  b.trans = REPAIR_LEN;                   // 直している間は撃たない・撃たれない
  if (b.body) b.body.alive = false;
  clearDanger();
  state.score += B().formBonus;
  flash('#fff', 10);
  state.shake = 10;
  b.repair = {
    t: 0, label: 'シュウセイ ' + (11 + b.form) + 'カイメ',
    pieces: REPAIR_PIECES[b.form].map(([dx, dy, w, h, col], i) => ({
      dx, dy, w, h, col, t0: 40 + i * 24, x: CFG.W + 60, y: 60 + ((i * 137) % (CFG.H - 120)), landed: false,
    })),
  };
  popup('+' + B().formBonus, b.x - 60, b.y + 150, { size: 18, col: '#FFD54F', life: 60 });
  // パワー2個 + ボム1個（低い方の系統を優先して立て直しやすく）
  const lv = state.player.lv;
  const first = lv.pow < lv.way ? 'pow' : 'way';
  spawnItem(first, b.x - 80, b.y - 30, -2.5, -1);
  spawnItem(first === 'pow' ? 'way' : 'pow', b.x - 80, b.y + 30, -2.5, 1);
  spawnItem('bomb', b.x - 90, b.y, -3, 0);
  // 直し終わってから次の形態の攻撃を始める
  sched.add((function* () { yield* sched.wait(REPAIR_LEN); startForm(b); })(), b);
}

// 倒しても派手にしない。攻撃が止まり、動きが止まる（物語）
function startDying(b) {
  b.hp = 0;
  b.dying = 1;
  b.weakenRate = 1;
  b.repair = null; b.drawForm = b.form; b.trans = 0;   // 直している途中でも打ち切る
  b.glow = 0; for (const p of b.parts) p.glow = 0;      // 撃つ途中で倒れても予告を残さない
  if (b.body) b.body.alive = false;
  for (const p of b.parts) p.dead = true;
  clearDanger();
  const sec = (state.frame - state.bossT0) / 60;
  const T = B().timeBonus;
  const tb = Math.max(0, T.full - Math.max(0, Math.floor(sec - T.within)) * T.perSec);
  state.score += B().killScore + tb;
  state.bossResult = { sec, timeBonus: tb };
}

// ぶら下がる羽：ガクッと傾いて少し跳ね返り、そのあとゆらゆら揺れ続ける（落ちそうで落ちない）
export const HANG_ROT = 0.6;   // 外側（左）へ折れ曲がる
export function hangRot(t) {
  if (t < 18) return HANG_ROT * 0.3 * (t / 18);                       // ヒビで少し曲がる
  const u = t - 18;
  if (u < 40) return HANG_ROT * (1 - Math.exp(-u / 6) * Math.cos(u / 3)); // ガクッ → 跳ね返り
  return HANG_ROT + Math.sin(u * 0.05) * 0.05;                         // ゆらゆら
}

// 撃破後は動かない。灯を消していくのは story.js の afterBoss
function dyingStep(b) {
  b.dying++;
  if (b.beacon) b.beacon.t++;
  // 焼け残りがゆっくり左下へ漂う（惑星から離れ、最後の信号の道のりが見えるように）
  if (b.drift) { b.x += (650 - b.x) * 0.008; b.y += (CFG.H / 2 + 110 - b.y) * 0.008; }
  // 羽のヒビが伸びる
  for (const k in b.cracks || {}) if (b.cracks[k] < 30) b.cracks[k]++;
  // もげた羽：付け根で少し曲がる（ボキッ）→ ちぎれて、回転しながら落ちていく
  for (const [side, a] of Object.entries(b.arms || {})) {
    const sy = side === 'up' ? -1 : 1;
    a.t++;
    if (a.hang) { a.x = 0; a.y = 0; a.rot = hangRot(a.t); continue; }
    // 下の羽はそのまま落ちる。上の羽はいったん上に弾けてから落ちる
    if (a.t <= 18) { a.rot = sy * 0.22 * (a.t / 18); a.x = 0; a.y = 0; a.vx = sy > 0 ? -0.6 : 1.2; a.vy = sy > 0 ? 1.2 : -3.2; a.vr = sy * 0.03; }
    else { a.x += a.vx; a.y += a.vy; a.vy += 0.12; a.rot += a.vr; }
  }
}

function boom(x, y, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 1 + fxRng.rnd() * sp;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 20 + fxRng.rnd() * 30,
      fxRng.pick(['#fff', '#FFD54F', '#FF9E3D', '#FF5C8A']), 3 + fxRng.rnd() * 5);
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

