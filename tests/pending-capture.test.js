import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingCaptureStorage } from '../src/storage/pending-capture.js';
import { SESSION_KEYS } from '../src/constants.js';

function area() {
  const values = {};
  return {
    values,
    async get() { return structuredClone(values); },
    async set(next) { Object.assign(values, structuredClone(next)); },
    async remove(key) { delete values[key]; },
  };
}
test('session capture is consumed once and is not local user data', async () => {
  const session = area();
  const captures = createPendingCaptureStorage(session);
  await captures.save({ url: 'https://example.com/selected' });
  assert.equal((await captures.take()).input.url, 'https://example.com/selected');
  assert.equal(await captures.take(), null);
  assert.deepEqual(session.values, {});
});
test('expired and malformed pending captures are discarded', async () => {
  const session = area();
  const captures = createPendingCaptureStorage(session);
  for (const createdAt of [Date.now() - 10 * 60 * 1000, 'invalid', Date.now() + 10 * 60 * 1000]) {
    session.values[SESSION_KEYS.PENDING_CAPTURE] = { input: { url: 'https://example.com' }, createdAt };
    assert.equal(await captures.take(), null);
  }
});
test('a second capture arriving during consumption is not erased', async () => {
  const session = area();
  const captures = createPendingCaptureStorage(session);
  await captures.save({ url: 'https://example.com/first' });
  const first = captures.take();
  const savingSecond = captures.save({ url: 'https://example.com/second' });
  assert.equal((await first).input.url, 'https://example.com/first');
  await savingSecond;
  assert.equal((await captures.take()).input.url, 'https://example.com/second');
});
