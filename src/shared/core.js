(function () {
  const APP_NAMESPACE = "WeiboClipper";

  const STORAGE_KEYS = {
    config: "config"
  };

  const LEGACY_DEFAULT_NOTE_TEMPLATE = [
    "---",
    "source: weibo",
    "author: \"{{authorYaml}}\"",
    "author_url: \"{{authorUrlYaml}}\"",
    "published_at: \"{{publishedAtYaml}}\"",
    "captured_at: \"{{capturedAtYaml}}\"",
    "post_id: \"{{idYaml}}\"",
    "post_url: \"{{urlYaml}}\"",
    "source_client: \"{{sourceClientYaml}}\"",
    "reposts: {{repostsCount}}",
    "comments: {{commentsCount}}",
    "likes: {{likesCount}}",
    "images:",
    "{{imagesYaml}}",
    "videos:",
    "{{videosYaml}}",
    "topics:",
    "{{topicsYaml}}",
    "---",
    "",
    "# {{title}}",
    "",
    "{{content}}",
    "",
    "{{imagesMarkdown}}",
    "{{videosMarkdown}}",
    "",
    "[查看原微博]({{url}})"
  ].join("\n");

  const LEGACY_DEFAULT_NOTE_TEMPLATE_V2 = [
    "---",
    "created: {{createdAtPretty}}",
    "date modified: {{modifiedAtPretty}}",
    "author: \"{{authorYaml}}\"",
    "author url: \"{{authorUrlYaml}}\"",
    "published at: \"{{publishedAtYaml}}\"",
    "source client: \"{{sourceClientYaml}}\"",
    "post id: \"{{idYaml}}\"",
    "post url: \"{{urlYaml}}\"",
    "reposts: {{repostsCount}}",
    "comments: {{commentsCount}}",
    "likes: {{likesCount}}",
    "topics: {{topicsYaml}}",
    "images: {{imagesYaml}}",
    "videos: {{videosYaml}}",
    "---",
    "",
    "# {{title}}",
    "",
    "{{content}}",
    "",
    "## 微博信息",
    "",
    "- 作者: {{author}}",
    "- 作者主页: {{authorUrl}}",
    "- 发布时间: {{publishedAt}}",
    "- 来源: {{sourceClient}}",
    "- 原文: {{url}}",
    "- 话题: {{topicsCsv}}",
    "",
    "{{imagesMarkdown}}",
    "{{videosMarkdown}}"
  ].join("\n");

  const DEFAULT_NOTE_TEMPLATE = [
    "---",
    "created: {{createdAtPretty}}",
    "date modified: {{modifiedAtPretty}}",
    "source: \"{{source}}\"",
    "source name: \"{{sourceName}}\"",
    "author: \"{{authorYaml}}\"",
    "author url: \"{{authorUrlYaml}}\"",
    "published at: \"{{publishedAtYaml}}\"",
    "source client: \"{{sourceClientYaml}}\"",
    "post id: \"{{idYaml}}\"",
    "post url: \"{{urlYaml}}\"",
    "reposts: {{repostsCount}}",
    "comments: {{commentsCount}}",
    "likes: {{likesCount}}",
    "topics: {{topicsYaml}}",
    "images: {{imagesYaml}}",
    "videos: {{videosYaml}}",
    "---",
    "",
    "# {{title}}",
    "",
    "{{content}}",
    "",
    "## 来源信息",
    "",
    "- 平台: {{sourceName}}",
    "- 作者: {{author}}",
    "- 作者主页: {{authorUrl}}",
    "- 发布时间: {{publishedAt}}",
    "- 来源: {{sourceClient}}",
    "- 原文: {{url}}",
    "- 话题: {{topicsCsv}}",
    "",
    "{{imagesMarkdown}}",
    "{{videosMarkdown}}"
  ].join("\n");

  const DEFAULT_PATH_TEMPLATES_BY_SOURCE = {
    weibo: "Clippings/Weibo/{{yyyy}}/{{mm}}",
    x: "Clippings/X/{{yyyy}}/{{mm}}"
  };

  const DEFAULT_CONFIG = {
    saveMethod: "filesystem",
    obsidianVault: "",
    relativePathTemplate: "Clippings/{{sourceFolder}}/{{yyyy}}/{{mm}}",
    pathTemplatesBySource: DEFAULT_PATH_TEMPLATES_BY_SOURCE,
    fileNameTemplate: "{{yyyy}}-{{mm}}-{{dd}}-{{pathSafeAuthor}}-{{id}}",
    noteTemplate: DEFAULT_NOTE_TEMPLATE,
    overwriteExisting: false,
    downloadImages: true
  };

  const TEMPLATE_TOKENS = [
    "{{author}}",
    "{{authorYaml}}",
    "{{authorUrl}}",
    "{{authorUrlYaml}}",
    "{{content}}",
    "{{title}}",
    "{{titleYaml}}",
    "{{publishedAt}}",
    "{{publishedAtYaml}}",
    "{{capturedAt}}",
    "{{capturedAtYaml}}",
    "{{createdAtPretty}}",
    "{{modifiedAtPretty}}",
    "{{source}}",
    "{{sourceName}}",
    "{{sourceFolder}}",
    "{{sourceClient}}",
    "{{sourceClientYaml}}",
    "{{url}}",
    "{{urlYaml}}",
    "{{id}}",
    "{{idYaml}}",
    "{{repostsCount}}",
    "{{commentsCount}}",
    "{{likesCount}}",
    "{{imagesMarkdown}}",
    "{{videosMarkdown}}",
    "{{imagesYaml}}",
    "{{videosYaml}}",
    "{{topicsYaml}}",
    "{{topicsCsv}}",
    "{{pathSafeAuthor}}",
    "{{pathSafeTitle}}",
    "{{yyyy}}",
    "{{mm}}",
    "{{dd}}",
    "{{hh}}",
    "{{min}}",
    "{{ss}}"
  ];

  function mergeConfig(rawConfig) {
    const normalizedConfig = normalizeLegacyConfig(rawConfig);
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...(normalizedConfig || {})
    };
    mergedConfig.pathTemplatesBySource = {
      ...DEFAULT_PATH_TEMPLATES_BY_SOURCE,
      ...(normalizedConfig?.pathTemplatesBySource || {})
    };
    return mergedConfig;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function sanitizePathSegment(value, fallback = "untitled") {
    const cleaned = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\.+$/g, "")
      .trim();

    return cleaned || fallback;
  }

  function sanitizeFileName(value, fallback = "note") {
    return sanitizePathSegment(value, fallback).slice(0, 120);
  }

  function escapeYamlString(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"");
  }

  function linesToYamlList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "[]";
    }

    return `[${items.map((item) => `"${escapeYamlString(item)}"`).join(", ")}]`;
  }

  function linesToMarkdownList(items, label) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    return items.map((item) => `- ${label}: ${item}`).join("\n");
  }

  function linesToImageMarkdown(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    return items
      .map((item) => {
        if (isExternalUrl(item)) {
          return `<img src="${escapeHtmlAttribute(item)}" alt="" referrerpolicy="no-referrer" />`;
        }

        return `![[${item}]]`;
      })
      .join("\n\n");
  }

  function isExternalUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
  }

  function escapeHtmlAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function titleFromContent(content) {
    const normalized = String(content || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "微博剪藏";
    }

    return normalized.slice(0, 60);
  }

  function normalizeLegacyConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object") {
      return rawConfig;
    }

    const normalizedConfig = { ...rawConfig };
    if (
      normalizedConfig.noteTemplate === LEGACY_DEFAULT_NOTE_TEMPLATE ||
      normalizedConfig.noteTemplate === LEGACY_DEFAULT_NOTE_TEMPLATE_V2
    ) {
      normalizedConfig.noteTemplate = DEFAULT_NOTE_TEMPLATE;
    }

    if (normalizedConfig.relativePathTemplate === "Clippings/Weibo/{{yyyy}}/{{mm}}") {
      normalizedConfig.relativePathTemplate = DEFAULT_CONFIG.relativePathTemplate;
    }

    if (!normalizedConfig.pathTemplatesBySource || typeof normalizedConfig.pathTemplatesBySource !== "object") {
      normalizedConfig.pathTemplatesBySource = derivePathTemplatesBySource(normalizedConfig);
    }

    return normalizedConfig;
  }

  function derivePathTemplatesBySource(config) {
    const relativePathTemplate = String(config?.relativePathTemplate || "").trim();

    if (!relativePathTemplate || relativePathTemplate === DEFAULT_CONFIG.relativePathTemplate) {
      return { ...DEFAULT_PATH_TEMPLATES_BY_SOURCE };
    }

    if (relativePathTemplate === "Clippings/Weibo/{{yyyy}}/{{mm}}") {
      return {
        weibo: "Clippings/Weibo/{{yyyy}}/{{mm}}",
        x: DEFAULT_PATH_TEMPLATES_BY_SOURCE.x
      };
    }

    return {
      weibo: relativePathTemplate,
      x: relativePathTemplate
    };
  }

  function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const raw = String(value || "").trim();
    if (!raw) {
      return 0;
    }

    const compactMatch = raw.match(/([\d.,]+)\s*([KMB])/i);
    if (compactMatch) {
      const numeric = Number.parseFloat(compactMatch[1].replace(/,/g, ""));
      const unit = compactMatch[2].toUpperCase();
      const multiplierMap = {
        K: 1000,
        M: 1000000,
        B: 1000000000
      };
      return Number.isFinite(numeric) ? Math.round(numeric * multiplierMap[unit]) : 0;
    }

    if (raw.includes("万")) {
      const numeric = Number.parseFloat(raw.replace("万", ""));
      return Number.isFinite(numeric) ? Math.round(numeric * 10000) : 0;
    }

    const normalized = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeTopics(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function buildTemplateContext(post) {
    const now = new Date();
    const topics = normalizeTopics(post.topics);
    const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
    const videos = Array.isArray(post.videos) ? post.videos.filter(Boolean) : [];
    const content = String(post.content || "").trim();
    const author = String(post.author || "").trim() || "未知作者";
    const title = titleFromContent(content);
    const source = normalizeSourceKind(post.source);
    const sourceName = getSourceName(source);

    return {
      source,
      sourceName,
      sourceFolder: sanitizePathSegment(sourceName, source),
      author,
      authorYaml: escapeYamlString(author),
      authorUrl: String(post.authorUrl || "").trim(),
      authorUrlYaml: escapeYamlString(String(post.authorUrl || "").trim()),
      content,
      title,
      titleYaml: escapeYamlString(title),
      publishedAt: String(post.publishedAt || "").trim(),
      publishedAtYaml: escapeYamlString(String(post.publishedAt || "").trim()),
      capturedAt: now.toISOString(),
      capturedAtYaml: escapeYamlString(now.toISOString()),
      createdAtPretty: formatPrettyDate(now),
      modifiedAtPretty: formatPrettyDate(now),
      sourceClient: String(post.sourceClient || "").trim(),
      sourceClientYaml: escapeYamlString(String(post.sourceClient || "").trim()),
      url: String(post.url || "").trim(),
      urlYaml: escapeYamlString(String(post.url || "").trim()),
      id: sanitizeFileName(post.id || `${Date.now()}`, `${Date.now()}`),
      idYaml: escapeYamlString(sanitizeFileName(post.id || `${Date.now()}`, `${Date.now()}`)),
      repostsCount: normalizeNumber(post.repostsCount),
      commentsCount: normalizeNumber(post.commentsCount),
      likesCount: normalizeNumber(post.likesCount),
      imagesMarkdown: linesToImageMarkdown(images),
      videosMarkdown: linesToMarkdownList(videos, "视频"),
      imagesYaml: linesToYamlList(images),
      videosYaml: linesToYamlList(videos),
      topicsYaml: linesToYamlList(topics),
      topicsCsv: topics.join(", "),
      pathSafeAuthor: sanitizeFileName(author, "unknown-author"),
      pathSafeTitle: sanitizeFileName(title, "weibo-post"),
      yyyy: String(now.getFullYear()),
      mm: pad(now.getMonth() + 1),
      dd: pad(now.getDate()),
      hh: pad(now.getHours()),
      min: pad(now.getMinutes()),
      ss: pad(now.getSeconds())
    };
  }

  function normalizeSourceKind(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "x" || raw === "twitter") {
      return "x";
    }

    return "weibo";
  }

  function getSourceName(source) {
    if (source === "x") {
      return "X";
    }

    return "Weibo";
  }

  function renderTemplate(template, context) {
    return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        return String(context[key] ?? "");
      }

      return "";
    });
  }

  function formatPrettyDate(date) {
    const weekdayNames = [
      "星期日",
      "星期一",
      "星期二",
      "星期三",
      "星期四",
      "星期五",
      "星期六"
    ];
    const monthNames = [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月"
    ];
    const hours24 = date.getHours();
    const hours12 = hours24 % 12 || 12;
    let period = "上午";
    if (hours24 < 6) {
      period = "凌晨";
    } else if (hours24 < 12) {
      period = "上午";
    } else if (hours24 < 13) {
      period = "中午";
    } else if (hours24 < 18) {
      period = "下午";
    } else {
      period = "晚上";
    }

    return `${weekdayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}日 ${date.getFullYear()}, ${hours12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${period}`;
  }

  function normalizeRelativePath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .map((segment) => sanitizePathSegment(segment))
      .filter(Boolean)
      .join("/");
  }

  function createNote(post, config) {
    const merged = mergeConfig(config);
    const context = buildTemplateContext(post);
    const pathTemplate = resolveRelativePathTemplate(merged, context.source);
    const relativePath = normalizeRelativePath(
      renderTemplate(pathTemplate, context)
    );
    const fileName = sanitizeFileName(
      renderTemplate(merged.fileNameTemplate, context),
      context.id
    );
    const markdown = renderTemplate(merged.noteTemplate, context).replace(/\n{3,}/g, "\n\n");

    return {
      context,
      relativePath,
      fileName,
      markdown
    };
  }

  function resolveRelativePathTemplate(config, source) {
    const normalizedSource = normalizeSourceKind(source);
    const specificTemplate = config?.pathTemplatesBySource?.[normalizedSource];
    if (typeof specificTemplate === "string" && specificTemplate.trim()) {
      return specificTemplate;
    }

    return config?.relativePathTemplate || DEFAULT_CONFIG.relativePathTemplate;
  }

  function getNoteTargetPath(note) {
    const fileName = `${note.fileName}.md`;
    return note.relativePath ? `${note.relativePath}/${fileName}` : fileName;
  }

  function getAppRuntime() {
    const target = globalThis[APP_NAMESPACE] || {};
    target.STORAGE_KEYS = STORAGE_KEYS;
    target.DEFAULT_CONFIG = DEFAULT_CONFIG;
    target.TEMPLATE_TOKENS = TEMPLATE_TOKENS;
    target.mergeConfig = mergeConfig;
    target.createNote = createNote;
    target.getNoteTargetPath = getNoteTargetPath;
    target.formatPrettyDate = formatPrettyDate;
    target.normalizeSourceKind = normalizeSourceKind;
    target.resolveRelativePathTemplate = resolveRelativePathTemplate;
    target.sanitizeFileName = sanitizeFileName;
    target.sanitizePathSegment = sanitizePathSegment;
    target.normalizeNumber = normalizeNumber;
    globalThis[APP_NAMESPACE] = target;
    return target;
  }

  getAppRuntime();
})();
