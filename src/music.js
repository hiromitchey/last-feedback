// chiptune-studio の曲をゲームの場面に合わせて鳴らす。
// AudioContext はブラウザの自動再生制限に合わせ、最初の操作で作る。
import { Chiptune } from './apu/index.js';

const SONG_URLS = {
  stage: new URL('./music/1面.json', import.meta.url),
  boss: new URL('./music/ボス.json', import.meta.url),
};
const VOLUME_KEY = 'last-feedback.bgm-volume';
const clampVolume = value => Math.max(0, Math.min(1, value));

function savedVolume() {
  try {
    const value = localStorage.getItem(VOLUME_KEY);
    if (value !== null && Number.isFinite(Number(value))) return clampVolume(Number(value));
  } catch { /* ストレージが使えなくても音は鳴らす */ }
  return 0.65;
}

let apu = null;
let ready = null;
let songs = null;
let wanted = null;
let playing = null;
let paused = false;
let volume = savedVolume();

export function getAudioContext() { return apu?.ac ?? null; }
export function getMusicVolume() { return volume; }

export function setMusicVolume(value) {
  if (!Number.isFinite(value)) return;
  volume = clampVolume(value);
  if (apu?.node) apu.setVolume(volume);
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* 保存不可でも今回の音量は変える */ }
}

async function loadSongs() {
  const entries = await Promise.all(Object.entries(SONG_URLS).map(async ([name, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return [name, await response.json()];
  }));
  return Object.fromEntries(entries);
}

function applyMusic() {
  if (!songs || !apu?.node) return;
  if (!wanted) {
    if (playing) apu.stop();
    playing = null;
    return;
  }
  if (paused) {
    if (apu.ac.state === 'running') apu.ac.suspend().catch(console.warn);
    return;
  }
  if (playing !== wanted) {
    const song = songs[wanted];
    const result = apu.play(song.channels, { chips: song.chips });
    if (result.errors.length) console.warn(`BGM「${song.name}」のMML`, result.errors);
    playing = wanted;
  }
  if (apu.ac.state === 'suspended') apu.ac.resume().catch(console.warn);
}

// pointerdown / keydown のイベント中に呼ぶ。非同期の読込完了前でも
// AudioContext の作成と resume はユーザー操作の中で始める。
export function unlockMusic() {
  if (ready) {
    if (apu?.ac?.state === 'suspended') apu.ac.resume().catch(console.warn);
    return;
  }
  apu = new Chiptune();
  const init = apu.init();
  if (apu.ac?.state === 'suspended') apu.ac.resume().catch(console.warn);
  ready = Promise.all([init, loadSongs()]).then(([, loaded]) => {
    songs = loaded;
    apu.setVolume(volume);
    applyMusic();
  }).catch(error => console.warn('BGMを読み込めませんでした。ゲームは無音で続行します。', error));
}

// track: 'stage' | 'boss' | null。ポーズは再生位置を保つ。
export function syncMusic(track, hold = false) {
  if (wanted === track && paused === hold) return;
  wanted = track;
  paused = hold;
  applyMusic();
}
