/** Fortress: Nova audio direction. All samples are original, editable synth assets.
 * Scene stems share one start time, run continuously, and crossfade on game events.
 */
const MUSIC = {
  menu: 'menu_ambient', base: 'battle_base', pulse: 'battle_pulse', danger: 'battle_danger',
};
const EFFECTS = ['fire', 'impact', 'shield', 'repair', 'ui', 'charge', 'victory', 'defeat'];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : lo));
const asset = name => new URL(`../assets/audio/${name}.ogg`, import.meta.url).href;

export class AudioDirector {
  constructor({ master = .8, music = .52, sfx = .8 } = {}) {
    this.volumes = { master: clamp(master), music: clamp(music), sfx: clamp(sfx) };
    this.muted = false;
    this.paused = false;
    this.scene = 'menu';
    this.intensity = .18;
    this.context = null;
    this.buffers = new Map();
    this.stems = new Map();
    this.voices = [];
    this.maxVoices = 16;
    this.lastEvents = new Map();
    this._loadPromise = null;
    this._disposed = false;
    this._resumeId = 0;
  }

  /** Call directly from pointerdown/click/keydown; safe to call more than once. */
  async unlock() {
    if (this._disposed) return false;
    try {
      if (!this.context) {
        const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Constructor) return false;
        this.context = new Constructor({ latencyHint: 'interactive' });
        const ctx = this.context;
        this.masterGain = ctx.createGain();
        this.musicGain = ctx.createGain();
        this.sfxGain = ctx.createGain();
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -6;
        this.limiter.knee.value = 8;
        this.limiter.ratio.value = 6;
        this.limiter.attack.value = .003;
        this.limiter.release.value = .18;
        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.limiter);
        this.limiter.connect(ctx.destination);
        this.masterGain.gain.value = this.muted ? 0 : this.volumes.master;
        this.musicGain.gain.value = this.volumes.music;
        this.sfxGain.gain.value = this.volumes.sfx;
      }
      if (!this.paused && this.context.state !== 'running' && this.context.state !== 'closed') {
        // Resume happens before awaiting any downloads, preserving gesture authorization.
        await this.context.resume();
      }
      if (!this._loadPromise) {
        this._loadPromise = this._load().then(() => {
          if (!this._disposed) this._startMusic();
        });
      }
      await this._loadPromise;
      return this.context.state === 'running';
    } catch {
      // A browser denying sound must never interrupt the game.
      return false;
    }
  }

  async _load() {
    const entries = [...Object.entries(MUSIC), ...EFFECTS.map(name => [name, name])];
    await Promise.all(entries.map(async ([key, filename]) => {
      try {
        const response = await fetch(asset(filename));
        if (!response.ok) throw new Error('Audio asset unavailable');
        const bytes = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(bytes);
        if (!this._disposed) this.buffers.set(key, buffer);
      } catch {
        if (!this._disposed) {
          this.buffers.set(key, key in MUSIC ? this._fallbackMusic(key) : this._fallbackEffect(key));
        }
      }
    }));
  }

  _startMusic() {
    if (this.stems.size || this._disposed) return;
    const when = this.context.currentTime + .06;
    for (const key of Object.keys(MUSIC)) {
      const buffer = this.buffers.get(key);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.musicGain);
      source.start(when);
      this.stems.set(key, { source, gain });
    }
    this._mix(1.1);
  }

  _ramp(param, value, seconds = .10) {
    if (!param || !this.context || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    // hold the actual interpolated value before replacing a transition
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      const held = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(held, now);
    }
    param.linearRampToValueAtTime(value, now + seconds);
  }

  _mix(seconds = .65) {
    const combat = this.scene === 'battle';
    const i = this.intensity;
    const values = {
      menu: combat ? 0 : .70,
      base: combat ? .65 : 0,
      pulse: combat ? .10 + .54 * i : 0,
      danger: combat ? .58 * clamp((i - .42) / .58) : 0,
    };
    for (const [key, stem] of this.stems) this._ramp(stem.gain.gain, values[key], seconds);
  }

  setScene(scene) {
    const next = scene === 'battle' ? 'battle' : 'menu';
    if (next === this.scene) return;
    this.scene = next;
    this._mix(1.25);
  }

  setIntensity(intensity) {
    const next = clamp(intensity);
    // Frame-loop callers do not create thousands of redundant gain automations.
    if (Math.abs(next - this.intensity) < .025) return;
    this.intensity = next;
    if (this.scene === 'battle') this._mix(.55);
  }

  setVolumes(values = {}) {
    for (const key of ['master', 'music', 'sfx']) {
      if (values[key] !== undefined) this.volumes[key] = clamp(values[key]);
    }
    this._ramp(this.masterGain?.gain, this.muted ? 0 : this.volumes.master);
    this._ramp(this.musicGain?.gain, this.volumes.music);
    this._ramp(this.sfxGain?.gain, this.volumes.sfx);
  }

  setMuted(muted = true) {
    this.muted = Boolean(muted);
    this._ramp(this.masterGain?.gain, this.muted ? 0 : this.volumes.master, .06);
  }

  /** Confirmed game events; optional { power: 0..1, pan: -1..1, volume: 0..1 }. */
  event(name, options = {}) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.paused || this.muted || this._disposed) return false;
    if (!EFFECTS.includes(name)) return false;
    if (typeof options === 'number') options = { power: options };
    const now = ctx.currentTime;
    const minGap = { ui: .045, charge: .20, impact: .055, fire: .055 }[name] || .03;
    if (now - (this.lastEvents.get(name) ?? -Infinity) < minGap) return false;
    this.lastEvents.set(name, now);
    let buffer = this.buffers.get(name);
    if (!buffer) {
      // Immediate first-click feedback while compressed assets are still decoding.
      buffer = this._fallbackEffect(name);
      this.buffers.set(name, buffer);
    }
    this.voices = this.voices.filter(voice => !voice.ended && voice.end > now);
    if (this.voices.length >= this.maxVoices) {
      const victim = this.voices.shift();
      this._stopVoice(victim);
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const power = clamp(options.power ?? .65);
    source.buffer = buffer;
    const rate = ['impact', 'fire'].includes(name) ? 1.09 - power * .18 : 1;
    source.playbackRate.value = rate;
    const level = { fire: .66, impact: .72, shield: .52, repair: .44, ui: .30,
      charge: .31, victory: .70, defeat: .62 }[name] * clamp(options.volume ?? 1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + .005);
    const duration = buffer.duration / rate;
    gain.gain.setValueAtTime(level, now + Math.max(.006, duration - .04));
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(gain);
    if (pan) {
      pan.pan.value = clamp(options.pan ?? 0, -1, 1);
      gain.connect(pan);
      pan.connect(this.sfxGain);
    } else gain.connect(this.sfxGain);
    const voice = { source, gain, pan, end: now + duration, ended: false };
    this.voices.push(voice);
    source.onended = () => {
      voice.ended = true;
      source.disconnect(); gain.disconnect(); pan?.disconnect();
      const index = this.voices.indexOf(voice);
      if (index >= 0) this.voices.splice(index, 1);
    };
    source.start(now);
    if (name === 'victory' || name === 'defeat') {
      // Leave the loop synchronized while giving the result fanfare room.
      this._ramp(this.musicGain.gain, this.volumes.music * .32, .12);
      const token = ++this._resumeId;
      clearTimeout(this._duckTimer);
      this._duckTimer = setTimeout(() => {
        if (!this._disposed && token === this._resumeId) this._ramp(this.musicGain.gain, this.volumes.music, 1);
      }, duration * 1000);
    }
    return true;
  }

  _stopVoice(voice) {
    if (!voice) return;
    voice.ended = true;
    try { voice.source.stop(); } catch { /* already ended */ }
    voice.source.disconnect(); voice.gain.disconnect(); voice.pan?.disconnect();
  }

  pause() {
    this.paused = true;
    if (this.context?.state === 'running') this.context.suspend().catch(() => {});
  }

  async resume() {
    this.paused = false;
    return this.unlock();
  }

  dispose() {
    this._disposed = true;
    this._resumeId++;
    clearTimeout(this._duckTimer);
    for (const voice of this.voices) this._stopVoice(voice);
    for (const stem of this.stems.values()) {
      try { stem.source.stop(); } catch { /* already stopped */ }
      stem.source.disconnect(); stem.gain.disconnect();
    }
    this.voices.length = 0;
    this.stems.clear(); this.buffers.clear();
    this.context?.close().catch(() => {});
  }

  _fallbackEffect(name) {
    const seconds = { fire: .44, impact: .85, shield: .55, repair: .7, ui: .12,
      charge: .7, victory: 2, defeat: 2 }[name] || .18;
    const sr = 24000;
    const buffer = this.context.createBuffer(2, Math.round(sr * seconds), sr);
    const data = buffer.getChannelData(0);
    let phase = 0, seed = 9137, low = 0;
    for (let n = 0; n < data.length; n++) {
      const t = n / sr;
      seed = (seed * 16807) % 2147483647;
      const noise = seed / 1073741823.5 - 1;
      low += .13 * (noise - low);
      let value;
      if (name === 'fire' || name === 'impact') {
        phase += (42 + (name === 'fire' ? 150 : 70) * Math.exp(-t * 14)) * Math.PI * 2 / sr;
        value = (.55 * Math.sin(phase) + low * .8 + noise * .20 * Math.exp(-t * 20)) * Math.exp(-t * (name === 'fire' ? 9 : 5));
      } else if (name === 'victory' || name === 'defeat' || name === 'repair') {
        const notes = name === 'defeat' ? [62, 60, 58, 50] : [62, 65, 69, 74, 77];
        const index = Math.min(notes.length - 1, Math.floor(t * (name === 'repair' ? 9 : 4)));
        const frequency = 440 * 2 ** ((notes[index] - 69) / 12);
        phase += frequency * Math.PI * 2 / sr;
        value = (Math.sin(phase) + .2 * Math.sin(phase * 2)) * .32 * Math.exp(-t * 1.6);
      } else {
        const frequency = name === 'shield' ? 720 + 400 * Math.exp(-t * 9)
          : name === 'charge' ? 110 + t * t * 900 : 880;
        phase += frequency * Math.PI * 2 / sr;
        value = Math.sin(phase) * .42 * (name === 'charge' ? t / seconds : Math.exp(-t * (name === 'ui' ? 35 : 7)));
      }
      const edge = Math.min(1, t / .004, (seconds - t) / .025);
      data[n] = value * Math.max(0, edge);
    }
    buffer.getChannelData(1).set(data);
    return buffer;
  }

  _fallbackMusic(key) {
    const sr = 24000, bpm = key === 'menu' ? 80 : 110, beat = 60 / bpm;
    const length = Math.round(32 * beat * sr);
    const buffer = this.context.createBuffer(2, length, sr);
    const chords = [[50,57,60,65],[46,53,58,62],[41,53,57,60],[45,52,57,61]];
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let n = 0; n < length; n++) {
        const t = n / sr, beats = t / beat;
        const chord = chords[Math.min(3, Math.floor(beats / 8))];
        let value = 0;
        if (key === 'menu' || key === 'base') {
          for (const note of chord) {
            const frequency = 440 * 2 ** ((note - 69) / 12);
            value += Math.sin(t * frequency * Math.PI * 2 * (channel ? 1.001 : 1)) * .04;
          }
          value *= Math.sin(Math.PI * (beats % 8) / 8) ** .35;
        } else {
          const step = Math.floor(beats * 2);
          const note = chord[step % 4] + (key === 'danger' ? 24 : 12);
          const frequency = 440 * 2 ** ((note - 69) / 12);
          const age = (beats * 2 % 1) * beat / 2;
          value = Math.sin(age * frequency * Math.PI * 2) * Math.exp(-age * 12) * .13;
          value *= Math.min(1, age * 350);
        }
        data[n] = value;
      }
    }
    return buffer;
  }
}

export default AudioDirector;
