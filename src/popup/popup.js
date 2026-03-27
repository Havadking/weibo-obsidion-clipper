(function () {
  const statusText = document.getElementById("status-text");
  const openOptionsButton = document.getElementById("open-options");

  init().catch((error) => {
    statusText.textContent = error instanceof Error ? error.message : String(error);
  });

  async function init() {
    const response = await chrome.runtime.sendMessage({ type: "get-status" });

    if (!response?.ok) {
      statusText.textContent = "暂时无法读取配置状态。";
      return;
    }

    if (response.config?.saveMethod === "obsidian-uri") {
      if (!response.config?.obsidianVault) {
        statusText.textContent = "当前是 Obsidian URI 模式，但还没有填写 vault 名称。";
      } else {
        statusText.textContent = `当前使用 Obsidian URI 模式，目标 vault：${response.config.obsidianVault}。`;
      }
    } else if (!response.vaultName) {
      statusText.textContent = "还没有连接 Obsidian vault，请先在设置页选择本地目录。";
    } else if (response.permissionState !== "granted") {
      statusText.textContent = `当前 vault：${response.vaultName}，但需要重新授权目录写入权限。`;
    } else {
      statusText.textContent = `当前 vault：${response.vaultName}。打开微博后，每条微博右上角都会出现保存按钮。`;
    }

    openOptionsButton.addEventListener("click", async () => {
      await chrome.runtime.openOptionsPage();
      window.close();
    });
  }
})();
