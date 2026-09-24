// 効果音：ファミコン（APU）の音。BGM と同じ系統の音にそろえ、浮かないようにする。
// 矩形波（デューティ比 12.5 / 25 / 50%）・三角波・ノイズ（15bit LFSR の長周期／短周期）を使い、
// 音程と音量は実機と同じく 1/60 秒ごとに段々で書き換える（なめらかに変えない）。
// 明るいファンファーレは使わない。短く、乾いた音。
// 音声ファイルは持たない。BGM のポーズや読込に左右されないよう、効果音専用の AudioContext を使う。

const VOLUME_KEY = 'last-feedback.sfx-volume';
const MAX_VOICES = 20;
const OUTPUT_GAIN = 0.9;
const FRAME = 1 / 60;                         // 実機の音量・音程の書き換え単位
const clamp = value => Math.max(0, Math.min(1, value));
// 同じ音を続けて鳴らさない間隔（秒）。ショットと命中は間引いて、うるさくしない
// ショットは弾 2 発に 1 回（10 フレーム）鳴るように、ずれにくい間隔にしている
const cooldown = { shot: 0.15, hit: 0.14, enemy: 0.06, heavy: 0.12, pickup: 0.1, kakera: 0.05, boom: 0.2, orb: 0.08, pop: 0.05, bigboom: 0.3, type: 0.03 };
const last = new Map();
let ac = null, bus = null, echoIn = null, voices = 0;
// 残響を付けない音。命中は数が多く、響くとうるさい
const DRY = new Set(['hit', 'shot', 'type', 'enemy', 'warning', 'repairBuzz', 'bashi']);   // 敵撃破も軽く
let dry = false;
let kakeraChain = 0, kakeraAt = -Infinity;                          // かけらを続けて拾うと音が上がっていく
const waves = new Map();                      // デューティ比ごとの矩形波
const noiseBuf = {};                          // long / short の LFSR ノイズ

// 最初の操作（または試聴ボタン）の中で呼ぶ。自動再生制限への対応。
export function unlockSfx() {
  try {
    if (!ac) ac = new AudioContext();
    return ac.state === 'suspended' ? ac.resume() : Promise.resolve();
  } catch (error) {
    console.warn('効果音を有効にできませんでした。', error);
    return Promise.resolve();
  }
}

function savedVolume() {
  try {
    const value = localStorage.getItem(VOLUME_KEY);
    if (value !== null && Number.isFinite(Number(value))) return clamp(Number(value));
  } catch { /* 保存が使えなくても鳴らす */ }
  return 0.65;
}

let volume = savedVolume();
export function getSfxVolume() { return volume; }
export function setSfxVolume(value) {
  if (!Number.isFinite(value)) return;
  volume = clamp(value);
  if (bus) bus.gain.value = volume * OUTPUT_GAIN;
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* 今回の音量は変える */ }
}

// 出力：実機の出力と同じく高音を少し丸める。残響は echoIn に入れた音にだけ短く付ける
// （生の矩形波だけだと安っぽく聞こえるため。命中など細かい音には付けない）
function output() {
  if (!bus) {
    bus = ac.createGain();
    bus.gain.value = volume * OUTPUT_GAIN;
    let out = bus;
    if (ac.createBiquadFilter) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 9000;
      bus.connect(lp); out = lp;
    }
    out.connect(ac.destination);
    echoIn = ac.createGain();
    echoIn.connect(bus);
    if (ac.createDelay) {
      const delay = ac.createDelay(0.5), fb = ac.createGain(), wet = ac.createGain();
      delay.delayTime.value = 0.09; fb.gain.value = 0.25; wet.gain.value = 0.16;
      echoIn.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(bus);
    }
  }
  return dry ? bus : echoIn;
}

// ---- 音源 ----
// 矩形波：デューティ比 d のパルスをフーリエ級数で作る（倍音 64 まで）
function pulseWave(d) {
  if (waves.has(d)) return waves.get(d);
  const N = 64, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    const a = 2 / (n * Math.PI) * Math.sin(n * Math.PI * d);
    re[n] = a * Math.cos(n * Math.PI * d);
    im[n] = a * Math.sin(n * Math.PI * d);
  }
  const w = ac.createPeriodicWave ? ac.createPeriodicWave(re, im) : null;
  waves.set(d, w);
  return w;
}

