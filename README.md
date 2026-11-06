# s0m1ng · Fuwari

基于 [Fuwari](https://github.com/saicaca/fuwari) 的 Astro 静态博客，保留原 Hexo 文章目录与历史网址。视觉按 [官方 demo](https://fuwari.vercel.app/) 对齐：同款横幅、封面、蓝色主题和卡片布局，头像使用 som1ng 的 GitHub 头像，中文导航与多级分类用于查找笔记。参见 [设计依据](DESIGN.md)。

日常改文章、导航、头像、横幅、分类、页脚及样式，请先看根目录的 **[博客修改指南](博客修改指南.md)**，其中按页面区域列出实际生效的文件、配置限制、预览步骤及本次目录清理记录。

## 本地运行

需要 Node.js **22.18 或更高版本**，推荐 Node 22 LTS。

```powershell
npm ci
npm run migrate
npm run dev
```

开发地址见终端输出。搜索索引在正式构建后生成，验证搜索请使用：

```powershell
npm run build
npm run verify
npm run verify:categories
npm run verify:search
npm run preview
```

`npm run check` 检查 Astro / TypeScript。`npm test` 在构建产物上验证浏览器交互；首次需要 `npx playwright install chromium`。测试会自行启动预览服务，并在 `docs/verification/` 保存报告和截图。

## 写作

**文章源仍为 `source/_posts/`，图片源仍为 `source/images/`。** `src/content/posts/` 是构建时生成的内容，不要直接修改。修改后运行 `npm run migrate`；`npm run build` 会自动执行转换。

```powershell
npm run new-post -- "新的学习笔记" --category REVERSE
```

原有 `title`、`date`、`updated`、`categories`、`tags` 和 Hexo `post_link` 可以继续使用。日期格式支持 `YYYY-MM-DD HH:mm:ss` 与已有的 `YYYY/MM/DD`。`categories` 按数组顺序表示从大分类到小分类的路径；新增分类会在下一次构建时自动生成侧栏节点、数量和分类页。

例如 `categories: [PWN, PWN_ATTACK, stack_overflow]` 对应「PWN → PWN_ATTACK → stack_overflow」。父分类显示全部后代文章；分类名打开文章列表，右侧箭头展开子分类；文章页和分类页提供逐级面包屑。手机导航中的「分类」可访问完整分类树。现有内容包含 4 个顶层分类、31 个分类节点。

每个分类都有可分享的 `/categories/完整路径/` 静态页面，无脚本也可以访问。旧 Hexo 分类地址中的连字符仍兼容，例如 `/categories/PWN/PWN-ATTACK/stack-overflow/`。

可在文章的 YAML 中明确指定系列和顺序：

```yaml
title: 新的学习笔记
date: 2026-11-05 10:00:00
categories:
  - REVERSE
  - 密码学
tags:
  - AES
series: 逆向中的密码学
series_order: 7
```

现有 RAG、Linux 提权、Windows 提权、内网横向、PE 逆向、密码学与栈溢出系列自动归组。新系列使用 `series` 字段即可出现在系列页。

## 定制

- `src/config.ts`：名称、介绍、配色与基础配置。
- `src/styles/site.css`：卡片、布局、响应式和组件外观。
- `src/styles/transition.css`：页面过渡与减少动态效果模式。
- `src/components/CategoryTree.astro` / `CategoryView.astro`：分类树和逐级查询页面。
- `src/content/spec/about.md`：关于页面。
- `static/theme/`：官方 demo 横幅与封面、GitHub 头像；图片来源与署名见 `DESIGN.md`。
- `static/rss.css`：RSS XML 的浏览器阅读样式，订阅地址仍为 `/rss.xml`，旧 `/atom.xml` 同样适用。
- `static/favicon/`：Fuwari 自带站点图标。

首页第三张卡片使用 demo 封面，保留 demo 的有图 / 无图卡片组合。正文技术截图仍使用你的原图。分类内容来自 Markdown，不需要手工维护导航列表。

全局导航、明暗切换、目录、代码复制与图片预览统一在 `src/scripts/site.ts` 管理；搜索组件为 `src/components/Search.svelte`。导航使用 Fuwari 的 Swup 集成，搜索使用 Pagefind，代码使用 Expressive Code，公式在构建时由 KaTeX 渲染，图片使用 PhotoSwipe。

## 网址与部署

站点地址为 `https://s0m1ng.dpdns.org/`，静态产物位于 `dist/`，公共文件源为 `static/`。原 `public/` 是旧 Hexo 构建产物，已移入 `.backups/cleanup-2026-11-06-archived/public/`，新站不会把它当作资源目录。

`src/data/hexo-baseline.json` 保存原文章的日期、路径与标题锚点；`src/data/legacy-pages.json` 保存历史分类、标签与归档页面。它们应随源码提交，新的构建不再依赖旧 `db.json` 或旧 `public/`。原文章的 `/年/月/日/路径/` 保持直接访问。

GitHub Pages 工作流已放入 `.github/workflows/pages.yml`，源码仓库推送 `main` 或 `master` 时构建。需要在目标仓库的 Settings → Pages 中将 Source 设为 GitHub Actions，并保留自定义域名。工作流运行检查、构建、兼容性验证后发布 `dist/`。本次本地重构没有推送远端或改动线上站点。

当前项目使用 Astro，发布不再运行 `hexo d`。**首次需要把当前源码目录关联到 GitHub 源码仓库，并启用上述 Pages 工作流**；当前根目录没有 `.git/`，这一步尚未完成。`npm run build` 只生成本地文件，不会上传网站。

首次设置完成后，每次本地修改可执行：

```powershell
npm run build
git add .
git commit -m "更新博客"
git push
```

推送到 `main` 或 `master` 后，由 GitHub Actions 自动构建和发布，进度在仓库 Actions 标签页查看。自定义域名应在仓库 Settings → Pages 中保存为 `s0m1ng.dpdns.org`；CNAME 文件本身不会自动绑定域名。首次关联已有仓库时，应先核对远端分支及历史，详细说明见 [博客修改指南](博客修改指南.md#10-域名和部署应该改哪里)。

## 原站备份与回退

改造前的完整源码和配置保存在 `.backups/hexo-2026-11-05T14-09-23-251Z/`，其中包含原文章、主题、配置与 npm 锁文件。该目录不参与发布，也不应提交到仓库。

需要回退时，先保存当前改动，将备份复制到另一个空目录，执行 `npm ci`，再运行原 Hexo 命令。避免直接覆盖新站目录。旧的 `_config.yml`、`themes/`、`scaffolds/` 和 `source/_data/` 等已从工作目录移入 `.backups/cleanup-2026-11-06-archived/`；新站不加载 NexT 配置。

2026-11-06 清理时，旧构建结果、临时缓存、未被引用的组件和演示素材也移入上述目录，保留相对路径以便找回；本次整理采用可恢复归档，没有释放这些文件占用的磁盘空间。另有 `.backups/cleanup-2026-11-06.zip` 保存被整理的旧组件、素材和修改前文档。逐项记录见 `docs/cleanup-2026-11-06.json`。

## 上游

基础主题：saicaca/fuwari，提交 `6d39b0dec41282e7852e23e032998a5789abee28`，MIT 许可见 `LICENSE`。Astro 从上游固定的 5.13.10 更新到兼容的 5.18.2，依赖通过 `package-lock.json` 锁定。
