# Changelog

## 1.2.1

- Rebuilt Home, Fitness, CPA, Timeline, Goals, Capture, and Profile against the supplied phone layout with a light MYM-owned visual system.
- Added a presentation model that derives human-readable titles, summaries, dates, categories, metrics, and media without exposing filenames, paths, YAML, or internal fields.
- Added inline local video previews and playback, two-column image galleries, before/after comparison, and full-screen local media viewing.
- Reworked the knowledge space around image-centered radial nodes, five domain filters, click-to-refocus, and a structured knowledge preview card.
- Added MYM-only host chrome suppression, measured host-bottom fallback spacing, Visual Viewport sizing, keyboard-aware navigation hiding, and safe-area content clearance.
- Rebuilt quick capture with the specified five record types and four tools: image, recording, attachment, and mood.

## 1.2.0

- Rebuilt the entire application in the supplied dark, restrained, masculine mobile visual system.
- Added media-first Home, compact focus rows, recent-life cards, fitness and CPA-specific detail layouts.
- Added five-item mobile navigation, Goals, Search, Knowledge, Timeline, Profile, and Settings experiences.
- Rebuilt quick capture as a bottom sheet with categories and local image, video, and audio attachments.
- Upgraded Knowledge Space with domain filters, draggable nodes, progressive loading up to 80 nodes, tags, and relation counts.
- Preserved offline-only Obsidian APIs, readable empty/error states, Visual Viewport keyboard handling, and local media playback.

## 1.1.0

- Rebuilt the mobile experience around MYM custom App Views and a three-level navigation stack.
- Added a native-style life-line detail view for goals, progress, recap, media, recent entries, and knowledge.
- Added Visual Viewport, keyboard, Dynamic Island, Home Indicator, landscape, and small-screen layout handling.
- Upgraded the local knowledge graph with progressive loading, focused relationships, collision-aware labels, and preview cards.
- Unified design tokens, typography, cards, spacing, navigation, loading, empty, and error states.

## 1.0.0

- 首次公开发布。
- 提供移动端首页、Recap、时间流、快速记录、搜索和局部知识图谱。
- 修复 Obsidian View 生命周期方法命名冲突导致的首页白屏。
- 兼容 Obsidian 1.7.2+ DeferredView 生命周期。
- 增加渲染错误边界和无数据 Empty State。
- 修复第三方主题覆盖卡片布局的问题。
