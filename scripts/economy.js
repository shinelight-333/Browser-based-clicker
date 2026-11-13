// Shared by the buildless browser app and Node's deterministic economy tests.
((root) => {
  "use strict";

  const COIN = 1000;
  const MAX_LEVEL = 5;
  const UPGRADES = Object.freeze({
    hammer: Object.freeze({ name: "Молоток", basePrice: 30, clickBonus: 1, passiveBonus: 0 }),
    anvil: Object.freeze({ name: "Наковальня", basePrice: 80, clickBonus: 2, passiveBonus: 0 }),
    apprentice: Object.freeze({ name: "Подмастерье", basePrice: 60, clickBonus: 0, passiveBonus: 1 }),
    // Keep the saved key and prices compatible with earlier workshop saves.
    forge: Object.freeze({ name: "Кузня", basePrice: 200, clickBonus: 0, passiveBonus: 5 }),
  });
  const MATERIALS = Object.freeze([
    Object.freeze({ id: "mild", name: "Мягкая сталь", bladeName: "Первая заготовка", threshold: 0 }),
    Object.freeze({ id: "carbon", name: "Углеродистая сталь", bladeName: "Углеродистая заготовка", threshold: 500 }),
    Object.freeze({ id: "hardened", name: "Закалённая сталь", bladeName: "Закалённая заготовка", threshold: 1500 }),
    Object.freeze({ id: "patterned", name: "Узорчатая сталь", bladeName: "Узорчатая заготовка", threshold: 5000 }),
    Object.freeze({ id: "tamahagane", name: "Тамахаганэ", bladeName: "Заготовка мастера", threshold: 10000 }),
  ]);
  const EQUIPMENT_NAMES = Object.freeze({
    hammer: Object.freeze(["Старый молоток", "Рабочий молоток", "Стальной молоток", "Воронёный молоток", "Серебристый молоток", "Молоток мастера"]),
    anvil: Object.freeze(["Старая наковальня", "Укреплённая наковальня", "Стальная наковальня", "Воронёная наковальня", "Каменная опора", "Наковальня мастера"]),
    apprentice: Object.freeze(["Место подмастерья", "Новичок", "Помощник", "Ремесленник", "Опытный кузнец", "Правая рука мастера"]),
    forge: Object.freeze(["Старая кузня", "Обновлённая кузня", "Каменная кузня", "Кузня ремесленника", "Кузня мастера", "Легендарная кузня"]),
  });
  const ACHIEVEMENTS = Object.freeze([
    Object.freeze({ id: "first-strike", name: "Первый удар" }),
    Object.freeze({ id: "steady-rhythm", name: "Ровный ритм" }),
    Object.freeze({ id: "equipped-forge", name: "Оснащённая кузница" }),
    Object.freeze({ id: "working-forge", name: "Работа спорится" }),
    Object.freeze({ id: "first-thousand", name: "Первая тысяча" }),
    Object.freeze({ id: "master-pattern", name: "Узор мастера" }),
  ]);

  function earnedAchievements(state) {
    const conditions = [
      state.strikes >= 1,
      state.strikes >= 100,
      state.levels.hammer >= 3 && state.levels.anvil >= 3,
      state.levels.apprentice + 5 * state.levels.forge >= 10,
      state.lifetimeEarnedMilli >= 1000 * COIN,
      state.lifetimeEarnedMilli >= 5000 * COIN,
    ];
    return ACHIEVEMENTS.filter((_, index) => conditions[index]).map(({ id }) => id);
  }

  // Only canonical fields enter the model. Derived income, material and time are never restored.
  function validateState(value) {
    const isRecord = (item) => item !== null && typeof item === "object" && !Array.isArray(item);
    const isAmount = (item) => Number.isSafeInteger(item) && item >= 0;
    if (!isRecord(value) || !isRecord(value.levels)
      || ![value.balanceMilli, value.lifetimeEarnedMilli, value.strikes].every(isAmount)
      || Object.keys(value.levels).length !== Object.keys(UPGRADES).length
      || !Object.keys(UPGRADES).every((id) => isAmount(value.levels[id]) && value.levels[id] <= MAX_LEVEL)) {
      throw new TypeError("Invalid saved counters or upgrade levels.");
    }
    const spent = Object.entries(UPGRADES).reduce(
      (total, [id, upgrade]) => total + upgrade.basePrice * (2 ** value.levels[id] - 1) * COIN, 0,
    );
    if (value.lifetimeEarnedMilli - value.balanceMilli !== spent
      || value.strikes > Math.floor(value.lifetimeEarnedMilli / COIN)) {
      throw new TypeError("Saved earnings do not match the balance and purchases.");
    }
    const expected = earnedAchievements(value);
    if (!Array.isArray(value.achievements) || value.achievements.length !== expected.length
      || new Set(value.achievements).size !== expected.length
      || !value.achievements.every((id) => expected.includes(id))) {
      throw new TypeError("Saved achievements do not match the progress.");
    }
    return {
      balanceMilli: value.balanceMilli,
      lifetimeEarnedMilli: value.lifetimeEarnedMilli,
      strikes: value.strikes,
      levels: Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, value.levels[id]])),
      achievements: expected,
    };
  }

  function createEconomy({ now = () => performance.now(), initialState = null } = {}) {
    const restored = initialState === null ? null : validateState(initialState);
    let balanceMilli = restored?.balanceMilli ?? 0;
    let lifetimeEarnedMilli = restored?.lifetimeEarnedMilli ?? 0;
    let strikes = restored?.strikes ?? 0;
    const levels = restored?.levels ?? { hammer: 0, anvil: 0, apprentice: 0, forge: 0 };

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
      const achievements = earnedAchievements({ strikes, lifetimeEarnedMilli, levels });
      const materialIndex = MATERIALS.reduce((index, material, candidate) => (
        lifetimeEarnedMilli >= material.threshold * COIN ? candidate : index
      ), 0);
      return {
        balanceMilli,
        lifetimeEarnedMilli,
        strikes,
        levels: { ...levels },
        clickIncome: clickIncome(),
        passiveIncome: passiveIncome(),
        achievements,
        materialIndex,
        equipmentTiers: { ...levels },
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

  const api = Object.freeze({ COIN, MAX_LEVEL, UPGRADES, MATERIALS, EQUIPMENT_NAMES, ACHIEVEMENTS, validateState, createEconomy });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ForgeEconomy = api;
  }
})(globalThis);
