(function () {
  const app = globalThis.WeiboClipper;
  const flashNode = document.getElementById("flash");
  const vaultNameNode = document.getElementById("vault-name");
  const vaultPermissionNode = document.getElementById("vault-permission");
  const pickVaultButton = document.getElementById("pick-vault-button");
  const configForm = document.getElementById("config-form");
  const resetButton = document.getElementById("reset-button");
  const tokenList = document.getElementById("token-list");
  const fileSystemCard = document.getElementById("filesystem-card");
  const uriCard = document.getElementById("uri-card");
  const saveMethodFilesystem = document.getElementById("save-method-filesystem");
  const saveMethodUri = document.getElementById("save-method-uri");

  init().catch((error) => {
    showFlash(error instanceof Error ? error.message : String(error));
  });

  async function init() {
    renderTokenList();
    await loadConfig();
    await refreshVaultStatus();
    bindEvents();
  }

  function bindEvents() {
    pickVaultButton.addEventListener("click", handlePickVault);
    configForm.addEventListener("submit", handleSubmit);
    resetButton.addEventListener("click", handleReset);
    saveMethodFilesystem.addEventListener("change", syncModeVisibility);
    saveMethodUri.addEventListener("change", syncModeVisibility);
  }

  async function loadConfig() {
    const { config } = await chrome.storage.local.get(app.STORAGE_KEYS.config);
    const merged = app.mergeConfig(config);

    saveMethodFilesystem.checked = merged.saveMethod === "filesystem";
    saveMethodUri.checked = merged.saveMethod === "obsidian-uri";
    document.getElementById("obsidian-vault").value = merged.obsidianVault || "";
    document.getElementById("relative-path-template").value = merged.relativePathTemplate;
    document.getElementById("file-name-template").value = merged.fileNameTemplate;
    document.getElementById("note-template").value = merged.noteTemplate;
    document.getElementById("overwrite-existing").checked = Boolean(merged.overwriteExisting);
    syncModeVisibility();
  }

  async function refreshVaultStatus() {
    const handle = await app.db.getVaultHandle();
    vaultNameNode.textContent = handle?.name || "未配置";

    if (!handle) {
      vaultPermissionNode.textContent = "未授权";
      return;
    }

    try {
      const permission = await handle.queryPermission({ mode: "readwrite" });
      vaultPermissionNode.textContent = permission === "granted" ? "已授权" : "需要重新授权";
    } catch (_error) {
      vaultPermissionNode.textContent = "状态未知";
    }
  }

  async function handlePickVault() {
    if (typeof window.showDirectoryPicker !== "function") {
      showFlash("当前浏览器没有启用目录选择器。Brave 通常默认关闭这个能力，建议切到“Obsidian URI 模式”，或者在 brave://flags/#file-system-access-api 里开启后重启浏览器。");
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: "readwrite"
      });
      const permission = await handle.requestPermission({ mode: "readwrite" });

      if (permission !== "granted") {
        throw new Error("没有拿到目录写入权限。");
      }

      await app.db.saveVaultHandle(handle);
      await refreshVaultStatus();
      showFlash(`已连接 vault：${handle.name}`);
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      showFlash(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const config = {
      saveMethod: saveMethodUri.checked ? "obsidian-uri" : "filesystem",
      obsidianVault: document.getElementById("obsidian-vault").value.trim(),
      relativePathTemplate: document.getElementById("relative-path-template").value.trim(),
      fileNameTemplate: document.getElementById("file-name-template").value.trim(),
      noteTemplate: document.getElementById("note-template").value,
      overwriteExisting: document.getElementById("overwrite-existing").checked
    };

    await chrome.storage.local.set({
      [app.STORAGE_KEYS.config]: app.mergeConfig(config)
    });

    showFlash("配置已保存。");
  }

  async function handleReset() {
    await chrome.storage.local.set({
      [app.STORAGE_KEYS.config]: app.DEFAULT_CONFIG
    });
    await loadConfig();
    showFlash("已恢复默认模板。");
  }

  function renderTokenList() {
    app.TEMPLATE_TOKENS.forEach((token) => {
      const chip = document.createElement("span");
      chip.className = "token-chip";
      chip.textContent = token;
      tokenList.append(chip);
    });
  }

  function syncModeVisibility() {
    const isUriMode = saveMethodUri.checked;
    fileSystemCard.classList.toggle("is-hidden", isUriMode);
    uriCard.classList.toggle("is-hidden", !isUriMode);
  }

  function showFlash(message) {
    flashNode.hidden = false;
    flashNode.textContent = message;
    window.clearTimeout(Number(flashNode.dataset.timer || 0));
    const timer = window.setTimeout(() => {
      flashNode.hidden = true;
    }, 3600);
    flashNode.dataset.timer = String(timer);
  }
})();
