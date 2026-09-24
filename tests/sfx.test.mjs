import test from 'node:test';
import assert from 'node:assert/strict';

test('効果音の発音間引き・音量保存・消音', async () => {
  let context;
  const oscillators = [];
  const stored = new Map([['last-feedback.sfx-volume', '0.4']]);
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  class Param {
    setValueAtTime(value) { this.value = value; }
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class Node {
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
  }
  globalThis.AudioContext = class {
    constructor() {
      context = this;
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'suspended';
      this.destination = {};
      this.audioWorklet = { addModule: async () => {} };
    }
    async resume() { this.state = 'running'; }
    createGain() { const node = new Node(); node.gain = new Param(); return node; }
    createOscillator() { const node = new Node(); node.frequency = new Param(); oscillators.push(node); return node; }
    createBuffer() { return { getChannelData: () => new Float32Array(48000) }; }
    createBufferSource() { return new Node(); }
    createBiquadFilter() { const node = new Node(); node.frequency = new Param(); return node; }
  };
  const { unlockSfx, getSfxVolume, setSfxVolume, playSfx } = await import('../src/sfx.js');
  assert.equal(getSfxVolume(), 0.4);
  await unlockSfx();
  playSfx('shot');
  assert.equal(oscillators.length, 1);
  playSfx('shot');
  assert.equal(oscillators.length, 1);
  context.currentTime = 0.19;
  playSfx('shot');
  assert.equal(oscillators.length, 2);

  setSfxVolume(0);
  assert.equal(stored.get('last-feedback.sfx-volume'), '0');
  context.currentTime = 1;
  playSfx('shot');
  assert.equal(oscillators.length, 2);
  setSfxVolume(1);
  playSfx('bomb');
  assert.equal(oscillators.length, 3);
});
