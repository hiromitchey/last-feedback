// デバッグ機能（技術設計書 10章）。F6（リプレイ）は Step 17
//   F1 判定の可視化 / F2 無敵 / F3 強化の段階 / F4 次の区間へ / F5 コマ送り（「.」で1フレーム）
//   F7 統計 / F8 config ライブ編集 / F9 エネルギー（試験）のオン・オフ
import { CFG } from './config.js';
import { state, particleCount, popup } from './world.js';
import { bulletWeight, bulletCap } from './bullets.js';
import * as sched from './sched.js';
import { checks } from './collide.js';
import { drawStats } from './render.js';
import { skipSegment } from './formation.js';

export const dbg = { hitbox: false, stats: false, stepMode: false, stepOnce: 0, stepMs: 0, renderMs: 0, fps: 60 };

const note = s => popup(s, CFG.W / 2, 80, { size: 18, life: 50 });

export function handleKey(code) {
  switch (code) {
    case 'F1': dbg.hitbox = !dbg.hitbox; break;
    case 'F2':
      state.debugInvincible = !state.debugInvincible;
      note('無敵 ' + (state.debugInvincible ? 'ON' : 'OFF'));
      break;
    case 'F3': {
      // ワイド・パワーを両方1段ずつ上げる（最大の次は0に戻る）
      const p = state.player;
      if (!p) break;
      const n = (Math.max(p.lv.way, p.lv.pow) + 1) % 4;
      p.lv.way = n; p.lv.pow = n; p.stock.way = 0; p.stock.pow = 0;
      note('W' + (n + 1) + ' / P' + (n + 1));
      break;
    }
    case 'F4':
      if (state.mode === 'play') { skipSegment(); }
      break;
    case 'F5':
      dbg.stepMode = !dbg.stepMode;
      note('コマ送り ' + (dbg.stepMode ? 'ON（. で1フレーム）' : 'OFF'));
      break;
    case 'Period':
      if (dbg.stepMode) dbg.stepOnce++;
      break;
    case 'F7': dbg.stats = !dbg.stats; break;
    case 'F8': togglePanel(); break;
    case 'F9':
      CFG.energy.enabled = !CFG.energy.enabled;
      if (state.player) { state.player.energy = CFG.energy.max; state.player.empty = false; }
      note('エネルギー ' + (CFG.energy.enabled ? 'ON' : 'OFF'));
      break;
  }
}

let fpsN = 0, fpsLast = performance.now();
export function tickFps(now) {
  fpsN++;
  if (now - fpsLast >= 500) { dbg.fps = fpsN * 1000 / (now - fpsLast); fpsN = 0; fpsLast = now; }
}

export function drawDebug() {
  if (!dbg.stats) return;
  const seg = state.seg ? `${state.seg.name}-${state.seg.part} ${((state.frame - state.seg.t0) / 60).toFixed(1)}s 漏れ${state.seg.escaped}` : '-';
  drawStats([
    `fps ${dbg.fps.toFixed(1)}   step ${dbg.stepMs.toFixed(2)}ms   render ${dbg.renderMs.toFixed(2)}ms`,
    `bullets ${bulletWeight()}/${bulletCap()}   enemies ${state.enemies.length}   particles ${particleCount()}/512`,
    `collide ${checks} checks   sched ${sched.count()} tasks   pShots ${state.pBullets.length}`,
    `${seg}`,
  ]);
}

// ---- F8：config ライブ編集。CFG を走査して数値ごとにスライダーを作る ----
// 変更は CFG を直接書き換えるだけ。次の発射・出現から効く
const SKIP = new Set(['W', 'H', 'FPS', 'STEP']);
let panel = null;

function togglePanel() {
  if (!panel) panel = buildPanel();
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function buildPanel() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;right:8px;width:320px;max-height:calc(100vh - 16px);overflow:auto;'
    + 'background:rgba(15,15,30,.92);color:#dfe;font:12px monospace;padding:8px;border-radius:8px;z-index:10;display:none';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  head.innerHTML = '<b style="flex:1">CFG（F8で閉じる）</b>';
  const btn = document.createElement('button');
  btn.textContent = 'JSONをコピー';
  btn.onclick = () => {
    const json = JSON.stringify(CFG, null, 2);
    navigator.clipboard?.writeText(json).then(() => note('CFG をコピーしました'), () => console.log(json));
  };
  head.appendChild(btn);
  el.appendChild(head);

  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? path + '.' + k : k;
      if (!path && SKIP.has(k)) continue;
      if (typeof v === 'number') el.appendChild(row(obj, k, p, v));
      else if (typeof v === 'boolean') el.appendChild(checkRow(obj, k, p));
      else if (v && typeof v === 'object') walk(v, p);
    }
  };
  walk(CFG, '');
  document.body.appendChild(el);
  // パネル上のキー入力をゲームに渡さない
  el.addEventListener('keydown', e => e.stopPropagation());
  return el;
}

function row(obj, k, path, v0) {
  const r = document.createElement('label');
  r.style.cssText = 'display:grid;grid-template-columns:1fr 90px 52px;gap:4px;align-items:center;margin:2px 0';
  const name = document.createElement('span'); name.textContent = path;
  const int = Number.isInteger(v0);
  const max = v0 === 0 ? 10 : Math.abs(v0) * 3;
  const sl = document.createElement('input');
  Object.assign(sl, { type: 'range', min: v0 < 0 ? -max : 0, max, step: int ? 1 : 0.01, value: v0 });
  const num = document.createElement('input');
  Object.assign(num, { type: 'number', step: int ? 1 : 0.01, value: v0 });
  num.style.width = '50px';
  const set = v => { v = Number(v); if (!Number.isFinite(v)) return; obj[k] = v; sl.value = v; num.value = v; };
  sl.oninput = () => set(sl.value);
  num.onchange = () => set(num.value);
  r.append(name, sl, num);
  return r;
}

function checkRow(obj, k, path) {
  const r = document.createElement('label');
  r.style.cssText = 'display:flex;gap:6px;margin:2px 0';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = obj[k];
  cb.onchange = () => { obj[k] = cb.checked; };
  const name = document.createElement('span'); name.textContent = path;
  r.append(cb, name);
  return r;
}
