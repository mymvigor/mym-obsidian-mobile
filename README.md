# MYM Life

MYM Life 是一个本地优先、iPhone 优先的 Obsidian 人生首页插件。它使用 Vault 中已有的 Markdown、YAML Properties、本地附件和双向链接，提供：

- 1.2 深色沉浸式人生首页、当前重点与最近人生
- 首页 → 主线详情 → 知识空间的轻量 App 导航栈
- 健身 / CPA 专属详情结构，以及通用主线详情
- 主线进度、Recap、本地照片/视频/音频、最近记录与知识入口
- 基于真实状态变化的 Recap
- Daily Note 时间流、目标管理、个人与设置页
- 支持分类、情绪和本地附件的底部快速记录面板
- 标题、标签和属性搜索
- 支持领域筛选、拖动、缩放、聚焦和渐进加载的局部知识图谱
- iPhone safe area、Dynamic Island、键盘、横屏和 Home Indicator 适配

插件不创建封闭数据库，不发送网络请求，不依赖 Node.js、Electron、CDN、外部 API 或 VPN。卸载插件后，Markdown 和本地附件仍可正常读取。

## 通过 BRAT 安装

需要 BRAT 1.1.0 或更新版本。

1. 在 Obsidian 社区插件中安装并启用 **BRAT**。
2. 打开 BRAT 设置，选择 **Add Beta plugin**。
3. 粘贴：`mymvigor/mym-obsidian-mobile`
4. 选择最新版本并安装。
5. 在“设置 → 第三方插件”中启用 **MYM Life**。
6. 点击侧边栏的叶子图标，或运行命令“MYM Life：打开人生首页”。

BRAT 会从 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`，后续可由 BRAT 检查并安装更新。

## 数据格式

插件读取普通 Markdown 的 Properties。目标示例：

```yaml
---
type: goal
title: 健身
status: focus
domain: 身体
progress: 60
metric: 最近 7 天训练 3 次
recap: 动作比上阶段更稳定。
hero: Attachments/健身封面.jpg
weight: 72.4
bodyFat: 18.3
strength: +12%
---
```

`hero`、`cover` 或 `image` 可指向 Vault 内本地图片；媒体也可以用普通 Markdown 嵌入。缺少任何字段时，界面会显示明确空状态，不会生成虚构数据。

推荐目录为 `04 Goals`、`02 Daily`、`03 Knowledge`，但目标和 Daily 也会通过 `type` 属性识别。模板目录 `Templates/` 会被排除。

## 本地开发

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

生产构建输出为仓库根目录的 `main.js`。

## 隐私边界

本仓库只包含插件代码和构建产物，不包含任何 Vault、笔记、附件、媒体、工作区状态或个人数据。`.gitignore` 对这些内容进行了显式阻止。

## License

MIT
