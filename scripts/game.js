(() => {
  "use strict";

  const { COIN, MAX_LEVEL, UPGRADES, createEconomy } = window.ForgeEconomy;
  const game = createEconomy();
  const numberFormat = new Intl.NumberFormat("ru-RU");
  const strikeButtons = [document.getElementById("forge-button"), document.getElementById("scene-hit-target")];
  const status = document.getElementById("game-status");
  const reward = document.querySelector(".forge-reward");
  const incomeUnit = document.querySelector("[data-stat-unit='click-income']");
  const balanceUnit = document.querySelector("[data-stat-unit='balance']");
  const earnedUnit = document.querySelector("[data-stat-unit='lifetime-earned']");
  const stats = Object.fromEntries(["balance", "click-income", "passive-income", "lifetime-earned", "strikes"].map(
    (name) => [name, [...document.querySelectorAll(`[data-stat="${name}"]`)]],
  ));
  const levelLabels = Object.fromEntries(Object.keys(UPGRADES).map(
    (id) => [id, [...document.querySelectorAll(`[data-level="${id}"]`)]],
  ));
  const cards = [...document.querySelectorAll("[data-upgrade]")].map((element) => ({
    element,
    id: element.dataset.upgrade,
    button: element.querySelector(".buy-button"),
    price: element.querySelector("[data-price]"),
    bonus: element.querySelector("[data-upgrade-bonus]"),
    unit: element.querySelector("[data-upgrade-unit]"),
    contribution: element.querySelector(".current-contribution"),
    track: element.querySelector(".level-track"),
    bars: [...element.querySelectorAll(".level-track i")],
    icons: [...element.querySelectorAll(".buy-button svg")],
  }));

  function setText(element, value) {
    const text = String(value);
    if (element.textContent !== text) element.textContent = text;
  }

  function setAttribute(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function coinWord(value) {
    const lastHundred = value % 100;
    if (lastHundred >= 11 && lastHundred <= 14) return "монет";
    const lastDigit = value % 10;
    if (lastDigit === 1) return "монета";
    if (lastDigit >= 2 && lastDigit <= 4) return "монеты";
    return "монет";
  }

  function render(state) {
    const values = {
      balance: Math.floor(state.balanceMilli / COIN),
      "click-income": state.clickIncome,
      "passive-income": state.passiveIncome,
      "lifetime-earned": Math.floor(state.lifetimeEarnedMilli / COIN),
      strikes: state.strikes,
    };
    for (const [key, elements] of Object.entries(stats)) {
      for (const element of elements) setText(element, numberFormat.format(values[key]));
    }
    setText(incomeUnit, coinWord(state.clickIncome));
    setText(balanceUnit, coinWord(values.balance));
    setText(earnedUnit, coinWord(values["lifetime-earned"]));
    setText(reward, `+${state.clickIncome}`);
    for (const button of strikeButtons) {
      setAttribute(button, "aria-label", `Ковать катану: +${state.clickIncome} ${coinWord(state.clickIncome)} за удар`);
    }

    for (const card of cards) {
      const upgrade = UPGRADES[card.id];
      const level = state.levels[card.id];
      const price = state.nextPrices[card.id];
      const maxed = price === null;
      const affordable = !maxed && state.balanceMilli >= price * COIN;
      const bonus = upgrade.clickBonus || upgrade.passiveBonus;
      const unit = upgrade.clickBonus ? "за удар" : "в секунду";

      for (const label of levelLabels[card.id]) setText(label, level);
      setText(card.price, maxed ? "Максимум" : numberFormat.format(price));
      setText(card.bonus, maxed ? "Улучшено полностью" : `+${bonus}`);
      setText(card.unit, maxed ? "" : unit);
      setText(card.contribution, `Сейчас +${bonus * level} ${upgrade.clickBonus ? "/ удар" : "/ сек"}`);
      setAttribute(card.track, "aria-label", `Уровень ${level} из ${MAX_LEVEL}`);
      card.bars.forEach((bar, index) => bar.classList.toggle("is-filled", index < level));
      card.element.classList.toggle("is-affordable", affordable);
      card.element.classList.toggle("is-maxed", maxed);
      card.button.disabled = !affordable;
      for (const icon of card.icons) icon.style.display = maxed ? "none" : "";

      const missing = maxed ? 0 : Math.ceil((price * COIN - state.balanceMilli) / COIN);
      const label = maxed
        ? `${upgrade.name}: достигнут максимальный уровень ${MAX_LEVEL}`
        : `${upgrade.name}: улучшить до уровня ${level + 1} за ${numberFormat.format(price)} монет${affordable ? "" : `. Не хватает ${numberFormat.format(missing)} монет`}`;
      setAttribute(card.button, "aria-label", label);
      setAttribute(card.button, "title", label);
    }
  }

  function strike() {
    render(game.strike());
  }

  for (const button of strikeButtons) {
    button.addEventListener("click", strike);
    button.addEventListener("keydown", (event) => {
      // Preserve native Enter/Space activation, but suppress auto-repeat clicks.
      if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
    });
  }

  for (const card of cards) {
    card.button.addEventListener("click", () => {
      const result = game.purchase(card.id);
      render(result.state);
      if (result.ok) {
        setText(status, `${UPGRADES[card.id].name}: уровень ${result.level}. Потрачено ${numberFormat.format(result.price)} монет.`);
      } else {
        setText(status, result.reason === "max-level" ? "Достигнут максимальный уровень." : "Для этого улучшения пока не хватает монет.");
      }
    });
  }

  function update() {
    render(game.tick());
  }

  // No per-frame income: elapsed session time is settled on return or before an action.
  window.setInterval(() => {
    if (!document.hidden) update();
  }, 200);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("pageshow", update);

  update();
  for (const button of strikeButtons) button.disabled = false;
})();
