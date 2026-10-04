/** Bounded-voice and audio lifecycle verification, without a browser or device. */
import assert from 'node:assert/strict';
import AudioDirector from '../src/audio.js';

class Param {
  constructor() { this.value = 0; this.changes = 0; }
  setValueAtTime(v) { this.value = v; this.changes++; }
  linearRampToValueAtTime(v) { this.value = v; this.changes++; }
  cancelAndHoldAtTime() {}
}
class Node {
  connect() {}
  disconnect() {}
}
class Context {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = new Node(); this.sources = []; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createGain() { return Object.assign(new Node(), { gain: new Param() }); }
  createStereoPanner() { return Object.assign(new Node(), { pan: new Param() }); }
  createDynamicsCompressor() {
    return Object.assign(new Node(), Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k => [k,new Param()])));
  }
  createBuffer(channels,length,sampleRate) {
    const data = Array.from({length:channels}, () => new Float32Array(length));
    return { duration: length/sampleRate, getChannelData: index => data[index] };
  }
  createBufferSource() {
    const source = Object.assign(new Node(), {
      playbackRate: new Param(), started: false, stopped: false,
      start(time) { this.started = true; this.startTime = time; },
      stop() { this.stopped = true; queueMicrotask(() => this.onended?.()); },
    });
    this.sources.push(source);
    return source;
  }
}

const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Intentional offline test'); };
globalThis.AudioContext = Context;
const audio = new AudioDirector();
assert.equal(audio.event('fire'),false,'Sound before gesture stays silent');
assert.equal(await audio.unlock(),true);
assert.equal(audio.stems.size,4,'All offline music fallbacks load');
assert.equal(audio.buffers.size,12);
assert.equal(new Set([...audio.stems.values()].map(s => s.source.startTime)).size,1,'Battle phase is shared');
const initialSources = audio.context.sources.length;
audio.setScene('battle');
audio.setIntensity(.8);
const automations = [...audio.stems.values()].map(s => s.gain.gain.changes);
for (let n=0;n<1000;n++) { audio.setScene('battle'); audio.setIntensity(.8); }
assert.equal(audio.context.sources.length,initialSources,'Frame calls never restart loops');
assert.deepEqual([...audio.stems.values()].map(s => s.gain.gain.changes),automations,'Frame calls do not queue duplicate fades');
assert.equal(audio.maxVoices,16);
for (let n=0;n<80;n++) {
  audio.context.currentTime = n*.031;
  audio.event(n%2 ? 'victory' : 'defeat');
  assert.ok(audio.voices.length<=16,'Effect voice count is bounded');
}
assert.ok(audio.context.sources.some(s => s.stopped),'Old voices are released at the cap');
audio.setVolumes({master:2,music:-1,sfx:.4});
assert.deepEqual(audio.volumes,{master:1,music:0,sfx:.4});
audio.setMuted(true);
assert.equal(audio.event('fire'),false);
audio.setMuted(false);
audio.pause();
assert.equal(audio.context.state,'suspended');
assert.equal(audio.event('fire'),false);
await audio.resume();
assert.equal(audio.context.state,'running');
assert.equal(audio.stems.size,4,'Pause preserves stem lifetime');
audio.dispose();
assert.equal(audio.context.state,'closed');
assert.equal(audio.stems.size,0);
assert.equal(await audio.unlock(),false);

let decodeFailures = 0;
class OlderSafariContext extends Context {
  async decodeAudioData() { decodeFailures++; throw new Error('Vorbis decoder unavailable on this iOS version'); }
}
globalThis.AudioContext = OlderSafariContext;
globalThis.fetch = async () => ({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});
const safari = new AudioDirector();
assert.equal(await safari.unlock(),true,'Unsupported Ogg decoding gracefully uses native synth');
assert.equal(decodeFailures,12,'Every exported stem and effect reaches the decoder');
assert.equal(safari.buffers.size,12);
assert.equal(safari.stems.size,4);
assert.equal(safari.event('fire'),true,'Unsupported codecs preserve gameplay audio');
safari.context.state = 'interrupted';
assert.equal(await safari.unlock(),true,'An iOS-interrupted context is resumed');
assert.equal(safari.stems.size,4,'An interrupted context does not create replacement loops');
safari.dispose();
delete globalThis.AudioContext;
assert.equal(await new AudioDirector().unlock(),false,'Missing Web Audio remains safe');
globalThis.fetch = oldFetch;
console.log('PASS: gesture gate, offline/unsupported-iOS-codec synthesis, interruption recovery, stem phase, frame idempotence, 16-voice cap, volumes, mute, pause/resume and teardown');
