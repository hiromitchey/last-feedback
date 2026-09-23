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
  grade: [
    { ways: 1, dmg: 2.0, pierce: false, spread: 0 },
    { ways: 3, dmg: 1.8, pierce: false, spread: 0.14 },
    { ways: 5, dmg: 1.6, pierce: false, spread: 0.14 },
    { ways: 7, dmg: 1.6, pierce: true,  spread: 0.14 },
  ],
  gradeCost: [2, 3, 4],
  scatterOnHit: 4,            // 被弾時にばら撒くパワー

  bullet: { cap: 30, orbWeight: 3, speedMax: 3.4, ringMax: 10, minGap: 64 },
  warn:   { shot: 30, laser: 80, spawn: 24 },

  enemy: {
    puni: { hp: 5,  r: 15, size: 48, speed: 2.6, score: 120 },
    moko: { hp: 50, r: 22, size: 80, score: 600 },
    byun: { hp: 12, r: 13, size: 44, score: 240 },
  },
  orb: { hpMid: 8, hpBoss: 20, rMid: 14, rBoss: 18, speed: 1.4, slowSpeed: 1.2, kakera: 3 },

  item: { r: 10, pickR: 30, drift: 1.2, life: 60 * 12 },

  score: { hit: 10, orb: 500, kakera: 200, item: 200, overPower: 600 },

  scroll: 2.0,

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
