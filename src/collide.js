// 当たり判定。すべて円対円、sqrt なし、総当たり（技術設計書 8章）
import { CFG } from './config.js';
import { state, spawnParticle, popup } from './world.js';
import { damageEnemy } from './enemies.js';
import { bossTargetable, damagePart, damageBoss } from './boss.js';
import { damagePlayer, gainLevel } from './player.js';
import { scatter } from './items.js';
import { onOrbBroken } from './story.js';
import { fxRng } from './rng.js';

const hit = (a, b, ra, rb) => {
  const dx = a.x - b.x, dy = a.y - b.y, r = ra + rb;
  return dx * dx + dy * dy < r * r;
};

export let checks = 0;
const PB_R = 5;   // 自弾の判定半径

// 貫通弾は1体につき1回だけ。通常弾は当たったら消える
function consume(b, target) {
  if (b.pierce) {
    if (b.hitIds.has(target.id)) return false;
    b.hitIds.add(target.id);
  } else {
    b.alive = false;
  }
  return true;
}

function hitOrbs(b) {
  for (const o of state.eBullets) {
    if (!o.hp || !o.alive) continue;
    checks++;
    if (!hit(b, o, PB_R, o.r)) continue;
    if (!consume(b, o)) continue;
    o.hp -= b.dmg;
    o.hitFlash = 3;
    state.score += CFG.score.hit;
    if (o.hp <= 0) breakOrb(o);
    return !b.alive;
  }
  return false;
}

export function breakOrb(o) {
  o.alive = false;
  onOrbBroken(o);                       // 断片が1行出る
  state.score += CFG.score.orb;
  scatter('kakera', o.boss ? CFG.orb.kakeraBoss : CFG.orb.kakera, o.x, o.y, 1.6, 3.2);
  // ボスのでか玉は強化アイテムも1個。低い方の系統を落として立て直しやすくする
  if (o.boss) { const lv = state.player.lv; scatter(lv.pow < lv.way ? 'pow' : 'way', 1, o.x, o.y, 0, 2, 0); }
  for (let i = 0; i < 30; i++) {
    const a = fxRng.rnd() * Math.PI * 2, s = 2 + fxRng.rnd() * 5;
    spawnParticle(o.x, o.y, Math.cos(a) * s, Math.sin(a) * s, 20 + fxRng.rnd() * 25,
      `hsl(${(fxRng.rnd() * 360) | 0},90%,70%)`, 3 + fxRng.rnd() * 4);
  }
  state.shake = Math.max(state.shake, 4);
}

// 部位 → 本体。部位が生きていれば、部位に当たった弾はそこで吸われる
function hitBoss(b) {
  if (!bossTargetable()) return false;
  const boss = state.boss;
  for (const p of boss.parts) {
    if (p.dead) continue;
    checks++;
    if (!hit(b, p, PB_R, p.r) || !consume(b, p)) continue;
    damagePart(p, b.dmg);
    if (!b.alive) return true;
  }
  checks++;
  if (hit(b, boss, PB_R, boss.r) && consume(b, boss)) {
    damageBoss(b.dmg);
    return !b.alive;
  }
  return false;
}

function hitEnemies(b) {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    checks++;
    if (!hit(b, e, PB_R, e.r)) continue;
    if (!consume(b, e)) continue;
    damageEnemy(e, b.dmg);
    if (!b.alive) return;
  }
}

export function collide() {
  checks = 0;
  const p = state.player;

  // 1. 自弾 → でか玉 → ボス部位 → ボス本体 → 敵
  for (const b of state.pBullets) {
    if (!b.alive) continue;
    if (hitOrbs(b)) continue;
    if (hitBoss(b)) continue;
    hitEnemies(b);
  }

  // 2. 敵弾（でか玉含む）→ 自機
  for (const b of state.eBullets) {
    if (!b.alive) continue;
    checks++;
    if (hit(b, p, b.r, CFG.player.r)) { damagePlayer(); break; }
  }

  // 2b. ボスの声・ビーム → 自機。1文字ずつ（出てくる途中は小さい）。高さが遠い列は飛ばす
  words: for (const q of state.phrases) {
    if (q.beam) {
      // ビームは帯で当たる（横断する帯なので高さの差だけ見る）
      if (q.w > 6 && Math.abs(p.y - q.y0) < q.w * 0.34 + CFG.player.r) { damagePlayer(); break; }
      continue;
    }
    if (Math.abs(p.y - q.y0) > q.amp + 40) continue;
    for (const c of q.chars) {
      if (c.space || c.sc < 0.5) continue;
      checks++;
      if (hit(c, p, c.r * c.sc, CFG.player.r)) { damagePlayer(); break words; }
    }
  }

  // 3. 敵本体 → 自機（道中の主脅威）
  for (const e of state.enemies) {
    if (!e.alive) continue;
    checks++;
    if (hit(e, p, e.r, CFG.player.r)) { damagePlayer(); break; }
  }

  // 4. アイテム → 自機
  for (const it of state.items) {
    if (!it.alive || it.t < 10) continue;
    checks++;
    if (!hit(it, p, CFG.item.r, CFG.item.pickR)) continue;
    it.alive = false;
    if (it.kind === 'way' || it.kind === 'pow') {
      state.score += CFG.score.item;
      gainLevel(it.kind);
    } else if (it.kind === 'kakera') {
      state.score += CFG.score.kakera;
      popup('+' + CFG.score.kakera, it.x, it.y - 12, { size: 14, col: '#fff', life: 24 });
      const EN = CFG.energy;
      if (EN.enabled) {
        p.energy = Math.min(EN.max, p.energy + EN.kakera);
        if (p.empty) p.lockT -= EN.kakeraLock;
      }
    } else if (it.kind === 'bomb') {
      p.bombs = Math.min(p.bombs + 1, CFG.bomb.max);
      popup('ボム +1', it.x, it.y - 12, { size: 16, col: '#FF9E3D', life: 30 });
    }
  }
}
