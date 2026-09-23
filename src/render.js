// 描画パイプライン（技術設計書 9章）。論理座標は常に 960×540
import { CFG, COL } from './config.js';
import { state, particles, planetXY } from './world.js';
import { input, touchButtons } from './input.js';
import * as S from './sprites.js';
import { fxRng } from './rng.js';
import { lineProgress, LIGHTS } from './story.js';
import { PART_COLORS } from './midboss.js';
import { HANG_ROT } from './boss.js';
import { RETRO_FONT, STORY } from './text.js';

// ボスの灯の位置（ボスの絵の中心からのずれ）
const BOSS_LIGHTS = [
  [-55, -14, '#4FC3F7'], [-100, 0, '#FFD54F'], [-30, -106, '#FF5C8A'],
  [-30, 106, '#4FC3F7'], [122, -34, '#FF9E3D'], [122, 34, '#FF9E3D'],
];

export let cv, ctx;
// 画面の文字はすべてドット風フォント（UIも）

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
  // 面が進むほど大きく見える（近づいている）
  const [px, py] = planetXY(), k = state.planet ?? 1;
  blit(S.planetSprite(), px, py, 0, 0.75 * k);
  drawSignals();
  // ワープ中は星が横に伸びて線になる
  const streak = state.warp ? Math.sin(Math.PI * Math.min(1, state.warp.t / CFG.warpFrames)) : 0;
  for (const L of layers) {
    ctx.fillStyle = `rgba(200,210,255,${Math.min(1, L.a + streak * 0.4)})`;
    const off = (state.scroll * L.speed) % 1920;
    const len = p => p.s + streak * 120 * L.speed;
    for (const p of L.pts) {
      let x = p.x - off; if (x < -10) x += 1920;
      if (x > CFG.W + 10) continue;
      ctx.fillRect(x, p.y, len(p), p.s);
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

function text(str, x, y, size, col, align = 'center', outline = '#2a2140', font = null) {
  ctx.font = `${size}px ${font || RETRO_FONT}`;
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
  if (state.mode === 'ending') { drawEnding(); return; }

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
  const spr = { puni: S.puniSprite(), moko: S.mokoSprite(), byun: S.byunSprite(), chibi: S.puniSprite(), guni: S.guniSprite() };
  const chibiScale = CFG.enemy.chibi.size / CFG.enemy.puni.size;
  for (const e of state.enemies) {
    if (e.hitFlash) ctx.globalAlpha = 0.6;
    const rot = e.type === 'byun' ? e.ang - Math.PI : e.type === 'guni' ? e.wob.rot : 0;
    blit(spr[e.type], e.x, e.y, rot, e.type === 'chibi' ? chibiScale : 1);
    // 船体番号（047 の前後。047 だけは無い）
    if (e.num) {
      const size = e.type === 'chibi' ? 7 : e.type === 'moko' ? 13 : 10;
      text(e.broken ? flicker(e.num) : e.num, e.x + 2, e.y + e.r * 0.55, size, '#fff', 'center', 'rgba(42,33,64,.8)', RETRO_FONT);
    }
    ctx.globalAlpha = 1;
    // アイテムを持っている個体には目印（倒すと落とす）
    if (e.carry) blit(S.itemSprite(e.carry), e.x + e.r * 0.6, e.y - e.r - 8, 0, 0.62);
    if (e.glow > 0) drawCharge(e);
  }
  drawBoss();
  drawMid();
  drawDebris();
  drawBooms();                  // 爆発はボスより手前
  // レーザー（弾より下）
  for (const w of state.laserWarns) {
    ctx.globalAlpha = 0.35 + 0.35 * ((w.t >> 3) & 1);
    ctx.strokeStyle = COL.YELLOW; ctx.lineWidth = 2; ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.moveTo(0, w.y); ctx.lineTo(CFG.W, w.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  // ボスの声・ビーム：言葉のかたまり。強調は大きく反転、言葉ごとに傾き、出てくるときに弾む
  for (const q of state.phrases) {
    if (q.beam) {
      if (q.w <= 0) continue;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, q.y0 - q.w / 2 - 3, q.srcX, q.w + 6);
      ctx.fillStyle = 'rgba(255,213,79,.55)'; ctx.fillRect(0, q.y0 - q.w / 2, q.srcX, q.w);
    }
    const s = q.beam ? Math.min(1, q.w / CFG.laser.width) : 1;
    for (const c of q.chars) {
      if (c.space || c.sc <= 0 || c.x < -40 || c.x > CFG.W + 40) continue;
      if (q.beam && c.x > q.srcX) continue;   // ボスの口より後ろは出さない
      blit(S.glyphSprite(c.ch, q.beam ? '#FF9E3D' : q.col, c.px, c.big), c.x, c.y, c.rot, c.sc * s);
    }
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
  drawStoryText();
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
}

function drawMid() {
  const m = state.mid;
  if (!m) return;
  // 崩れていくときは薄く、少しずつずれる
  if (m.dying) ctx.globalAlpha = Math.max(0, 1 - m.dying / 50);
  if (m.hitFlash) ctx.globalAlpha *= 0.75;
  const jx = m.dying ? (fxRng.rnd() - 0.5) * 6 : 0;
  // 瞬間移動の予告：移動先に残像
  if (m.ghost) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = 0.25 + 0.2 * ((state.frame >> 2) & 1);   // 点滅
    blit(S.midSprite(m.kind), m.x, m.ghost.y);
    ctx.globalAlpha = a;
  }
  if (m.glitch > 0) drawGlitch(S.midSprite(m.kind), m.x + jx, m.y);
  else blit(S.midSprite(m.kind), m.x + jx, m.y);
  // 化けた番号
  text(flicker(m.num), m.x + jx + 6, m.y + 34, 14, '#fff', 'center', 'rgba(42,33,64,.85)', RETRO_FONT);
  // 部品（修理機）。付け直すたびに色が変わる
  for (const p of m.parts) {
    if (!p.dead) drawPlate(p.x + jx, p.y, PART_COLORS[p.col], p.hp / p.maxhp, p.hitFlash);
    if (p.fly) drawPlate(p.fly.x, p.fly.y, PART_COLORS[(p.col + 1) % PART_COLORS.length], 1, 0);
    if (!p.dead && p.glow > 0) drawCharge(p);
  }
  ctx.globalAlpha = 1;
  if (m.glow > 0) drawCharge({ x: m.x - 20, y: m.y, r: 36, glow: m.glow });
}

// もげる羽：付け根を中心に回して、落ちた分だけずらす。a が無ければ付いたまま
function drawArm(form, side, cx, cy, a) {
  const img = S.bossSprite(form, side);
  if (!a) { blit(img, cx, cy); return; }
  const [rx, ry] = S.BOSS_ARM_ROOT[side];
  ctx.save();
  ctx.translate(cx + rx + a.x, cy + ry + a.y);
  ctx.rotate(a.rot);
  ctx.drawImage(img, -img.w / 2 - rx, -img.h / 2 - ry, img.w, img.h);
  ctx.restore();
}
// ヒビ：羽の付け根を走るジグザグ
function drawCrack(cx, cy, side, u) {
  const sy = side === 'up' ? -1 : 1;
  const [rx, ry] = S.BOSS_ARM_ROOT[side];
  const pts = [[-40, 0], [-24, 6], [-10, -5], [4, 6], [18, -4], [34, 3]];
  const n = Math.max(2, Math.round(pts.length * u));
  ctx.strokeStyle = '#1a1424'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(cx + rx + x, cy + ry + y * sy) : ctx.moveTo(cx + rx + x, cy + ry + y * sy)));
  ctx.stroke();
  ctx.strokeStyle = '#FFD54F'; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawDebris() {
  for (const d of state.debris) {
    ctx.globalAlpha = Math.min(1, (d.max - d.t) / 30);
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = '#fff'; ctx.fillRect(-d.w / 2 - 2, -d.h / 2 - 2, d.w + 4, d.h + 4);
    ctx.fillStyle = d.col; ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// 爆発：白い芯 → 黄色 → オレンジの火の玉が広がって消える。外側にリング
function drawBooms() {
  for (const b of state.booms) {
    const u = b.t / b.max, r = b.size * (0.3 + u * 0.9);
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = u < 0.2 ? '#fff' : u < 0.5 ? '#FFD54F' : '#FF9E3D';
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.35, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// 信号：光の粒と波紋が惑星へ（電波のように、文字は付けない）。届いたら小さな輪が広がって、それきり
function drawSignals() {
  for (const s of state.signals) {
    if (!s.hit) {
      const u = s.t / s.max, e = u * u * (3 - 2 * u);
      const x = s.x0 + (s.tx - s.x0) * e, y = s.y0 + (s.ty - s.y0) * e;
      const a = s.weak ? 0.45 : 0.8;
      for (let i = 0; i < 3; i++) {                 // 後ろに尾を引く
        const ue = Math.max(0, u - i * 0.04), ee = ue * ue * (3 - 2 * ue);
        ctx.globalAlpha = a * (1 - i * 0.3);
        ctx.fillStyle = '#9fe8ff';
        ctx.beginPath(); ctx.arc(s.x0 + (s.tx - s.x0) * ee, s.y0 + (s.ty - s.y0) * ee, s.weak ? 2 : 3 - i * 0.6, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = a * 0.6;                    // 波紋
      ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 6 + (s.t % 20), 0, 7); ctx.stroke();
    } else {
      // 届いた：輪が広がって消える。何も返ってこない
      const u = s.hit / 50;
      ctx.globalAlpha = (1 - u) * (s.weak ? 0.4 : 0.7);
      ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.tx, s.ty, 8 + u * 40, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// 化けた番号のちらつき：ときどき1文字が別の記号に入れ替わる（見た目だけ）
const FLICK = ['■', '?', '#', '_'];
function flicker(num) {
  if (fxRng.rnd() > 0.06) return num;
  const d = [...num];
  d[(fxRng.rnd() * d.length) | 0] = FLICK[(fxRng.rnd() * FLICK.length) | 0];
  return d.join('');
}

// ノイズ：絵を横の帯に切って、帯ごとに左右へずらす
function drawGlitch(img, x, y) {
  const n = 6, sh = img.height / n, lh = img.h / n;
  for (let i = 0; i < n; i++) {
    const dx = (fxRng.rnd() - 0.5) * 30;
    ctx.drawImage(img, 0, i * sh, img.width, sh, x - img.w / 2 + dx, y - img.h / 2 + i * lh, img.w, lh);
  }
}

// 部品の板：白フチ＋色＋ボルト＋砲口。HPでヒビ
function drawPlate(x, y, col, ratio, flashT) {
  const w = 48, h = 38;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6);
  ctx.fillStyle = flashT ? '#fff' : col; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#2a2140'; ctx.fillRect(x - w / 2 - 14, y - 5, 16, 10);     // 砲口（左向き）
  ctx.fillStyle = '#e6e0ff';
  for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x + px * (w / 2 - 6), y + py * (h / 2 - 6), 2.5, 0, 7); ctx.fill(); }
  if (ratio < 0.6) { ctx.strokeStyle = '#2a2140'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, y - 12); ctx.lineTo(x + 2, y); ctx.lineTo(x - 4, y + 12); ctx.stroke(); }
  if (ratio < 0.3) { ctx.beginPath(); ctx.moveTo(x + 8, y - 14); ctx.lineTo(x + 14, y + 4); ctx.stroke(); }
}

function drawBoss() {
  const b = state.boss;
  if (!b) return;
  // 撃破中は灯が消えていくように暗くする
  // 撃破後：灯が消えるほど暗くなる
  const lit = b.lights ?? LIGHTS;
  if (b.dying) ctx.globalAlpha = 0.4 + 0.6 * lit / LIGHTS;
  const jit = 0;
  if (b.hitFlash) ctx.globalAlpha *= 0.75;
  const form = b.drawForm ?? b.form;
  if (b.arms) {
    // 羽がもげる：胴体と、まだ付いている羽と、落ちていく羽を別々に描く
    // 羽は胴体より奥（元の絵でも羽が下）。落ちる羽は胴体の後ろをくぐる
    // ぶら下がっている羽だけは手前（折れているのが見えるように）
    const hanging = side => b.arms[side] && b.arms[side].hang;
    for (const side of ['up', 'down']) if (!hanging(side)) drawArm(form, side, b.x + 20, b.y, b.arms[side]);
    blit(S.bossSprite(form, 'body'), b.x + 20, b.y);
    for (const side of ['up', 'down']) if (hanging(side)) drawArm(form, side, b.x + 20, b.y, b.arms[side]);
  } else blit(S.bossSprite(form), b.x + jit + 20, b.y);
  ctx.globalAlpha = 1;
  for (const [side, c] of Object.entries(b.cracks || {}))
    if (!(b.arms && b.arms[side] && b.arms[side].t > 18 && !b.arms[side].hang)) drawCrack(b.x + 20, b.y, side, c / 30);
  // 灯（窓・スラスター・腕の先）。撃破後、ひとつずつ消える。折れたら半分ごとに付いていく
  BOSS_LIGHTS.forEach(([dx, dy, col], i) => {
    if (i >= lit) return;
    // 羽の先の灯は、羽と一緒に落ちて消える
    const side = dy < -90 ? 'up' : dy > 90 ? 'down' : null;
    const arm = side && b.arms && b.arms[side];
    if (arm && arm.t > 18 && !arm.hang) return;
    let x = b.x + jit + 20 + dx, y = b.y + dy;
    if (arm && arm.hang) {
      // ぶら下がった羽の先の灯：羽と一緒に回る
      const [rx, ry] = S.BOSS_ARM_ROOT[side], c = Math.cos(arm.rot), s = Math.sin(arm.rot);
      x = b.x + 20 + rx + (dx - rx) * c - (dy - ry) * s;
      y = b.y + ry + (dx - rx) * s + (dy - ry) * c;
    }
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(state.frame * 0.1 + i);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
  });
  // 部位（本体の手前。狙える対象は見えていなければならない）
  for (const p of b.parts) {
    if (p.dead) continue;
    const ratio = p.hp / p.maxhp;
    const crack = ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
    blit(S.coreSprite(p.which, crack), p.x + jit, p.y, 0, p.hitFlash ? 1.08 : 1);
    if (p.glow > 0) drawCharge(p);
  }
  if (b.glow > 0) drawCharge({ x: b.x - 40, y: b.y, r: 40, glow: b.glow });
  // 自己修正：飛んでくる板と「シュウセイ nカイメ」
  const R = b.repair;
  if (R) {
    for (const p of R.pieces) {
      if (R.t < p.t0 || p.landed) continue;
      ctx.fillStyle = '#fff'; ctx.fillRect(p.x - p.w / 2 - 2, p.y - p.h / 2 - 2, p.w + 4, p.h + 4);
      ctx.fillStyle = p.col; ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    }
    const n = Math.min([...R.label].length, Math.floor(R.t / 4));
    const a = R.t > REPAIR_TEXT_END ? Math.max(0, 1 - (R.t - REPAIR_TEXT_END) / 20) : 1;
    ctx.globalAlpha = a;
    text([...R.label].slice(0, n).join(''), b.x - 30, b.y - 150, 26, '#FFD54F', 'center', 'rgba(20,16,36,.9)');
    ctx.globalAlpha = 1;
  }
}
const REPAIR_TEXT_END = 170;

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
  text(hearts, 330, 24, 16, COL.PINK, 'left');
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
  if (state.seg) text(state.seg.name, 620, 24, 16, '#cfd6ff');
  if (state.autoShot) text('AUTO', CFG.W - 20, 24, 14, COL.AQUA, 'right');
  text('B×' + p.bombs, 200, CFG.H - 37, 18, '#FF9E3D', 'left');
  // ボスの体力（形態の区切り付き）とコア
  const md = state.mid;
  if (md && !md.entering) {
    const x = 300, y = 52, w = 360, h = 10;
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#2a2140'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#8d8398'; ctx.fillRect(x, y, w * Math.max(0, md.hp) / md.maxhp, h);
  }
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
  // 静かで寂しい物語なので、明るい色は使わない。白に暗い青の縁取り
  text('LAST FEEDBACK', CFG.W / 2, CFG.H / 2 - 50, 72, '#e8ecf4', 'center', '#1e2a44');
  if ((state.frame >> 5) & 1)
    text('クリック / タップ / Z ではじめる', CFG.W / 2, CFG.H / 2 + 40, 20, '#9aa6c4', 'center', '#10152a');
  const help = [
    'マウス：追従・左で撃つ・右でボム　キー：矢印で移動・Zで撃つ・Xでボム・Shiftで低速',
    'タッチ：ドラッグで移動・右下で撃つ　Q / AUTO：オートショット切替　F9：エネルギー切替（試験）',
  ];
  help.forEach((s, i) => text(s, CFG.W / 2, CFG.H - 70 + i * 26, 15, '#7d88a6', 'center', '#10152a'));
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
  for (const q of state.phrases) {
    if (q.beam) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(0, q.y0 - q.w * 0.34, CFG.W, q.w * 0.68); continue; }
    for (const c of q.chars) if (!c.space) circle(c.x, c.y, c.r * c.sc, '#ff0');
  }
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.beginPath(); ctx.moveTo(CFG.player.xMax, 0); ctx.lineTo(CFG.player.xMax, CFG.H); ctx.stroke();
}

export function drawStats(lines) {
  ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, 44, 330, lines.length * 15 + 8);
  ctx.fillStyle = '#9f9';
  lines.forEach((l, i) => ctx.fillText(l, 14, 48 + i * 15));
}

// ---- 物語の文字（レトロなフォント。戦いの邪魔をしない） ----
function drawStoryText() {
  const L = state.logLine;
  if (L) {
    const pr = lineProgress(L);
    ctx.globalAlpha = pr.alpha;
    text(pr.text, CFG.W / 2, L.y, L.size, '#fff', 'center', 'rgba(20,16,36,.9)', RETRO_FONT);
    ctx.globalAlpha = 1;
  }
  const M = state.mission;
  if (M) {
    // MISSION / イジョウヲ ハイジョセヨ（タイプライター）
    const a = Math.min(1, (200 - M.t) / 30);
    ctx.globalAlpha = Math.max(0, a);
    const [h, body] = STORY.mission;
    const n = Math.max(0, Math.floor((M.t - 30) / 5));
    text(h.slice(0, Math.min(h.length, Math.floor(M.t / 4))), CFG.W / 2, CFG.H / 2 - 24, 22, '#FFD54F', 'center', 'rgba(20,16,36,.9)', RETRO_FONT);
    text([...body].slice(0, n).join(''), CFG.W / 2, CFG.H / 2 + 16, 30, '#fff', 'center', 'rgba(20,16,36,.9)', RETRO_FONT);
    ctx.globalAlpha = 1;
  }
  if (state.blackout) {
    ctx.globalAlpha = Math.min(1, state.blackout.t / 90);
    ctx.fillStyle = '#000'; ctx.fillRect(-20, -20, CFG.W + 40, CFG.H + 40);
    ctx.globalAlpha = 1;
  }
}

// ---- 最後の一枚。止まった母船、残骸、灯りのない惑星。一台だけ、まだ動いている ----
function drawEnding() {
  const t = state.endT;
  ctx.fillStyle = '#07080f'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  // 星（動かない）
  for (const L of layers) {
    ctx.fillStyle = `rgba(200,210,255,${L.a * 0.7})`;
    for (const p of L.pts) if (p.x < CFG.W) ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  // 灯りのない惑星（大きく）
  blit(S.planetSprite(), 780, 160, 0, 1.6);
  // 止まった母船。継ぎ接ぎだらけ
  ctx.globalAlpha = 0.55;
  blit(S.bossSprite(3, 'body'), 640, 330);
  drawArm(3, 'up', 640, 330, { x: 0, y: 0, rot: HANG_ROT + Math.sin(t * 0.03) * 0.04 });   // 落ちそうなまま、ぶら下がっている
  drawArm(3, 'down', 600, 330, { x: 200, y: 90, rot: 0.9 });   // もげた羽が漂っている
  ctx.globalAlpha = 1;
  // 残骸：動かない船。番号が読める
  const wrecks = [[470, 110, 0.5], [860, 440, 2.4], [330, 470, -0.8], [560, 500, 1.2]];
  const puni = S.puniSprite();
  STORY.wrecks.forEach((num, i) => {
    const [x, y, r] = wrecks[i];
    ctx.globalAlpha = 0.5;
    blit(puni, x, y, r);
    ctx.globalAlpha = 0.8;
    text(num, x, y + 16, 11, '#cfd6ff', 'center', 'rgba(7,8,15,.9)', RETRO_FONT);
    ctx.globalAlpha = 1;
  });
  // 自機。船体に 047
  const py = 280 + Math.sin(t * 0.03) * 6;
  blit(S.playerSprite(state.player.lv.way), 250, py);
  text('047', 244, py + 15, 12, '#2a2140', 'center', 'rgba(255,255,255,.9)', RETRO_FONT);
  // フェードイン
  if (t < 120) { ctx.globalAlpha = 1 - t / 120; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CFG.W, CFG.H); ctx.globalAlpha = 1; }
}
