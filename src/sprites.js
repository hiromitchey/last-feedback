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
// part：'all' 全体 / 'body' 羽を除いた胴体 / 'up' 上の羽だけ / 'down' 下の羽だけ（撃破で羽がもげて落ちる）
// どれも同じ大きさ・同じ座標で描くので、重ねれば 'all' と同じになる
export const BOSS_ARM_ROOT = { up: [5, -35], down: [5, 35] };   // 羽の付け根（絵の中心からのずれ）
export const BOSS_WINDOW = { x: -55, y: -14 };                    // 青い窓（信号の発信源）
export function bossSprite(form, part = 'all') {
  const k = 'boss|' + form + '|' + part;
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
    const all = part === 'all', withBody = all || part === 'body';
    for (const sy of [-1, 1]) {
      if (!all && part !== (sy < 0 ? 'up' : 'down')) continue;
      arm(sy); g.strokeStyle = '#fff'; g.lineWidth = 9; g.stroke();
      g.fillStyle = form === 3 && sy > 0 ? '#8d8398' : body; g.fill();
    }
    // 羽の上の継ぎ接ぎは羽と一緒に落ちる
    const onArm = y => (y > 60 ? 'down' : y < -60 ? 'up' : null);
    const patchHere = y => all || (onArm(y) ? part === onArm(y) : withBody);
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
    if (!withBody) {
      if (form >= 2) drawPatches();
      return;
    }
    hull(); g.strokeStyle = '#fff'; g.lineWidth = 10; g.stroke();
    g.fillStyle = body; g.fill();
    // 元の意匠：047 と同じ窓と帯（同じ作り手の証）
    g.fillStyle = dark;
    g.fillRect(m.x - 60, m.y + 14, 150, 12);
    g.fillStyle = '#4FC3F7';
    g.beginPath(); g.ellipse(m.x + BOSS_WINDOW.x, m.y + BOSS_WINDOW.y, 34, 20, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.ellipse(m.x - 66, m.y - 22, 11, 6, 0, 0, 7); g.fill();
    // 後ろのスラスター
    g.fillStyle = dark;
    for (const y of [-34, 0, 34]) { g.fillRect(m.x + 104, m.y + y - 8, 18, 16); }
    if (form >= 2) drawPatches();
    function drawPatches() {
      // 継ぎ接ぎ：色の合わない板とボルト
      const patch = (x, y, w, h, col, rot) => {
        if (!patchHere(y)) return;
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

// ---- 背景の惑星：海・大陸・雲・大気。昼と夜の境目があり、夜側には灯りがひとつも無い（物語） ----
// 事前生成なのでグラデーションを使ってよい（毎フレームは作らない）
export const PLANET_R = 120;
export function planetSprite() {
  const k = 'planet';
  let c = cache.get(k);
  if (c) return c;
  const R = PLANET_R, pad = 24, d = (R + pad) * 2, m = d / 2;
  let seed = 0x47;                                     // 固定の形（ゲームの乱数は使わない）
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  c = mk(d, d, g => {
    // 大気の薄い光
    const glow = g.createRadialGradient(m, m, R * 0.95, m, m, R + pad);
    glow.addColorStop(0, 'rgba(120,190,255,.45)');
    glow.addColorStop(1, 'rgba(120,190,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(m, m, R + pad, 0, 7); g.fill();
    // 海
    g.save();
    g.beginPath(); g.arc(m, m, R, 0, 7); g.clip();
    const sea = g.createRadialGradient(m - R * 0.4, m - R * 0.3, R * 0.1, m, m, R);
    sea.addColorStop(0, '#4f8fd0'); sea.addColorStop(1, '#1d3f78');
    g.fillStyle = sea; g.fillRect(0, 0, d, d);
    // 大陸：いびつな塊をいくつか
    const land = (cx, cy, r, col) => {
      g.fillStyle = col; g.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2, rr = r * (0.65 + rnd() * 0.5);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.fill();
    };
    land(m - R * 0.35, m - R * 0.25, R * 0.38, '#5b8a4c');
    land(m - R * 0.1, m + R * 0.35, R * 0.3, '#7a8f52');
    land(m + R * 0.4, m - R * 0.1, R * 0.34, '#5b8a4c');
    land(m - R * 0.55, m + R * 0.25, R * 0.16, '#8a7a52');
    land(m + R * 0.15, m - R * 0.6, R * 0.2, '#6d8a50');
    // 雲の帯
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(m + (rnd() - 0.5) * R * 1.6, m + (rnd() - 0.5) * R * 1.6, R * (0.2 + rnd() * 0.3), R * 0.05, -0.3, 0, 7);
      g.fill();
    }
    // 街：昼側の大陸に、よく見れば分かる程度の灰色の点
    g.fillStyle = 'rgba(170,170,160,.3)';
    for (const [cx, cy] of [[-0.4, -0.25], [-0.25, -0.1], [-0.1, 0.35]]) {
      for (let i = 0; i < 5; i++) g.fillRect(m + (cx + (rnd() - 0.5) * 0.1) * R, m + (cy + (rnd() - 0.5) * 0.08) * R, 1.5 + rnd() * 2, 1.5 + rnd() * 1.5);
    }
    // 夜側：右下がすっぽり暗い。都市の灯りは、ひとつも無い
    const night = g.createLinearGradient(m - R * 0.1, m - R * 0.3, m + R * 0.7, m + R * 0.5);
    night.addColorStop(0, 'rgba(6,8,18,0)');
    night.addColorStop(0.35, 'rgba(6,8,18,.85)');
    night.addColorStop(1, 'rgba(6,8,18,.97)');
    g.fillStyle = night; g.fillRect(0, 0, d, d);
    g.restore();
    // 昼側の縁の光
    g.strokeStyle = 'rgba(170,220,255,.8)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(m, m, R, Math.PI * 0.55, Math.PI * 1.45); g.stroke();
  });
  cache.set(k, c);
  return c;
}

// ---- 廃墟の街：惑星の夜側の灯へズームした先。崩れたビル、瓦礫、錆びた受信アンテナ。灯りは無い ----
export const DISH_LIGHT = { x: 586, y: 236 };   // 受信アンテナの灯（動く部分は render が描く）
export function ruinsSprite() {
  const k = 'ruins';
  let c = cache.get(k);
  if (c) return c;
  const W = CFG.W, H = CFG.H;
  let seed = 0x3e5;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  c = mk(W, H, g => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070a14'); sky.addColorStop(1, '#161b2c');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(200,210,255,.5)';
    for (let i = 0; i < 70; i++) g.fillRect(rnd() * W, rnd() * H * 0.55, 1 + rnd(), 1 + rnd());
    // ビル：上が欠け、傾き、窓が割れている
    const building = (x, w, h, col, win, tilt) => {
      const base = H - 70;
      g.save(); g.translate(x + w / 2, base); g.rotate(tilt);
      g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h);
      const steps = 5;
      for (let i = 1; i <= steps; i++) g.lineTo(-w / 2 + w * i / steps, -h + (rnd() - 0.2) * h * 0.25);   // 崩れた上端
      g.lineTo(w / 2, 0); g.closePath();
      g.fillStyle = col; g.fill();
      g.strokeStyle = 'rgba(90,100,125,.5)'; g.lineWidth = 1; g.stroke();
      for (let yy = -h + 20; yy < -12; yy += 16)
        for (let xx = -w / 2 + 6; xx < w / 2 - 8; xx += 12) {
          const r = rnd();
          if (r < 0.25) continue;                                      // 窓ごと無い
          g.fillStyle = r < 0.45 ? '#07090f' : win;                    // 割れて真っ暗な窓
          g.fillRect(xx, yy, 6, 8);
        }
      g.restore();
    };
    // 奥の列
    for (let x = -20; x < W; x += 60 + rnd() * 40) building(x, 50 + rnd() * 40, 120 + rnd() * 140, '#10141f', '#161b28', (rnd() - 0.5) * 0.05);
    // 手前の列
    for (let x = -30; x < W; x += 90 + rnd() * 60) {
      if (x > 470 && x < 640) continue;                                // アンテナのところは空ける
      building(x, 70 + rnd() * 50, 90 + rnd() * 160, '#1a2031', '#232a3c', (rnd() - 0.5) * 0.12);
    }
    // 地面と瓦礫
    g.fillStyle = '#0c0f17'; g.fillRect(0, H - 70, W, 70);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = H - 70 + rnd() * 50, s = 6 + rnd() * 18;
      g.fillStyle = rnd() < 0.5 ? '#1e2434' : '#262c3c';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y - s * 0.4); g.lineTo(x + s * 1.3, y + s * 0.3); g.lineTo(x + s * 0.2, y + s * 0.4); g.closePath(); g.fill();
    }
    // 受信アンテナ：錆びた鉄塔の上に、欠けた皿
    const tx = 560, top = 270, bot = H - 70;
    g.strokeStyle = '#5a4a3e'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(tx - 34, bot); g.lineTo(tx - 6, top); g.moveTo(tx + 34, bot); g.lineTo(tx + 6, top); g.stroke();
    g.lineWidth = 1.5;
    for (let y = bot; y > top; y -= 26) {
      const hw = 34 - 28 * ((bot - y) / (bot - top)), hw2 = 34 - 28 * ((bot - y + 26) / (bot - top));
      g.beginPath(); g.moveTo(tx - hw, y); g.lineTo(tx + hw2, y - 26); g.moveTo(tx + hw, y); g.lineTo(tx - hw2, y - 26); g.stroke();
    }
    g.save(); g.translate(tx + 12, top - 16); g.rotate(-0.6);
    g.fillStyle = '#6d6f78';
    g.beginPath(); g.ellipse(0, 0, 58, 20, 0, Math.PI, Math.PI * 2 - 0.5); g.lineTo(0, 0); g.closePath(); g.fill();   // 皿（一部が欠けている）
    g.fillStyle = '#8a5a3c';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(-40 + rnd() * 70, -10 + rnd() * 8, 2 + rnd() * 3, 0, 7); g.fill(); }   // 錆
    g.strokeStyle = '#8a8c95'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -2); g.lineTo(18, -26); g.stroke();                                                          // 受信部の腕
    g.restore();
    // 垂れ下がったケーブル
    g.strokeStyle = '#2c2c34'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx + 4, top + 10); g.quadraticCurveTo(tx + 60, top + 120, tx + 30, bot - 10); g.stroke();
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
  midSprite(1); midSprite(2); midSprite(3); guniSprite(); planetSprite(); ruinsSprite();
  for (const w of ['upper', 'lower']) for (let cr = 0; cr < 4; cr++) coreSprite(w, cr);
  watchFont();
  return cache.size;
}
