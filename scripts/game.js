(() => {
  "use strict";

  const { COIN, MAX_LEVEL, UPGRADES, MATERIALS, EQUIPMENT_NAMES, ACHIEVEMENTS, createEconomy } = window.ForgeEconomy;
  const { SAVE_KEY, createSaveStore } = window.ForgeStorage;
  const store = createSaveStore();
  const loaded = store.load();
  let game = createEconomy({ initialState: loaded.state ?? null });
  let blocked = loaded.status === "invalid";
  let lastRendered = null;
  let toastTimer;
  const numberFormat = new Intl.NumberFormat("ru-RU");
  const strikeButtons = [document.getElementById("forge-button"), document.getElementById("scene-hit-target")];
  const status = document.getElementById("game-status");
  const reward = document.querySelector(".forge-reward");
  const incomeUnit = document.querySelector("[data-stat-unit='click-income']");
  const balanceUnit = document.querySelector("[data-stat-unit='balance']");
  const earnedUnit = document.querySelector("[data-stat-unit='lifetime-earned']");
  const saveNotice = document.getElementById("save-notice");
  const saveLabel = document.getElementById("save-label");
  const saveDetail = document.getElementById("save-detail");
  const reloadButton = document.getElementById("reload-save");
  const recoveryReset = document.getElementById("recovery-reset");
  const resetDialog = document.getElementById("reset-dialog");
  const resetError = document.getElementById("reset-error");
  const resetTriggers = [...document.querySelectorAll('[data-open-dialog="reset-dialog"]')];
  const toast = document.getElementById("milestone-toast");
  const materialSteps = [...document.querySelectorAll("[data-material-step]")];
  const materialProgress = document.getElementById("material-progress");
  const achievementRows = [...document.querySelectorAll("[data-achievement]")];
  const achievementTrigger = document.querySelector('[data-open-dialog="achievements-dialog"]');
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
      button.disabled = blocked;
    }

    for (const card of cards) {
      const upgrade = UPGRADES[card.id];
      const level = state.levels[card.id];
      const price = state.nextPrices[card.id];
      const maxed = price === null;
      const affordable = !blocked && !maxed && state.balanceMilli >= price * COIN;
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
      const label = blocked ? `${upgrade.name}: игра приостановлена, проверьте сообщение о сохранении.` : maxed
        ? `${upgrade.name}: достигнут максимальный уровень ${MAX_LEVEL}`
        : `${upgrade.name}: улучшить до уровня ${level + 1} за ${numberFormat.format(price)} монет${affordable ? "" : `. Не хватает ${numberFormat.format(missing)} монет`}`;
      setAttribute(card.button, "aria-label", label);
      setAttribute(card.button, "title", label);
    }

    const material = MATERIALS[state.materialIndex];
    const next = MATERIALS[state.materialIndex + 1];
    setText(document.getElementById("scene-heading"), material.bladeName);
    setText(document.querySelector('[data-stat="material-name"]'), material.name);
    setText(document.querySelector('[data-stat="material-tier"]'), state.materialIndex + 1);
    setAttribute(document.getElementById("katana"), "data-material", material.id);
    for (const id of ["hammer", "anvil"]) {
      setAttribute(document.getElementById(id), "data-visual-level", String(state.equipmentTiers[id]));
      setText(document.querySelector(`[data-equipment-name="${id}"]`), EQUIPMENT_NAMES[id][state.equipmentTiers[id]]);
    }
    setText(document.getElementById("scene-art-description"), `${material.bladeName} на наковальне. ${EQUIPMENT_NAMES.hammer[state.equipmentTiers.hammer]}; ${EQUIPMENT_NAMES.anvil[state.equipmentTiers.anvil]}. В мастерской горит горн.`);

    for (const [index, step] of materialSteps.entries()) {
      const unlocked = index <= state.materialIndex;
      step.classList.toggle("is-current", index === state.materialIndex);
      step.classList.toggle("is-unlocked", unlocked);
      if (index === state.materialIndex) setAttribute(step, "aria-current", "step");
      else step.removeAttribute("aria-current");
      const lock = step.querySelector("svg");
      if (lock) lock.style.display = unlocked ? "none" : "";
      setText(step.querySelector("small"), unlocked ? (index === state.materialIndex ? "В работе" : "Открыто") : `${numberFormat.format(MATERIALS[index].threshold)} монет всего`);
    }
    const progress = next
      ? (state.lifetimeEarnedMilli / COIN - material.threshold) / (next.threshold - material.threshold)
      : 1;
    materialProgress.value = Math.min(1, Math.max(0, progress));
    setText(document.getElementById("material-progress-label"), next ? `До материала «${next.name}»` : "Все материалы открыты");
    setText(document.getElementById("material-target"), next ? `${numberFormat.format(next.threshold)} монет всего` : "3 / 3");
    setAttribute(materialProgress, "aria-valuetext", next ? `${Math.floor(progress * 100)}% до материала ${next.name}` : "Все материалы открыты");

    const achievementCount = `${state.achievements.length} / ${ACHIEVEMENTS.length}`;
    for (const element of document.querySelectorAll('[data-stat="achievement-count"]')) setText(element, achievementCount);
    setAttribute(achievementTrigger, "aria-label", `Достижения, открыто ${state.achievements.length} из ${ACHIEVEMENTS.length}`);
    for (const row of achievementRows) {
      const unlocked = state.achievements.includes(row.dataset.achievement);
      row.classList.toggle("is-unlocked", unlocked);
      setText(row.querySelector(".achievement-state"), unlocked ? "Открыто" : "Закрыто");
    }
  }

  function showSaveNotice(kind, label, detail) {
    saveNotice.dataset.state = kind;
    setText(saveLabel, label);
    setText(saveDetail, detail);
  }

  function showMilestone(messages) {
    window.clearTimeout(toastTimer);
    setText(toast, messages.join(" · "));
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6500);
  }

  function display(state, announce = true) {
    const messages = [];
    if (lastRendered && announce) {
      for (const id of ["hammer", "anvil"]) {
        if (state.equipmentTiers[id] > lastRendered.equipmentTiers[id]) messages.push(EQUIPMENT_NAMES[id][state.equipmentTiers[id]]);
      }
      if (state.materialIndex > lastRendered.materialIndex) messages.push(`Новый материал: ${MATERIALS[state.materialIndex].name}`);
      for (const achievement of ACHIEVEMENTS) {
        if (state.achievements.includes(achievement.id) && !lastRendered.achievements.includes(achievement.id)) {
          messages.push(`Достижение «${achievement.name}»`);
        }
      }
    }
    render(state);
    lastRendered = state;
    if (messages.length) showMilestone(messages);
    return messages.length > 0;
  }

  function persist(state) {
    if (blocked) return;
    const result = store.save(state);
    if (result.ok) showSaveNotice("saved", "Автосохранение", "Прогресс сохранён в этом браузере.");
    else showSaveNotice("warning", "Без сохранения", "Хранилище недоступно. Текущие изменения могут потеряться после закрытия страницы.");
  }

  function saveCurrent() {
    if (blocked) return;
    const state = game.tick();
    display(state);
    persist(state);
  }

  function strike() {
    if (blocked) return;
    const state = game.strike();
    if (display(state)) persist(state);
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
      if (blocked) return;
      const result = game.purchase(card.id);
      const milestone = display(result.state);
      if (result.ok || milestone) persist(result.state);
      if (result.ok) {
        setText(status, `${UPGRADES[card.id].name}: уровень ${result.level}. Потрачено ${numberFormat.format(result.price)} монет.`);
      } else {
        setText(status, result.reason === "max-level" ? "Достигнут максимальный уровень." : "Для этого улучшения пока не хватает монет.");
      }
    });
  }

  function update() {
    if (blocked) return;
    const state = game.tick();
    if (display(state)) persist(state);
  }

  document.getElementById("confirm-reset").addEventListener("click", () => {
    const result = store.reset();
    if (!result.ok) {
      setText(resetError, "Не удалось очистить сохранение. Сброс не выполнен; попробуйте снова, когда хранилище станет доступно.");
      resetError.hidden = false;
      return;
    }
    window.clearTimeout(toastTimer);
    toast.hidden = true;
    game = createEconomy();
    blocked = false;
    lastRendered = null;
    recoveryReset.hidden = true;
    reloadButton.hidden = true;
    display(game.snapshot(), false);
    persist(game.snapshot());
    setText(status, "Новая игра. Первое улучшение — молоток за 30 монет.");
    resetDialog.close();
  });
  resetDialog.addEventListener("close", () => { resetError.hidden = true; });
  reloadButton.addEventListener("click", () => window.location.reload());

  // A stale tab must not overwrite a save or resurrect progress reset in another tab.
  window.addEventListener("storage", (event) => {
    if (event.key !== SAVE_KEY && event.key !== null) return;
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    blocked = true;
    render(game.snapshot());
    window.clearTimeout(toastTimer);
    toast.hidden = true;
    reloadButton.hidden = false;
    recoveryReset.hidden = true;
    for (const trigger of resetTriggers) trigger.disabled = true;
    if (resetDialog.open) resetDialog.close();
    showSaveNotice("warning", "Другая вкладка", "Прогресс изменён в другой вкладке. Повторите загрузку, чтобы продолжить с актуального состояния.");
  });

  // No per-frame income: elapsed session time is settled on return or before an action.
  window.setInterval(() => {
    if (!document.hidden) update();
  }, 200);
  window.setInterval(saveCurrent, 5000);
  document.addEventListener("visibilitychange", saveCurrent);
  window.addEventListener("pagehide", () => { saveCurrent(); blocked = true; });
  window.addEventListener("pageshow", (event) => {
    // Reopening a cached page starts a fresh clock and reads the latest saved progress.
    if (event.persisted) window.location.reload();
    else update();
  });

  display(game.snapshot(), false);
  if (blocked) {
    recoveryReset.hidden = false;
    reloadButton.hidden = false;
    showSaveNotice("error", "Сохранение не загружено", loaded.reason === "version"
      ? "Формат сохранения не поддерживается. Данные сохранены; можно повторить загрузку или подтвердить сброс."
      : "Сохранение повреждено. Данные сохранены; можно повторить загрузку или подтвердить сброс.");
  } else if (loaded.status === "unavailable") {
    showSaveNotice("warning", "Без сохранения", "Хранилище недоступно. Игра работает, но прогресс не сохраняется.");
  } else {
    persist(game.snapshot());
    if (loaded.status === "loaded") setText(status, "Прогресс восстановлен. Можно продолжать ковку.");
  }
})();
