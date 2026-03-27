(function () {
  const APP_NAMESPACE = "WeiboClipper";
  const DB_NAME = "weibo-clipper-db";
  const DB_VERSION = 1;
  const STORE_NAME = "handles";
  const VAULT_HANDLE_KEY = "vaultRoot";

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, callback) {
    const database = await openDatabase();

    try {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = await callback(store);

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });

      return result;
    } finally {
      database.close();
    }
  }

  async function saveVaultHandle(handle) {
    return withStore("readwrite", async (store) => {
      store.put(handle, VAULT_HANDLE_KEY);
    });
  }

  async function getVaultHandle() {
    return withStore("readonly", (store) => requestToPromise(store.get(VAULT_HANDLE_KEY)));
  }

  async function clearVaultHandle() {
    return withStore("readwrite", async (store) => {
      store.delete(VAULT_HANDLE_KEY);
    });
  }

  const target = globalThis[APP_NAMESPACE] || {};
  target.db = {
    saveVaultHandle,
    getVaultHandle,
    clearVaultHandle
  };
  globalThis[APP_NAMESPACE] = target;
})();
