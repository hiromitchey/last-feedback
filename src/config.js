// 全数値をここに集約する（技術設計書 1章）。調整はこのファイルだけを触る
export const DEBUG = true;

export const CFG = {
  W: 960, H: 540, FPS: 60, STEP: 1000 / 60,

  player: {
    speed: 5.2, slowSpeed: 2.4, r: 7,
    xMin: 30, xMax: 620, yMin: 30, yMax: 510,
    startX: 220, startY: 270,
    shotInterval: 5, shotSpeed: 14, invincible: 160,
    touchOffsetY: 60,
    size: 56,
  },
  // 強化は2系統（設計書の「グレード4段」から変更。PLAN.md）
  //   ワイド W：弾の数が増える   パワー P：1発のダメージが上がる。最大で貫通
  shot: {
    ways:    [1, 3, 5, 7],
    baseDmg: [2.0, 1.8, 1.6, 1.6],   // way数ごとの1発の基本ダメージ（増えるほど1発は軽く）
    powMul:  [1.0, 1.3, 1.6, 2.0],   // パワー段階ごとの倍率
    pierceAt: 3,                     // パワーがこの段階で貫通
    spread: 0.14,
  },
  lvCost: [1, 2, 2],          // 次の段階に上がるのに要る個数（両系統共通）
  scatterOnHit: 1,            // 被弾時に落とすアイテム（設計書は4。ぬるいので1に。PLAN.md）

  // 【試験】ショットのエネルギー。撃つと減り、撃たないと回復する。F9 でオン・オフ
  energy: {
    enabled: true,
    max: 100,
    cost: [1.0, 1.4, 1.8, 2.2],  // 1トリガーあたり（G1〜G4）。G1 は撃ちっぱなしで約8秒、G4 は約4秒
    regen: 1.2,                  // 撃っていないときの回復量/フレーム（空→満タン 約1.4秒）
    regenDelay: 10,              // 撃つのをやめてから回復が始まるまで
    lock: 180,                   // 切れたら撃てない時間（3秒）。その間にゲージが満タンまで戻る
    kakera: 12,                  // かけらを1個拾うと回復（でか玉1個で3個 = 36）
    kakeraLock: 30,              // 撃てない間に拾うと、待ち時間がこれだけ縮む
  },

  bullet: { cap: 30, orbWeight: 3, speedMax: 3.4, ringMax: 10, minGap: 64 },
  warn:   { shot: 30, laser: 80, spawn: 24 },

  enemy: {
    puni: { hp: 5,  r: 15, size: 48, speed: 2.6, score: 120 },
    moko: { hp: 50, r: 22, size: 80, speed: 2.4, score: 600, stay: 180, stopX: 780 },
    byun: { hp: 12, r: 13, size: 44, speed: 5.6, vy: 1.6, score: 240 },
    // ゆがみ：壊れてから作られた小さなもの。編隊を組まず、不規則に揺れたり止まったりする
    guni: { hp: 6, r: 14, size: 44, speed: 2.2, score: 150 },
    // 子機：母船の「ハイジョセヨ」で出てくる小さな兄弟機
    chibi: { hp: 2, r: 10, size: 30, speed: 2.8, score: 50, max: 10, count: [4, 5, 6] },
  },

  // 道中2区間。切り替えは「全滅」かつ「最低時間の経過」
  seg: {
    minFrames: 45 * 60,
    cap: [10, 16],            // 区間ごとの同時弾上限（道中A / 道中B）
    zeroMissBonus: 3000,
  },

  // ビーム：予告80fのあと、ボスの声が予告線の高さをまっすぐ速く飛んでくる
  laser: { warn: 80, fire: 150, width: 52, minGap: 80, textSpeed: 4, maxTextSize: 2.2 },
  // ボスの声（言葉のかたまり）。base は標準の文字の大きさ(px)、判定は文字の大きさ×hitRatio
  phrase: { base: 24, speed: 1.9, amp: 42, wavelength: 360, hitRatio: 0.3, max: 3,
    bigSpeed: 1.0, bigMul: 1.35,      // でっかい文字：ゆーっくり（{{}} 2.6 × 1.35 ≒ 84px）
    fastSpeed: 7.0, fastMul: 0.8 },   // 小さい文字：高速。原則2（ピンク上限3.4）の例外。発射予告あり（PLAN.md）

  boss: {
    // 体力は設計書の約2.2倍。強化2系統（W/P）の最大火力が設計書の G4 の約2倍になるため（PLAN.md）
    body: 6600, core: 1300, coreOffsetY: 90, bodyR: 64, coreR: 30,
    x: 760, formThresholds: [4400, 2200],
    cap: [20, 25, 30],                                  // 形態ごとの同時弾上限
    weaken: [[30 * 60, 1.3], [45 * 60, 1.6], [60 * 60, 2.0]],   // 形態3が長引くと発射間隔が伸びる
    coreScore: 5000, formBonus: 8000, killScore: 20000,
    timeBonus: { full: 20000, within: 90, perSec: 200 },
  },

  // 中ボス（面ごと）。倒すと母船の記録が出る
  midboss: { hp: [900, 1300, 1800], r: 44, x: 730, score: 10000,
    partR: 24, partHp: 220, partScore: 1000, repairWait: 240,
    teleWarn: 40 },                                               // 中ボス3の瞬間移動：残像を出してから跳ぶまで   // 修理機の部品（壊しても付け直される）

  bomb: { max: 6, invincible: 120, enemyDmg: 30, bossDmg: 80 },
  autoBomb: true,             // 被弾の瞬間、ボムが残っていれば自動で発動して打ち消す（既定ON）
  continueCount: 10,          // CONTINUE? のカウント（秒）
  orb: { hpMid: 8, hpBoss: 20, rMid: 14, rBoss: 18, speed: 1.4, slowSpeed: 1.2, kakera: 3, kakeraBoss: 5 },

  item: { r: 10, pickR: 30, drift: 1.2, life: 60 * 12 },

  score: { hit: 10, orb: 500, kakera: 200, item: 200, overPower: 600 },

  scroll: 2.0,
  warpFrames: 90,             // 面の区切りのワープ

  diff: {
    easy:   { speed: 0.8, count: 0.7, hp: 0.8, orbHp: 0.7, lives: 7, bombs: 4 },  // 既定
    normal: { speed: 1.0, count: 1.0, hp: 1.0, orbHp: 1.0, lives: 5, bombs: 3 },
  },

  touch: { btnSize: 180 },   // 右下のボタン領域
};

// 弾の色は速度の意味を持つ（設計書 原則2）
export const COL = {
  CYAN: '#4FC3F7', VIOLET: '#B388FF', PINK: '#FF5C8A', YELLOW: '#FFD54F',
  AQUA: '#7FFFD4', ORANGE: '#FF9E3D',
};

// 色ごとの許される速度帯（難易度係数を掛けた後の値で見るので下限は緩め）
export const SPEED_OK = {
  [COL.CYAN]:   s => s <= 2.0 + 1e-6,
  [COL.VIOLET]: s => s <= 2.2 + 1e-6,
  [COL.PINK]:   s => s <= 3.4 + 1e-6,
};

// グレードごとの色（演出・HUD）
export const GRADE_COL = ['#7FFFD4', '#4FC3F7', '#B388FF', '#FF5C8A'];
