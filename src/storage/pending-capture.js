import { SESSION_KEYS, PENDING_CAPTURE_MAX_AGE } from '../constants.js';

export function createPendingCaptureStorage(area) {
  let tail = Promise.resolve();
  function enqueue(operation) {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }
  return {
    save(input) {
      return enqueue(() => area.set({
        [SESSION_KEYS.PENDING_CAPTURE]: { input, createdAt: Date.now() },
      }));
    },
    take() {
      return enqueue(async () => {
        const values = await area.get(SESSION_KEYS.PENDING_CAPTURE);
        const pending = values[SESSION_KEYS.PENDING_CAPTURE];
        // Serialize this read/removal with saves: a second capture must not be
        // erased between reading the first one and consuming it.
        await area.remove(SESSION_KEYS.PENDING_CAPTURE);
        const age = Date.now() - pending?.createdAt;
        return pending && age >= 0 && age < PENDING_CAPTURE_MAX_AGE ? pending : null;
      });
    },
  };
}
