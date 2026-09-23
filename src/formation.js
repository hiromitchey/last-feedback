// 編隊と道中2区間（設計書 5章）。出現予告24fをここで必ず出す（原則3）
import { CFG } from './config.js';
import { state, popup } from './world.js';
import * as sched from './sched.js';
import { spawnEnemy } from './enemies.js';
import { bigOrb } from './bullets.js';
import { bossFight, skipForm } from './boss.js';
import { mission } from './story.js';
import { midbossFight, midTargetable, damageMid } from './midboss.js';

function warn(ys) {
  for (const y of ys) state.warnings.push({ y, t: CFG.warn.spawn, alive: true });
}

export function moveWarnings() {
  for (const w of state.warnings) if (--w.t <= 0) w.alive = false;
}

const X0 = CFG.W + 30;   // 画面右端の外
const MID = CFG.H / 2;

// 編隊の形。全員が完全に同期して動く（物語：命令通りの個体。乱れているのは もこ だけ）
// opt.carry: [index, 'way'|'pow'] — その個体が倒されるとアイテムを落とす（道中の強化は固定配置）
// opt.shoot: ぷにが自機狙いを撃つか
export function* formation(kind, n, opt = {}) {
  const carryOf = i => (opt.carry && opt.carry[0] === i ? opt.carry[1] : null);
  const shoot = opt.shoot ?? false;

  switch (kind) {
    case '連なり': {
      // 同じ高さで一列。パワー最大（貫通）で一掃できる見せ場
      const y = opt.y ?? MID;
      warn([y]);
      yield* sched.wait(CFG.warn.spawn);
      for (let i = 0; i < n; i++)
        spawnEnemy('puni', X0 + i * 56, y, { shoot: shoot && i === 0, carry: carryOf(i) });
      break;
    }
    case '波': {
      // 上下にうねりながら左へ
      const y0 = opt.y0 ?? MID, amp = opt.amp ?? 110;
      warn([y0]);
      yield* sched.wait(CFG.warn.spawn);
      for (let i = 0; i < n; i++)
        spawnEnemy('puni', X0 + i * 64, y0, { move: 'wave', amp, freq: 0.045, phase: (opt.phase ?? 0) - i * 0.6,
          shoot: shoot && i % 3 === 1, carry: carryOf(i) });
      break;
    }
    case '階段': {
      // 斜めにずれて並ぶ
      const y0 = opt.y0 ?? 120, dy = opt.dy ?? 70;
      const ys = Array.from({ length: n }, (_, i) => y0 + i * dy);
      warn(ys);
      yield* sched.wait(CFG.warn.spawn);
      ys.forEach((y, i) => spawnEnemy('puni', X0 + i * 48, y, { shoot: shoot && i === n - 1, carry: carryOf(i) }));
      break;
    }
    case '挟み': {
      // 上端2 + 下端2。中央に寄りながら来るので、どちらかの端に逃げる
      const ys = [50, 105, CFG.H - 105, CFG.H - 50];
      warn(ys);
      yield* sched.wait(CFG.warn.spawn);
      ys.forEach((y, i) => spawnEnemy('puni', X0 + (i % 2) * 50, y, {
        move: 'converge', ty: y < MID ? MID - 75 : MID + 75, shoot: shoot && i % 2 === 0, carry: carryOf(i) }));
      break;
    }
    case '追い越し': {
      // びゅんが高速で通過。弾は撃たない。軌道は直線（壁で反射）なので読める
      const ys = opt.ys ?? [120, 400, 200, 330];
      for (let i = 0; i < n; i++) {
        const y = ys[i % ys.length];
        warn([y]);
        yield* sched.wait(CFG.warn.spawn);
        const vy = (y < MID ? 1 : -1) * CFG.enemy.byun.vy;
        spawnEnemy('byun', X0, y, { vy, carry: carryOf(i) });
        yield* sched.wait(opt.gap ?? 36);
      }
      break;
    }
    case '玉吐き': {
      // もこ×1 + ぷに。もこ本体・でか玉・ぷにの優先順位
      const my = opt.y ?? MID;
      warn([my]);
      yield* sched.wait(CFG.warn.spawn);
      spawnEnemy('moko', X0 + 20, my, { orb: true, carry: opt.mokoCarry ?? null });
      yield* sched.wait(70);
      const ys = n >= 4 ? [my - 150, my + 150, my - 100, my + 100] : [my - 140, my + 140];
      warn(ys.slice(0, n));
      yield* sched.wait(CFG.warn.spawn);
      for (let i = 0; i < n; i++)
        spawnEnemy('puni', X0 + (i >> 1) * 70, ys[i], { shoot, carry: carryOf(i) });
      break;
    }
    case 'Uターン': {
      // 左端まで行って高さを変えて戻る。撃ち漏らすと戻ってくる。弾は撃たない
      const y0 = opt.y ?? 150, dy = opt.dy ?? 150;
      warn([y0]);
      yield* sched.wait(CFG.warn.spawn);
      for (let i = 0; i < n; i++)
        spawnEnemy('puni', X0 + i * 60, y0, { move: 'uturn', dy, carry: carryOf(i) });
      break;
    }
    case '玉の雨':
    case '玉': {
      // でか玉（高さ違い・時間差）
      const ys = opt.ys ?? [MID];
      for (let i = 0; i < ys.length; i++) {
        warn([ys[i]]);
        yield* sched.wait(CFG.warn.spawn);
        bigOrb(X0, ys[i], { slow: opt.slow });
        if (i < ys.length - 1) yield* sched.wait(opt.gap ?? 50);
      }
      break;
    }
  }
}

