// シード付き xorshift32。Math.random は使わない（技術設計書 6章）
function makeRng(seedValue = 1) {
  let s = seedValue >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
  return {
    rnd,
    range: (a, b) => a + rnd() * (b - a),
    pick: a => a[(rnd() * a.length) | 0],
    seed: n => { s = n >>> 0 || 1; },
  };
}

export const gameRng = makeRng(0x2f1c);  // ロジック用。リプレイに影響する
export const fxRng   = makeRng(0x9e37);  // 演出用。乱数列を分けて汚さない
