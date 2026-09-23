// 編隊と道中2区間（設計書 5章）。出現予告24fをここで必ず出す（原則3）
import { CFG } from './config.js';
import { state, popup } from './world.js';
import * as sched from './sched.js';
import { spawnEnemy } from './enemies.js';
import { bigOrb } from './bullets.js';
import { bossFight, skipForm } from './boss.js';

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

// ---- 道中A：操作を覚える。最初の1編隊だけ少なめ、そこからモブを増やしていく。でか玉の初出 ----
function* segmentA() {
  yield* sched.wait(60);
  yield* formation('連なり', 3, { y: MID, carry: [2, 'way'] });           // 3体だけ。最初の1個
  yield* sched.waitCleared(20);
  yield* formation('連なり', 4, { y: 150 });
  yield* sched.wait(50);
  yield* formation('連なり', 4, { y: 390 });
  yield* sched.wait(50);
  yield* formation('連なり', 4, { y: MID });
  yield* sched.waitCleared(20);
  yield* formation('玉', 1, { ys: [MID - 40], slow: true });               // 初対面：何もない所に1個だけ
  yield* sched.wait(150);
  yield* formation('連なり', 5, { y: 380 });
  yield* sched.wait(45);
  yield* formation('連なり', 5, { y: 160, carry: [4, 'pow'] });
  yield* sched.waitCleared(20);
  yield* formation('波', 6, { y0: MID, amp: 110, carry: [5, 'way'] });
  yield* sched.wait(70);
  yield* formation('波', 6, { y0: 200, amp: 80, phase: Math.PI });
  yield* sched.waitCleared(20);
  yield* formation('階段', 5, { y0: 90, dy: 85, shoot: true, carry: [4, 'bomb'] });   // ボム1個
  yield* sched.wait(60);
  yield* formation('階段', 5, { y0: 450, dy: -85 });
  yield* sched.waitCleared(20);
  yield* formation('玉', 2, { ys: [140, 400], gap: 70 });                // 高さ違いの2個
  yield* sched.wait(60);
  yield* formation('連なり', 5, { y: MID });
  yield* sched.wait(40);
  yield* formation('連なり', 4, { y: 90 });
  yield* sched.waitCleared(20);
  yield* formation('波', 6, { y0: 200, amp: 90, shoot: true, carry: [5, 'pow'] });
  yield* sched.wait(50);
  yield* formation('波', 6, { y0: 340, amp: 90, phase: Math.PI });
  yield* sched.waitCleared(20);
  yield* formation('玉吐き', 4, { y: MID, mokoCarry: 'way' });
  yield* sched.wait(100);
  yield* formation('連なり', 5, { y: 90 });
  yield* sched.wait(40);
  yield* formation('連なり', 5, { y: 450 });
  yield* sched.wait(40);
  yield* formation('階段', 5, { y0: 110, dy: 80 });
  yield* sched.waitCleared(20);
}

// ---- 道中B：高速型と面弾。モブ多め。途中で貫通が付く ----
function* segmentB() {
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
  yield* formation('波', 8, { y0: MID, amp: 150 });
  yield* sched.waitCleared(20);
}

export const SEGMENTS = [
  { name: '道中A', gen: segmentA },
  { name: '道中B', gen: segmentB },
];

function* stage(startIdx, bossForm, cores) {
  for (let idx = startIdx; idx < SEGMENTS.length; idx++) {
    const S = SEGMENTS[idx];
    state.seg = { index: idx, name: S.name, t0: state.frame, escaped: 0 };
    state.segCap = CFG.seg.cap[idx];
    // チェックポイント：死んだら区間の頭から
    state.checkpoint = { seg: idx, lv: { ...state.player.lv } };
    popup(S.name, CFG.W / 2, CFG.H / 2 - 30, { big: true, size: 48, col: '#fff', life: 90 });
    yield* S.gen();
    // 区間の切り替えは「全滅」かつ「最低時間の経過」
    yield* sched.waitUntil(() => state.frame - state.seg.t0 >= CFG.seg.minFrames
      && state.enemies.length === 0 && state.warnings.length === 0);
    if (state.seg.escaped === 0) {
      state.score += CFG.seg.zeroMissBonus;
      popup('撃ち漏らしゼロ！ +' + CFG.seg.zeroMissBonus, CFG.W / 2, CFG.H / 2, { big: true, size: 36, col: '#FFD54F', life: 90 });
      yield* sched.wait(90);
    }
  }
  yield* bossFight(bossForm, cores);
  yield* sched.wait(60);
  state.mode = 'clear';
  state.clearT = 0;
}

let token = null;
// idx: 0 道中A / 1 道中B / 'boss'
export function startStage(idx = 0, bossForm = 1, cores = null) {
  if (token) token.alive = false;
  token = { alive: true };
  sched.add(stage(idx === 'boss' ? SEGMENTS.length : idx, bossForm, cores), token);
}

// F4：次の区間へ（ボス戦中は次の形態へ）
export function skipSegment() {
  if (state.boss) { skipForm(); return; }
  if (state.seg && state.seg.index >= SEGMENTS.length) return;   // 警告中
  const next = state.seg ? state.seg.index + 1 : 0;
  for (const e of state.enemies) e.alive = false;
  for (const b of state.eBullets) b.alive = false;
  state.warnings.length = 0;
  startStage(next >= SEGMENTS.length ? 'boss' : next);
}
