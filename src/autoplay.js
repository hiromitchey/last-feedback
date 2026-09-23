// 自動プレイ（デバッグ用）。描画なしで早回しして、通しの流れ・時間・例外を確かめる
// コンソールから： __pop.sim({ inv: true })  →  { log, errs, hits, end }
//   inv: 無敵 / energy: エネルギーあり / frames: 最大フレーム数 / route: 'body' | 'core'
import { CFG } from './config.js';
import { state } from './world.js';
import { input } from './input.js';

export function sim({ inv = false, energy = false, frames = 60 * 300, route = 'body' } = {}, startGame, step) {
  const s = state;
  const errs = [], log = [];
  startGame();
  s.autoShot = true; s.debugInvincible = inv;
  const energyWas = CFG.energy.enabled;
  CFG.energy.enabled = energy;
  let lastSeg = null, lastForm = 0, lastLv = '', lastLives = s.player.lives, lastBombs = s.player.bombs, lastLine = null, hits = 0;
  const at = () => (s.frame / 60).toFixed(1);
  for (let f = 0; f < frames; f++) {
    const p = s.player;
    if (s.mode === 'continue') {
      log.push(at() + ' CONTINUE');
      for (let k = 0; k < 40 && s.mode === 'continue'; k++) { input.tapped = true; step(); }
      continue;
    }
    if (s.mode !== 'play') { log.push(at() + ' ' + s.mode); break; }
    if (s.seg && s.seg.name !== lastSeg) { log.push(at() + ' ' + s.seg.name); lastSeg = s.seg.name; }
    const lv = p.lv.way + '/' + p.lv.pow;
    if (lv !== lastLv) { log.push(at() + ' W/P ' + lv); lastLv = lv; }
    if (p.lives < lastLives) { hits++; log.push(at() + ' HIT'); }
    lastLives = p.lives;
    if (p.bombs < lastBombs) log.push(at() + ' BOMB');
    lastBombs = p.bombs;
    if (s.boss && s.boss.form !== lastForm) { log.push(at() + ' 形態' + s.boss.form); lastForm = s.boss.form; }
    const line = s.logLine && s.logLine.parts.join('|');
    if (line && line !== lastLine) log.push(at() + ' 「' + line + '」');
    lastLine = line;

    // 狙い：アイテム > 敵・でか玉の高さ。ボス戦は本体（またはコア）。近い危険は上下によける
    let ty = CFG.H / 2, tx = 200;
    if (s.boss && !s.boss.entering) {
      const alive = s.boss.parts.filter(q => !q.dead);
      ty = route === 'core' && alive.length ? alive[0].y : s.boss.y;
      tx = 380;
    }
    const tgt = [...s.enemies.filter(e => e.x > p.x + 40), ...s.eBullets.filter(b => b.hp && b.x > p.x)].sort((a, b) => a.x - b.x)[0];
    if (tgt && (!s.boss || (tgt.hp && Math.abs(tgt.x - p.x) < 300))) ty = tgt.y;
    const it = s.items.find(i => i.x < 700 && i.x > 40);
    if (it) { ty = it.y; tx = Math.max(60, Math.min(600, it.x - 10)); }
    const away = (y, d) => { ty = p.y + (p.y < y ? -d : d); };
    for (const b of s.eBullets) { if (b.hp) continue; const dx = b.x - p.x; if (dx > -10 && dx < 100 && Math.abs(b.y - p.y) < 40) away(b.y, 80); }
    for (const w of s.laserWarns) if (Math.abs(w.y - p.y) < 60) away(w.y, 100);
    for (const q of s.phrases) {
      if (q.beam) { if (Math.abs(q.y0 - p.y) < 60) away(q.y0, 100); continue; }
      for (const c of q.chars) { const dx = c.x - p.x; if (!c.space && dx > -20 && dx < 120 && Math.abs(c.y - p.y) < 50) { away(c.y, 90); break; } }
    }
    for (const e of s.enemies) { const dx = e.x - p.x; if (dx > -20 && dx < 70 && Math.abs(e.y - p.y) < 45) away(e.y, 90); }
    input.mode = 'pointer'; input.tx = tx; input.ty = Math.max(30, Math.min(510, ty));
    try { step(); } catch (e) { errs.push(e.message + ' @' + at() + ' ' + (e.stack || '').split('\n')[1]); break; }
  }
  CFG.energy.enabled = energyWas;
  return { log, errs, hits, end: at() };
}
