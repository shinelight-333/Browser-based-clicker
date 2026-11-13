// Shared by the buildless browser app and Node's deterministic economy tests.
((root) => {
  "use strict";

  const COIN = 1000;
  const MAX_LEVEL = 5;
  const UPGRADES = Object.freeze({
    hammer: Object.freeze({ name: "Молоток", basePrice: 30, clickBonus: 1, passiveBonus: 0 }),
    anvil: Object.freeze({ name: "Наковальня", basePrice: 80, clickBonus: 2, passiveBonus: 0 }),
    apprentice: Object.freeze({ name: "Подмастерье", basePrice: 60, clickBonus: 0, passiveBonus: 1 }),
    forge: Object.freeze({ name: "Горн", basePrice: 200, clickBonus: 0, passiveBonus: 5 }),
  });

  function createEconomy({ now = () => performance.now() } = {}) {
    let balanceMilli = 0;
    let lifetimeEarnedMilli = 0;
    let strikes = 0;
    const levels = { hammer: 0, anvil: 0, apprentice: 0, forge: 0 };

    function readClock() {
      const value = Math.floor(now());
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("The session clock must return a finite, nonnegative millisecond value.");
      }
      return value;
    }

    let lastSettledAt = readClock();

    const clickIncome = () => 1 + levels.hammer + 2 * levels.anvil;
    const passiveIncome = () => levels.apprentice + 5 * levels.forge;

    function credit(amountMilli) {
      balanceMilli += amountMilli;
      lifetimeEarnedMilli += amountMilli;
    }

    function settle() {
      const timestamp = readClock();
      // Keep the high-water mark: a repeated or backward clock value earns nothing.
      if (timestamp <= lastSettledAt) return;
      // Coins/second × milliseconds = thousandths of a coin, with no rounding loss.
      credit(passiveIncome() * (timestamp - lastSettledAt));
      lastSettledAt = timestamp;
    }

    function snapshot() {
      return {
        balanceMilli,
        lifetimeEarnedMilli,
        strikes,
        levels: { ...levels },
        clickIncome: clickIncome(),
        passiveIncome: passiveIncome(),
        nextPrices: Object.fromEntries(Object.entries(UPGRADES).map(([id, upgrade]) => [
          id, levels[id] === MAX_LEVEL ? null : upgrade.basePrice * 2 ** levels[id],
        ])),
      };
    }

    function tick() {
      settle();
      return snapshot();
    }

    function strike() {
      settle();
      credit(clickIncome() * COIN);
      strikes += 1;
      return snapshot();
    }

    function purchase(id) {
      if (!Object.prototype.hasOwnProperty.call(UPGRADES, id)) {
        throw new RangeError(`Unknown upgrade: ${id}`);
      }

      // Time before this transaction belongs to the old passive-income rate.
      settle();
      if (levels[id] === MAX_LEVEL) {
        return { ok: false, reason: "max-level", state: snapshot() };
      }

      const price = UPGRADES[id].basePrice * 2 ** levels[id];
      if (balanceMilli < price * COIN) {
        return { ok: false, reason: "insufficient-funds", state: snapshot() };
      }

      balanceMilli -= price * COIN;
      levels[id] += 1;
      return { ok: true, price, level: levels[id], state: snapshot() };
    }

    return Object.freeze({ snapshot, tick, strike, purchase });
  }

  const api = Object.freeze({ COIN, MAX_LEVEL, UPGRADES, createEconomy });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ForgeEconomy = api;
  }
})(globalThis);