// ---- 1面「命令通り」：兄弟（ぷに・びゅん）ばかり。整然とした編隊。最初は少なめ ----
function* road1a() {
  yield* sched.wait(60);
  yield* formation('連なり', 3, { y: MID, carry: [2, 'way'] });           // 3体だけ。最初の1個
  yield* sched.waitCleared(20);
  yield* formation('連なり', 4, { y: 150 });
  yield* sched.wait(50);
  yield* formation('連なり', 4, { y: 390 });
  yield* sched.waitCleared(20);
  yield* formation('玉', 1, { ys: [MID - 40], slow: true });               // でか玉の初対面：何もない所に1個だけ
  yield* sched.wait(150);
  yield* formation('連なり', 5, { y: 380 });
  yield* sched.wait(45);
  yield* formation('連なり', 5, { y: 160, carry: [4, 'pow'] });
  yield* sched.waitCleared(20);
  yield* formation('波', 6, { y0: MID, amp: 110, carry: [5, 'way'] });
  yield* sched.wait(70);
  yield* formation('波', 6, { y0: 200, amp: 80, phase: Math.PI });
  yield* sched.waitCleared(20);
  yield* formation('階段', 5, { y0: 90, dy: 85, shoot: true });
  yield* sched.wait(60);
  yield* formation('階段', 5, { y0: 450, dy: -85 });
  yield* sched.waitCleared(20);
  yield* formation('玉', 2, { ys: [140, 400], gap: 70 });
  yield* sched.wait(60);
  yield* formation('追い越し', 4, { carry: [3, 'pow'] });
  yield* sched.waitCleared(20);
}

function* road1b() {
  yield* sched.wait(40);
  yield* formation('連なり', 5, { y: 120, carry: [4, 'way'] });
  yield* sched.wait(40);
  yield* formation('連なり', 5, { y: 420 });
  yield* sched.wait(40);
  yield* formation('波', 6, { y0: MID, amp: 140, shoot: true });
  yield* sched.waitCleared(20);
}

// ---- 2面「改修」：兄弟と歪んだもの（もこ）が混ざる ----
function* road2a() {
  yield* sched.wait(60);
  yield* formation('追い越し', 6, { ys: [120, 400, 200, 330, 80, 460], gap: 28, carry: [5, 'pow'] });
  yield* sched.waitCleared(20);
  yield* formation('挟み', 4, { shoot: true, carry: [1, 'pow'] });
  yield* sched.wait(70);
  yield* formation('連なり', 6, { y: MID, shoot: true });
  yield* sched.wait(40);
  yield* formation('挟み', 4, { carry: [2, 'bomb'] });   // ボム1個
  yield* sched.waitCleared(20);
  yield* formation('玉の雨', 3, { ys: [110, MID, 430], gap: 45 });
  yield* sched.wait(40);
  yield* formation('波', 8, { y0: MID, amp: 130, shoot: true });
  yield* sched.wait(70);
  yield* formation('追い越し', 5, { ys: [100, 440, 270, 180, 360], gap: 30 });
  yield* sched.waitCleared(20);
  yield* formation('階段', 6, { y0: 70, dy: 80, shoot: true });
  yield* sched.wait(50);
  yield* formation('階段', 6, { y0: 470, dy: -80 });
  yield* sched.waitCleared(20);
  yield* formation('玉吐き', 4, { y: MID, shoot: true, mokoCarry: 'pow' });  // ここで貫通が付く想定
  yield* sched.waitCleared(20);
}

