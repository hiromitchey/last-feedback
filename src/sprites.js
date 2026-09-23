// スプライトの事前生成とキャッシュ（技術設計書 9章）
// 毎フレームのグラデーション生成と shadowBlur は禁止。ここで一度だけ描いて以後 drawImage
import { COL, GRADE_COL, CFG } from './config.js';
import { RETRO_FONT } from './text.js';

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

// ---- ボス（左向き）：形態ごとに1枚。物語：自己改良の地層 ----
// 形態1 元の姿に近い・きれい / 形態2 継ぎ接ぎが増える / 形態3 原型をとどめていない
// 上下 ±90px にコア（コードで描く）が乗るので、上下に腕を出しておく
export function bossSprite(form) {
  const k = 'boss|' + form;
  let c = cache.get(k);
  if (c) return c;
  const W = 260, H = 300, m = { x: W / 2, y: H / 2 };
  c = mk(W, H, g => {
    g.lineJoin = 'round';
    const body = form === 1 ? '#E8ECF4' : form === 2 ? '#d5d2dc' : '#a79fb3';
    const dark = form === 3 ? '#4a3d5c' : '#5a6a88';
    // 上下の腕（コアの台座）
    const arm = sy => {
      g.beginPath();
      g.moveTo(m.x + 30, m.y + sy * 30);
      g.quadraticCurveTo(m.x + 10, m.y + sy * 95, m.x - 30, m.y + sy * 110);
      g.lineTo(m.x - 60, m.y + sy * 92);
      g.quadraticCurveTo(m.x - 20, m.y + sy * 70, m.x - 20, m.y + sy * 25);
      g.closePath();
    };
    for (const sy of [-1, 1]) {
      arm(sy); g.strokeStyle = '#fff'; g.lineWidth = 9; g.stroke();
      g.fillStyle = form === 3 && sy > 0 ? '#8d8398' : body; g.fill();
    }
    // 本体：左向きの流線形
    const hull = () => {
      g.beginPath();
      g.moveTo(m.x - 118, m.y);
      g.quadraticCurveTo(m.x - 90, m.y - 62, m.x + 10, m.y - 66);
      g.quadraticCurveTo(m.x + 100, m.y - 60, m.x + 112, m.y - 20);
      g.lineTo(m.x + 112, m.y + 20);
      g.quadraticCurveTo(m.x + 100, m.y + 60, m.x + 10, m.y + 66);
      g.quadraticCurveTo(m.x - 90, m.y + 62, m.x - 118, m.y);
      g.closePath();
    };
    hull(); g.strokeStyle = '#fff'; g.lineWidth = 10; g.stroke();
    g.fillStyle = body; g.fill();
    // 元の意匠：047 と同じ窓と帯（同じ作り手の証）
    g.fillStyle = dark;
    g.fillRect(m.x - 60, m.y + 14, 150, 12);
    g.fillStyle = '#4FC3F7';
    g.beginPath(); g.ellipse(m.x - 55, m.y - 14, 34, 20, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.ellipse(m.x - 66, m.y - 22, 11, 6, 0, 0, 7); g.fill();
    // 後ろのスラスター
    g.fillStyle = dark;
    for (const y of [-34, 0, 34]) { g.fillRect(m.x + 104, m.y + y - 8, 18, 16); }
    if (form >= 2) {
      // 継ぎ接ぎ：色の合わない板とボルト
      const patch = (x, y, w, h, col, rot) => {
        g.save(); g.translate(m.x + x, m.y + y); g.rotate(rot);
        g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = '#e6e0ff';
        for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(px * (w / 2 - 4), py * (h / 2 - 4), 2.2, 0, 7); g.fill(); }
        g.restore();
      };
      patch(20, -40, 46, 26, '#a0875e', 0.1);
      patch(60, 36, 40, 22, '#5c6b7a', -0.15);
      patch(-10, 88, 30, 20, '#8a6f9e', 0.3);
      if (form === 3) {
        patch(-20, -2, 54, 30, '#6d5c4a', -0.25);
        patch(40, -80, 36, 24, '#556070', 0.4);
        patch(-90, 20, 28, 34, '#7a6a55', 0.2);
      }
    }
    if (form === 3) {
      // 窓の割れ、はみ出した配線、欠けた装甲
      g.strokeStyle = '#2a2140'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(m.x - 70, m.y - 28); g.lineTo(m.x - 52, m.y - 12); g.lineTo(m.x - 40, m.y - 24); g.stroke();
      g.strokeStyle = '#FFD54F'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(m.x + 70, m.y + 50); g.quadraticCurveTo(m.x + 100, m.y + 90, m.x + 70, m.y + 110); g.stroke();
      g.strokeStyle = '#FF5C8A';
      g.beginPath(); g.moveTo(m.x + 90, m.y - 44); g.quadraticCurveTo(m.x + 130, m.y - 60, m.x + 118, m.y - 96); g.stroke();
      g.fillStyle = '#171a2e';
      g.beginPath(); g.moveTo(m.x + 30, m.y + 66); g.lineTo(m.x + 50, m.y + 48); g.lineTo(m.x + 70, m.y + 62); g.closePath(); g.fill();
    }
  });
  cache.set(k, c);
  return c;
}

