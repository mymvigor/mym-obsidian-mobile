"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MymLifePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var HOME_VIEW = "mym-life-home";
var TIMELINE_VIEW = "mym-life-timeline";
var GRAPH_VIEW = "mym-life-graph";
var SEARCH_VIEW = "mym-life-search";
function asText(value, fallback = "") {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return fallback;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function statusOf(value) {
  const status = asText(value).toLowerCase();
  if (["focus", "active", "paused", "done"].includes(status)) return status;
  return "active";
}
function dateLabel(epoch) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(epoch));
}
function localDate() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
var MymView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.cleanups = [];
    this.plugin = plugin;
  }
  onClose() {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    return Promise.resolve();
  }
  watchVault(render) {
    const refresh = debounce(() => render(), 220);
    this.registerEvent(this.app.metadataCache.on("changed", () => refresh()));
    this.registerEvent(this.app.vault.on("create", () => refresh()));
    this.registerEvent(this.app.vault.on("delete", () => refresh()));
    this.registerEvent(this.app.vault.on("rename", () => refresh()));
  }
  shell(active) {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page" });
    const dock = this.contentEl.createDiv({ cls: "mym-dock", attr: { "aria-label": "\u4E3B\u5BFC\u822A" } });
    [
      ["home", "\u9996\u9875", HOME_VIEW],
      ["calendar-days", "\u65F6\u95F4", TIMELINE_VIEW],
      ["search", "\u641C\u7D22", SEARCH_VIEW]
    ].forEach(([icon, label, type]) => {
      const button = dock.createEl("button", { cls: type === active ? "is-active" : "" });
      (0, import_obsidian.setIcon)(button.createSpan(), icon);
      button.createSpan({ text: label });
      button.addEventListener("click", () => void this.plugin.activate(type));
    });
    return page;
  }
  renderFailure(error, retry) {
    console.error(`[MYM Life] ${this.getViewType()} render failed`, error);
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page mym-error-page" });
    const card = page.createDiv({ cls: "mym-error", attr: { role: "alert" } });
    const icon = card.createDiv({ cls: "mym-error-icon" });
    (0, import_obsidian.setIcon)(icon, "circle-alert");
    card.createEl("h1", { text: "\u9996\u9875\u6682\u65F6\u6CA1\u6709\u52A0\u8F7D\u51FA\u6765" });
    card.createEl("p", { text: "MYM \u5DF2\u4FDD\u62A4\u4F60\u7684\u6570\u636E\u3002\u53EF\u4EE5\u7ACB\u5373\u91CD\u8BD5\uFF1B\u5982\u679C\u4ECD\u5931\u8D25\uFF0C\u9519\u8BEF\u5DF2\u5199\u5165\u5F00\u53D1\u8005\u63A7\u5236\u53F0\u3002" });
    const detail = error instanceof Error ? error.message : String(error);
    card.createEl("code", { text: detail || "\u672A\u77E5\u6E32\u67D3\u9519\u8BEF" });
    const button = card.createEl("button", { text: "\u91CD\u65B0\u52A0\u8F7D\u9996\u9875" });
    button.addEventListener("click", retry);
  }
  openNote(file) {
    void this.app.workspace.getLeaf(false).openFile(file);
  }
};
var HomeView = class extends MymView {
  getViewType() {
    return HOME_VIEW;
  }
  getDisplayText() {
    return "\u4EBA\u751F\u9996\u9875";
  }
  getIcon() {
    return "sprout";
  }
  onOpen() {
    this.renderSafely();
    this.watchVault(() => this.renderSafely());
    return Promise.resolve();
  }
  renderSafely() {
    try {
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.renderSafely());
    }
  }
  render() {
    const page = this.shell(HOME_VIEW);
    const hour = (/* @__PURE__ */ new Date()).getHours();
    const greeting = hour < 6 ? "\u591C\u6DF1\u4E86" : hour < 12 ? "\u65E9\u4E0A\u597D" : hour < 18 ? "\u4E0B\u5348\u597D" : "\u665A\u4E0A\u597D";
    const hero = page.createDiv({ cls: "mym-hero" });
    hero.createDiv({ cls: "mym-eyebrow", text: dateLabel(Date.now()) });
    hero.createEl("h1", { text: greeting });
    hero.createEl("p", { text: "\u770B\u6E05\u6B63\u5728\u53D1\u751F\u7684\u53D8\u5316\uFF0C\u7136\u540E\u7EE7\u7EED\u751F\u6D3B\u3002" });
    const quick = page.createDiv({ cls: "mym-quick" });
    this.quickButton(quick, "plus", "\u8BB0\u5F55", () => new CaptureModal(this.app).open());
    this.quickButton(quick, "calendar-check", "\u4ECA\u5929", () => void this.plugin.openToday());
    this.quickButton(quick, "orbit", "\u56FE\u8C31", () => void this.plugin.activate(GRAPH_VIEW));
    const goals = this.plugin.goals();
    this.sectionHeading(page, "\u5F53\u524D\u91CD\u70B9", "\u53EA\u653E\u771F\u6B63\u6295\u5165\u7684\u4E8B");
    const focus = goals.filter((goal) => goal.status === "focus").slice(0, 5);
    if (focus.length === 0) this.emptyState(page, "\u628A\u76EE\u6807\u7684 status \u6539\u4E3A focus\uFF0C\u5B83\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002", "04 Goals/\u76EE\u6807\u4F7F\u7528\u8BF4\u660E.md");
    else {
      const list = page.createDiv({ cls: "mym-focus-list" });
      focus.forEach((goal, index) => this.goalCard(list, goal, index === 0));
    }
    const recapRank = { focus: 0, active: 1, paused: 2, done: 3 };
    const recaps = goals.filter((goal) => goal.recap || goal.metric).sort((a, b) => recapRank[a.status] - recapRank[b.status] || b.updated - a.updated).slice(0, 4);
    this.sectionHeading(page, "\u6700\u8FD1\u53D8\u5316", "\u53EA\u53CD\u9988\u771F\u5B9E\u72B6\u6001\u4E0E\u6210\u679C");
    const recapGrid = page.createDiv({ cls: "mym-recap-grid" });
    recaps.forEach((goal) => {
      const card = recapGrid.createEl("button", { cls: "mym-recap" });
      card.createSpan({ cls: "mym-recap-domain", text: goal.domain || goal.title });
      card.createEl("strong", { text: goal.metric || (goal.progress === void 0 ? "\u72B6\u6001\u66F4\u65B0" : `${goal.progress}%`) });
      card.createSpan({ text: goal.recap || "\u8FDB\u5EA6\u5DF2\u66F4\u65B0" });
      card.addEventListener("click", () => this.openNote(goal.file));
    });
    if (recaps.length === 0) recapGrid.createDiv({ cls: "mym-muted", text: "\u5728\u76EE\u6807\u5C5E\u6027\u4E2D\u586B\u5199 metric \u6216 recap \u540E\u663E\u793A\u3002" });
    const groups = [["active", "\u5176\u4ED6\u8FDB\u884C\u4E2D"], ["paused", "\u6682\u505C / \u7B49\u5F85"], ["done", "\u5DF2\u5B8C\u6210 / \u5DF2\u8D70\u8FC7"]];
    groups.forEach(([status, label]) => {
      const items = goals.filter((goal) => goal.status === status);
      if (!items.length) return;
      this.sectionHeading(page, label, `${items.length} \u9879`);
      const compact = page.createDiv({ cls: "mym-goal-compact-list" });
      items.forEach((goal) => {
        const row = compact.createEl("button", { cls: "mym-goal-compact" });
        row.createSpan({ text: goal.title });
        row.createSpan({ cls: "mym-muted", text: goal.metric || (goal.progress === void 0 ? "\u67E5\u770B" : `${goal.progress}%`) });
        row.addEventListener("click", () => this.openNote(goal.file));
      });
    });
    this.sectionHeading(page, "\u6700\u8FD1\u53D1\u751F", "Markdown \u65F6\u95F4\u6D41");
    const recent = this.plugin.dailyFiles().slice(0, 4);
    const stream = page.createDiv({ cls: "mym-stream" });
    if (!recent.length) stream.createDiv({ cls: "mym-empty", text: "\u8FD8\u6CA1\u6709\u6700\u8FD1\u8BB0\u5F55\u3002\u70B9\u4E0A\u65B9\u201C\u8BB0\u5F55\u201D\u5199\u4E0B\u7B2C\u4E00\u6761\u3002" });
    recent.forEach((file) => {
      const row = stream.createEl("button", { cls: "mym-stream-row" });
      row.createSpan({ cls: "mym-stream-date", text: file.basename.slice(5) || dateLabel(file.stat.mtime) });
      const body = row.createDiv();
      body.createEl("strong", { text: file.basename });
      body.createSpan({ text: this.plugin.summary(file) });
      row.addEventListener("click", () => this.openNote(file));
    });
  }
  quickButton(parent, icon, label, action) {
    const button = parent.createEl("button", { cls: "mym-quick-button" });
    (0, import_obsidian.setIcon)(button.createSpan({ cls: "mym-quick-icon" }), icon);
    button.createSpan({ text: label });
    button.addEventListener("click", action);
  }
  sectionHeading(parent, title, subtitle) {
    const heading = parent.createDiv({ cls: "mym-section-heading" });
    heading.createEl("h2", { text: title });
    heading.createSpan({ text: subtitle });
  }
  emptyState(parent, text, path) {
    const box = parent.createDiv({ cls: "mym-empty" });
    box.createSpan({ text });
    const button = box.createEl("button", { text: "\u67E5\u770B\u8BF4\u660E" });
    button.addEventListener("click", () => void this.app.workspace.openLinkText(path, "", false));
  }
  goalCard(parent, goal, primary) {
    const card = parent.createEl("button", { cls: `mym-goal-card${primary ? " is-primary" : ""}` });
    const top = card.createDiv({ cls: "mym-goal-top" });
    top.createSpan({ cls: "mym-goal-domain", text: goal.domain || "\u5F53\u524D\u76EE\u6807" });
    top.createSpan({ text: goal.progress === void 0 ? "\u8FDB\u884C\u4E2D" : `${goal.progress}%` });
    card.createEl("h3", { text: goal.title });
    if (goal.metric) card.createEl("strong", { cls: "mym-goal-metric", text: goal.metric });
    if (goal.recap) card.createEl("p", { text: goal.recap });
    if (goal.progress !== void 0) {
      const track = card.createDiv({ cls: "mym-progress", attr: { role: "progressbar", "aria-valuenow": String(goal.progress), "aria-valuemin": "0", "aria-valuemax": "100" } });
      track.createDiv({ attr: { style: `width:${clamp(goal.progress, 0, 100)}%` } });
    }
    if (goal.due) {
      const days = Math.ceil((new Date(goal.due).getTime() - Date.now()) / 864e5);
      card.createSpan({ cls: "mym-goal-due", text: days >= 0 ? `\u8FD8\u6709 ${days} \u5929` : `\u5DF2\u8FC7 ${Math.abs(days)} \u5929` });
    }
    card.addEventListener("click", () => this.openNote(goal.file));
  }
};
var TimelineView = class extends MymView {
  getViewType() {
    return TIMELINE_VIEW;
  }
  getDisplayText() {
    return "\u4EBA\u751F\u65F6\u95F4\u6D41";
  }
  getIcon() {
    return "calendar-days";
  }
  onOpen() {
    this.renderSafely();
    this.watchVault(() => this.renderSafely());
    return Promise.resolve();
  }
  renderSafely() {
    try {
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.renderSafely());
    }
  }
  render() {
    const page = this.shell(TIMELINE_VIEW);
    const head = page.createDiv({ cls: "mym-title-row" });
    const words = head.createDiv();
    words.createEl("h1", { text: "\u4EBA\u751F\u65F6\u95F4\u6D41" });
    words.createEl("p", { text: "\u4E0D\u7528\u6253\u5361\uFF0C\u53EA\u770B\u771F\u6B63\u7559\u4E0B\u7684\u4E1C\u897F\u3002" });
    const add = head.createEl("button", { cls: "mym-icon-button", attr: { "aria-label": "\u5FEB\u901F\u8BB0\u5F55" } });
    (0, import_obsidian.setIcon)(add, "plus");
    add.addEventListener("click", () => new CaptureModal(this.app).open());
    const files = this.plugin.dailyFiles();
    if (!files.length) {
      page.createDiv({ cls: "mym-empty", text: "\u8FD8\u6CA1\u6709 Daily Note\u3002\u70B9\u53F3\u4E0A\u89D2\u5F00\u59CB\u7B2C\u4E00\u6761\u8BB0\u5F55\u3002" });
      return;
    }
    const timeline = page.createDiv({ cls: "mym-timeline" });
    files.slice(0, 90).forEach((file) => {
      const item = timeline.createEl("button", { cls: "mym-time-item" });
      item.createDiv({ cls: "mym-time-dot" });
      const card = item.createDiv({ cls: "mym-time-card" });
      card.createSpan({ cls: "mym-eyebrow", text: dateLabel(file.stat.mtime) });
      card.createEl("h2", { text: file.basename });
      card.createEl("p", { text: this.plugin.summary(file) });
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = cache ? (0, import_obsidian.getAllTags)(cache) || [] : [];
      if (tags.length) card.createSpan({ cls: "mym-tags", text: tags.slice(0, 3).join("  ") });
      item.addEventListener("click", () => this.openNote(file));
    });
  }
};
var SearchView = class extends MymView {
  getViewType() {
    return SEARCH_VIEW;
  }
  getDisplayText() {
    return "\u5168\u5C40\u641C\u7D22";
  }
  getIcon() {
    return "search";
  }
  onOpen() {
    try {
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.onOpen());
    }
    return Promise.resolve();
  }
  render() {
    const page = this.shell(SEARCH_VIEW);
    page.createEl("h1", { text: "\u641C\u7D22" });
    page.createEl("p", { text: "\u6807\u9898\u3001\u8DEF\u5F84\u3001\u6807\u7B7E\u4E0E\u5C5E\u6027\u5373\u65F6\u7B5B\u9009\uFF1B\u6B63\u6587\u4EA4\u7ED9 Obsidian \u539F\u751F\u641C\u7D22\u3002" });
    const searchBox = page.createDiv({ cls: "mym-search-box" });
    (0, import_obsidian.setIcon)(searchBox.createSpan(), "search");
    const input = searchBox.createEl("input", { type: "search", placeholder: "\u641C\u7D22\u76EE\u6807\u3001\u77E5\u8BC6\u3001\u6807\u7B7E\u2026", attr: { enterkeyhint: "search" } });
    const results = page.createDiv({ cls: "mym-search-results" });
    const native = page.createEl("button", { cls: "mym-native-search", text: "\u6253\u5F00 Obsidian \u5168\u6587\u641C\u7D22" });
    native.addEventListener("click", () => void this.openNativeSearch());
    const update = () => {
      results.empty();
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) {
        results.createDiv({ cls: "mym-muted", text: "\u8F93\u5165\u5173\u952E\u8BCD\u5F00\u59CB\u641C\u7D22\u3002" });
        return;
      }
      const matches = this.app.vault.getMarkdownFiles().filter((file) => {
        const fm = this.plugin.frontmatter(file);
        const cache = this.app.metadataCache.getFileCache(file);
        const tags = cache ? (0, import_obsidian.getAllTags)(cache) || [] : [];
        const haystack = `${file.basename} ${file.path} ${tags.join(" ")} ${Object.values(fm).map((value) => asText(value)).join(" ")}`.toLocaleLowerCase();
        return haystack.includes(query);
      }).slice(0, 60);
      if (!matches.length) results.createDiv({ cls: "mym-empty", text: "\u5C5E\u6027\u7D22\u5F15\u4E2D\u6CA1\u6709\u7ED3\u679C\uFF0C\u53EF\u8BD5\u8BD5\u5168\u6587\u641C\u7D22\u3002" });
      matches.forEach((file) => {
        const row = results.createEl("button", { cls: "mym-search-result" });
        const body = row.createDiv();
        body.createEl("strong", { text: file.basename });
        body.createSpan({ text: this.plugin.summary(file) });
        row.createSpan({ cls: "mym-search-path", text: file.parent?.name || "Vault" });
        row.addEventListener("click", () => this.openNote(file));
      });
    };
    const debouncedUpdate = debounce(() => update(), 80);
    input.addEventListener("input", () => debouncedUpdate());
    window.setTimeout(() => input.focus(), 60);
  }
  async openNativeSearch() {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: "search", active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
};
var GraphView = class extends MymView {
  constructor() {
    super(...arguments);
    this.nodes = [];
    this.edges = [];
    this.selected = 0;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
  }
  getViewType() {
    return GRAPH_VIEW;
  }
  getDisplayText() {
    return "\u77E5\u8BC6\u56FE\u8C31";
  }
  getIcon() {
    return "orbit";
  }
  onOpen() {
    try {
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.onOpen());
    }
    this.watchVault(() => {
      try {
        this.build();
      } catch (error) {
        this.renderFailure(error, () => this.onOpen());
      }
    });
    return Promise.resolve();
  }
  onClose() {
    this.resize?.disconnect();
    return super.onClose();
  }
  render() {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root", "mym-graph-root");
    const wrap = this.contentEl.createDiv({ cls: "mym-graph-wrap" });
    const top = wrap.createDiv({ cls: "mym-graph-top" });
    const back = top.createEl("button", { attr: { "aria-label": "\u8FD4\u56DE\u9996\u9875" } });
    (0, import_obsidian.setIcon)(back, "chevron-left");
    back.addEventListener("click", () => void this.plugin.activate(HOME_VIEW));
    top.createDiv({ cls: "mym-graph-title", text: "\u5C40\u90E8\u77E5\u8BC6\u56FE\u8C31" });
    const reset = top.createEl("button", { attr: { "aria-label": "\u91CD\u7F6E\u89C6\u56FE" } });
    (0, import_obsidian.setIcon)(reset, "locate-fixed");
    reset.addEventListener("click", () => {
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.draw();
    });
    this.canvas = wrap.createEl("canvas", { cls: "mym-graph-canvas", attr: { "aria-label": "\u53EF\u7F29\u653E\u77E5\u8BC6\u56FE\u8C31" } });
    this.ctx = this.canvas.getContext("2d") || void 0;
    const preview = wrap.createDiv({ cls: "mym-graph-preview" });
    const label = preview.createDiv({ cls: "mym-graph-preview-label", text: "\u5F53\u524D\u8282\u70B9" });
    const title = preview.createEl("h2");
    const summary = preview.createEl("p");
    const open = preview.createEl("button", { text: "\u6253\u5F00\u7B14\u8BB0" });
    open.addEventListener("click", () => {
      const node = this.nodes[this.selected];
      if (node) this.openNote(node.file);
    });
    const updatePreview = () => {
      const node = this.nodes[this.selected];
      if (!node) {
        title.setText("\u6682\u65E0\u77E5\u8BC6\u8282\u70B9");
        summary.setText("\u5728 03 Knowledge \u4E2D\u6DFB\u52A0\u94FE\u63A5\u7B14\u8BB0\u3002 ");
        return;
      }
      label.setText(node.level === 0 ? "\u4E2D\u5FC3\u8282\u70B9" : node.domain || "\u5173\u8054\u77E5\u8BC6");
      title.setText(node.file.basename);
      summary.setText(this.plugin.summary(node.file));
    };
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas?.setPointerCapture(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.pointer.moved = true;
      this.panX += dx;
      this.panY += dy;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.draw();
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.pointer) return;
      if (!this.pointer.moved) {
        const index = this.hitTest(event.clientX, event.clientY);
        if (index >= 0) {
          this.selected = index;
          updatePreview();
          this.draw();
        }
      }
      this.pointer = void 0;
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.scale = clamp(this.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.55, 2.4);
      this.draw();
    }, { passive: false });
    let pinchDistance = 0;
    const touches = /* @__PURE__ */ new Map();
    this.canvas.addEventListener("pointerdown", (event) => {
      touches.set(event.pointerId, event);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, event);
      if (touches.size === 2) {
        const pair = Array.from(touches.values());
        const distance = Math.hypot(pair[0].clientX - pair[1].clientX, pair[0].clientY - pair[1].clientY);
        if (pinchDistance) this.scale = clamp(this.scale * distance / pinchDistance, 0.55, 2.4);
        pinchDistance = distance;
        this.draw();
      }
    });
    const endTouch = (event) => {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinchDistance = 0;
    };
    this.canvas.addEventListener("pointerup", endTouch);
    this.canvas.addEventListener("pointercancel", endTouch);
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(this.canvas);
    this.build();
    updatePreview();
  }
  build() {
    const active = this.app.workspace.getActiveFile();
    const knowledge = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("03 Knowledge/"));
    this.center = active && active.extension === "md" ? active : knowledge[0] || this.app.vault.getMarkdownFiles()[0];
    if (!this.center) {
      this.nodes = [];
      this.edges = [];
      this.draw();
      return;
    }
    const reverse = /* @__PURE__ */ new Map();
    Object.entries(this.app.metadataCache.resolvedLinks).forEach(([source, targets]) => {
      Object.keys(targets).forEach((target) => {
        const sources = reverse.get(target) || [];
        sources.push(source);
        reverse.set(target, sources);
      });
    });
    const chosen = /* @__PURE__ */ new Map();
    const queue = [{ file: this.center, level: 0 }];
    const edges = [];
    while (queue.length && chosen.size < 80) {
      const current = queue.shift();
      if (!current || chosen.has(current.file.path) || current.level > 2) continue;
      const index = chosen.size;
      chosen.set(current.file.path, index);
      const links = this.neighbors(current.file, reverse).slice(0, current.level === 0 ? 18 : 7);
      links.forEach((file) => {
        if (!chosen.has(file.path) && current.level < 2) queue.push({ file, level: current.level + 1 });
      });
    }
    const entries = Array.from(chosen.entries());
    const nodes = entries.map(([path, index]) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      const level = path === this.center?.path ? 0 : this.neighbors(this.center, reverse).some((item) => item.path === path) ? 1 : 2;
      const peers = entries.filter(([peer]) => peer !== this.center?.path && (level === 1 || this.neighbors(file, reverse).some((neighbor) => neighbor.path === peer)));
      const angle = index === 0 ? 0 : Math.PI * 2 * (index - 1) / Math.max(1, entries.length - 1);
      const radius = level === 0 ? 0 : level === 1 ? 125 : 230 + index % 3 * 18;
      const fm = this.plugin.frontmatter(file);
      return { file, level, domain: asText(fm.domain, file.parent?.name || "\u77E5\u8BC6"), x: Math.cos(angle) * radius, y: Math.sin(angle) * radius + peers.length % 2 * 8 };
    });
    nodes.forEach((node, from) => this.neighbors(node.file, reverse).forEach((neighbor) => {
      const to = chosen.get(neighbor.path);
      if (to !== void 0 && from < to) edges.push({ from, to });
    }));
    this.nodes = nodes;
    this.edges = edges;
    this.selected = 0;
    this.resizeCanvas();
  }
  neighbors(file, reverse) {
    const cache = this.app.metadataCache.getFileCache(file);
    const paths = /* @__PURE__ */ new Set();
    [...cache?.links || [], ...cache?.embeds || []].forEach((link) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (target?.extension === "md") paths.add(target.path);
    });
    (reverse.get(file.path) || []).forEach((path) => paths.add(path));
    return Array.from(paths).map((path) => this.app.vault.getAbstractFileByPath(path)).filter((item) => item instanceof import_obsidian.TFile);
  }
  resizeCanvas() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  screen(node) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.width / 2 + this.panX + node.x * this.scale, y: rect.height / 2 + this.panY + node.y * this.scale };
  }
  draw() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, rect.width, rect.height);
    const gradient = ctx.createRadialGradient(rect.width / 2, rect.height / 2, 10, rect.width / 2, rect.height / 2, Math.max(rect.width, rect.height));
    gradient.addColorStop(0, "#152d2a");
    gradient.addColorStop(1, "#081412");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);
    const adjacent = /* @__PURE__ */ new Set([this.selected]);
    this.edges.forEach((edge) => {
      if (edge.from === this.selected) adjacent.add(edge.to);
      if (edge.to === this.selected) adjacent.add(edge.from);
    });
    this.edges.forEach((edge) => {
      const a = this.screen(this.nodes[edge.from]);
      const b = this.screen(this.nodes[edge.to]);
      const active = edge.from === this.selected || edge.to === this.selected;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = active ? "rgba(126, 224, 179, .58)" : "rgba(154, 190, 178, .14)";
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.stroke();
    });
    this.nodes.forEach((node, index) => {
      const point = this.screen(node);
      const active = adjacent.has(index);
      const selected = index === this.selected;
      const radius = (selected ? 13 : node.level === 0 ? 11 : node.level === 1 ? 7 : 4.5) * Math.sqrt(this.scale);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + (selected ? 6 : 0), 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(108, 230, 171, .16)" : "transparent";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      const palette = ["#77dfaa", "#7fbead", "#8ea5d9", "#d9b987"];
      ctx.fillStyle = active ? palette[Math.abs(this.hash(node.domain)) % palette.length] : "#34534b";
      ctx.fill();
      if (node.level < 2 || selected || active) {
        ctx.font = `${selected ? 600 : 500} ${selected ? 14 : 12}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = active ? "rgba(239,250,245,.94)" : "rgba(197,215,208,.43)";
        const label = node.file.basename.length > 12 ? `${node.file.basename.slice(0, 11)}\u2026` : node.file.basename;
        ctx.fillText(label, point.x, point.y + radius + 7);
      }
    });
  }
  hitTest(clientX, clientY) {
    if (!this.canvas) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let nearest = -1;
    let distance = 32;
    this.nodes.forEach((node, index) => {
      const point = this.screen(node);
      const current = Math.hypot(point.x - x, point.y - y);
      if (current < distance) {
        nearest = index;
        distance = current;
      }
    });
    return nearest;
  }
  hash(input) {
    let value = 0;
    for (let i = 0; i < input.length; i++) value = (value << 5) - value + input.charCodeAt(i) | 0;
    return value;
  }
};
var CaptureModal = class extends import_obsidian.Modal {
  constructor() {
    super(...arguments);
    this.moods = /* @__PURE__ */ new Set();
  }
  onOpen() {
    this.modalEl.addClass("mym-capture-modal");
    this.titleEl.setText("\u8BB0\u4E00\u4E0B");
    const input = this.contentEl.createEl("textarea", { placeholder: "\u6B64\u523B\u53D1\u751F\u4E86\u4EC0\u4E48\uFF1F", attr: { rows: "6", enterkeyhint: "done" } });
    this.contentEl.createDiv({ cls: "mym-field-label", text: "\u60C5\u7EEA\uFF08\u53EF\u591A\u9009\uFF0C\u4E5F\u53EF\u4EE5\u4E0D\u9009\uFF09" });
    const moodRow = this.contentEl.createDiv({ cls: "mym-moods" });
    ["\u5F00\u5FC3", "\u5E73\u9759", "\u7126\u8651", "\u4F4E\u843D", "\u6124\u6012", "\u75B2\u60EB", "\u671F\u5F85"].forEach((mood) => {
      const button = moodRow.createEl("button", { text: mood });
      button.addEventListener("click", () => {
        if (this.moods.has(mood)) this.moods.delete(mood);
        else this.moods.add(mood);
        button.toggleClass("is-active", this.moods.has(mood));
      });
    });
    const actions = this.contentEl.createDiv({ cls: "mym-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "\u4FDD\u5B58\u5230\u4ECA\u5929" });
    save.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) {
        new import_obsidian.Notice("\u5148\u5199\u4E00\u70B9\u5185\u5BB9");
        input.focus();
        return;
      }
      save.disabled = true;
      const folder = "02 Daily";
      const path = `${folder}/${localDate()}.md`;
      const existing = this.app.vault.getAbstractFileByPath(path);
      const stamp = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(/* @__PURE__ */ new Date());
      const moodText = this.moods.size ? `
\u60C5\u7EEA\uFF1A${Array.from(this.moods).map((item) => `#\u60C5\u7EEA/${item}`).join(" ")}` : "";
      const block = `

## ${stamp}

${text}${moodText}
`;
      try {
        if (existing instanceof import_obsidian.TFile) await this.app.vault.process(existing, (content) => content + block);
        else {
          if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
          await this.app.vault.create(path, `---
type: daily
date: ${localDate()}
---
# ${localDate()}${block}`);
        }
        new import_obsidian.Notice("\u5DF2\u4FDD\u5B58\u5230\u4ECA\u5929");
        this.close();
      } catch (error) {
        save.disabled = false;
        console.error(error);
        new import_obsidian.Notice("\u4FDD\u5B58\u5931\u8D25\uFF0C\u539F\u5185\u5BB9\u672A\u88AB\u5220\u9664");
      }
    });
    window.setTimeout(() => input.focus(), 80);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MymLifePlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerView(HOME_VIEW, (leaf) => new HomeView(leaf, this));
    this.registerView(TIMELINE_VIEW, (leaf) => new TimelineView(leaf, this));
    this.registerView(GRAPH_VIEW, (leaf) => new GraphView(leaf, this));
    this.registerView(SEARCH_VIEW, (leaf) => new SearchView(leaf, this));
    this.addRibbonIcon("sprout", "\u6253\u5F00 MYM \u4EBA\u751F\u9996\u9875", () => void this.activate(HOME_VIEW));
    this.addCommand({ id: "open-life-home", name: "\u6253\u5F00\u4EBA\u751F\u9996\u9875", callback: () => void this.activate(HOME_VIEW) });
    this.addCommand({ id: "quick-capture", name: "\u5FEB\u901F\u8BB0\u5F55\u5230\u4ECA\u5929", callback: () => new CaptureModal(this.app).open() });
    this.addCommand({ id: "open-life-graph", name: "\u6253\u5F00\u5C40\u90E8\u77E5\u8BC6\u56FE\u8C31", callback: () => void this.activate(GRAPH_VIEW) });
    this.app.workspace.onLayoutReady(() => {
      void this.activate(HOME_VIEW).catch((error) => {
        console.error("[MYM Life] failed to activate home view", error);
        new import_obsidian.Notice("MYM \u4EBA\u751F\u9996\u9875\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u518D\u6B21\u70B9\u51FB\u53F6\u5B50\u56FE\u6807");
      });
    });
  }
  async activate(type) {
    const existing = this.app.workspace.getLeavesOfType(type);
    let leaf = existing.find((candidate) => candidate.view.containerEl.isConnected) || existing[0];
    if (leaf) {
      await this.app.workspace.revealLeaf(leaf);
      await leaf.loadIfDeferred();
      if (leaf.view.containerEl.isConnected) return;
      this.app.workspace.detachLeavesOfType(type);
    }
    leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type, active: true });
    await this.app.workspace.revealLeaf(leaf);
    await leaf.loadIfDeferred();
  }
  async openToday() {
    const path = `02 Daily/${localDate()}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }
    if (!this.app.vault.getAbstractFileByPath("02 Daily")) await this.app.vault.createFolder("02 Daily");
    const file = await this.app.vault.create(path, `---
type: daily
date: ${localDate()}
---
# ${localDate()}

`);
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  frontmatter(file) {
    return this.app.metadataCache.getFileCache(file)?.frontmatter || {};
  }
  goals() {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && asText(this.frontmatter(file).type) === "goal").map((file) => {
      const fm = this.frontmatter(file);
      const rawProgress = Number(fm.progress);
      return {
        file,
        title: asText(fm.title, file.basename),
        status: statusOf(fm.status),
        progress: Number.isFinite(rawProgress) ? clamp(rawProgress, 0, 100) : void 0,
        metric: asText(fm.metric) || void 0,
        recap: asText(fm.recap) || void 0,
        due: asText(fm.due) || void 0,
        domain: asText(fm.domain) || void 0,
        updated: file.stat.mtime
      };
    }).sort((a, b) => b.updated - a.updated);
  }
  dailyFiles() {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && (file.path.startsWith("02 Daily/") || asText(this.frontmatter(file).type) === "daily")).sort((a, b) => b.basename.localeCompare(a.basename) || b.stat.mtime - a.stat.mtime);
  }
  summary(file) {
    const fm = this.frontmatter(file);
    return asText(fm.recap) || asText(fm.summary) || asText(fm.metric) || file.path;
  }
  onunload() {
    [HOME_VIEW, TIMELINE_VIEW, GRAPH_VIEW, SEARCH_VIEW].forEach((type) => this.app.workspace.detachLeavesOfType(type));
  }
};
