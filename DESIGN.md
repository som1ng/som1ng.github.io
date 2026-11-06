# Fuwari demo 对齐

## 来源与证据

- 参考：https://fuwari.vercel.app/ ，2026-11-05 读取。
- 官方源码：https://github.com/saicaca/fuwari 。本地参考提交 `6d39b0dec41282e7852e23e032998a5789abee28`。
- 当时保存的线上 HTML / CSS 已随目录清理移至 `.backups/cleanup-2026-11-06-archived/.cache/fuwari-demo.html`、`.backups/cleanup-2026-11-06-archived/.cache/fuwari-demo.css`，并保存在 `.backups/cleanup-2026-11-06.zip` 中。
- Firecrawl 截图受网络限制，浏览器渲染未核验；以下尺寸来自线上 HTML / CSS 和上游组件，不声称像素级截图一致。

## 图片

后续按用户要求，站点头像改为 GitHub 账号 `som1ng` 的头像，本地文件 `static/theme/github-avatar.jpg`，来源 https://avatars.githubusercontent.com/u/189888470?s=512&v=4 。下表保留原 demo 素材对照，demo 头像不再用于页面。

当前 `static/theme/` 保留实际使用的横幅、封面与 GitHub 头像。原 demo 头像仅用于设计对照，已移至 `.backups/cleanup-2026-11-06-archived/static/theme/demo-avatar.webp`；下表记录当时的 demo 素材：

| 用途 | 文件 | 原地址 |
| --- | --- | --- |
| 横幅 | demo-banner.webp | https://fuwari.vercel.app/_astro/demo-banner.DFyx781H_Z1SsDuN.webp |
| 头像 | demo-avatar.webp | https://fuwari.vercel.app/_astro/demo-avatar.CxcI0ivM_1nbuVe.webp |
| 文章封面 | demo-cover.webp | https://fuwari.vercel.app/_astro/cover.CgGywNHJ_9MQNr.webp |

横幅沿用 demo 的署名「空色天絵 / NEO TOKYO NOIR 01」及作品链接 https://www.pixiv.net/artworks/111024784 。图片来自演示站，不据此推断其具有独立的开放图片许可。

## 视觉规范

- 默认色相 250；浅色背景 `oklch(0.95 0.01 250)`，白卡片；深色沿用 Fuwari 原生变量。
- 页面最大宽度 75rem，桌面侧栏 17.5rem，列间距 1rem，卡片圆角 1rem。
- 顶部白色导航高 4.5rem，顶部贴边、底部圆角；首页桌面横幅 65vh，内页和小屏 35vh；内容与横幅重叠 3.5rem。
- 使用本地 Roboto 字体，中文系统字体回退。文章卡片桌面标题 30px、正文摘要 16px、元信息 14px；标题左侧蓝色短竖线。
- 头像为大尺寸方图，12px 内边距，12px 圆角；姓名下方短色条；取消先前自定义介绍卡和统计区。
- 无封面卡片右侧为浅蓝色整高箭头按钮；有封面时右侧图片占 28%。首页第三张卡片使用 demo 封面，其他无自定义封面的文章保持无图卡片，与 demo 的疏密节奏一致。
- 按钮与图像缩放约 160–200ms，页面淡入淡出约 180–220ms；不在大面积阴影上持续动画。遵循减少动态效果设置。

## 内容与分类

保留 s0m1ng 的文章、介绍、中文导航及 GitHub。文章内的技术截图属于正文内容，继续使用原图。

分类使用完整路径作为身份，自动由 Markdown `categories` 生成。侧栏为折叠树；分类页显示路径面包屑和直接子分类；父节点包含全部后代文章。移动端从导航的「分类」进入。分类独立 URL 支持刷新、分享、无脚本访问与浏览器历史；文章页每级面包屑均可点击。

## 再次核对

workflow: firecrawl-website-design-clone
source_url: https://fuwari.vercel.app/
target_stack: Astro / Fuwari / Swup / Svelte
output: DESIGN.md
