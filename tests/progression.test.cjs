const test = require("node:test");
const assert = require("node:assert/strict");
const { COIN, ACHIEVEMENTS, createEconomy, validateState } = require("../scripts/economy.js");

function strikeTimes(game, count) {
  for (let i = 0; i < count; i += 1) game.strike();
}

test("materials unlock at exact lifetime thresholds, including fractional passive income", () => {
  let time = 0;
  const game = createEconomy({ now: () => time });
  strikeTimes(game, 60);
  game.purchase("apprentice");
  time = 439_999;
  assert.equal(game.tick().materialIndex, 0);
  time += 1;
  assert.equal(game.tick().lifetimeEarnedMilli, 500 * COIN);
  assert.equal(game.snapshot().materialIndex, 1);
  assert.equal(game.purchase("forge").ok, true);
  assert.equal(game.snapshot().materialIndex, 1);
  assert.ok(game.snapshot().balanceMilli < 500 * COIN);
  time += 749_999;
  assert.equal(game.tick().materialIndex, 1);
  time += 1;
  assert.equal(game.tick().lifetimeEarnedMilli, 5000 * COIN);
  assert.equal(game.snapshot().materialIndex, 2);
});

test("one delayed tick can unlock the highest material and several achievements", () => {
  let time = 0;
  const game = createEconomy({ now: () => time });
  strikeTimes(game, 60);
  game.purchase("apprentice");
  time = 5_000_000;
  const state = game.tick();
  assert.equal(state.materialIndex, 2);
  assert.deepEqual(state.achievements, ["first-strike", "first-thousand", "master-pattern"]);
  assert.deepEqual(game.tick(), state);
  assert.equal(state.balanceMilli, 5000 * COIN); // Achievements grant no money.
});

test("hammer and anvil change appearance only at levels two and four", () => {
  const game = createEconomy({ now: () => 0 });
  strikeTimes(game, 5000);
  for (const id of ["hammer", "anvil"]) {
    assert.equal(game.snapshot().equipmentTiers[id], 0);
    for (const expectedTier of [0, 1, 1, 2, 2]) {
      assert.equal(game.purchase(id).ok, true);
      assert.equal(game.snapshot().equipmentTiers[id], expectedTier);
    }
  }
});

test("all six achievements unlock once at their respective conditions", () => {
  const game = createEconomy({ now: () => 0 });
  assert.deepEqual(game.snapshot().achievements, []);
  assert.deepEqual(game.strike().achievements, ["first-strike"]);
  strikeTimes(game, 98);
  assert.deepEqual(game.snapshot().achievements, ["first-strike"]);
  assert.ok(game.strike().achievements.includes("steady-rhythm"));
  strikeTimes(game, 899);
  assert.ok(!game.snapshot().achievements.includes("first-thousand"));
  assert.ok(game.strike().achievements.includes("first-thousand"));
  strikeTimes(game, 3999);
  assert.ok(!game.snapshot().achievements.includes("master-pattern"));
  assert.ok(game.strike().achievements.includes("master-pattern"));
  for (let i = 0; i < 3; i += 1) game.purchase("hammer");
  for (let i = 0; i < 2; i += 1) game.purchase("anvil");
  assert.ok(!game.snapshot().achievements.includes("equipped-forge"));
  assert.ok(game.purchase("anvil").state.achievements.includes("equipped-forge"));
  game.purchase("forge");
  for (let i = 0; i < 4; i += 1) game.purchase("apprentice");
  assert.equal(game.snapshot().passiveIncome, 9);
  assert.ok(!game.snapshot().achievements.includes("working-forge"));
  game.purchase("apprentice");
  assert.deepEqual(game.snapshot().achievements, ACHIEVEMENTS.map(({ id }) => id));
  const complete = game.snapshot();
  assert.deepEqual(game.tick(), complete);
  assert.equal(complete.lifetimeEarnedMilli, 5000 * COIN);
  complete.achievements.length = 0;
  assert.equal(game.snapshot().achievements.length, 6);
});

test("restoring preserves fractions and recomputes derived fields without offline rewards", () => {
  let time = 0;
  const first = createEconomy({ now: () => time });
  strikeTimes(first, 500);
  first.purchase("hammer");
  first.purchase("hammer");
  first.purchase("apprentice");
  time = 1234;
  const saved = first.tick();
  let nextTime = 90_000_000;
  const restored = createEconomy({
    now: () => nextTime,
    initialState: { ...saved, clickIncome: 999, passiveIncome: 999, materialIndex: 2, lastSettledAt: 0 },
  });
  assert.deepEqual(restored.tick(), saved);
  saved.levels.hammer = 5;
  assert.equal(restored.snapshot().levels.hammer, 2);
  nextTime += 766;
  const state = restored.tick();
  assert.equal(state.balanceMilli, 352 * COIN);
  assert.equal(state.lifetimeEarnedMilli, 502 * COIN);
  assert.equal(state.strikes, 500);
});

test("invalid or inconsistent saved data is rejected before it reaches the economy", () => {
  const fresh = validateState(createEconomy({ now: () => 0 }).snapshot());
  const invalid = [
    null, [], {},
    { ...fresh, balanceMilli: -1 },
    { ...fresh, lifetimeEarnedMilli: Infinity },
    { ...fresh, strikes: 0.5 },
    { ...fresh, strikes: 1 },
    { ...fresh, balanceMilli: Number.MAX_SAFE_INTEGER + 1 },
    { ...fresh, balanceMilli: 1 },
    { ...fresh, levels: { ...fresh.levels, hammer: 6 } },
    { ...fresh, levels: { ...fresh.levels, hammer: 1 } },
    { ...fresh, levels: { ...fresh.levels, unknown: 0 } },
    { ...fresh, levels: { hammer: 0 } },
    { ...fresh, achievements: ["unknown"] },
  ];
  const game = createEconomy({ now: () => 0 });
  const earned = game.strike();
  invalid.push({ ...earned, achievements: [] });
  invalid.push({ ...earned, achievements: ["first-strike", "first-strike"] });
  for (const state of invalid) {
    assert.throws(() => validateState(state), TypeError);
    if (state !== null) assert.throws(() => createEconomy({ initialState: state, now: () => 0 }), TypeError);
  }
});
