const test = require("node:test");
const assert = require("node:assert/strict");
const { createEconomy, validateState } = require("../scripts/economy.js");
const { SAVE_KEY, SAVE_VERSION, createSaveStore } = require("../scripts/storage.js");

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const fresh = () => createEconomy({ now: () => 0 }).snapshot();

test("save round trip keeps fractions and stores only canonical versioned progress", () => {
  const storage = memoryStorage();
  const store = createSaveStore({ getStorage: () => storage });
  assert.equal(store.load().status, "empty");
  let time = 0;
  const game = createEconomy({ now: () => time });
  for (let i = 0; i < 60; i += 1) game.strike();
  game.purchase("apprentice");
  time = 777;
  const state = game.tick();
  assert.equal(store.save(state).ok, true);
  const record = JSON.parse(storage.values.get(SAVE_KEY));
  assert.deepEqual(record, { version: SAVE_VERSION, data: validateState(state) });
  const reopened = createSaveStore({ getStorage: () => storage }).load();
  assert.equal(reopened.status, "loaded");
  assert.equal(reopened.state.balanceMilli, 777);
  assert.deepEqual(createEconomy({ initialState: reopened.state, now: () => 99_000_000 }).tick(), state);
});

test("corrupt, inconsistent and unsupported saves are preserved until explicit reset", () => {
  const samples = ["{broken", JSON.stringify({ version: 99, data: fresh() }),
    JSON.stringify({ version: SAVE_VERSION, data: { ...fresh(), balanceMilli: -1 } })];
  for (const original of samples) {
    const storage = memoryStorage([[SAVE_KEY, original], ["another-app", "keep"]]);
    const store = createSaveStore({ getStorage: () => storage });
    assert.equal(store.load().status, "invalid");
    assert.equal(store.save(fresh()).ok, false);
    assert.equal(storage.values.get(SAVE_KEY), original);
    assert.equal(store.reset().ok, true);
    assert.equal(storage.values.has(SAVE_KEY), false);
    assert.equal(storage.values.get("another-app"), "keep");
    assert.equal(store.save(fresh()).ok, true);
  }
});

test("an unread or inaccessible save is never overwritten", () => {
  const storage = memoryStorage([[SAVE_KEY, "unknown"]]);
  const store = createSaveStore({ getStorage: () => storage });
  assert.equal(store.save(fresh()).reason, "unread");
  const originalRead = storage.getItem;
  storage.getItem = () => { throw new Error("Read denied"); };
  assert.equal(store.load().status, "unavailable");
  storage.getItem = originalRead;
  assert.equal(store.save(fresh()).reason, "unavailable");
  assert.equal(storage.values.get(SAVE_KEY), "unknown");
});

test("blocked storage getters do not prevent a playable in-memory session", () => {
  const store = createSaveStore({ getStorage: () => { throw new Error("SecurityError"); } });
  assert.equal(store.load().status, "unavailable");
  const game = createEconomy({ now: () => 0 });
  assert.equal(game.strike().balanceMilli, 1000);
  assert.equal(store.save(game.snapshot()).ok, false);
  assert.equal(store.reset().ok, false);
});

test("quota failures preserve the previous save and a later write can recover", () => {
  const storage = memoryStorage();
  const store = createSaveStore({ getStorage: () => storage });
  store.load();
  store.save(fresh());
  const original = storage.values.get(SAVE_KEY);
  const originalWrite = storage.setItem;
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const earned = createEconomy({ now: () => 0 }).strike();
  assert.equal(store.save(earned).reason, "unavailable");
  assert.equal(storage.values.get(SAVE_KEY), original);
  storage.setItem = originalWrite;
  assert.equal(store.save(earned).ok, true);
  assert.equal(store.load().state.strikes, 1);
});

test("failed reset preserves the original save and reports failure", () => {
  const storage = memoryStorage([[SAVE_KEY, "original"]]);
  storage.removeItem = () => { throw new Error("Removal denied"); };
  const store = createSaveStore({ getStorage: () => storage });
  store.load();
  assert.equal(store.reset().ok, false);
  assert.equal(storage.values.get(SAVE_KEY), "original");
  assert.equal(store.save(fresh()).ok, false);
});

test("invalid new state cannot replace a valid save", () => {
  const storage = memoryStorage();
  const store = createSaveStore({ getStorage: () => storage });
  store.load();
  store.save(fresh());
  const original = storage.values.get(SAVE_KEY);
  assert.equal(store.save({ ...fresh(), achievements: ["first-strike"] }).reason, "invalid-state");
  assert.equal(storage.values.get(SAVE_KEY), original);
});