// ノイズ：実機と同じ 15bit LFSR。long は「ザー」、short（93 ステップで一周）は金属っぽい「ジー」
function lfsrBuffer(short) {
  const key = short ? 'short' : 'long';
  if (noiseBuf[key]) return noiseBuf[key];
  const len = short ? 93 * 64 : 32767;
  const buf = ac.createBuffer(1, len, 44100);
  const data = buf.getChannelData(0);
  let r = 1;
  for (let i = 0; i < len; i++) {
    const fb = (r & 1) ^ ((r >> (short ? 6 : 1)) & 1);
    r = (r >> 1) | (fb << 14);
    data[i] = r & 1 ? -1 : 1;
  }
  return (noiseBuf[key] = buf);
}
// 実機のノイズ周期表（NTSC）。数字が大きいほど低い
const NOISE_PERIOD = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const noiseRate = p => (1789773 / NOISE_PERIOD[p]) / 44100;

// 1/60 秒ごとに値を書き換える（段々）
function steps(param, values, at) {
  values.forEach((v, i) => param.setValueAtTime(v, at + i * FRAME));
}
// 音量の列（0〜15）を実際の音量に。最後は必ず 0
const volSteps = (vols, level) => [...vols.map(v => (v / 15) * level), 0];

function voice(at, frames) {
  if (voices >= MAX_VOICES) return null;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.connect(output());
  voices++;
  return { g, end: at + frames * FRAME + 0.02 };
}

// 矩形波：hz（音程の列）と vol（音量の列 0〜15）を 1 フレームずつ
function pulse(duty, hz, vol, level = 0.22, delay = 0) {
  const at = ac.currentTime + delay;
  const v = voice(at, Math.max(hz.length, vol.length) + 1);
  if (!v) return;
  const osc = ac.createOscillator();
  const w = pulseWave(duty);
  if (w && osc.setPeriodicWave) osc.setPeriodicWave(w); else osc.type = 'square';
  steps(osc.frequency, hz, at);
  steps(v.g.gain, volSteps(vol, level), at);
  osc.connect(v.g);
  osc.onended = () => { voices--; osc.disconnect(); v.g.disconnect(); };
  osc.start(at);
  osc.stop(v.end);
}

// 三角波：実機では音量が無い（鳴るか止まるか）。低い「ドン」に使う
function tri(hz, frames, level = 0.3, delay = 0) {
  const at = ac.currentTime + delay;
  const v = voice(at, Math.max(hz.length, frames) + 1);
  if (!v) return;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  steps(osc.frequency, hz, at);
  v.g.gain.setValueAtTime(level, at);
  v.g.gain.setValueAtTime(0, at + frames * FRAME);
  osc.connect(v.g);
  osc.onended = () => { voices--; osc.disconnect(); v.g.disconnect(); };
  osc.start(at);
  osc.stop(v.end);
}

// ノイズ：period（周期表の番号の列）と vol（0〜15）を 1 フレームずつ
function noise(period, vol, level = 0.2, short = false, delay = 0) {
  const at = ac.currentTime + delay;
  const v = voice(at, Math.max(period.length, vol.length) + 1);
  if (!v) return;
  const src = ac.createBufferSource();
  src.buffer = lfsrBuffer(short);
  src.loop = true;
  if (src.playbackRate) steps(src.playbackRate, period.map(noiseRate), at);
  steps(v.g.gain, volSteps(vol, level), at);
  src.connect(v.g);
  src.onended = () => { voices--; src.disconnect(); v.g.disconnect(); };
  src.start(at);
  src.stop(v.end);
}

// よく使う形
const down = (from, n, k) => Array.from({ length: n }, (_, i) => from * Math.pow(k, i));   // 1 フレームごとに k 倍
const fade = (from, n) => Array.from({ length: n }, (_, i) => Math.round(from * (1 - i / n)));

