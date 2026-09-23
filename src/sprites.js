// スプライトの事前生成とキャッシュ（技術設計書 9章）
// 毎フレームのグラデーション生成と shadowBlur は禁止。ここで一度だけ描いて以後 drawImage
import { COL, GRADE_COL, CFG } from './config.js';

const SS = 2;                 // 高DPI用に2倍で描いておく
const cache = new Map();

function mk(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  fn(g, w, h);
  c.w = w; c.h = h;           // 論理サイズ
  return c;
}

// ---- 弾（白フチ → 本体色 → ハイライト） ----
export function bulletSprite(col, r) {
  const k = 'b|' + col + '|' + r;
  let c = cache.get(k);
  if (c) return c;
  const d = (r + 3) * 2;
  c = mk(d, d, g => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(d / 2, d / 2, r + 2.5, 0, 7); g.fill();
    g.fillStyle = col;    g.beginPath(); g.arc(d / 2, d / 2, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(d / 2 - r * 0.3, d / 2 - r * 0.3, r * 0.26, 0, 7); g.fill();
  });
  cache.set(k, c);
  return c;
}

// 針（はり弾）：細長い。進行方向に回して描く
export function needleSprite(col) {
  const k = 'n|' + col;
  let c = cache.get(k);
  if (c) return c;
  c = mk(26, 14, g => {
    const pill = (w, h) => { g.beginPath(); g.ellipse(13, 7, w, h, 0, 0, 7); g.fill(); };
    g.fillStyle = '#fff'; pill(12, 6);
    g.fillStyle = col;    pill(9.5, 3.8);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(16, 5.6, 3, 1.2, 0, 0, 7); g.fill();
  });
  cache.set(k, c);
  return c;
}

// ---- でか玉：12色相 × 4ヒビ段階 ----
const HUES = 12;
const CRACKS = [
  [],
  [[0, -0.1, 0.45, -0.5], [0.45, -0.5, 0.7, -0.35]],
  [[0, -0.1, 0.45, -0.5], [0.45, -0.5, 0.7, -0.35], [-0.1, 0.05, -0.5, 0.45], [-0.5, 0.45, -0.35, 0.75]],
  [[0, -0.1, 0.45, -0.5], [0.45, -0.5, 0.7, -0.35], [-0.1, 0.05, -0.5, 0.45], [-0.5, 0.45, -0.35, 0.75],
   [0.05, 0.05, 0.55, 0.3], [0.55, 0.3, 0.8, 0.1], [0, -0.1, -0.45, -0.55]],
];

export function orbSprite(r, hueIdx, crack) {
  const k = 'o|' + r + '|' + hueIdx + '|' + crack;
  let c = cache.get(k);
  if (c) return c;
  const d = (r + 6) * 2, m = d / 2;
  c = mk(d, d, g => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(m, m, r + 4, 0, 7); g.fill();     // 太い白フチ
    const h0 = hueIdx * 360 / HUES;
    // 虹色：扇形を色相順に並べる（事前生成なのでグラデーションも可だが、扇の方がポップ）
    const seg = 6;
    for (let i = 0; i < seg; i++) {
      g.fillStyle = `hsl(${(h0 + i * 60) % 360},95%,62%)`;
      g.beginPath(); g.moveTo(m, m);
      g.arc(m, m, r, i * Math.PI * 2 / seg, (i + 1) * Math.PI * 2 / seg + 0.02);
      g.closePath(); g.fill();
    }
    // 中心を少し明るく
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(m, m, r * 0.45, 0, 7); g.fill();
    // ハイライト
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.ellipse(m - r * 0.38, m - r * 0.4, r * 0.28, r * 0.18, -0.6, 0, 7); g.fill();
    // ヒビ
    if (crack) {
      g.strokeStyle = '#2a2140'; g.lineWidth = 2; g.lineCap = 'round';
      for (const [x1, y1, x2, y2] of CRACKS[crack]) {
        g.beginPath(); g.moveTo(m + x1 * r, m + y1 * r); g.lineTo(m + x2 * r, m + y2 * r); g.stroke();
      }
    }
  });
  cache.set(k, c);
  return c;
}
export const ORB_HUES = HUES;

// ---- 自機（右向き）：ワイドの段階ごとに色違い。絵のスロット player1〜4 のフォールバック ----
function shipPath(g, s) {
  // 原点中心、右向き。s = 半径相当
  g.beginPath();
  g.moveTo(s * 1.0, 0);
  g.quadraticCurveTo(s * 0.55, -s * 0.5, -s * 0.35, -s * 0.48);
  g.lineTo(-s * 0.8, -s * 0.85);
  g.lineTo(-s * 0.72, -s * 0.28);
  g.quadraticCurveTo(-s * 0.95, 0, -s * 0.72, s * 0.28);
  g.lineTo(-s * 0.8, s * 0.85);
  g.lineTo(-s * 0.35, s * 0.48);
  g.quadraticCurveTo(s * 0.55, s * 0.5, s * 1.0, 0);
  g.closePath();
}

