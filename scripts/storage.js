((root) => {
  "use strict";
  const { validateState } = typeof module !== "undefined" && module.exports
    ? require("./economy.js") : root.ForgeEconomy;
  const SAVE_KEY = "forge-master.save";
  const SAVE_VERSION = 1;

  function createSaveStore({ getStorage = () => root.localStorage } = {}) {
    let mode = "unread";

    function load() {
      let raw;
      try {
        raw = getStorage().getItem(SAVE_KEY);
      } catch {
        mode = "unavailable";
        return { status: "unavailable" };
      }
      if (raw === null) {
        mode = "writable";
        return { status: "empty" };
      }
      try {
        const record = JSON.parse(raw);
        if (record?.version !== SAVE_VERSION) {
          mode = "protected";
          return { status: "invalid", reason: "version" };
        }
        const state = validateState(record.data);
        mode = "writable";
        return { status: "loaded", state };
      } catch {
        mode = "protected";
        return { status: "invalid", reason: "corrupt" };
      }
    }

    function save(state) {
      // Do not overwrite a corrupt save or an unknown save after a failed read.
      if (mode !== "writable") return { ok: false, reason: mode };
      let data;
      try {
        data = validateState(state);
      } catch {
        return { ok: false, reason: "invalid-state" };
      }
      try {
        getStorage().setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, data }));
        return { ok: true };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    }

    function reset() {
      try {
        getStorage().removeItem(SAVE_KEY);
        mode = "writable";
        return { ok: true };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    }

    return Object.freeze({ load, save, reset });
  }

  const api = Object.freeze({ SAVE_KEY, SAVE_VERSION, createSaveStore });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ForgeStorage = api;
})(globalThis);
