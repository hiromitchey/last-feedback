// 入力の正規化（技術設計書 6章）
// 相対（パッド・キーボード）と絶対（タッチ・マウス）の2系統を潰さずに持つ
import { CFG } from './config.js';

export const BTN = { SHOT: 1, BOMB: 2, PAUSE: 4, SLOW: 8 };

export const input = {
  mode: 'pointer',        // 'pointer' | 'dir' — 最後に使われた系統
  dx: 0, dy: 0,           // 相対入力（−1〜1）
  tx: CFG.player.startX, ty: CFG.player.startY,   // 絶対入力（論理座標）
  btn: 0, prevBtn: 0,
  touchUsed: false,       // 一度でも指で触ったらタッチUIを出す
  tapped: false,          // タイトルなどの「どこか押した」（main が消費する）
  toggleAuto: false,      // オートショット切替の要求（main が消費する）
  fkeys: [],              // デバッグ用ファンクションキー（main が消費する）
};

export const held    = b => (input.btn & b) !== 0;
export const pressed = b => (input.btn & b) !== 0 && (input.prevBtn & b) === 0;

// タッチのボタン（論理座標）。右下にショット、その上にボム、左上にポーズ
export const touchButtons = {
  shot:  { x: CFG.W - 96, y: CFG.H - 92,  r: 62, label: 'SHOT' },
  bomb:  { x: CFG.W - 96, y: CFG.H - 230, r: 44, label: 'BOMB' },
  pause: { x: 40, y: CFG.H - 40, r: 26, label: 'II' },
  auto:  { x: CFG.W - 200, y: CFG.H - 40, r: 26, label: 'AUTO' },   // オートショット切替
};

let cv = null;
const keys = new Set();
let mouseBtn = 0, touchBtn = 0, padBtn = 0;
let latch = 0;   // 次の sample までに押されたボタン。1フレームより短いクリックを取りこぼさない
const roles = new Map();  // pointerId -> 'move' | 'shot' | 'bomb' | 'pause' | 'mouse'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * CFG.W, y: (e.clientY - r.top) / r.height * CFG.H };
}

function hitButton(p) {
  for (const [name, b] of Object.entries(touchButtons)) {
    const dx = p.x - b.x, dy = p.y - b.y, r = b.r + 14;   // 指は大きいので判定を広めに
    if (dx * dx + dy * dy < r * r) return name;
  }
  return null;
}

const TOUCH_BIT = { shot: BTN.SHOT, bomb: BTN.BOMB, pause: BTN.PAUSE };

function setTouchTarget(p) {
  input.tx = p.x;
  input.ty = clamp(p.y - CFG.player.touchOffsetY, CFG.player.yMin, CFG.player.yMax);
}

export function initInput(canvas) {
  cv = canvas;

  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    input.tapped = true;
    const p = toLogical(e);
    input.tapAt = p;                        // 触った場所（キーやパッドのときは null）
    if (e.pointerType === 'mouse') {
      input.mode = 'pointer';
      input.tx = p.x; input.ty = p.y;
      if (e.button === 0) { mouseBtn |= BTN.SHOT; latch |= BTN.SHOT; }
      if (e.button === 2) { mouseBtn |= BTN.BOMB; latch |= BTN.BOMB; }
      roles.set(e.pointerId, 'mouse');
      return;
    }
    // タッチ・ペン：触れた瞬間に役割を決めて、離すまで変えない
    input.touchUsed = true;
    const role = hitButton(p) || 'move';
    roles.set(e.pointerId, role);
    try { cv.setPointerCapture(e.pointerId); } catch {}
    if (role === 'move') { input.mode = 'pointer'; setTouchTarget(p); }
    else if (role === 'auto') input.toggleAuto = true;
    else { touchBtn |= TOUCH_BIT[role]; latch |= TOUCH_BIT[role]; }
  }, { passive: false });

  cv.addEventListener('pointermove', e => {
    e.preventDefault();
    const p = toLogical(e);
    if (e.pointerType === 'mouse') {
      input.mode = 'pointer';
      input.tx = p.x; input.ty = p.y;
      return;
    }
    if (roles.get(e.pointerId) === 'move') { input.mode = 'pointer'; setTouchTarget(p); }
  }, { passive: false });

  const up = e => {
    const role = roles.get(e.pointerId);
    if (role === 'mouse') {
      if (e.button === 0 || e.type === 'pointercancel') mouseBtn &= ~BTN.SHOT;
      if (e.button === 2 || e.type === 'pointercancel') mouseBtn &= ~BTN.BOMB;
    } else if (TOUCH_BIT[role]) {
      touchBtn &= ~TOUCH_BIT[role];
    }
    roles.delete(e.pointerId);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  // 窓の外でボタンを離されたとき用
  addEventListener('blur', () => { mouseBtn = 0; touchBtn = 0; keys.clear(); roles.clear(); });

  addEventListener('keydown', e => {
    if (/^F\d+$/.test(e.code)) { e.preventDefault(); if (!e.repeat) input.fkeys.push(e.code); return; }
    if (e.code === 'Period') input.fkeys.push('Period');   // コマ送り（F5 中）
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat && (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter')) { input.tapped = true; input.tapAt = null; }
    if (!e.repeat && e.code === 'KeyQ') input.toggleAuto = true;
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
}

function pollGamepad() {
  const gp = navigator.getGamepads?.()[0];
  padBtn = 0;
  if (!gp) return false;
  const dead = 0.3;
  const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
  // リプレイの再現性のためスティックは8方向に量子化する（技術設計書 19章3）
  const sx = Math.abs(ax) > dead ? Math.sign(ax) : 0;
  const sy = Math.abs(ay) > dead ? Math.sign(ay) : 0;
  const px = (gp.buttons[14]?.pressed ? -1 : 0) + (gp.buttons[15]?.pressed ? 1 : 0);
  const py = (gp.buttons[12]?.pressed ? -1 : 0) + (gp.buttons[13]?.pressed ? 1 : 0);
  if (gp.buttons[0]?.pressed) padBtn |= BTN.SHOT;
  if (gp.buttons[1]?.pressed) padBtn |= BTN.BOMB;
  if (gp.buttons[9]?.pressed) padBtn |= BTN.PAUSE;
  if (padBtn & BTN.SHOT && !(input.prevBtn & BTN.SHOT)) { input.tapped = true; input.tapAt = null; }
  const dx = px || sx, dy = py || sy;
  if (dx || dy) { input.mode = 'dir'; input.dx = dx; input.dy = dy; return true; }
  return false;
}

// step() の先頭で1回呼ぶ。この時点の値がそのフレームの入力として確定する
export function sample() {
  input.prevBtn = input.btn;
  const padMoved = pollGamepad();

  const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  const ky = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
  if (kx || ky) { input.mode = 'dir'; input.dx = kx; input.dy = ky; }
  else if (!padMoved && input.mode === 'dir') { input.dx = 0; input.dy = 0; }

  let kb = 0;
  if (keys.has('KeyZ') || keys.has('Space')) kb |= BTN.SHOT;
  if (keys.has('KeyX')) kb |= BTN.BOMB;
  if (keys.has('Escape') || keys.has('KeyP')) kb |= BTN.PAUSE;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) kb |= BTN.SLOW;

  input.btn = kb | mouseBtn | touchBtn | padBtn | latch;
  latch = 0;
}

// 自機の位置をポインタの目標に合わせる（リスタート時など、急に飛ばないように）
export function syncTarget(x, y) { input.tx = x; input.ty = y; }
