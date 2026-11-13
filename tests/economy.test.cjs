const test = require("node:test");
const assert = require("node:assert/strict");
const { createEconomy, COIN } = require("../scripts/economy.js");

function session() {
  let time = 0;
  const game = createEconomy({ now: () => time });
  return { game, at: (value) => { time = value; } };
}

function strikeTimes(game, count) {
  for (let i = 0; i < count; i += 1) game.strike();
}

test("time alone earns nothing before the first passive upgrade", () => {
  const { game, at } = session();
  at(60_000);
  const state = game.tick();
  assert.equal(state.balanceMilli, 0);
  assert.equal(state.lifetimeEarnedMilli, 0);
  assert.equal(state.strikes, 0);
  assert.equal(state.clickIncome, 1);
  assert.equal(state.passiveIncome, 0);
});

test("an exact-price purchase spends only the balance and strengthens the next strike", () => {
  const { game } = session();
  strikeTimes(game, 29);
  const before = game.snapshot();
  assert.equal(game.purchase("hammer").reason, "insufficient-funds");
  assert.deepEqual(game.snapshot(), before);

  game.strike();
  const purchase = game.purchase("hammer");
  assert.equal(purchase.ok, true);
  assert.equal(purchase.price, 30);
  assert.equal(purchase.state.balanceMilli, 0);
  assert.equal(purchase.state.lifetimeEarnedMilli, 30 * COIN);
  assert.equal(purchase.state.nextPrices.hammer, 60);
  assert.equal(purchase.state.clickIncome, 2);

  const next = game.strike();
  assert.equal(next.balanceMilli, 2 * COIN);
  assert.equal(next.lifetimeEarnedMilli, 32 * COIN);
  assert.equal(next.strikes, 31);
});

test("consecutive purchases cannot reuse funds or the old price", () => {
  const { game } = session();
  strikeTimes(game, 60);
  assert.equal(game.purchase("hammer").ok, true);
  const second = game.purchase("hammer");
  assert.equal(second.reason, "insufficient-funds");
  assert.equal(second.state.levels.hammer, 1);
  assert.equal(second.state.balanceMilli, 30 * COIN);
  assert.equal(second.state.lifetimeEarnedMilli, 60 * COIN);
});

test("a return after a long gap settles the old rate before purchasing a new rate", () => {
  const { game, at } = session();
  strikeTimes(game, 60);
  game.purchase("apprentice");

  // No intermediate tick: equivalent to a suspended rendering loop in a hidden tab.
  at(200_000);
  const purchase = game.purchase("forge");
  assert.equal(purchase.ok, true);
  assert.equal(purchase.state.balanceMilli, 0);
  assert.equal(purchase.state.lifetimeEarnedMilli, 260 * COIN);
  assert.equal(purchase.state.passiveIncome, 6);

  at(201_000);
  const returned = game.tick();
  assert.equal(returned.balanceMilli, 6 * COIN);
  assert.equal(returned.lifetimeEarnedMilli, 266 * COIN);
  assert.equal(returned.strikes, 60);
  assert.deepEqual(game.tick(), returned);

  at(200_500);
  assert.deepEqual(game.tick(), returned);
  at(201_500);
  assert.equal(game.tick().balanceMilli, 9 * COIN);
});

test("fractional income is independent of how often the UI updates", () => {
  const frequent = session();
  const delayed = session();
  for (const { game } of [frequent, delayed]) {
    strikeTimes(game, 60);
    game.purchase("apprentice");
  }

  frequent.at(999);
  assert.equal(frequent.game.tick().balanceMilli, 999);
  assert.equal(frequent.game.purchase("hammer").reason, "insufficient-funds");
  for (let i = 9991; i <= 10_000; i += 1) {
    frequent.at(i / 10);
    frequent.game.tick();
  }
  delayed.at(1000);
  assert.deepEqual(frequent.game.snapshot(), delayed.game.tick());
  assert.equal(frequent.game.snapshot().balanceMilli, COIN);
});

test("all twenty purchases cost 11,470 coins and stop at level five", () => {
  const { game } = session();
  for (const id of ["hammer", "anvil", "apprentice", "forge"]) {
    for (let level = 1; level <= 5; level += 1) {
      const price = game.snapshot().nextPrices[id];
      while (game.snapshot().balanceMilli < price * COIN) game.strike();
      assert.equal(game.purchase(id).ok, true);
      assert.equal(game.snapshot().levels[id], level);
    }
  }

  const complete = game.snapshot();
  assert.equal(complete.clickIncome, 16);
  assert.equal(complete.passiveIncome, 30);
  assert.equal(complete.lifetimeEarnedMilli - complete.balanceMilli, 11_470 * COIN);
  for (const id of ["hammer", "anvil", "apprentice", "forge"]) {
    assert.equal(complete.nextPrices[id], null);
    assert.equal(game.purchase(id).reason, "max-level");
  }
  assert.deepEqual(game.snapshot(), complete);
});

test("reading a snapshot cannot mutate balances, prices or equipment", () => {
  const { game } = session();
  const state = game.snapshot();
  state.balanceMilli = 100_000 * COIN;
  state.levels.hammer = 5;
  state.nextPrices.hammer = 0;
  assert.equal(game.purchase("hammer").reason, "insufficient-funds");
  assert.equal(game.snapshot().balanceMilli, 0);
  assert.equal(game.snapshot().levels.hammer, 0);
  assert.equal(game.snapshot().nextPrices.hammer, 30);
});

test("a new session starts with zero income even when the clock is already advanced", () => {
  const game = createEconomy({ now: () => 1_000_000 });
  const state = game.tick();
  assert.equal(state.balanceMilli, 0);
  assert.equal(state.lifetimeEarnedMilli, 0);
  assert.equal(state.passiveIncome, 0);
  assert.equal(state.strikes, 0);
});