export function playSfx(kind) {
  if (!ac || ac.state !== 'running' || volume === 0) return;
  const gap = cooldown[kind] ?? 0;
  if (ac.currentTime - (last.get(kind) ?? -Infinity) < gap) return;
  last.set(kind, ac.currentTime);
  dry = DRY.has(kind);
  if (kind === 'kakera') {
    kakeraChain = ac.currentTime - kakeraAt < 0.6 ? kakeraChain + 1 : 0;
    kakeraAt = ac.currentTime;
  }
  switch (kind) {
    case 'shot':            // ピシュン：頭に一瞬ノイズ、矩形波が段々に下がる。弾 2 発ぶんの長さ
      noise([0, 1], [9, 4], 0.1, true);
      pulse(0.25, [1760, 1568, 1397, 1245, 1109, 988, 932, 880], [11, 10, 8, 7, 5, 4, 2, 1], 0.15);
      break;
    case 'type':            // 文字送り：ピッ。短い矩形波 2 フレーム
      pulse(0.25, [1319, 1319], [9, 5], 0.1);
      break;
    case 'typeSlow':        // 最後の呼びかけ（ゆっくり）：低く、弱く、少し残響
      pulse(0.5, [659, 659, 622], [7, 5, 2], 0.08);
      break;
    case 'hit':             // カッ：低めのノイズが一瞬。響かせない
      noise([4, 6, 8], [9, 5, 2], 0.14);
      pulse(0.5, [196, 165], [5, 2], 0.08);
      break;
    case 'enemy':           // 敵の撃破：カシャッ。金属が割れる音を短く軽く、低いブザーは一瞬だけ
      noise([1, 2, 3], [12, 9, 5], 0.18, true);
      noise([4, 5, 6, 7, 8, 9], fade(11, 6), 0.22, false, 2 * FRAME);
      pulse(0.125, [196, 196, 175], [7, 4, 2], 0.1);
      break;
    case 'heavy':           // ドシャッ：大きいものが壊れる（約 0.5 秒）
      noise([2, 3], [15, 12], 0.22, true);
      noise(Array.from({ length: 30 }, (_, i) => Math.min(15, 7 + (i >> 2))), fade(15, 30), 0.32, false, 2 * FRAME);
      tri(down(180, 20, 0.9), 20, 0.36);
      break;
    case 'pop':             // 連鎖爆発の 1 つ：ボンッ
      noise([6, 8, 9, 10, 11, 11, 12, 12, 13, 13, 13, 14, 14, 14], fade(15, 14), 0.3);
      tri(down(150, 8, 0.85), 8, 0.3);
      break;
    case 'bigboom':         // 本体がはじける：バシャッ → ドドーン（約 1.3 秒、低い地鳴りが残る）
      noise([1, 2, 3], [15, 14, 12], 0.26, true);
      noise(Array.from({ length: 80 }, (_, i) => Math.min(15, 8 + (i >> 3))), fade(15, 80), 0.4, false, 2 * FRAME);
      tri(down(220, 40, 0.94), 40, 0.42);
      pulse(0.5, down(330, 24, 0.9), fade(9, 24), 0.12);
      break;
    case 'orb': {           // 虹の玉が割れる：パリンッ → 虹の粒が散るあいだ（約 0.6 秒）キラキラと下りていく
      noise([0, 1, 2, 3, 4], [14, 12, 9, 6, 3], 0.2, true);
      const sparkle = [3136, 2637, 2349, 2093, 1760, 1568, 1319, 1175, 1047];
      pulse(0.125, sparkle.flatMap(f => [f, f, f * 1.5, f]), sparkle.flatMap((_, i) => { const v = 12 - i; return [v, v, v - 2, v - 3]; }), 0.15);
      pulse(0.25, sparkle.flatMap(f => [f / 2, f / 2, f / 2, f / 2]), sparkle.flatMap((_, i) => { const v = 8 - (i >> 1); return [v, v - 1, v - 2, 0]; }), 0.1, 2 * FRAME);
      break;
    }
    case 'kakera': {        // かけらを拾う：ピロリッ。続けて拾うと 1 音ずつ上がる
      const up = Math.pow(2, Math.min(kakeraChain, 7) / 12);
      pulse(0.5, [988, 988, 1319, 1319, 1976, 1976, 1976, 1976].map(f => f * up), [11, 11, 11, 11, 10, 8, 5, 2], 0.14);
      break;
    }
    case 'pickup':          // 強化・ボムを拾う：ピピッ（強化が上がるときは level の音が続く）
      pulse(0.25, [1047, 1047, 1047, 0, 1568, 1568, 1568, 1568, 1568], [11, 10, 8, 0, 11, 10, 8, 5, 2], 0.15);
      break;
    case 'level': {         // 強化：ピロピロピロ↑。4 音の分散和音を 3 回、1 段ずつ上げて、最後に和音をドン
      const arp = [523, 659, 784, 1047];
      const seq = [0, 1, 2].flatMap(k => arp.map(f => f * Math.pow(2, k * 4 / 12))).flatMap(f => [f, f]);
      pulse(0.5, [...seq, ...Array(40).fill(1319)], [...seq.map(() => 11), ...fade(13, 40)], 0.14);
      pulse(0.25, [...seq.map(f => f / 2), ...Array(36).fill(988)], [...seq.map((_, i) => (i % 2 ? 6 : 9)), ...fade(11, 36)], 0.1, 2 * FRAME);
      tri([...seq.map(f => f / 4), ...Array(30).fill(165)], seq.length + 30, 0.2);
      noise([2, 2, 3, 3, 4, 5], [10, 8, 6, 4, 2, 1], 0.08, true, seq.length * FRAME);
      break;
    }
    case 'bomb':            // ドーン：ノイズが長く低く、三角波が落ちる
      noise(Array.from({ length: 60 }, (_, i) => Math.min(15, 7 + (i >> 3))), fade(15, 60), 0.38);
      tri(down(200, 40, 0.94), 40, 0.4);
      break;
    case 'damage':          // 被弾：音程が大きく落ちる
      pulse(0.5, down(880, 22, 0.9), fade(12, 22), 0.2);
      noise([9, 10, 11, 12, 13, 14], fade(12, 6), 0.22);
      break;
    case 'warning': {       // 警告：ビーーッ！ビーーッ！ビーーッ！（30 フレーム鳴って 10 休み ×3、約 2 秒）
      // 電磁ブザー風：短周期ノイズ（93 ステップで一周する金属っぽい音、約 200Hz）がジリジリした芯。
      // 同じ高さの細い矩形波を重ね、1 フレームごとにわずかに揺らして機械の震えを出す
      const P = 40, ON = 30, len = P * 3, pos = i => i % P;
      const vol = (a, b) => Array.from({ length: len }, (_, i) => (pos(i) === 0 ? a : pos(i) < ON ? b : 0));
      const jitter = [1, 1.012, 0.994, 1.008, 0.99, 1.004];
      noise(Array(len).fill(5), vol(15, 14), 0.1, true);                 // 音量は控えめに
      pulse(0.125, Array.from({ length: len }, (_, i) => 200 * jitter[i % jitter.length]), vol(12, 10), 0.07);
      for (const d of [0, P, P * 2]) tri(Array(ON).fill(100), ON, 0.11, d * FRAME);
      break;
    }
    case 'repairBuzz': {    // 自己修正中のブザー：ビー・ビー、　ビー・ビー、…を 4 回（約 3 秒、修正の 190 フレームに収める）
      // 警告と同じ電磁ブザーの音色・高さ。警告（長く 3 回）とは刻み方で聞き分ける
      // ビー 10 フレーム、ビーと同じ長さの間 10、ビー 10、しばらく休み 20（最後の休みは無音なので音は 180 フレームで終わる）
      const BEEP = 10, GAP = 10, REST = 20, P = BEEP * 2 + GAP + REST, len = P * 4, pos = i => i % P;
      const second = BEEP + GAP;
      const vol = (a, b) => Array.from({ length: len }, (_, i) => {
        const k = pos(i);
        return k === 0 || k === second ? a : (k < BEEP || (k >= second && k < second + BEEP)) ? b : 0;
      });
      const jitter = [1, 1.012, 0.994, 1.008, 0.99, 1.004];
      noise(Array(len).fill(5), vol(15, 14), 0.09, true);   // 約 200Hz のジリジリ
      pulse(0.125, Array.from({ length: len }, (_, i) => 200 * jitter[i % jitter.length]), vol(12, 10), 0.06);
      break;
    }
    case 'snap': {          // 母船の上の羽が折れる：ゴキッ → ゴゴ…と重く後ろに伸びる（約 0.7 秒）
      noise([12, 12, 13], [15, 15, 12], 0.34);                       // 重い「ゴ」
      noise([4, 5], [13, 8], 0.18, true, 3 * FRAME);                 // 硬いものが割れる「キッ」
      tri(down(120, 16, 0.9), 16, 0.5);                              // 太い芯。下がりながら止まる
      pulse(0.5, down(78, 14, 0.93), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1], 0.14);
      noise(Array.from({ length: 36 }, (_, i) => Math.min(15, 13 + (i >> 4))), fade(10, 36), 0.2, false, 5 * FRAME);   // ゴゴ…と残る
      break;
    }
    case 'signal': {        // 廃墟のアンテナに届いた電波：ホワン。ふくらんで、揺れながら消える（約 1.2 秒、残響あり）
      const N = 70;
      const hz = Array.from({ length: N }, (_, i) => (i < 8 ? 440 + 220 * i / 8 : 660 - 60 * (i - 8) / (N - 8)) * (1 + 0.012 * Math.sin(i * 0.9)));
      const vol = Array.from({ length: N }, (_, i) => Math.round(i < 6 ? 3 + i * 1.5 : 12 * (1 - (i - 6) / (N - 6))));
      pulse(0.5, hz, vol, 0.05);                                    // 小さめ（そのあとの文字送りの音を目立たせる）
      pulse(0.25, hz.map(f => f * 1.5), vol.map(v => Math.round(v * 0.5)), 0.03, 3 * FRAME);
      break;
    }
    case 'signalFly': {     // 廃墟へ電波が降りてくる間（240 フレーム）：ほよほよ。弱々しく小さく、揺れながら途切れそうになる
      const N = 240;
      const wob = i => 1 + 0.07 * Math.sin(i * 0.4) + 0.02 * Math.sin(i * 0.13);   // ほよほよ揺れる
      const hz = Array.from({ length: N }, (_, i) => 587 * (1 - 0.15 * i / N) * wob(i));   // 降りるにつれ少しずつ下がる
      const vol = Array.from({ length: N }, (_, i) => {
        const env = Math.min(1, i / 40, (N - i) / 50);
        return Math.round(10 * env * (0.5 + 0.5 * Math.sin(i * 0.4 + 1)));   // 揺れるたびに消えかける
      });
      pulse(0.5, hz, vol, 0.03);
      pulse(0.125, hz.map(f => f * 2.01), vol.map(v => Math.round(v * 0.4)), 0.012, 4 * FRAME);
      break;
    }
    case 'bashi': {         // 弾ける言葉の1文字が出る：バシッ。短く硬い（残響なし）
      noise([1, 2, 4, 6], [15, 11, 6, 2], 0.2, true);
      noise([6, 8, 10], [12, 7, 3], 0.18);
      pulse(0.5, [220, 150, 110], [10, 6, 2], 0.1);
      break;
    }
    case 'warp': {          // ワープ：ビューン。軽く、上がりっぱなしで抜けていく（最後に下がらない）
      // 大きさは背景の流れる速さ（sin で立ち上がって戻る、90 フレーム）に合わせる。高さは上がり続ける
      const N = 90, sp = Array.from({ length: N }, (_, i) => Math.sin(Math.PI * i / N));
      const hz = k => Array.from({ length: N }, (_, i) => 330 * k * Math.pow(2, 3 * (1 - Math.pow(1 - i / N, 2.2))));   // 約 330Hz → 2.6kHz
      const vol = m => sp.map(v => Math.round(m * (0.2 + 0.8 * v)));
      pulse(0.125, hz(1), vol(11), 0.11);
      pulse(0.125, hz(1.008), vol(7), 0.06, 2 * FRAME);                            // 少し遅れて重ね、軽いうねり
      noise(Array.from({ length: N }, (_, i) => Math.max(1, 6 - ((i / 15) | 0))), vol(7), 0.06, true);   // 高い風切り
      break;
    }
    case 'laser':           // ビーム：金属っぽいジーッ
      noise(Array(36).fill(3), fade(10, 36), 0.16, true);
      pulse(0.125, Array(24).fill(110), fade(8, 24), 0.1);
      break;
    case 'slam':            // 叩きつけ：ドスッ
      noise([10, 11, 12, 13, 14, 15, 15, 15], fade(15, 8), 0.3);
      tri(down(130, 10, 0.88), 10, 0.36);
      break;
    case 'repair':          // 自己修正：ガチャッ、ガチャッ
      for (const d of [0, 0.12, 0.24]) {
        noise([4, 6], [12, 4], 0.2, true, d);
        pulse(0.25, [330, 247], [8, 3], 0.12, d);
      }
      break;
    case 'boom':            // 爆発：ザザーン。ノイズが低くなりながら長く残る
      noise(Array.from({ length: 45 }, (_, i) => Math.min(15, 8 + (i >> 3))), fade(15, 45), 0.34);
      tri(down(130, 24, 0.93), 24, 0.34);
      break;
  }
}