// 2面の後半：中ボス2（修理機）のあと。貫通の見せ場から
function* road2b() {
  yield* sched.wait(40);
  yield* formation('連なり', 7, { y: 150, carry: [6, 'way'] });           // 貫通の見せ場
  yield* sched.wait(35);
  yield* formation('連なり', 7, { y: 390 });
  yield* sched.wait(35);
  yield* formation('連なり', 7, { y: MID, shoot: true });
  yield* sched.waitCleared(20);
  yield* formation('挟み', 4, { shoot: true });
  yield* sched.wait(50);
  yield* formation('追い越し', 6, { ys: [80, 460, 150, 390, 230, 310], gap: 26 });
  yield* sched.waitCleared(20);
  yield* formation('Uターン', 5, { y: 130, dy: 160, carry: [0, 'way'] });
  yield* sched.wait(80);
  yield* formation('Uターン', 5, { y: 420, dy: -160 });
  yield* sched.wait(60);
  yield* formation('玉', 1, { ys: [MID], slow: true });
  yield* sched.wait(60);
  yield* formation('波', 8, { y0: MID, amp: 150 });
  yield* sched.waitCleared(20);
}

// ---- 面の構成（物語に合わせた3面。PLAN.md） ----
// part: { road, min, cap } 道中 / { mid } 中ボス / { boss } 母船
export const STAGES = [
  { name: 'STAGE 1', title: '', planet: 0.8, parts: [
    { road: road1a, min: 35 * 60, cap: 10 },
    { mid: 1 },
    { road: road1b, min: 15 * 60, cap: 10 },
  ] },
  { name: 'STAGE 2', title: '', planet: 1.0, parts: [
    { road: road2a, min: 30 * 60, cap: 16 },
    { mid: 2 },                                     // 修理機
    { road: road2b, min: 20 * 60, cap: 16 },
  ] },
  { name: 'STAGE 3', title: '', planet: 1.3, parts: [
    { boss: true },                                 // 道中・中ボス3 は次の作業で
  ] },
];

function* runPart(si, pi, part, bossForm, cores) {
  const S = STAGES[si];
  state.seg = { stage: si, part: pi, name: S.name, t0: state.frame, escaped: 0 };
  // チェックポイント：死んだらこの部分の頭から（母船は形態の頭から。boss.js が上書きする）
  state.checkpoint = { stage: si, part: pi, lv: { ...state.player.lv } };
  if (part.road) {
    state.segCap = part.cap;
    yield* part.road();
    // 切り替えは「全滅」かつ「最低時間の経過」
    yield* sched.waitUntil(() => state.frame - state.seg.t0 >= part.min
      && state.enemies.length === 0 && state.warnings.length === 0);
    if (state.seg.escaped === 0) {
      state.score += CFG.seg.zeroMissBonus;
      popup('撃ち漏らしゼロ！ +' + CFG.seg.zeroMissBonus, CFG.W / 2, CFG.H / 2, { big: true, size: 36, col: '#FFD54F', life: 90 });
      yield* sched.wait(90);
    }
  } else if (part.mid) {
    state.segCap = CFG.boss.cap[0];
    yield* midbossFight(part.mid);
  } else if (part.boss) {
    state.checkpoint.boss = true;
    yield* bossFight(bossForm, cores);
  }
}

function* stage(si, pi, bossForm, cores, withMission) {
  if (withMission) yield* mission();
  for (; si < STAGES.length; si++, pi = 0) {
    const S = STAGES[si];
    state.stage = si;
    state.planet = S.planet;
    if (pi === 0) {
      popup(S.name, CFG.W / 2, CFG.H / 2 - 30, { big: true, size: 44, col: '#fff', life: 100 });
      yield* sched.wait(60);
    }
    for (; pi < S.parts.length; pi++) yield* runPart(si, pi, S.parts[pi], bossForm, cores);
  }
}

let token = null;
export function startStage(si = 0, pi = 0, bossForm = 1, cores = null, withMission = false) {
  if (token) token.alive = false;
  token = { alive: true };
  sched.add(stage(si, pi, bossForm, cores, withMission), token);
}

// F4：次の部分へ（中ボスは倒す、母船は次の形態へ）
export function skipSegment() {
  if (state.boss) { skipForm(); return; }
  if (state.mid) { if (midTargetable()) damageMid(state.mid.hp + 1); return; }
  if (!state.seg || state.seg.skipping) return;   // 次の部分が始まるまでは受け付けない
  let si = state.seg.stage, pi = state.seg.part + 1;
  if (pi >= STAGES[si].parts.length) { si++; pi = 0; }
  if (si >= STAGES.length) return;
  for (const e of state.enemies) e.alive = false;
  for (const b of state.eBullets) b.alive = false;
  state.warnings.length = 0;
  state.seg.skipping = true;
  startStage(si, pi);
}
