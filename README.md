# Social Clipper for Obsidian

一个面向微博和 X/Twitter 网页的 Chrome/Brave 扩展。

它会在微博卡片或推文右上角注入一个轻量保存按钮，点击后即可把当前内容剪藏到本地 Obsidian 库，或通过 `obsidian://` URI 直接发送到 Obsidian 桌面端。

## Features

- 在 `weibo.com` / `www.weibo.com` 页面自动识别微博卡片
- 在 `x.com` / `twitter.com` 页面自动识别推文卡片
- 为每条微博 / 推文注入低干扰的小图标保存按钮
- 提取正文、作者、发布时间、来源、原文链接、话题、图片、视频、转评赞 / Reply-Like 数据
- 支持两种保存方式
  - `filesystem`：直接写入本地 Obsidian vault
  - `obsidian-uri`：通过 Obsidian URI 创建笔记，更适合 Brave
- 支持自定义
  - 按平台分别配置保存路径模板
  - 通用回退路径模板
  - 文件名模板
  - Markdown 模板
- 本地目录模式下自动下载图片到 `笔记名.assets/`，并写入 Obsidian 内嵌链接
- 默认输出 Obsidian 友好的 frontmatter 属性

## Project Structure

```text
manifest.json
src/
  background/   # 后台保存逻辑
  content/      # 微博页面按钮注入与内容提取
  options/      # 扩展设置页
  popup/        # 扩展弹窗
  shared/       # 模板、配置、公共工具
```

## Quick Start

### 1. Load Extension

1. 打开浏览器扩展页
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. 打开“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目目录：`E:\personal\projects\weibo-clipper`

### 2. Configure Save Mode

首次打开设置页时，先选择一种保存方式：

- `直接写入本地目录`
  - 适合 Chrome / Edge
  - 需要浏览器支持 File System Access API
  - 点击“选择 vault 目录”后授权 Obsidian 根目录

- `Obsidian URI 模式`
  - 更适合 Brave
  - 不依赖目录选择器
  - 只需填写 Obsidian vault 名称

然后可以分别配置：

- 微博保存路径模板
- X 保存路径模板
- 通用回退路径模板

### 3. Save a Post

1. 打开微博或 X 页面
2. 将鼠标移动到某条微博卡片或推文附近
3. 点击右上角书签小图标
4. 插件会把内容保存到 Obsidian

## Per-Platform Folders

现在可以为不同平台单独设置保存目录，例如：

```text
Weibo -> 00 Inbox/01 Clippings/Weibo/{{yyyy}}
X      -> 00 Inbox/01 Clippings/X/{{yyyy}}
```

如果某个平台没有单独配置，则会回退到通用路径模板。

## Template Variables

以下变量可用于保存路径、文件名和 Markdown 模板：

- `{{author}}`
- `{{authorUrl}}`
- `{{content}}`
- `{{title}}`
- `{{publishedAt}}`
- `{{capturedAt}}`
- `{{createdAtPretty}}`
- `{{modifiedAtPretty}}`
- `{{sourceClient}}`
- `{{url}}`
- `{{id}}`
- `{{repostsCount}}`
- `{{commentsCount}}`
- `{{likesCount}}`
- `{{imagesMarkdown}}`
- `{{videosMarkdown}}`
- `{{imagesYaml}}`
- `{{videosYaml}}`
- `{{topicsYaml}}`
- `{{topicsCsv}}`
- `{{pathSafeAuthor}}`
- `{{pathSafeTitle}}`
- `{{yyyy}}`
- `{{mm}}`
- `{{dd}}`
- `{{hh}}`
- `{{min}}`
- `{{ss}}`

## Example Output

默认输出类似这样的属性格式：

```yaml
---
created: 星期二, 一月 13日 2026, 11:14:07 晚上
date modified: 星期二, 一月 13日 2026, 11:14:07 晚上
author: "某个作者"
source: "weibo"
source name: "Weibo"
author url: "https://weibo.com/..."
published at: "3分钟前"
source client: "iPhone客户端"
post id: "xxxxxxxx"
post url: "https://weibo.com/..."
reposts: 12
comments: 5
likes: 26
topics: ["话题一", "话题二"]
images: ["2026-03-27-作者-123.assets/01.jpg"]
videos: []
---
```

## Brave Notes

- Brave 默认通常没有启用 File System Access API
- 如果目录选择器不可用，建议直接使用 `Obsidian URI 模式`
- 如果仍想使用本地目录模式，可尝试打开：
  - `brave://flags/#file-system-access-api`
- 启用后重启 Brave 再测试
- `Obsidian URI 模式` 建议搭配 Obsidian `1.7.2+`

## Current Limitations

- 微博 DOM 结构经常变化，当前识别逻辑使用启发式选择器
- X/Twitter DOM 结构也会变化，当前使用 `article + status link + tweetText` 的组合选择器
- `Obsidian URI 模式` 下超长内容可能受 URI 长度限制
- 本地图片下载受微博图床防盗链策略影响，个别图片可能回退为远程链接
- X 的视频在时间线上通常不会直接暴露稳定的 mp4 地址，所以当前优先保证文本和图片
- “展开全文”场景仍有进一步提升空间

## Development

当前项目是纯前端 Chrome Extension，无需额外构建步骤。

如果要本地修改后测试：

1. 编辑源码
2. 回到扩展页点击“重新加载”
3. 刷新微博页面

## Roadmap

- 更稳定的微博 DOM 适配层
- 更稳定的 X/Twitter DOM 适配层
- 自定义附件保存路径
- 自定义 frontmatter 字段映射
- 更完整的长微博 / 长推文与媒体抓取

## License

暂未添加，可按你的 GitHub 仓库需求补充。
