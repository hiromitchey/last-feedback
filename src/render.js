// 描画パイプライン（技術設計書 9章）。論理座標は常に 960×540
import { CFG, COL } from './config.js';
import { state, particles } from './world.js';
import { input, touchButtons } from './input.js';
import * as S from './sprites.js';
import { fxRng } from './rng.js';

export let cv, ctx;
const FONT = '"Hiragino Maru Gothic ProN","BIZ UDPGothic","Meiryo",sans-serif';

export function initRender(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
  fit();
  addEventListener('resize', fit);
  buildBackground();
}

// 画面フィット。canvas の実ピクセルだけ dpr 倍し、論理座標は変えない
export function fit() {
  const s = Math.min(innerWidth / CFG.W, innerHeight / CFG.H);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.style.width = Math.floor(CFG.W * s) + 'px';
  cv.style.height = Math.floor(CFG.H * s) + 'px';
  cv.width = Math.round(CFG.W * s * dpr);
  cv.height = Math.round(CFG.H * s * dpr);
}

// ---- 背景（仮）：奥・中・手前の3層の点 + 灯りのない惑星。絵の差し替えは Step 12・18 ----
const layers = [];
function buildBackground() {
  const specs = [
    { n: 60, speed: 0.15, sz: [1, 2],  a: 0.35 },
    { n: 40, speed: 0.6,  sz: [2, 3],  a: 0.45 },
    { n: 14, speed: 1.0,  sz: [3, 5],  a: 0.25 },
  ];
  for (const sp of specs) {
    const pts = [];
    for (let i = 0; i < sp.n; i++) pts.push({ x: fxRng.rnd() * 1920, y: fxRng.rnd() * CFG.H, s: fxRng.range(sp.sz[0], sp.sz[1]) });
    layers.push({ ...sp, pts });
  }
}

function drawBackground() {
  ctx.fillStyle = '#171a2e';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  // 惑星（ずっと奥に見えている。夜側に灯りがひとつも無い）
  const px = 780 - (state.scroll * 0.02) % 40;
  ctx.fillStyle = '#23304a'; ctx.beginPath(); ctx.arc(px, 110, 86, 0, 7); ctx.fill();
  ctx.fillStyle = '#2d3d5c'; ctx.beginPath(); ctx.arc(px - 22, 96, 70, 0, 7); ctx.fill();
  ctx.fillStyle = '#171a2e'; ctx.beginPath(); ctx.arc(px + 40, 124, 72, 0, 7); ctx.fill();
  for (const L of layers) {
    ctx.fillStyle = `rgba(200,210,255,${L.a})`;
    const off = (state.scroll * L.speed) % 1920;
    for (const p of L.pts) {
      let x = p.x - off; if (x < -10) x += 1920;
      if (x > CFG.W + 10) continue;
      ctx.fillRect(x, p.y, p.s, p.s);
    }
  }
}