// ---- 中ボス（左向き）：壊れてから生まれた歪んだもの。面を追うごとに歪む ----
// 1：少しだけ歪んだ試作品。047 に近い形。でも、どこかが合っていない
export function midSprite(kind) {
  const k = 'mid|' + kind;
  let c = cache.get(k);
  if (c) return c;
  if (kind === 2) { c = repairUnitSprite(); cache.set(k, c); return c; }
  if (kind === 3) { c = shapelessSprite(); cache.set(k, c); return c; }
  const size = 130;
  c = mk(size, size, g => {
    const m = size / 2;
    drawShip(g, size, '#d9d5e0', '#FF5C8A', -1);          // 窓の色が違う
    // 片側だけ曲がったヒレ
    g.save(); g.translate(m, m); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(size * 0.2, size * 0.18); g.lineTo(size * 0.42, size * 0.42); g.lineTo(size * 0.3, size * 0.44); g.closePath();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#9c95a8'; g.fill();
    // 合っていない板
    g.fillStyle = '#a0875e'; g.fillRect(-size * 0.02, -size * 0.2, size * 0.2, size * 0.1);
    g.fillStyle = '#e6e0ff';
    for (const [x, y] of [[0.0, -0.18], [0.16, -0.18], [0.0, -0.12], [0.16, -0.12]]) { g.beginPath(); g.arc(x * size + 2, y * size + 2, 1.8, 0, 7); g.fill(); }
    // ヒビ
    g.strokeStyle = '#2a2140'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-size * 0.15, size * 0.02); g.lineTo(-size * 0.05, size * 0.1); g.lineTo(size * 0.05, size * 0.06); g.stroke();
    g.restore();
  });
  cache.set(k, c);
  return c;
}

