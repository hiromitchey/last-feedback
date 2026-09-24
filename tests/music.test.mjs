import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('曲の切替・ポーズ・撃破後の停止', async () => {
  let context, node;
  const stored = new Map([['last-feedback.bgm-volume', '0.3']]);
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  globalThis.AudioContext = class {
    constructor() {
      context = this;
      this.state = 'suspended';
      this.audioWorklet = { addModule: async () => {} };
      this.destination = {};
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
  };
  globalThis.AudioWorkletNode = class {
    constructor() {
      node = this;
      this.messages = [];
      this.port = { postMessage: message => this.messages.push(message) };
    }
    connect() {}
  };
  globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) });

  const { unlockMusic, syncMusic, getMusicVolume, setMusicVolume } = await import('../src/music.js');
  assert.equal(getMusicVolume(), 0.3);
  syncMusic('stage');
  unlockMusic();
  for (let i = 0; i < 100 && !node?.messages.some(m => m.type === 'play'); i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(node.messages.filter(m => m.type === 'play').length, 1);
  assert.equal(node.messages.find(m => m.type === 'play').chips.length, 2);
  assert.equal(node.messages.find(m => m.type === 'gain').v, 0.3);

  setMusicVolume(0.42);
  assert.equal(node.messages.at(-1).v, 0.42);
  assert.equal(stored.get('last-feedback.bgm-volume'), '0.42');
  setMusicVolume(2);
  assert.equal(getMusicVolume(), 1);
  setMusicVolume(0);
  assert.equal(node.messages.at(-1).v, 0);

  syncMusic('stage');
  assert.equal(node.messages.filter(m => m.type === 'play').length, 1);
  syncMusic('boss');
  assert.equal(node.messages.filter(m => m.type === 'play').length, 2);

  syncMusic('boss', true);
  assert.equal(context.state, 'suspended');
  syncMusic('boss', false);
  assert.equal(context.state, 'running');
  assert.equal(node.messages.filter(m => m.type === 'play').length, 2);

  syncMusic(null);
  assert.equal(node.messages.at(-1).type, 'stop');
  syncMusic('stage');
  assert.equal(node.messages.filter(m => m.type === 'play').length, 3);
});
