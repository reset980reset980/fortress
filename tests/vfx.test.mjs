import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectDirector } from '../src/vfx.js';

// Exercise event pooling/lifetime/resource ownership without pretending that a
// GL stub validates a GPU shader. tools/vfx-browser.html does the real GL check.
function createHarness({ reduced = false } = {}) {
  const calls = { draws: [], deleted: [], uploads: [], listeners: new Map() };
  let resourceId = 0;
  const constants = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
    'ARRAY_BUFFER', 'DYNAMIC_DRAW', 'STATIC_DRAW', 'ALIASED_POINT_SIZE_RANGE', 'BLEND',
    'CULL_FACE', 'LEQUAL', 'FLOAT', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'ONE',
    'POINTS', 'TRIANGLES', 'DEPTH_TEST'];
  const gl = Object.fromEntries(constants.map((name, i) => [name, i + 1]));
  gl.COLOR_BUFFER_BIT = 0x4000;
  gl.DEPTH_BUFFER_BIT = 0x0100;
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram',
    'bindBuffer', 'enable', 'disable', 'clearColor', 'clearDepth', 'depthFunc',
    'viewport', 'depthMask', 'clear', 'useProgram', 'uniform2f', 'uniform1f',
    'enableVertexAttribArray', 'disableVertexAttribArray', 'vertexAttribPointer', 'blendFunc']) gl[name] = () => {};
  gl.createShader = () => ({ id: resourceId++ });
  gl.createProgram = () => ({ id: resourceId++, attrs: new Map() });
  gl.createBuffer = () => ({ id: resourceId++ });
  gl.getShaderParameter = () => true;
  gl.getProgramParameter = () => true;
  gl.getAttribLocation = (program, name) => {
    if (!program.attrs.has(name)) program.attrs.set(name, program.attrs.size);
    return program.attrs.get(name);
  };
  gl.getUniformLocation = (_, name) => name;
  gl.getParameter = () => [1, 256];
  gl.deleteShader = () => {};
  gl.deleteProgram = (value) => calls.deleted.push(['program', value.id]);
  gl.deleteBuffer = (value) => calls.deleted.push(['buffer', value.id]);
  gl.bufferData = (_, data) => calls.uploads.push(typeof data === 'number' ? data : data.byteLength);
  gl.bufferSubData = (_, offset, data) => {
    assert.equal(offset, 0);
    assert.ok(data instanceof Float32Array);
    assert.ok(data.every(Number.isFinite), 'GPU uploads must contain finite coordinates/colors');
  };
  gl.drawArrays = (mode, offset, count) => calls.draws.push({ mode, offset, count });
  const media = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => media;
  const canvas = {
    width: 0, height: 0,
    getContext: () => gl,
    addEventListener: (name, listener) => calls.listeners.set(name, listener),
    removeEventListener: name => calls.listeners.delete(name),
  };
  const director = new EffectDirector(canvas);
  if (previousMatchMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = previousMatchMedia;
  return { director, canvas, calls, gl };
}

test('VFX unsupported contexts and invalid events remain safe', () => {
  for (const canvas of [null, { getContext: () => null }, { getContext: () => { throw new Error('disabled'); } }]) {
    const director = new EffectDirector(canvas);
    assert.equal(director.supported, false);
    assert.equal(director.emit('explosion', 50, 40), false);
    director.resize(400, 300, 2);
    director.update(1 / 60);
    director.render();
    director.clear();
    director.destroy();
  }
  const { director } = createHarness();
  assert.equal(director.emit('explosion', NaN, 50), false);
  assert.equal(director.emit('explosion', 50, Infinity), false);
  assert.equal(director.emit('unknown', 50, 50), false);
  assert.equal(director.activeCount, 0);
  director.destroy();
});

test('rapid explosions have a bounded particle pool and every effect expires', () => {
  const { director, canvas, calls, gl } = createHarness();
  director.resize(720, 450, 3);
  assert.equal(canvas.width, 1440);
  assert.equal(canvas.height, 900);
  for (let i = 0; i < 240; i++) {
    director.emit('explosion', i % 720, 330, { intensity: 2.5, color: '#ffb348' });
  }
  assert.ok(director.activeCount <= 456);
  director.update(1 / 60);
  director.render();
  assert.ok(calls.draws.some(call => call.mode === gl.TRIANGLES), 'rotating debris and waves render as triangles');
  assert.ok(calls.draws.some(call => call.mode === gl.POINTS), 'glow/spark particles render');
  for (let frame = 0; frame < 180; frame++) director.update(1 / 60);
  assert.equal(director.activeCount, 0);
  director.render();
  director.destroy();
});

test('all combat event variants render within low quality and reduced motion budgets', () => {
  for (const reduced of [false, true]) {
    const { director, canvas } = createHarness({ reduced });
    director.resize(390, 400, 3);
    director.setQuality('low');
    assert.equal(canvas.width, Math.round(390 * 1.25));
    for (const type of ['fire', 'muzzle', 'trail', 'impact', 'plasma', 'shield', 'heal', 'smoke', 'dust', 'victory']) {
      for (let i = 0; i < 12; i++) director.emit(type, 190, 280, { color: [84, 215, 255], angle: 0.6, intensity: 1.5 });
    }
    assert.ok(director.activeCount <= (reduced ? 132 : 148));
    director.update(.03);
    director.render();
    director.clear();
    assert.equal(director.activeCount, 0);
    director.destroy();
  }
});

test('context loss pauses emission, restoration recreates resources, teardown removes listeners', () => {
  const { director, calls } = createHarness();
  director.resize(800, 450, 1.5);
  director.emit('plasma', 400, 240);
  let prevented = false;
  calls.listeners.get('webglcontextlost')({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.equal(director.supported, false);
  assert.equal(director.activeCount, 0);
  assert.equal(director.emit('plasma', 400, 240), false);
  director.render();
  calls.listeners.get('webglcontextrestored')();
  assert.equal(director.supported, true);
  assert.equal(director.emit('plasma', 400, 240), true);
  director.render();
  director.destroy();
  assert.equal(calls.listeners.size, 0);
  assert.equal(calls.deleted.length, 5, 'two programs and three buffers are released');
  director.destroy();
  assert.equal(calls.deleted.length, 5, 'destroy is idempotent');
  assert.equal(director.supported, false);
});