function drawShip(g, size, body, accent, dir = 1, num = null) {
  const m = size / 2, s = size * 0.42;
  g.save(); g.translate(m, m); g.scale(dir, 1);
  g.lineJoin = 'round';
  shipPath(g, s);
  g.strokeStyle = '#fff'; g.lineWidth = size * 0.1; g.stroke();   // ステッカーの白フチ
  g.fillStyle = body; g.fill();
  // 窓
  g.fillStyle = accent;
  g.beginPath(); g.ellipse(s * 0.3, -s * 0.08, s * 0.26, s * 0.17, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.beginPath(); g.ellipse(s * 0.36, -s * 0.14, s * 0.09, s * 0.05, 0, 0, 7); g.fill();
  // 帯
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(-s * 0.5, s * 0.12, s * 0.8, s * 0.12);
  g.restore();
  if (num) {
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.font = `bold ${size * 0.16}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(num, m - dir * s * 0.1, m + s * 0.4);
  }
}

export function playerSprite(grade) {
  const k = 'p|' + grade;
  let c = cache.get(k);
  if (c) return c;
  const size = CFG.player.size + 8;
  c = mk(size, size, g => drawShip(g, size, '#E8ECF4', GRADE_COL[grade], 1));
  cache.set(k, c);
  return c;
}

// ぷに（左向き）。物語：047 とよく似た形の正常個体。色で分ける
export function puniSprite() {
  const k = 'e|puni';
  let c = cache.get(k);
  if (c) return c;
  const size = CFG.enemy.puni.size + 8;
  c = mk(size, size, g => drawShip(g, size, '#FF9E3D', '#5b3a8a', -1));
  cache.set(k, c);
  return c;
}

// びゅん（左向き・高速）。ぷにと同じ正常個体。色で分ける。進行方向に回すので水平で描く
export function byunSprite() {
  const k = 'e|byun';
  let c = cache.get(k);
  if (c) return c;
  const size = CFG.enemy.byun.size + 8;
  c = mk(size, size, g => {
    g.save(); g.translate(size / 2, size / 2); g.scale(1, 0.72); g.translate(-size / 2, -size / 2);
    drawShip(g, size, '#C7D34A', '#2d4a3a', -1);
    g.restore();
  });
  cache.set(k, c);
  return c;
}

// もこ（左向き）。物語：壊れてから作られたもの。歪んでいて、組み上がりきっていない
export function mokoSprite() {
  const k = 'e|moko';
  let c = cache.get(k);
  if (c) return c;
  const size = CFG.enemy.moko.size + 12, m = size / 2, R = size * 0.4;
  c = mk(size, size, g => {
    // 左右非対称のいびつな輪郭
    const n = 11, rs = [1, 0.86, 1.05, 0.8, 0.97, 1.08, 0.78, 0.95, 1.02, 0.84, 0.93];
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, r = R * rs[i % n];
      const x = m + Math.cos(a) * r, y = m + Math.sin(a) * r * 0.9;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#7a5aa8'; g.fill();
    // 継ぎ当て（色の合わない板）
    g.fillStyle = '#a0875e'; g.fillRect(m + R * 0.05, m - R * 0.6, R * 0.5, R * 0.34);
    g.fillStyle = '#5c6b7a'; g.fillRect(m - R * 0.7, m + R * 0.2, R * 0.45, R * 0.3);
    // ボルト
    g.fillStyle = '#e6e0ff';
    for (const [x, y] of [[0.15, -0.55], [0.5, -0.55], [-0.62, 0.28], [-0.3, 0.45]])
      { g.beginPath(); g.arc(m + x * R, m + y * R, 2.2, 0, 7); g.fill(); }
    // 片目だけの大きなレンズ（左向き）
    g.fillStyle = '#fff'; g.beginPath(); g.arc(m - R * 0.35, m - R * 0.12, R * 0.3, 0, 7); g.fill();
    g.fillStyle = '#FF5C8A'; g.beginPath(); g.arc(m - R * 0.42, m - R * 0.12, R * 0.16, 0, 7); g.fill();
    // はみ出した配線
    g.strokeStyle = '#FFD54F'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m + R * 0.7, m + R * 0.3); g.quadraticCurveTo(m + R * 1.1, m + R * 0.5, m + R * 0.95, m + R * 0.85); g.stroke();
  });
  cache.set(k, c);
  return c;
}

// ---- アイテム ----
export function itemSprite(kind) {
  const k = 'i|' + kind;
  let c = cache.get(k);
  if (c) return c;
  c = mk(28, 28, g => {
    if (kind === 'kakera') {
      // かけら：小さなひし形
      g.beginPath(); g.moveTo(14, 4); g.lineTo(22, 14); g.lineTo(14, 24); g.lineTo(6, 14); g.closePath();
      g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      g.fillStyle = COL.YELLOW; g.fill();
      return;
    }
    const col = { way: '#3FA7F5', pow: '#F0503C', bomb: COL.ORANGE }[kind];
    g.fillStyle = '#fff'; roundRect(g, 1, 1, 26, 26, 8); g.fill();
    g.fillStyle = col;    roundRect(g, 4, 4, 20, 20, 6); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText({ way: 'W', pow: 'P', bomb: 'B' }[kind], 14, 15);
  });
  cache.set(k, c);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// 起動時に全部作る（以後は drawImage のみ）
export function prebuild() {
  for (const col of [COL.CYAN, COL.VIOLET, COL.PINK]) { bulletSprite(col, 5.5); needleSprite(col); }
  bulletSprite(COL.AQUA, 4);
  for (const r of [CFG.orb.rMid, CFG.orb.rBoss])
    for (let h = 0; h < HUES; h++) for (let cr = 0; cr < 4; cr++) orbSprite(r, h, cr);
  for (let g = 0; g < 4; g++) playerSprite(g);
  puniSprite();
  for (const k of ['way', 'pow', 'kakera', 'bomb']) itemSprite(k);
  mokoSprite(); byunSprite();
  return cache.size;
}
