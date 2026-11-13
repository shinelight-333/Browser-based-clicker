// Dialog controls; game state and input live in game.js.
(() => {
  "use strict";

  const dialogTriggers = document.querySelectorAll("[data-open-dialog]");
  const dialogs = document.querySelectorAll("dialog");
  const dialogOpeners = new WeakMap();

  for (const trigger of dialogTriggers) {
    trigger.addEventListener("click", () => {
      const dialog = document.getElementById(trigger.dataset.openDialog);
      if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;

      dialogOpeners.set(dialog, trigger);
      dialog.showModal();
      document.body.classList.add("dialog-open");
    });
  }

  for (const dialog of dialogs) {
    // A click inside the dialog's padding must not be treated as a backdrop click.
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;

      const bounds = dialog.getBoundingClientRect();
      const isOutside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;

      if (isOutside) dialog.close();
    });

    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) {
        document.body.classList.remove("dialog-open");
      }
      dialogOpeners.get(dialog)?.focus({ preventScroll: true });
    });
  }
})();
