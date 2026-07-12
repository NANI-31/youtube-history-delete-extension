export const STORAGE_KEYS = {
  ENABLED: "enabled",
  DELETED_COUNT: "deletedCount",
  DEBUG: "debug",
};

export const getStorage = (keys) => {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, resolve);
    } else {
      // Fallback for development/testing outside Chrome extension environment
      const fallback = {};
      if (typeof keys === "string") {
        const val = localStorage.getItem(keys);
        fallback[keys] = val !== null ? JSON.parse(val) : undefined;
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          const val = localStorage.getItem(key);
          fallback[key] = val !== null ? JSON.parse(val) : undefined;
        });
      } else if (typeof keys === "object") {
        Object.entries(keys).forEach(([key, defaultVal]) => {
          const val = localStorage.getItem(key);
          fallback[key] = val !== null ? JSON.parse(val) : defaultVal;
        });
      }
      resolve(fallback);
    }
  });
};

export const setStorage = (data) => {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(data, resolve);
    } else {
      // Fallback for development/testing outside Chrome extension
      Object.entries(data).forEach(([key, val]) => {
        localStorage.setItem(key, JSON.stringify(val));
      });
      resolve();
    }
  });
};

export const getEnabled = async () => {
  const res = await getStorage({ [STORAGE_KEYS.ENABLED]: true });
  return res[STORAGE_KEYS.ENABLED];
};

export const setEnabled = async (enabled) => {
  await setStorage({ [STORAGE_KEYS.ENABLED]: enabled });
};

export const getDeletedCount = async () => {
  const res = await getStorage({ [STORAGE_KEYS.DELETED_COUNT]: 0 });
  return res[STORAGE_KEYS.DELETED_COUNT];
};

export const setDeletedCount = async (count) => {
  await setStorage({ [STORAGE_KEYS.DELETED_COUNT]: count });
};

export const incrementDeletedCount = async () => {
  const current = await getDeletedCount();
  const next = current + 1;
  await setDeletedCount(next);
  return next;
};

export const getDebug = async () => {
  const res = await getStorage({ [STORAGE_KEYS.DEBUG]: false });
  return res[STORAGE_KEYS.DEBUG];
};

export const setDebug = async (debug) => {
  await setStorage({ [STORAGE_KEYS.DEBUG]: debug });
};