// ゆがみ（小さな壊れたもの）：いびつで、色が合っていない。番号は無い
export function guniSprite() {
  const k = 'e|guni';
  let c = cache.get(k);
  if (c) return c;
  const size = CFG.enemy.guni.size + 8, m = size / 2, R = size * 0.34;
  c = mk(size, size, g => {
    const rs = [1, 0.7, 1.15, 0.85, 1.05, 0.6, 1.1, 0.9];
    g.beginPath();
    rs.forEach((r, i) => {
      const a = i / rs.length * Math.PI * 2 + 0.3, x = m + Math.cos(a) * R * r, y = m + Math.sin(a) * R * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#6d5c8a'; g.fill();
    g.fillStyle = '#a0875e'; g.fillRect(m + R * 0.1, m - R * 0.7, R * 0.6, R * 0.45);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(m - R * 0.35, m + R * 0.05, R * 0.3, 0, 7); g.fill();
    g.fillStyle = '#FF5C8A'; g.beginPath(); g.arc(m - R * 0.42, m + R * 0.05, R * 0.14, 0, 7); g.fill();
  });
  cache.set(k, c);
  return c;
}

// 3：原型をとどめないもの。047型の翼、もこのレンズ、継ぎ当ての板が一つの塊にくっついている
function shapelessSprite() {
  const size = 170, m = size / 2, R = size * 0.34;
  return mk(size, size, g => {
    g.lineJoin = 'round';
    // 突き出た 047 型の翼（あちこちの向き）
    const wing = (x, y, rot, col) => {
      g.save(); g.translate(m + x, m + y); g.rotate(rot);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.9, -R * 0.25); g.lineTo(R * 0.75, R * 0.1); g.closePath();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); g.fillStyle = col; g.fill();
      g.restore();
    };
    wing(10, -30, -2.2, '#d9d5e0'); wing(20, 30, 2.0, '#FF9E3D'); wing(-20, 20, 2.8, '#C7D34A'); wing(30, -10, -0.4, '#d9d5e0');
    const rs = [1, 0.8, 1.2, 0.7, 1.1, 0.9, 1.25, 0.75, 1.05, 0.85];
    g.beginPath();
    rs.forEach((r, i) => {
      const a = i / rs.length * Math.PI * 2, x = m + Math.cos(a) * R * r, y = m + Math.sin(a) * R * r * 0.9;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#5a4a70'; g.fill();
    for (const [x, y, w, h, col, r] of [[5, -30, 40, 22, '#a0875e', 0.3], [-20, 18, 30, 26, '#5c6b7a', -0.4], [28, 22, 26, 18, '#8a6f9e', 0.6], [-30, -18, 22, 20, '#6d5c4a', 0.1]]) {
      g.save(); g.translate(m + x, m + y); g.rotate(r); g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    }
    // レンズがいくつも（数が合っていない）
    for (const [x, y, r, col] of [[-0.45, -0.1, 0.26, '#FF5C8A'], [0.1, 0.35, 0.16, '#FFD54F'], [-0.1, -0.55, 0.12, '#4FC3F7']]) {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(m + x * R, m + y * R, r * R, 0, 7); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(m + x * R - r * R * 0.2, m + y * R, r * R * 0.5, 0, 7); g.fill();
    }
    // はみ出した配線
    g.lineCap = 'round'; g.lineWidth = 3;
    g.strokeStyle = '#FFD54F'; g.beginPath(); g.moveTo(m + R * 0.8, m + R * 0.4); g.quadraticCurveTo(m + R * 1.3, m + R * 0.9, m + R * 1.0, m + R * 1.3); g.stroke();
    g.strokeStyle = '#FF5C8A'; g.beginPath(); g.moveTo(m + R * 0.6, m - R * 0.7); g.quadraticCurveTo(m + R * 1.2, m - R * 1.1, m + R * 1.3, m - R * 0.6); g.stroke();
  });
}

// 2：修理機（継ぎ接ぎの塊）。いびつな塊に、色の合わない板がいくつも貼られている
function repairUnitSprite() {
  const size = 150, m = size / 2, R = size * 0.38;
  return mk(size, size, g => {
    const rs = [1, 0.9, 1.06, 0.84, 1.0, 1.1, 0.86, 0.96, 1.04, 0.88, 0.95, 1.02];
    g.beginPath();
    rs.forEach((r, i) => {
      const a = i / rs.length * Math.PI * 2, x = m + Math.cos(a) * R * r, y = m + Math.sin(a) * R * r * 0.95;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#9a90a8'; g.fill();
    const plate = (x, y, w, h, col, rot) => {
      g.save(); g.translate(m + x, m + y); g.rotate(rot);
      g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = '#e6e0ff';
      for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(px * (w / 2 - 4), py * (h / 2 - 4), 2, 0, 7); g.fill(); }
      g.restore();
    };
    plate(10, -30, 40, 24, '#a0875e', 0.15);
    plate(28, 18, 34, 26, '#5c6b7a', -0.2);
    plate(-8, 34, 30, 18, '#7a5aa8', 0.35);
    plate(-24, -8, 26, 30, '#6d5c4a', -0.1);
    plate(40, -8, 22, 30, '#8a6f9e', 0.25);
    // 工具の腕（後ろ）
    g.strokeStyle = '#cfd3dc'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m + R * 0.8, m - R * 0.3); g.lineTo(m + R * 1.15, m - R * 0.75); g.lineTo(m + R * 1.3, m - R * 0.55); g.stroke();
    // 片目のレンズ（左向き）
    g.fillStyle = '#fff'; g.beginPath(); g.arc(m - R * 0.5, m - R * 0.05, R * 0.24, 0, 7); g.fill();
    g.fillStyle = '#FFD54F'; g.beginPath(); g.arc(m - R * 0.56, m - R * 0.05, R * 0.12, 0, 7); g.fill();
  });
}

// コア（部位）：白フチ + 原色 + 中心の光。HPでヒビ
export function coreSprite(which, crack) {
  const k = 'core|' + which + '|' + crack;
  let c = cache.get(k);
  if (c) return c;
  const r = CFG.boss.coreR, d = (r + 8) * 2, m = d / 2;
  const col = which === 'upper' ? COL.PINK : COL.CYAN;
  c = mk(d, d, g => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(m, m, r + 5, 0, 7); g.fill();
    g.fillStyle = '#2a2140'; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(m, m, r - 5, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(m, m, r * 0.32, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath(); g.ellipse(m - r * 0.4, m - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, 7); g.fill();
    if (crack) {
      g.strokeStyle = '#2a2140'; g.lineWidth = 2.5; g.lineCap = 'round';
      for (const [x1, y1, x2, y2] of CRACKS[crack]) {
        g.beginPath(); g.moveTo(m + x1 * r, m + y1 * r); g.lineTo(m + x2 * r, m + y2 * r); g.stroke();
      }
    }
  });
  cache.set(k, c);
  return c;
}

// ---- ボスの声の1文字：ドット風フォント。ふつうは白フチ＋弾の色、強調は反転（色フチ＋白） ----
// フォントの読み込みが終わったら作り直す（それまでは代用フォントで描いたものを使う）
export const GLYPH_SIZE = 24;
export function glyphSprite(ch, col, px = GLYPH_SIZE, invert = false) {
  const k = 'g|' + ch + '|' + col + '|' + px + '|' + (invert ? 1 : 0);
  let c = cache.get(k);
  if (c) return c;
  const d = Math.ceil(px * 1.2 + 10);
  const lw = Math.max(4, px * 0.26);
  c = mk(d, d, g => {
    g.font = `${px}px ${RETRO_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (invert) {
      g.strokeStyle = '#2a2140'; g.lineWidth = lw + 4; g.strokeText(ch, d / 2, d / 2 + 1);
      g.strokeStyle = col; g.lineWidth = lw; g.strokeText(ch, d / 2, d / 2 + 1);
      g.fillStyle = '#fff'; g.fillText(ch, d / 2, d / 2 + 1);
    } else {
      g.strokeStyle = '#fff'; g.lineWidth = lw; g.strokeText(ch, d / 2, d / 2 + 1);
      g.fillStyle = col; g.fillText(ch, d / 2, d / 2 + 1);
    }
  });
  cache.set(k, c);
  return c;
}

export function watchFont() {
  if (!document.fonts?.load) return;
  document.fonts.load(`${GLYPH_SIZE}px "DotGothic16"`, 'アイ').then(() => {
    // 文字を含む絵（声の文字・アイテムの W/P/B）を作り直す
    for (const k of [...cache.keys()]) if (k.startsWith('g|') || k.startsWith('i|')) cache.delete(k);
  }).catch(() => {});
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
    g.fillStyle = '#fff'; g.font = `16px ${RETRO_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
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
  for (let f = 1; f <= 3; f++) bossSprite(f);
  midSprite(1); midSprite(2); midSprite(3); guniSprite();
  for (const w of ['upper', 'lower']) for (let cr = 0; cr < 4; cr++) coreSprite(w, cr);
  watchFont();
  return cache.size;
}
