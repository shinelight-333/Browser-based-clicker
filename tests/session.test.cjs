const test = require("node:test");
const assert = require("node:assert/strict");
const { COIN, createEconomy } = require("../scripts/economy.js");
const { createSaveStore } = require("../scripts/storage.js");

test("a full game survives reloading after each of the twenty purchases", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  let store = createSaveStore({ getStorage: () => storage });
  assert.equal(store.load().status, "empty");
  let time = 0;
  let game = createEconomy({ now: () => time });
  let spent = 0;
  let purchases = 0;
  let unlocked = [];

  for (let level = 1; level <= 5; level += 1) {
    for (const id of ["hammer", "anvil", "apprentice", "forge"]) {
      // Mix manual income and fractional passive income throughout the session.
      for (const elapsed of [137, 113, 271]) {
        time += elapsed;
        game.strike();
      }
      const price = game.snapshot().nextPrices[id];
      while (game.snapshot().balanceMilli < price * COIN) {
        const state = game.snapshot();
        if (state.passiveIncome > 0) {
          time += Math.ceil((price * COIN - state.balanceMilli) / state.passiveIncome);
          game.tick();
        } else {
          game.strike();
        }
      }

      const funded = game.snapshot();
      const result = game.purchase(id);
      assert.equal(result.ok, true);
      assert.equal(result.level, level);
      assert.equal(result.state.lifetimeEarnedMilli, funded.lifetimeEarnedMilli);
      spent += result.price * COIN;
      purchases += 1;
      assert.equal(result.state.lifetimeEarnedMilli - result.state.balanceMilli, spent);
      for (const achievement of unlocked) assert.ok(result.state.achievements.includes(achievement));
      unlocked = result.state.achievements;
      assert.equal(store.save(result.state).ok, true);

      // A new document has an unrelated clock; time between documents earns nothing.
      time = purchases * 100_000_000;
      store = createSaveStore({ getStorage: () => storage });
      const reopened = store.load();
      assert.equal(reopened.status, "loaded");
      game = createEconomy({ now: () => time, initialState: reopened.state });
      assert.deepEqual(game.tick(), result.state);
    }
  }

  const complete = game.snapshot();
  assert.equal(purchases, 20);
  assert.equal(spent, 11_470 * COIN);
  assert.deepEqual(complete.levels, { hammer: 5, anvil: 5, apprentice: 5, forge: 5 });
  assert.equal(complete.clickIncome, 16);
  assert.equal(complete.passiveIncome, 30);
  assert.equal(complete.materialIndex, 2);
  assert.deepEqual(complete.equipmentTiers, { hammer: 2, anvil: 2 });
  assert.equal(complete.achievements.length, 6);

  for (const id of ["hammer", "anvil", "apprentice", "forge"]) {
    assert.equal(game.purchase(id).reason, "max-level");
  }
  assert.deepEqual(game.snapshot(), complete);

  // A completed workshop remains playable after restoring its final save.
  time += 125;
  const continued = game.strike();
  assert.equal(continued.balanceMilli - complete.balanceMilli, 30 * 125 + 16 * COIN);
  assert.equal(continued.strikes, complete.strikes + 1);
  assert.equal(store.save(continued).ok, true);
});
