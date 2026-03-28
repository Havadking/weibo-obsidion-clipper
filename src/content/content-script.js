(function () {
  const app = globalThis.WeiboClipper;
  const BUTTON_TEXT = "存入 Obsidian";
  const PROCESS_MARK = "data-weibo-clipper-ready";
  const ANCHOR_MARK = "data-weibo-clipper-anchor";
  const STATUS_TTL = 3200;
  let scanTimer = 0;
  let cachedConfig = app.mergeConfig();

  init();

  function init() {
    void loadConfig();
    chrome.storage.onChanged.addListener(handleStorageChange);
    scanPosts();
    observePage();
  }

  async function loadConfig() {
    const { config } = await chrome.storage.local.get(app.STORAGE_KEYS.config);
    cachedConfig = app.mergeConfig(config);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[app.STORAGE_KEYS.config]) {
      return;
    }

    cachedConfig = app.mergeConfig(changes[app.STORAGE_KEYS.config].newValue);
  }

  function observePage() {
    const observer = new MutationObserver(() => {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scanPosts, 120);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function scanPosts() {
    getPostRoots().forEach((root) => enhancePost(root));
  }

  function getPostRoots() {
    if (getCurrentSite() === "x") {
      return getXPostRoots();
    }

    return getWeiboPostRoots();
  }

  function getCurrentSite() {
    const hostname = location.hostname.toLowerCase();
    if (hostname === "x.com" || hostname === "twitter.com" || hostname.endsWith(".x.com")) {
      return "x";
    }

    return "weibo";
  }

  function getWeiboPostRoots() {
    const candidates = new Set();

    document
      .querySelectorAll('a[href*="/status/"], a[href*="/detail/"], a[href*="weibo.com/"][href*="/"]')
      .forEach((link) => {
        const root = findWeiboPostRoot(link);
        if (root) {
          candidates.add(root);
        }
      });

    return Array.from(candidates);
  }

  function getXPostRoots() {
    return Array.from(document.querySelectorAll("article"))
      .filter((article) => article instanceof HTMLElement)
      .filter((article) => {
        const statusLink = article.querySelector('a[href*="/status/"] time');
        if (!statusLink) {
          return false;
        }

        const hasText = article.querySelector('[data-testid="tweetText"]');
        const hasMedia = article.querySelector(
          'img[src*="pbs.twimg.com/media"], img[src*="pbs.twimg.com/ext_tw_video_thumb"], video'
        );
        const hasAuthor = article.querySelector('[data-testid="User-Name"]');

        return Boolean(hasAuthor && (hasText || hasMedia));
      });
  }

  function findWeiboPostRoot(seed) {
    let current = seed instanceof Element ? seed : null;
    let best = null;
    let bestScore = 0;

    while (current && current !== document.body) {
      const score = scoreWeiboPostCandidate(current);
      if (score > bestScore) {
        best = current;
        bestScore = score;
      }

      current = current.parentElement;
    }

    return bestScore >= 45 ? best : null;
  }

  function scoreWeiboPostCandidate(element) {
    if (!(element instanceof HTMLElement)) {
      return 0;
    }

    if (element.hasAttribute(ANCHOR_MARK)) {
      return 0;
    }

    const text = cleanText(element.innerText || "");
    if (text.length < 20 || text.length > 8000) {
      return 0;
    }

    let score = 0;
    const classText = `${element.className || ""} ${element.id || ""}`;
    const statusLinks = element.querySelectorAll('a[href*="/status/"], a[href*="/detail/"]').length;
    const authorLinks = element.querySelectorAll('a[href*="/u/"], a[href*="weibo.com/u/"]').length;

    if (element.hasAttribute("mid") || element.hasAttribute("omid")) {
      score += 45;
    }

    if (
      /feed_list_item|card-wrap|Feed_wrap|detail|WB_feed|vue-recycle-scroller/i.test(classText)
    ) {
      score += 28;
    }

    if (/转发|评论|赞/.test(text)) {
      score += 16;
    }

    if (statusLinks === 1) {
      score += 18;
    } else if (statusLinks > 1 && statusLinks <= 3) {
      score += 10;
    } else if (statusLinks > 3) {
      score -= 35;
    }

    if (element.querySelector("img, video")) {
      score += 8;
    }

    if (authorLinks >= 1 && authorLinks <= 2) {
      score += 6;
    } else if (authorLinks > 3) {
      score -= 12;
    }

    const rect = element.getBoundingClientRect();
    if (rect.height > 120) {
      score += 6;
    }

    if (rect.height > 2200 || (rect.width > window.innerWidth * 0.95 && statusLinks > 3)) {
      score -= 28;
    }

    if (text.length > 1800 && statusLinks > 2) {
      score -= 16;
    }

    return score;
  }

  function enhancePost(root) {
    if (!(root instanceof HTMLElement) || root.getAttribute(PROCESS_MARK) === "true") {
      return;
    }

    root.setAttribute(PROCESS_MARK, "true");
    ensureRootPositioning(root);

    const anchor = document.createElement("div");
    anchor.className = "weibo-clipper-anchor";
    anchor.setAttribute(ANCHOR_MARK, "true");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "weibo-clipper-button";
    button.innerHTML = getButtonIconMarkup();
    button.setAttribute("aria-label", BUTTON_TEXT);
    button.setAttribute("title", BUTTON_TEXT);

    const status = document.createElement("span");
    status.className = "weibo-clipper-status";
    status.hidden = true;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await savePost(root, button, status);
    });

    anchor.append(button, status);
    root.append(anchor);
  }

  function ensureRootPositioning(root) {
    const currentPosition = window.getComputedStyle(root).position;
    if (currentPosition === "static") {
      root.style.position = "relative";
    }
  }

  async function savePost(root, button, status) {
    button.disabled = true;
    button.dataset.state = "saving";
    button.innerHTML = getButtonIconMarkup();
    updateStatus(status, "正在提取内容...");

    try {
      const post = extractPost(root);
      const config = cachedConfig || app.DEFAULT_CONFIG;

      if (config.saveMethod === "obsidian-uri") {
        const path = saveWithObsidianUri(post, config);
        updateStatus(status, `已发送到 Obsidian：${path}`);
        button.dataset.state = "success";
        window.setTimeout(() => {
          delete button.dataset.state;
          button.innerHTML = getButtonIconMarkup();
        }, STATUS_TTL);
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "save-post",
        post
      });

      if (!response?.ok) {
        if (response?.code === "VAULT_NOT_READY" || response?.code === "VAULT_PERMISSION_REQUIRED") {
          chrome.runtime.sendMessage({ type: "open-options" }).catch(() => undefined);
        }
        throw new Error(response?.error || "保存失败。");
      }

      updateStatus(status, `已保存到 ${response.path}`);
      button.dataset.state = "success";
      window.setTimeout(() => {
        delete button.dataset.state;
        button.innerHTML = getButtonIconMarkup();
      }, STATUS_TTL);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus(status, message);
      button.dataset.state = "error";
      window.setTimeout(() => {
        delete button.dataset.state;
        button.innerHTML = getButtonIconMarkup();
      }, STATUS_TTL);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
      }, 600);
    }
  }

  function saveWithObsidianUri(post, config) {
    const vault = String(config.obsidianVault || "").trim();
    if (!vault) {
      chrome.runtime.sendMessage({ type: "open-options" }).catch(() => undefined);
      throw new Error("还没有配置 Obsidian vault 名称，请先到设置页填写。");
    }

    const note = app.createNote(post, config);
    const path = app.getNoteTargetPath(note);
    const uri = buildObsidianUri(vault, path, note.markdown);
    if (uri.length > 7500) {
      throw new Error("当前笔记内容过长，URI 模式可能超出浏览器限制。建议缩短模板，或改用本地目录模式。");
    }
    openExternalUri(uri);
    return path;
  }

  function buildObsidianUri(vault, filePath, content) {
    const normalizedPath = filePath.replace(/\.md$/i, "");
    const params = [
      ["vault", vault],
      ["file", normalizedPath],
      ["content", content],
      ["silent", "true"]
    ];

    return `obsidian://new?${params
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&")}`;
  }

  function openExternalUri(uri) {
    const anchor = document.createElement("a");
    anchor.href = uri;
    anchor.rel = "noreferrer";
    anchor.style.display = "none";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function updateStatus(node, message) {
    node.hidden = false;
    node.textContent = message;
    window.clearTimeout(Number(node.dataset.timer || 0));
    const timer = window.setTimeout(() => {
      node.hidden = true;
    }, STATUS_TTL);
    node.dataset.timer = String(timer);
  }

  function extractPost(root) {
    if (getCurrentSite() === "x") {
      return extractXPost(root);
    }

    return extractWeiboPost(root);
  }

  function extractWeiboPost(root) {
    const url = extractWeiboPostUrl(root);
    const content = extractWeiboContent(root);
    const authorLink = extractWeiboAuthorLink(root);
    const timeLink = extractWeiboTimeLink(root);
    const stats = extractWeiboStats(root);
    const authorHref = authorLink?.getAttribute("href") || "";

    return {
      source: "weibo",
      id: extractPostId(root, url),
      url,
      author: authorLink?.textContent?.trim() || "",
      authorUrl: authorHref ? new URL(authorHref, location.origin).href : "",
      publishedAt: cleanText(timeLink?.textContent || ""),
      sourceClient: extractWeiboSourceClient(timeLink),
      content,
      images: extractWeiboImages(root),
      videos: extractWeiboVideos(root),
      topics: extractTopics(content),
      repostsCount: stats.repostsCount,
      commentsCount: stats.commentsCount,
      likesCount: stats.likesCount
    };
  }

  function extractXPost(root) {
    const statusLink = extractXStatusLink(root);
    const timeNode = statusLink?.querySelector("time");
    const author = extractXAuthor(root);
    const content = extractXContent(root);
    const url = statusLink ? new URL(statusLink.getAttribute("href"), location.origin).href : location.href;
    const stats = extractXStats(root);

    return {
      source: "x",
      id: extractPostId(root, url),
      url,
      author: author.name,
      authorUrl: author.url,
      publishedAt: timeNode?.getAttribute("datetime") || cleanText(timeNode?.textContent || ""),
      sourceClient: "",
      content,
      images: extractXImages(root),
      videos: extractXVideos(root),
      topics: extractTopics(content),
      repostsCount: stats.repostsCount,
      commentsCount: stats.commentsCount,
      likesCount: stats.likesCount
    };
  }

  function extractWeiboPostUrl(root) {
    const link = extractWeiboTimeLink(root);
    const timeHref = link?.getAttribute("href") || "";
    if (link) {
      return timeHref ? new URL(timeHref, location.origin).href : location.href;
    }

    const generic = root.querySelector('a[href*="/status/"], a[href*="/detail/"]');
    const genericHref = generic?.getAttribute("href") || "";
    if (generic) {
      return genericHref ? new URL(genericHref, location.origin).href : location.href;
    }

    return location.href;
  }

  function extractXStatusLink(root) {
    const link = root.querySelector('a[href*="/status/"] time');
    if (link?.parentElement instanceof HTMLAnchorElement) {
      return link.parentElement;
    }

    return root.querySelector('a[href*="/status/"]');
  }

  function extractWeiboTimeLink(root) {
    const selectors = [
      'a[href*="/status/"]',
      'a[href*="/detail/"]',
      '[class*="from"] a',
      "time"
    ];

    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node && cleanText(node.textContent || "").length > 0) {
        return node;
      }
    }

    return null;
  }

  function extractWeiboAuthorLink(root) {
    const selectors = [
      'a[href*="/u/"]',
      'a[href*="weibo.com/u/"]',
      '[class*="head_nick"] a',
      '[class*="head"] a',
      "h3 a",
      "header a"
    ];

    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node && isLikelyWeiboAuthor(node)) {
        return node;
      }
    }

    const links = Array.from(root.querySelectorAll("a"));
    return links.find(isLikelyWeiboAuthor) || null;
  }

  function extractXAuthor(root) {
    const container = root.querySelector('[data-testid="User-Name"]');
    if (!container) {
      return {
        name: "",
        url: ""
      };
    }

    const profileLink = Array.from(container.querySelectorAll('a[href^="/"]')).find((link) =>
      isLikelyXProfileLink(link.getAttribute("href") || "")
    );

    const displayName =
      Array.from(container.querySelectorAll("span"))
        .map((node) => cleanText(node.textContent || ""))
        .find((text) => text && !text.startsWith("@") && !isXMetaText(text)) || "";

    return {
      name: displayName || (profileLink ? profileLink.pathname.split("/").filter(Boolean)[0] || "" : ""),
      url: profileLink ? new URL(profileLink.getAttribute("href"), location.origin).href : ""
    };
  }

  function extractWeiboContent(root) {
    const selectors = [
      '[node-type="feed_list_content_full"]',
      '[node-type="feed_list_content"]',
      '[class*="detail_wbtext"]',
      '[class*="wbtext"]',
      '[class*="Feed_text"]',
      '[class*="content"] [lang]',
      "[lang]"
    ];

    let bestText = "";
    for (const selector of selectors) {
      root.querySelectorAll(selector).forEach((node) => {
        const text = cleanText(node.textContent || "");
        if (text.length > bestText.length && !isWeiboUtilityText(text)) {
          bestText = text;
        }
      });
    }

    if (bestText) {
      return bestText;
    }

    const clone = root.cloneNode(true);
    clone.querySelectorAll("[data-weibo-clipper-anchor], button, video, img, svg").forEach((node) => {
      node.remove();
    });

    return cleanText(clone.textContent || "");
  }

  function extractXContent(root) {
    const textBlocks = Array.from(root.querySelectorAll('[data-testid="tweetText"]'))
      .map((node) => cleanText(node.textContent || ""))
      .filter(Boolean);

    if (textBlocks.length > 0) {
      return Array.from(new Set(textBlocks)).join("\n\n");
    }

    const clone = root.cloneNode(true);
    clone.querySelectorAll("[data-weibo-clipper-anchor], button, video, img, svg").forEach((node) => {
      node.remove();
    });

    return cleanText(clone.textContent || "");
  }

  function isLikelyWeiboAuthor(node) {
    if (!(node instanceof HTMLAnchorElement)) {
      return false;
    }

    const text = cleanText(node.textContent || "");
    if (!text || text.length > 30) {
      return false;
    }

    if (/转发|评论|赞|收藏|展开|全文|视频|图片|网页链接/.test(text)) {
      return false;
    }

    const href = node.getAttribute("href") || "";
    return /\/u\/|weibo\.com\/n\/|weibo\.com\/[0-9a-zA-Z_-]+/.test(href);
  }

  function isLikelyXProfileLink(href) {
    if (!href || !href.startsWith("/")) {
      return false;
    }

    const segments = href.split("/").filter(Boolean);
    if (segments.length !== 1) {
      return false;
    }

    const reserved = new Set([
      "home",
      "explore",
      "notifications",
      "messages",
      "i",
      "search",
      "settings",
      "compose",
      "login",
      "signup",
      "tos",
      "privacy"
    ]);

    return !reserved.has(segments[0].toLowerCase());
  }

  function isXMetaText(text) {
    return /^(@|·|•)/.test(text) || /^[0-9]+[smhdw]$/.test(text.toLowerCase());
  }

  function isWeiboUtilityText(text) {
    return text.length < 5 || (/转发|评论|赞|收藏|展开全文/.test(text) && text.length < 40);
  }

  function extractWeiboImages(root) {
    const urls = new Set();
    const nodes = Array.from(root.querySelectorAll("img"));

    nodes.forEach((img) => {
      const src = extractImageUrl(img);
      const alt = img.getAttribute("alt") || "";
      const classText = img.className || "";
      const rect = img.getBoundingClientRect();

      if (!src) {
        return;
      }

      if (/avatar|head|icon|emoji/i.test(`${alt} ${classText}`)) {
        return;
      }

      if (rect.width > 70 && rect.height > 70) {
        urls.add(normalizeWeiboAssetUrl(src));
      }
    });

    return Array.from(urls);
  }

  function extractXImages(root) {
    const urls = new Set();
    const selectors = [
      'img[src*="pbs.twimg.com/media"]',
      'img[src*="pbs.twimg.com/ext_tw_video_thumb"]',
      'img[src*="pbs.twimg.com/amplify_video_thumb"]'
    ];

    root.querySelectorAll(selectors.join(", ")).forEach((img) => {
      const src = extractImageUrl(img);
      if (!src) {
        return;
      }

      urls.add(normalizeXAssetUrl(src));
    });

    return Array.from(urls);
  }

  function extractWeiboVideos(root) {
    const urls = new Set();

    root.querySelectorAll("video[src], video source[src]").forEach((node) => {
      const src = node.getAttribute("src");
      if (src) {
        urls.add(normalizeAssetUrl(src));
      }
    });

    return Array.from(urls);
  }

  function extractXVideos(root) {
    const urls = new Set();

    root.querySelectorAll("video[src], video source[src]").forEach((node) => {
      const src = node.getAttribute("src");
      if (src && !src.startsWith("blob:")) {
        urls.add(normalizeAssetUrl(src));
      }
    });

    return Array.from(urls);
  }

  function extractTopics(content) {
    const matches = String(content || "").match(/#([^#\n]+)#?/g);
    if (!matches) {
      return [];
    }

    return Array.from(
      new Set(
        matches
          .map((item) => item.replaceAll("#", "").trim())
          .filter(Boolean)
      )
    );
  }

  function extractWeiboSourceClient(timeLink) {
    if (!timeLink || !timeLink.parentElement) {
      return "";
    }

    const text = cleanText(timeLink.parentElement.textContent || "");
    return text.replace(cleanText(timeLink.textContent || ""), "").replace(/^来自/, "").trim();
  }

  function extractPostId(root, url) {
    const attrCandidates = ["mid", "omid", "data-mid", "id"];
    for (const attrName of attrCandidates) {
      const raw = root.getAttribute(attrName);
      if (raw && raw.trim()) {
        return raw.trim();
      }
    }

    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || `${Date.now()}`;
    } catch (_error) {
      return `${Date.now()}`;
    }
  }

  function extractWeiboStats(root) {
    const statMap = {
      repostsCount: 0,
      commentsCount: 0,
      likesCount: 0
    };

    const keywords = [
      ["repostsCount", "转发"],
      ["commentsCount", "评论"],
      ["likesCount", "赞"]
    ];

    const buttons = Array.from(root.querySelectorAll("button, a, span, div"));
    for (const [targetKey, keyword] of keywords) {
      const match = buttons.find((node) => {
        const text = cleanText(node.textContent || "");
        return text.startsWith(keyword) || text === keyword || text.includes(`${keyword} `);
      });

      if (match) {
        const raw = cleanText(match.textContent || "").replace(keyword, "").trim();
        statMap[targetKey] = app.normalizeNumber(raw);
      }
    }

    return statMap;
  }

  function extractXStats(root) {
    return {
      commentsCount: readXStat(root, ["reply"]),
      repostsCount: readXStat(root, ["retweet", "unretweet"]),
      likesCount: readXStat(root, ["like", "unlike"])
    };
  }

  function readXStat(root, testIds) {
    for (const testId of testIds) {
      const node = root.querySelector(`[data-testid="${testId}"]`);
      if (!node) {
        continue;
      }

      const candidates = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.textContent
      ];

      for (const value of candidates) {
        const normalized = app.normalizeNumber(value);
        if (normalized > 0) {
          return normalized;
        }
      }

      return 0;
    }

    return 0;
  }

  function normalizeAssetUrl(url) {
    if (!url) {
      return "";
    }

    if (url.startsWith("//")) {
      return `${location.protocol}${url}`;
    }

    try {
      return new URL(url, location.origin).href;
    } catch (_error) {
      return url;
    }
  }

  function normalizeWeiboAssetUrl(url) {
    const normalizedUrl = normalizeAssetUrl(url);
    if (!normalizedUrl) {
      return "";
    }

    return normalizedUrl.replace(
      /\/(?:orj360|thumb150|thumb180|mw690|bmiddle|small|square|wap360|large)\//i,
      "/large/"
    );
  }

  function normalizeXAssetUrl(url) {
    const normalizedUrl = normalizeAssetUrl(url);
    if (!normalizedUrl) {
      return "";
    }

    try {
      const parsed = new URL(normalizedUrl);
      if (parsed.hostname === "pbs.twimg.com") {
        parsed.searchParams.set("name", "large");
      }

      return parsed.href;
    } catch (_error) {
      return normalizedUrl;
    }
  }

  function extractImageUrl(img) {
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
    const srcsetUrl = srcset
      .split(",")
      .map((item) => item.trim().split(/\s+/)[0])
      .filter(Boolean)
      .pop();

    return (
      img.currentSrc ||
      img.getAttribute("data-src") ||
      img.getAttribute("src") ||
      srcsetUrl ||
      ""
    );
  }

  function getButtonIconMarkup() {
    return [
      '<svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">',
      '<path d="M6 3.5h8a1 1 0 0 1 1 1V17l-5-3-5 3V4.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
      "</svg>"
    ].join("");
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+/g, " ")
      .trim();
  }
})();