function blit(img, x, y, rot = 0, scale = 1) {
  const w = img.w * scale, h = img.h * scale;
  if (!rot) { ctx.drawImage(img, x - w / 2, y - h / 2, w, h); return; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function text(str, x, y, size, col, align = 'center', outline = '#2a2140') {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = outline;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = col; ctx.fillText(str, x, y);
}

export function render(debug) {
  const k = cv.width / CFG.W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (state.shake > 0) ctx.translate((fxRng.rnd() - 0.5) * state.shake, (fxRng.rnd() - 0.5) * state.shake);

  drawBackground();

  if (state.mode === 'title') { drawTitle(); drawTouchUI(); return; }

  // アイテム
  for (const it of state.items) {
    const blink = it.t > CFG.item.life - 120 && (it.t >> 3) & 1;
    if (!blink) blit(S.itemSprite(it.kind), it.x, it.y, it.kind === 'kakera' ? it.t * 0.1 : 0);
  }
  // パーティクル（fillRect。drawImage にしない）
  for (const p of particles) {
    if (!p.alive) continue;
    ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
  // 敵
  const spr = { puni: S.puniSprite(), moko: S.mokoSprite(), byun: S.byunSprite() };
  for (const e of state.enemies) {
    if (e.hitFlash) ctx.globalAlpha = 0.6;
    blit(spr[e.type], e.x, e.y, e.type === 'byun' ? e.ang - Math.PI : 0);
    ctx.globalAlpha = 1;
    // アイテムを持っている個体には目印（倒すと落とす）
    if (e.carry) blit(S.itemSprite(e.carry), e.x + e.r * 0.6, e.y - e.r - 8, 0, 0.62);
    if (e.glow > 0) drawCharge(e);
  }
  drawBoss();
  // レーザー（弾より下）
  for (const w of state.laserWarns) {
    ctx.globalAlpha = 0.35 + 0.35 * ((w.t >> 3) & 1);
    ctx.strokeStyle = COL.YELLOW; ctx.lineWidth = 2; ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.moveTo(0, w.y); ctx.lineTo(CFG.W, w.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  for (const l of state.lasers) {
    if (l.w <= 0) continue;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, l.y - l.w / 2 - 3, CFG.W, l.w + 6);
    ctx.fillStyle = COL.YELLOW; ctx.fillRect(0, l.y - l.w / 2, CFG.W, l.w);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(0, l.y - l.w * 0.12, CFG.W, l.w * 0.24);
  }
  // 敵弾（でか玉以外）
  for (const b of state.eBullets) {
    if (b.hp) continue;
    if (b.needle) blit(S.needleSprite(b.col), b.x, b.y, Math.atan2(b.vy, b.vx));
    else blit(S.bulletSprite(b.col, 5.5), b.x, b.y);
  }
  // でか玉（弾の中で一番上）
  for (const b of state.eBullets) {
    if (!b.hp) continue;
    const ratio = b.hp / b.maxhp;
    const crack = ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
    const hue = ((state.frame / 6) | 0) % S.ORB_HUES;
    blit(S.orbSprite(b.r, hue, crack), b.x, b.y, b.spin, b.hitFlash ? 1.08 : 1);
  }
  // 自弾
  const shot = S.needleSprite(COL.AQUA);
  for (const b of state.pBullets) blit(shot, b.x, b.y, b.ang);
  // 自機 + 判定円（常に最前面）
  drawPlayer();
  // 出現予告「▶」（右端。何にも隠されない）
  for (const w of state.warnings) {
    if ((w.t >> 2) & 1) continue;
    text('◀', CFG.W - 22, w.y, 26, '#FFD54F');
  }
  drawPopups();
  drawHUD();
  drawTouchUI();

  if (state.flash) {
    ctx.globalAlpha = state.flash.t / state.flash.max * 0.45;
    ctx.fillStyle = state.flash.col; ctx.fillRect(-20, -20, CFG.W + 40, CFG.H + 40);
    ctx.globalAlpha = 1;
  }
  if (debug?.hitbox) drawHitboxes();
  if (state.bossWarn > 0 && (state.bossWarn >> 3) & 1) {
    ctx.fillStyle = 'rgba(255,92,138,.18)'; ctx.fillRect(0, CFG.H / 2 - 50, CFG.W, 100);
    text('WARNING', CFG.W / 2, CFG.H / 2, 64, '#FF5C8A', 'center', '#fff');
  }
  if (state.mode === 'pause') overlay('PAUSE', 'クリック / タップ / Z でつづける');
  if (state.mode === 'continue') {
    const n = Math.max(0, Math.ceil(state.contT / 60) - 1);
    overlay('CONTINUE?', n + '　　クリック / タップ / Z でつづける');
  }
  if (state.mode === 'clear') {
    const r = state.bossResult;
    overlay('CLEAR（仮）', 'SCORE ' + Math.floor(state.score) + (r ? '　撃破 ' + r.sec.toFixed(1) + '秒' : '') + '　クリック / タップでタイトルへ');
  }
}

function drawBoss() {
  const b = state.boss;
  if (!b) return;
  // 撃破中は灯が消えていくように暗くする
  if (b.dying) ctx.globalAlpha = Math.max(0.25, 1 - b.dying / 240);
  const jit = b.trans > 0 ? Math.sin(b.trans * 0.8) * 6 : 0;   // のけぞり
  if (b.hitFlash) ctx.globalAlpha *= 0.75;
  blit(S.bossSprite(b.form), b.x + jit + 20, b.y);
  ctx.globalAlpha = 1;
  // 部位（本体の手前。狙える対象は見えていなければならない）
  for (const p of b.parts) {
    if (p.dead) continue;
    const ratio = p.hp / p.maxhp;
    const crack = ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
    blit(S.coreSprite(p.which, crack), p.x + jit, p.y, 0, p.hitFlash ? 1.08 : 1);
    if (p.glow > 0) drawCharge(p);
  }
  if (b.glow > 0) drawCharge({ x: b.x - 40, y: b.y, r: 40, glow: b.glow });
}

function drawCharge(e) {
  // 発射予告：発射元が光る＋「!」
  const t = e.glow / CFG.warn.shot;
  ctx.strokeStyle = COL.PINK; ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6 + t * 14, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1;
  text('!', e.x, e.y - e.r - 16, 20, COL.PINK, 'center', '#fff');
}

function drawPlayer() {
  const p = state.player;
  if (p.gradeFx > 0) {
    const t = 1 - p.gradeFx / 40;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = p.gradeFxCol || '#fff'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 20 + t * 120, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const blink = p.invincible > 0 && (p.invincible >> 2) & 1;
  if (!blink) blit(S.playerSprite(p.lv.way), p.x, p.y);
  // 判定円：薄いリングで常時表示
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, CFG.player.r, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,92,138,.85)';
  ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill();
  drawEnergy(p);
  if (state.bombFx > 0) {
    const t = 1 - state.bombFx / 40;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = COL.ORANGE; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 + t * 700, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// 【試験】エネルギーゲージ：自機の真下。満タンなら出さない
function drawEnergy(p) {
  const EN = CFG.energy;
  if (!EN.enabled || p.energy >= EN.max) return;
  const w = 44, h = 6, x = p.x - w / 2, y = p.y + 30;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#2a2140'; ctx.fillRect(x, y, w, h);
  const r = p.energy / EN.max;
  ctx.fillStyle = p.empty ? ((state.frame >> 2) & 1 ? '#FF5C8A' : '#FF9E3D') : r < 0.3 ? '#FF9E3D' : COL.AQUA;
  ctx.fillRect(x, y, w * r, h);
}

function drawPopups() {
  for (const p of state.popups) {
    let scale = 1;
    if (p.big) {
      // バウンドして出る（easeOutBack）
      const u = Math.min(1, p.t / 16) - 1, c = 2.2;
      scale = Math.max(0.05, 1 + (c + 1) * u * u * u + c * u * u);
    }
    ctx.globalAlpha = Math.min(1, (p.life - p.t) / 15);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(scale, scale);
    text(p.text, 0, 0, p.size, p.col);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const p = state.player;
  // レトロSTGのUIに擬態させる：左上に 047（物語）
  text('047', 22, 24, 18, '#fff', 'left');
  text('SCORE ' + String(Math.floor(state.score)).padStart(7, '0'), 110, 24, 18, '#fff', 'left');
  const hearts = p.lives >= 0 ? '♥'.repeat(Math.min(p.lives, 9)) : '';
  text(hearts, 340, 24, 18, COL.PINK, 'left');
  // ワイド（W）とパワー（P）の段階。四角は次の段階までに拾った数
  const row = (label, kind, col, gy, sub) => {
    const gx = 22, lv = p.lv[kind];
    text(label + (lv + 1), gx, gy, 18, col, 'left');
    if (lv < 3) {
      const need = CFG.lvCost[lv];
      for (let i = 0; i < need; i++) {
        ctx.fillStyle = '#fff'; ctx.fillRect(gx + 40 + i * 18, gy - 7, 14, 14);
        ctx.fillStyle = i < p.stock[kind] ? col : '#2a2140';
        ctx.fillRect(gx + 42 + i * 18, gy - 5, 10, 10);
      }
      text(sub, gx + 46 + need * 18, gy, 13, '#cfd6ff', 'left');
    } else text('MAX ' + sub, gx + 40, gy, 13, '#fff', 'left');
  };
  const S2 = CFG.shot;
  row('W', 'way', '#3FA7F5', CFG.H - 50, S2.ways[p.lv.way] + 'way');
  row('P', 'pow', '#F0503C', CFG.H - 24, '×' + S2.powMul[p.lv.pow].toFixed(1) + (p.lv.pow >= S2.pierceAt ? ' 貫通' : ''));
  if (state.seg) text(state.seg.name, CFG.W / 2, 24, 16, '#cfd6ff');
  if (state.autoShot) text('AUTO', CFG.W - 20, 24, 14, COL.AQUA, 'right');
  text('B×' + p.bombs, 200, CFG.H - 37, 18, '#FF9E3D', 'left');
  // ボスの体力（形態の区切り付き）とコア
  const b = state.boss;
  if (b && !b.entering) {
    const x = 300, y = 52, w = 360, h = 10;
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#2a2140'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ['#B388FF', '#4FC3F7', '#FF5C8A'][b.form - 1];
    ctx.fillRect(x, y, w * Math.max(0, b.hp) / b.maxhp, h);
    ctx.fillStyle = '#fff';
    for (const t of b.th) ctx.fillRect(x + w * t / b.maxhp - 1, y - 2, 2, h + 4);
    b.parts.forEach((p, i) => {
      const cx = x + w + 20 + i * 22;
      ctx.fillStyle = p.dead ? '#444' : (i === 0 ? COL.PINK : COL.CYAN);
      ctx.beginPath(); ctx.arc(cx, y + h / 2, 7, 0, 7); ctx.fill();
    });
  }
}

function drawTouchUI() {
  if (!input.touchUsed) return;
  for (const [name, b] of Object.entries(touchButtons)) {
    if (state.mode === 'title' && name !== 'auto') continue;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = name === 'auto' && state.autoShot ? COL.AQUA : '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.9;
    text(b.label, b.x, b.y, b.r > 40 ? 18 : 12, '#fff');
    ctx.globalAlpha = 1;
  }
}

function drawTitle() {
  text('ポップショット', CFG.W / 2, CFG.H / 2 - 50, 64, '#fff', 'center', '#FF5C8A');
  if ((state.frame >> 5) & 1)
    text('クリック / タップ / Z ではじめる', CFG.W / 2, CFG.H / 2 + 40, 22, '#FFD54F');
  const help = [
    'マウス：追従・左で撃つ・右でボム　キー：矢印で移動・Zで撃つ・Xでボム・Shiftで低速',
    'タッチ：ドラッグで移動・右下で撃つ　Q / AUTO：オートショット切替　F9：エネルギー切替（試験）',
  ];
  help.forEach((s, i) => text(s, CFG.W / 2, CFG.H - 70 + i * 26, 15, '#cfd6ff'));
}

function overlay(title, sub) {
  ctx.fillStyle = 'rgba(10,10,20,.55)'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  text(title, CFG.W / 2, CFG.H / 2 - 20, 52, '#fff', 'center', '#FF5C8A');
  text(sub, CFG.W / 2, CFG.H / 2 + 40, 20, '#FFD54F');
}

function drawHitboxes() {
  ctx.lineWidth = 1;
  const circle = (x, y, r, c) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };
  for (const e of state.enemies) circle(e.x, e.y, e.r, '#f00');
  for (const b of state.eBullets) circle(b.x, b.y, b.r, '#ff0');
  for (const b of state.pBullets) circle(b.x, b.y, 5, '#0f0');
  for (const it of state.items) circle(it.x, it.y, CFG.item.pickR, 'rgba(0,255,255,.4)');
  circle(state.player.x, state.player.y, CFG.player.r, '#0ff');
  const b = state.boss;
  if (b) { circle(b.x, b.y, b.r, '#f0f'); for (const p of b.parts) if (!p.dead) circle(p.x, p.y, p.r, '#f0f'); }
  for (const l of state.lasers) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(0, l.y - l.w * 0.34, CFG.W, l.w * 0.68); }
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.beginPath(); ctx.moveTo(CFG.player.xMax, 0); ctx.lineTo(CFG.player.xMax, CFG.H); ctx.stroke();
}

export function drawStats(lines) {
  ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, 44, 330, lines.length * 15 + 8);
  ctx.fillStyle = '#9f9';
  lines.forEach((l, i) => ctx.fillText(l, 14, 48 + i * 15));
}
