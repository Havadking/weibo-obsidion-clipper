importScripts("../shared/core.js", "../shared/idb.js");

const app = globalThis.WeiboClipper;

chrome.runtime.onInstalled.addListener(async () => {
  const { config } = await chrome.storage.local.get(app.STORAGE_KEYS.config);
  if (!config) {
    await chrome.storage.local.set({
      [app.STORAGE_KEYS.config]: app.DEFAULT_CONFIG
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        code: "UNEXPECTED_ERROR",
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      error: "无效的消息格式。"
    };
  }

  if (message.type === "save-post") {
    return savePostToVault(message.post || {});
  }

  if (message.type === "get-status") {
    return getExtensionStatus();
  }

  if (message.type === "open-options") {
    await chrome.runtime.openOptionsPage();
    return {
      ok: true
    };
  }

  return {
    ok: false,
    code: "UNKNOWN_MESSAGE",
    error: `未知消息类型: ${message.type}`
  };
}

async function getExtensionStatus() {
  const { config } = await chrome.storage.local.get(app.STORAGE_KEYS.config);
  const mergedConfig = app.mergeConfig(config);
  const handle = await app.db.getVaultHandle();
  const permissionState = handle
    ? await queryHandlePermission(handle)
    : "missing";

  return {
    ok: true,
    config: mergedConfig,
    vaultName: handle?.name || "",
    permissionState
  };
}

async function queryHandlePermission(handle) {
  if (!handle || typeof handle.queryPermission !== "function") {
    return "missing";
  }

  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch (_error) {
    return "prompt";
  }
}

async function savePostToVault(post) {
  const { config } = await chrome.storage.local.get(app.STORAGE_KEYS.config);
  const mergedConfig = app.mergeConfig(config);

  if (mergedConfig.saveMethod === "obsidian-uri") {
    const note = app.createNote(post, mergedConfig);
    return {
      ok: true,
      mode: "obsidian-uri",
      path: app.getNoteTargetPath(note)
    };
  }

  const vaultHandle = await app.db.getVaultHandle();

  if (!vaultHandle) {
    return {
      ok: false,
      code: "VAULT_NOT_READY",
      error: "还没有选择 Obsidian 库，请先到设置页完成授权。"
    };
  }

  const permissionState = await queryHandlePermission(vaultHandle);
  if (permissionState !== "granted") {
    return {
      ok: false,
      code: "VAULT_PERMISSION_REQUIRED",
      error: "Obsidian 库权限已失效，请在设置页重新授权。"
    };
  }

  const workingPost = {
    ...post,
    images: Array.isArray(post.images) ? [...post.images] : []
  };
  let note = app.createNote(workingPost, mergedConfig);
  const targetDirectory = await ensureDirectory(vaultHandle, note.relativePath);

  if (mergedConfig.downloadImages && workingPost.images.length > 0) {
    workingPost.images = await downloadImagesToAssets(
      workingPost.images,
      targetDirectory,
      note.fileName
    );
    note = app.createNote(workingPost, mergedConfig);
  }

  const fileHandle = await getTargetFileHandle(
    targetDirectory,
    note.fileName,
    mergedConfig.overwriteExisting
  );
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(note.markdown);
  } finally {
    await writable.close();
  }

  return {
    ok: true,
    mode: "filesystem",
    path: `${note.relativePath ? `${note.relativePath}/` : ""}${fileHandle.name}`,
    fileName: fileHandle.name,
    vaultName: vaultHandle.name
  };
}

async function downloadImagesToAssets(imageUrls, noteDirectoryHandle, noteFileName) {
  const assetDirectoryName = `${noteFileName}.assets`;
  const assetDirectoryHandle = await noteDirectoryHandle.getDirectoryHandle(assetDirectoryName, {
    create: true
  });
  const localImagePaths = [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];

    try {
      const response = await fetch(imageUrl, {
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });

      if (!response.ok) {
        throw new Error(`下载失败: ${response.status}`);
      }

      const blob = await response.blob();
      const extension = guessFileExtension(imageUrl, blob.type);
      const fileName = `${String(index + 1).padStart(2, "0")}.${extension}`;
      const fileHandle = await assetDirectoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }

      localImagePaths.push(`${assetDirectoryName}/${fileName}`);
    } catch (_error) {
      localImagePaths.push(imageUrl);
    }
  }

  return localImagePaths;
}

function guessFileExtension(url, mimeType) {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  if (normalizedMimeType.includes("jpeg")) {
    return "jpg";
  }

  if (normalizedMimeType.includes("png")) {
    return "png";
  }

  if (normalizedMimeType.includes("gif")) {
    return "gif";
  }

  if (normalizedMimeType.includes("webp")) {
    return "webp";
  }

  if (normalizedMimeType.includes("bmp")) {
    return "bmp";
  }

  if (normalizedMimeType.includes("svg")) {
    return "svg";
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch (_error) {
    return "jpg";
  }

  return "jpg";
}

async function ensureDirectory(rootHandle, relativePath) {
  let currentHandle = rootHandle;
  const segments = String(relativePath || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

async function getTargetFileHandle(directoryHandle, baseFileName, overwriteExisting) {
  const extension = ".md";
  const sanitizedBaseName = app.sanitizeFileName(baseFileName, `${Date.now()}`);

  if (overwriteExisting) {
    return directoryHandle.getFileHandle(`${sanitizedBaseName}${extension}`, { create: true });
  }

  let index = 0;
  while (index < 1000) {
    const candidateName =
      index === 0
        ? `${sanitizedBaseName}${extension}`
        : `${sanitizedBaseName}-${index}${extension}`;

    try {
      await directoryHandle.getFileHandle(candidateName, { create: false });
      index += 1;
    } catch (_error) {
      return directoryHandle.getFileHandle(candidateName, { create: true });
    }
  }

  throw new Error("连续文件名冲突过多，请调整文件名模板。");
}
