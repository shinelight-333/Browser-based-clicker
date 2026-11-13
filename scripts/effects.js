// Presentation only: these effects never change money, levels or input availability.
(() => {
  "use strict";

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const active = new Map();
  const hammer = document.getElementById("hammer-swing");
  const glow = document.getElementById("strike-glow");
  const feedback = document.getElementById("strike-feedback");
  const toast = document.getElementById("milestone-toast");
  const sparks = [...document.querySelectorAll(".strike-spark")];
  const trajectories = [[-64, -42], [-35, -65], [6, -75], [43, -57], [70, -28], [-76, -12]];
  const labels = Array.from({ length: 6 }, () => {
    const label = document.createElement("span");
    label.className = "strike-number";
    feedback.append(label);
    return label;
  });
  let nextLabel = 0;

  function play(element, frames, options) {
    active.get(element)?.cancel();
    if (motion.matches || document.hidden || typeof element.animate !== "function") return;
    const animation = element.animate(frames, { easing: "ease-out", ...options });
    active.set(element, animation);
    const release = () => {
      if (active.get(element) === animation) active.delete(element);
    };
    animation.onfinish = release;
    animation.oncancel = release;
  }

  function clear() {
    for (const animation of active.values()) animation.cancel();
    active.clear();
  }

  function strike(amount) {
    if (motion.matches || document.hidden) return;
    // Restart the swing; rapid input never waits for an earlier animation to finish.
    play(hammer, [
      { transform: "rotate(8deg)" },
      { transform: "rotate(-1deg)", offset: 0.18 },
      { transform: "rotate(17deg)", offset: 0.65 },
      { transform: "rotate(8deg)" },
    ], { duration: 260 });
    play(glow, [{ opacity: 0 }, { opacity: 0.5, offset: 0.2 }, { opacity: 0 }], { duration: 240, delay: 35 });
    sparks.forEach((spark, index) => {
      const [x, y] = trajectories[index];
      play(spark, [
        { transform: "translate(0, 0)", opacity: 0 },
        { opacity: 0.85, offset: 0.15 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
      ], { duration: 350 + index * 20, delay: 35 });
    });

    // Fixed pool: even a long burst of clicks cannot accumulate nodes or animations.
    const label = labels[nextLabel];
    const drift = (nextLabel % 3 - 1) * 18;
    nextLabel = (nextLabel + 1) % labels.length;
    label.textContent = `+${amount}`;
    play(label, [
      { transform: `translate(calc(-50% + ${drift}px), 0)`, opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: `translate(calc(-50% + ${drift}px), -54px)`, opacity: 0 },
    ], { duration: 680 });
  }

  function purchase(card) {
    play(card, [
      { boxShadow: "0 0 0 1px #efc58a, inset 0 0 24px #dcac7526" },
      { boxShadow: "0 0 0 5px #efc58a00, inset 0 0 24px #dcac7500" },
    ], { duration: 480 });
    play(card.querySelector(".upgrade-icon"), [
      { transform: "scale(1)" }, { transform: "scale(1.12)", offset: 0.35 }, { transform: "scale(1)" },
    ], { duration: 320 });
  }

  function milestone() {
    play(toast, [
      { opacity: 0, transform: "translate(-50%, 8px)" },
      { opacity: 1, transform: "translate(-50%, 0)" },
    ], { duration: 200 });
  }

  motion.addEventListener("change", clear);
  document.addEventListener("visibilitychange", () => {
    document.body.classList.toggle("is-background", document.hidden);
    if (document.hidden) clear();
  });
  document.body.classList.toggle("is-background", document.hidden);
  window.addEventListener("pagehide", clear);
  window.ForgeEffects = Object.freeze({ strike, purchase, milestone, clear });
})();
