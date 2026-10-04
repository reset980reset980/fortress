import test from 'node:test';

test('audio remains bounded and recoverable with blocked downloads, unsupported iOS codecs and interrupted contexts', async () => {
  await import('../tools/verify_audio.mjs');
});
