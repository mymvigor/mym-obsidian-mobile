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
var DETAIL_VIEW = "mym-life-detail";
var TIMELINE_VIEW = "mym-life-timeline";
var GRAPH_VIEW = "mym-life-graph";
var SEARCH_VIEW = "mym-life-search";
var GOALS_VIEW = "mym-life-goals";
var PROFILE_VIEW = "mym-life-profile";
var MYM_VIEWS = [HOME_VIEW, DETAIL_VIEW, TIMELINE_VIEW, GRAPH_VIEW, SEARCH_VIEW, GOALS_VIEW, PROFILE_VIEW];
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
function heroDate(epoch) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(epoch));
}
function timeLabel(epoch) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(epoch));
}
function calendarDate(raw) {
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(date) : raw;
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
    this.plugin.leaveMym(this);
    return Promise.resolve();
  }
  watchVault(render) {
    const refresh = debounce(() => render(), 220);
    this.registerEvent(this.app.metadataCache.on("changed", () => refresh()));
    this.registerEvent(this.app.vault.on("create", () => refresh()));
    this.registerEvent(this.app.vault.on("delete", () => refresh()));
    this.registerEvent(this.app.vault.on("rename", () => refresh()));
  }
  startMobileLifecycle(render) {
    this.plugin.enterMym(this);
    let largestHeight = 0;
    let previousWidth = window.visualViewport?.width || window.innerWidth;
    const sync = () => {
      const viewport = window.visualViewport;
      const available = viewport?.height || window.innerHeight;
      const width = viewport?.width || window.innerWidth;
      const hostHeight = this.contentEl.parentElement?.clientHeight || this.contentEl.clientHeight || available;
      const height = Math.max(320, Math.min(available, hostHeight || available));
      if (Math.abs(width - previousWidth) > 80) largestHeight = height;
      else largestHeight = Math.max(largestHeight, height);
      previousWidth = width;
      this.contentEl.style.setProperty("--mym-app-height", `${Math.round(height)}px`);
      this.contentEl.style.setProperty("--mym-host-bottom", `${this.plugin.hostBottomInset(this.contentEl)}px`);
      document.body.style.setProperty("--mym-vv-height", `${Math.round(height)}px`);
      document.body.style.setProperty("--mym-vv-top", `${Math.round(viewport?.offsetTop || 0)}px`);
      this.contentEl.toggleClass("is-keyboard-open", largestHeight - height > 120);
    };
    sync();
    this.registerDomEvent(window, "resize", sync);
    this.registerDomEvent(window, "orientationchange", sync);
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      viewport.addEventListener("resize", sync);
      viewport.addEventListener("scroll", sync);
      this.register(() => {
        viewport.removeEventListener("resize", sync);
        viewport.removeEventListener("scroll", sync);
      });
    }
    this.registerDomEvent(this.contentEl, "focusin", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      window.setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), 180);
    });
    this.watchVault(render);
  }
  shell(active) {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page" });
    const dock = this.contentEl.createDiv({ cls: "mym-dock", attr: { role: "navigation", "aria-label": "\u4E3B\u5BFC\u822A" } });
    const items = [
      { icon: "home", label: "\u9996\u9875", type: HOME_VIEW },
      { icon: "clock-3", label: "\u65F6\u95F4", type: TIMELINE_VIEW },
      { icon: "plus", label: "\u8BB0\u5F55", capture: true },
      { icon: "book-open", label: "\u77E5\u8BC6", type: GRAPH_VIEW },
      { icon: "user-round", label: "\u6211\u7684", type: PROFILE_VIEW }
    ];
    items.forEach((item) => {
      const button = dock.createEl("button", {
        cls: `${item.type === active ? "is-active" : ""}${item.capture ? " mym-dock-capture" : ""}`.trim(),
        attr: { "aria-label": item.label, ...item.type === active ? { "aria-current": "page" } : {} }
      });
      (0, import_obsidian.setIcon)(button.createSpan(), item.icon);
      button.createSpan({ text: item.label });
      if (item.capture) button.addEventListener("click", () => new CaptureModal(this.app).open());
      else if (item.type) {
        const type = item.type;
        button.addEventListener("click", () => void this.plugin.openRoot(type));
      }
    });
    return page;
  }
  detailShell(parentLabel = "\u9996\u9875") {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page mym-detail-page" });
    const nav = page.createDiv({ cls: "mym-app-nav" });
    const back = nav.createEl("button", { cls: "mym-back", attr: { "aria-label": `\u8FD4\u56DE${parentLabel}` } });
    (0, import_obsidian.setIcon)(back.createSpan(), "chevron-left");
    back.createSpan({ text: parentLabel });
    back.addEventListener("click", () => void this.plugin.back());
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
    card.createEl("h1", { text: "\u9875\u9762\u6682\u65F6\u6CA1\u6709\u52A0\u8F7D\u51FA\u6765" });
    card.createEl("p", { text: "\u4F60\u7684\u5185\u5BB9\u6CA1\u6709\u4E22\u5931\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u5F53\u524D\u9875\u9762\u3002" });
    const button = card.createEl("button", { text: "\u91CD\u65B0\u52A0\u8F7D" });
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
  async onOpen() {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }
  async renderSafely() {
    try {
      const files = this.app.vault.getMarkdownFiles().filter((file) => {
        const type = asText(this.plugin.frontmatter(file).type);
        return type === "goal" || type === "daily" || type === "home" || file.path.startsWith("02 Daily/");
      });
      await this.plugin.hydrate(files);
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.renderSafely());
    }
  }
  render() {
    const page = this.shell(HOME_VIEW);
    const goals = this.plugin.goals();
    const homeFile = this.plugin.fileByType("home");
    const homeFrontmatter = homeFile ? this.plugin.frontmatter(homeFile) : {};
    const heroFile = homeFile ? this.plugin.heroFor(homeFile) : void 0;
    const hero = page.createDiv({ cls: `mym-home-hero${heroFile ? " has-image" : ""}` });
    if (heroFile) hero.style.setProperty("--mym-hero-image", `url("${this.app.vault.getResourcePath(heroFile)}")`);
    const heroTop = hero.createDiv({ cls: "mym-home-hero-top" });
    heroTop.createSpan({ text: heroDate(Date.now()) });
    const heroAction = heroTop.createEl("button", { attr: { "aria-label": "\u6253\u5F00\u641C\u7D22" } });
    (0, import_obsidian.setIcon)(heroAction, "search");
    heroAction.addEventListener("click", () => void this.plugin.push(SEARCH_VIEW, {}, "\u9996\u9875"));
    const heroCopy = hero.createDiv({ cls: "mym-home-hero-copy" });
    heroCopy.createEl("h1", { text: asText(homeFrontmatter.headline, "\u66F4\u81EA\u5F8B\n\u66F4\u5F3A\u58EE\n\u66F4\u81EA\u7531") });
    heroCopy.createEl("p", { text: asText(homeFrontmatter.motto, "\u628A\u6CE8\u610F\u529B\u653E\u5728\u771F\u6B63\u91CD\u8981\u7684\u4E8B\u60C5\u4E0A\u3002") });
    const heading = page.createDiv({ cls: "mym-section-heading mym-section-action" });
    heading.createEl("h2", { text: "\u5F53\u524D\u91CD\u70B9" });
    const allGoals = heading.createEl("button", { text: "\u5168\u90E8" });
    allGoals.addEventListener("click", () => void this.plugin.push(GOALS_VIEW, {}, "\u9996\u9875"));
    const focus = goals.filter((goal) => goal.status === "focus").slice(0, 5);
    if (focus.length === 0) this.emptyState(page);
    else {
      const list = page.createDiv({ cls: "mym-focus-compact" });
      focus.forEach((goal) => {
        const card = list.createEl("button", { cls: "mym-focus-row" });
        const thumb = card.createDiv({ cls: "mym-focus-thumb" });
        const image = this.plugin.heroFor(goal.file) || this.plugin.mediaFor(goal.file)[0]?.file;
        if (image) thumb.style.backgroundImage = `url("${this.app.vault.getResourcePath(image)}")`;
        else (0, import_obsidian.setIcon)(thumb, this.plugin.iconFor(goal));
        const copy = card.createDiv({ cls: "mym-focus-copy" });
        copy.createEl("strong", { text: goal.title });
        copy.createSpan({ text: goal.metric || goal.recap || "\u7EE7\u7EED\u63A8\u8FDB" });
        if (goal.progress !== void 0) {
          const track = copy.createDiv({ cls: "mym-progress", attr: { role: "progressbar", "aria-valuenow": String(goal.progress), "aria-valuemin": "0", "aria-valuemax": "100" } });
          track.createDiv({ attr: { style: `width:${clamp(goal.progress, 0, 100)}%` } });
        }
        const value = card.createDiv({ cls: "mym-focus-value" });
        const dueDays = goal.due ? Math.ceil((new Date(goal.due).getTime() - Date.now()) / 864e5) : void 0;
        value.createEl("strong", { text: goal.progress !== void 0 ? `${goal.progress}%` : dueDays !== void 0 && dueDays >= 0 ? `${dueDays} \u5929` : goal.metric || "\u8FDB\u884C\u4E2D" });
        if (goal.due) {
          value.createSpan({ text: dueDays !== void 0 && dueDays >= 0 ? "\u5012\u8BA1\u65F6" : "\u5DF2\u5230\u671F" });
        }
        card.addEventListener("click", () => void this.plugin.openGoal(goal));
      });
    }
    this.sectionHeading(page, "\u6700\u8FD1\u4EBA\u751F", "\u4F60\u7684\u751F\u6D3B\uFF0C\u4E0D\u662F\u6570\u636E\u8868");
    const recent = this.plugin.dailyFiles().slice(0, 6);
    const stream = page.createDiv({ cls: "mym-life-strip" });
    if (!recent.length) stream.createDiv({ cls: "mym-empty", text: "\u8FD8\u6CA1\u6709\u6700\u8FD1\u8BB0\u5F55\u3002\u70B9\u5E95\u90E8\u201C\u8BB0\u5F55\u201D\u5199\u4E0B\u7B2C\u4E00\u6761\u3002" });
    recent.forEach((file) => {
      const card = stream.createEl("button", { cls: "mym-life-card" });
      const visual = card.createDiv({ cls: "mym-life-card-media" });
      const model = this.plugin.presentation(file);
      this.mediaThumb(visual, model.media[0]);
      card.createEl("strong", { text: model.displayTitle });
      card.createSpan({ text: `${model.date}${model.time ? ` \xB7 ${model.time}` : ""}` });
      card.addEventListener("click", () => this.openNote(file));
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
  mediaThumb(parent, media) {
    if (!media) {
      (0, import_obsidian.setIcon)(parent, "image");
      return;
    }
    const source = this.app.vault.getResourcePath(media.file);
    if (media.kind === "image") {
      parent.style.backgroundImage = `url("${source}")`;
      return;
    }
    if (media.kind === "video") {
      const video = parent.createEl("video", { attr: { src: source, preload: "metadata", muted: "", playsinline: "" } });
      const play = parent.createDiv({ cls: "mym-media-play" });
      (0, import_obsidian.setIcon)(play, "play");
      const duration = parent.createSpan({ cls: "mym-media-duration", text: "\u89C6\u9891" });
      video.addEventListener("loadedmetadata", () => {
        const total = Math.round(video.duration || 0);
        duration.setText(total ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : "\u89C6\u9891");
      }, { once: true });
      const start = (event) => {
        event.stopPropagation();
        video.controls = true;
        video.muted = false;
        play.hide();
        duration.hide();
        void video.play();
      };
      video.addEventListener("click", start);
      play.addEventListener("click", start);
      return;
    }
    (0, import_obsidian.setIcon)(parent, "audio-lines");
  }
  emptyState(parent) {
    const box = parent.createDiv({ cls: "mym-empty" });
    box.createEl("strong", { text: "\u5F53\u524D\u8FD8\u6CA1\u6709\u91CD\u70B9\u76EE\u6807" });
    box.createSpan({ text: "\u4ECE\u76EE\u6807\u9875\u9009\u62E9\u4F60\u73B0\u5728\u6700\u60F3\u6295\u5165\u7684\u4E8B\u60C5\u3002" });
    const button = box.createEl("button", { text: "\u9009\u62E9\u76EE\u6807" });
    button.addEventListener("click", () => void this.plugin.push(GOALS_VIEW, {}, "\u9996\u9875"));
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
    card.addEventListener("click", () => void this.plugin.openGoal(goal));
  }
};
var DetailView = class extends MymView {
  constructor() {
    super(...arguments);
    this.goalPath = "";
  }
  getViewType() {
    return DETAIL_VIEW;
  }
  getDisplayText() {
    return "\u4E3B\u7EBF\u8BE6\u60C5";
  }
  getIcon() {
    return "leaf";
  }
  getState() {
    return { goalPath: this.goalPath };
  }
  async setState(state, result) {
    await super.setState(state, result);
    this.goalPath = asText(state.goalPath);
    if (this.contentEl.isConnected) this.renderSafely();
  }
  async onOpen() {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }
  async renderSafely() {
    try {
      const relevant = this.app.vault.getMarkdownFiles().filter((file) => {
        const type = asText(this.plugin.frontmatter(file).type);
        return file.path === this.goalPath || type === "goal" || type === "daily" || file.path.startsWith("02 Daily/") || file.path.startsWith("03 Knowledge/");
      });
      await this.plugin.hydrate(relevant);
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.renderSafely());
    }
  }
  render() {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page mym-detail-page" });
    if (!this.goalPath) {
      const loading = page.createDiv({ cls: "mym-state-card mym-loading", attr: { role: "status", "aria-live": "polite" } });
      loading.createDiv({ cls: "mym-state-orb" });
      loading.createEl("h1", { text: "\u6B63\u5728\u6253\u5F00\u4E3B\u7EBF" });
      loading.createEl("p", { text: "MYM \u6B63\u5728\u6574\u7406\u8FD9\u4E00\u6BB5\u4EBA\u751F\u3002" });
      return;
    }
    const goal = this.plugin.goalForPath(this.goalPath);
    if (!goal) {
      const missing = page.createDiv({ cls: "mym-state-card" });
      const icon = missing.createDiv({ cls: "mym-state-icon" });
      (0, import_obsidian.setIcon)(icon, "file-question");
      missing.createEl("h1", { text: "\u8FD9\u6761\u4E3B\u7EBF\u6682\u65F6\u627E\u4E0D\u5230" });
      missing.createEl("p", { text: "\u7B14\u8BB0\u53EF\u80FD\u521A\u521A\u79FB\u52A8\u6216\u91CD\u547D\u540D\u3002\u8FD4\u56DE\u9996\u9875\u540E\uFF0CMYM \u4F1A\u6839\u636E\u6700\u65B0\u7D22\u5F15\u91CD\u65B0\u6574\u7406\u3002" });
      const button = missing.createEl("button", { cls: "mym-primary-button", text: "\u8FD4\u56DE\u9996\u9875" });
      button.addEventListener("click", () => void this.plugin.openRoot(HOME_VIEW));
      return;
    }
    const isCpa = /cpa|考试|审计|会计/i.test(`${goal.title} ${goal.domain || ""}`);
    const isFitness = /健身|身体|训练|体脂/i.test(`${goal.title} ${goal.domain || ""}`);
    const fm = this.plugin.frontmatter(goal.file);
    const heroFile = this.plugin.heroFor(goal.file) || this.plugin.mediaFor(goal.file).find((item) => item.kind === "image")?.file;
    const hero = page.createDiv({ cls: `mym-line-hero${heroFile ? " has-image" : ""}` });
    if (heroFile) hero.style.setProperty("--mym-line-image", `url("${this.app.vault.getResourcePath(heroFile)}")`);
    const back = hero.createEl("button", { cls: "mym-hero-back", attr: { "aria-label": "\u8FD4\u56DE\u9996\u9875" } });
    (0, import_obsidian.setIcon)(back, "chevron-left");
    back.addEventListener("click", () => void this.plugin.back());
    hero.createEl("h1", { text: goal.title });
    hero.createEl("p", { text: asText(fm.subtitle) || (isFitness ? "\u66F4\u5F3A\u58EE\uFF0C\u66F4\u6709\u80FD\u91CF\u7684\u81EA\u5DF1" : isCpa ? "\u4E00\u6B21\u901A\u8FC7\uFF0C\u7ED9\u672A\u6765\u66F4\u591A\u53EF\u80FD" : goal.recap || "\u6301\u7EED\u6295\u5165\uFF0C\u4FDD\u6301\u6E05\u9192\u3002") });
    const tabs = page.createDiv({ cls: "mym-detail-tabs", attr: { role: "tablist", "aria-label": `${goal.title} \u9875\u9762\u5BFC\u822A` } });
    const tabItems = isCpa ? [["\u603B\u89C8", "overview"], ["\u8BA1\u5212", "stage"], ["\u8BB0\u5F55", "records"], ["\u77E5\u8BC6", "knowledge"], ["\u8D44\u6599", "source"]] : [["\u603B\u89C8", "overview"], ["\u8BB0\u5F55", "records"], ["\u6570\u636E", "data"], ["\u77E5\u8BC6", "knowledge"], ["\u8D44\u6E90", "source"]];
    tabItems.forEach(([label, target], index) => {
      const button = tabs.createEl("button", { cls: index === 0 ? "is-active" : "", text: label, attr: { role: "tab" } });
      button.addEventListener("click", () => page.querySelector(`[data-mym-section="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    const recent = this.plugin.relatedDaily(goal.file).slice(0, 7);
    const knowledge = this.plugin.relatedKnowledge(goal.file);
    const media = this.plugin.mediaFor(goal.file);
    if (isFitness) this.renderFitness(page, goal, fm, media, recent);
    else if (isCpa) this.renderCpa(page, goal, fm, recent);
    else this.renderGeneric(page, goal, fm, media, recent);
    this.heading(page, "\u76F8\u5173\u77E5\u8BC6", knowledge.length ? `${knowledge.length} \u4E2A\u8FDE\u63A5` : "\u5C40\u90E8\u56FE\u8C31");
    const knowledgeCard = page.createEl("button", { cls: "mym-knowledge-entry", attr: { "data-mym-section": "knowledge" } });
    const knowledgeIcon = knowledgeCard.createDiv({ cls: "mym-knowledge-icon" });
    (0, import_obsidian.setIcon)(knowledgeIcon, "orbit");
    const knowledgeCopy = knowledgeCard.createDiv();
    knowledgeCopy.createEl("strong", { text: knowledge.length ? "\u8FDB\u5165\u6C89\u6D78\u77E5\u8BC6\u56FE\u8C31" : "\u4ECE\u8FD9\u6761\u4E3B\u7EBF\u5EFA\u7ACB\u77E5\u8BC6\u8FDE\u63A5" });
    knowledgeCopy.createSpan({ text: knowledge.length ? knowledge.slice(0, 3).map((file) => this.plugin.presentation(file).displayTitle).join(" \xB7 ") : "\u4ECE\u76F8\u5173\u5185\u5BB9\u4E2D\u5EFA\u7ACB\u8FDE\u63A5" });
    (0, import_obsidian.setIcon)(knowledgeCard.createSpan({ cls: "mym-entry-arrow" }), "arrow-up-right");
    knowledgeCard.addEventListener("click", () => void this.plugin.push(GRAPH_VIEW, { centerPath: goal.file.path }, goal.title));
    const edit = page.createEl("button", { cls: "mym-edit-source", attr: { "data-mym-section": "source" } });
    (0, import_obsidian.setIcon)(edit.createSpan(), "pencil");
    edit.createSpan({ text: "\u7F16\u8F91\u4E3B\u7EBF\u5185\u5BB9" });
    edit.addEventListener("click", () => this.openNote(goal.file));
    const floating = page.createEl("button", { cls: "mym-floating-add", attr: { "aria-label": "\u5FEB\u901F\u8BB0\u5F55" } });
    (0, import_obsidian.setIcon)(floating, "plus");
    floating.addEventListener("click", () => new CaptureModal(this.app).open());
  }
  renderFitness(page, goal, fm, media, recent) {
    const target = asText(fm.target) || goal.metric || "\u8FD8\u6CA1\u6709\u8BBE\u7F6E\u5F53\u524D\u76EE\u6807";
    const overview = page.createDiv({ cls: "mym-fitness-target", attr: { "data-mym-section": "overview" } });
    const copy = overview.createDiv();
    copy.createSpan({ cls: "mym-kicker", text: "\u5F53\u524D\u76EE\u6807" });
    copy.createEl("h2", { text: target });
    copy.createEl("p", { text: goal.due ? `\u76EE\u6807\uFF1A${this.formatDate(goal.due)}` : "\u7ED9\u76EE\u6807\u8BBE\u5B9A\u4E00\u4E2A\u6E05\u6670\u65E5\u671F" });
    const ring = overview.createDiv({ cls: "mym-progress-ring", attr: { style: `--mym-progress:${goal.progress ?? 0}` } });
    const ringText = ring.createDiv();
    ringText.createEl("strong", { text: goal.progress === void 0 ? "\u2014" : `${goal.progress}%` });
    ringText.createSpan({ text: goal.due ? this.daysText(goal.due) : "\u8FDB\u884C\u4E2D" });
    const stats = page.createDiv({ cls: "mym-stat-grid", attr: { "data-mym-section": "data" } });
    this.stat(stats, "\u4F53\u91CD", asText(fm.weight, "\u2014"), asText(fm.weightChange, "\u7B49\u5F85\u8BB0\u5F55"));
    this.stat(stats, "\u4F53\u8102\u7387", asText(fm.bodyFat, "\u2014"), asText(fm.bodyFatChange, "\u7B49\u5F85\u8BB0\u5F55"));
    this.stat(stats, "\u529B\u91CF", asText(fm.strength, "\u2014"), asText(fm.strengthChange, "\u7B49\u5F85\u8BB0\u5F55"));
    this.heading(page, "\u53D8\u5316\u5BF9\u6BD4", media.filter((item) => item.kind === "image").length >= 2 ? "\u771F\u5B9E\u53D8\u5316" : "\u7B49\u5F85\u7B2C\u4E8C\u5F20\u7167\u7247");
    const images = media.filter((item) => item.kind === "image").slice(0, 2);
    if (images.length) {
      const compare = page.createDiv({ cls: "mym-compare" });
      compare.toggleClass("is-single", images.length === 1);
      images.forEach((item, index) => {
        const frame = compare.createEl("button", { cls: "mym-compare-frame", attr: { "aria-label": "\u5168\u5C4F\u67E5\u770B\u7167\u7247" } });
        frame.createEl("img", { attr: { src: this.app.vault.getResourcePath(item.file), alt: index ? "\u5F53\u524D\u7167\u7247" : "\u4E4B\u524D\u7167\u7247", decoding: "async" } });
        frame.createSpan({ text: asText(index ? fm.afterDate : fm.beforeDate, index ? "\u73B0\u5728" : "\u4E4B\u524D") });
        frame.addEventListener("click", () => new MediaPreviewModal(this.app, item).open());
      });
      if (images.length === 2) {
        const arrow = compare.createDiv({ cls: "mym-compare-arrow" });
        (0, import_obsidian.setIcon)(arrow, "arrow-right");
      }
    } else page.createDiv({ cls: "mym-empty mym-empty-soft", text: "\u8BB0\u5F55\u4E24\u5F20\u7167\u7247\uFF0C\u5C31\u80FD\u5728\u8FD9\u91CC\u770B\u89C1\u771F\u5B9E\u53D8\u5316\u3002" });
    this.renderRecent(page, recent, "\u6700\u8FD1\u8BB0\u5F55", "\u8FD8\u6CA1\u6709\u5065\u8EAB\u8BB0\u5F55\u3002");
  }
  renderCpa(page, goal, fm, recent) {
    const countdown = page.createDiv({ cls: "mym-cpa-countdown", attr: { "data-mym-section": "overview" } });
    countdown.createSpan({ cls: "mym-kicker", text: "\u8DDD\u79BB\u8003\u8BD5\u8FD8\u6709" });
    countdown.createEl("h2", { text: goal.due ? this.daysText(goal.due) : "\u5C1A\u672A\u8BBE\u7F6E" });
    countdown.createEl("p", { text: goal.due ? this.formatDate(goal.due) : "\u8BBE\u7F6E\u8003\u8BD5\u65E5\u671F\u540E\u663E\u793A\u5012\u8BA1\u65F6" });
    const calendar = countdown.createDiv({ cls: "mym-countdown-icon" });
    (0, import_obsidian.setIcon)(calendar, "calendar-days");
    const progressCard = page.createDiv({ cls: "mym-study-progress", attr: { "data-mym-section": "data" } });
    const progressTitle = progressCard.createDiv();
    progressTitle.createEl("strong", { text: "\u5B66\u4E60\u8FDB\u5EA6" });
    progressTitle.createSpan({ text: goal.progress === void 0 ? "\u2014" : `${goal.progress}%` });
    const track = progressCard.createDiv({ cls: "mym-progress", attr: { role: "progressbar", "aria-valuenow": String(goal.progress ?? 0), "aria-valuemin": "0", "aria-valuemax": "100" } });
    track.createDiv({ attr: { style: `width:${goal.progress ?? 0}%` } });
    const subjects = progressCard.createDiv({ cls: "mym-subject-grid" });
    [["\u4F1A\u8BA1", fm.accounting], ["\u5BA1\u8BA1", fm.audit], ["\u8D22\u7BA1", fm.finance], ["\u7A0E\u6CD5", fm.tax]].forEach(([label, value]) => {
      const subject = subjects.createDiv({ cls: "mym-subject" });
      subject.createSpan({ text: String(label) });
      subject.createEl("strong", { text: asText(value, "\u2014") });
    });
    this.heading(page, "\u672C\u5468\u72B6\u6001", "7 \u5929");
    const week = page.createDiv({ cls: "mym-week-strip" });
    this.plugin.weekStatus(goal.file).forEach((item) => {
      const day = week.createDiv({ cls: item.active ? "is-active" : "" });
      day.createDiv();
      day.createSpan({ text: item.label });
    });
    this.heading(page, "\u5F53\u524D\u9636\u6BB5", "\u8BA1\u5212");
    const stage = page.createDiv({ cls: "mym-stage-card", attr: { "data-mym-section": "stage" } });
    stage.createEl("strong", { text: asText(fm.stage, "\u8FD8\u6CA1\u6709\u8BBE\u7F6E\u5F53\u524D\u9636\u6BB5") });
    stage.createSpan({ text: asText(fm.next, goal.metric || "\u5199\u4E0B\u8FD9\u5468\u6700\u91CD\u8981\u7684\u4E0B\u4E00\u6B65") });
    this.renderRecent(page, recent, "\u6700\u8FD1\u5B66\u4E60", "\u8FD8\u6CA1\u6709\u5B66\u4E60\u8BB0\u5F55\u3002");
  }
  renderGeneric(page, goal, fm, media, recent) {
    const overview = page.createDiv({ cls: "mym-fitness-target", attr: { "data-mym-section": "overview" } });
    const copy = overview.createDiv();
    copy.createSpan({ cls: "mym-kicker", text: "\u5F53\u524D\u76EE\u6807" });
    copy.createEl("h2", { text: goal.metric || asText(fm.target, "\u7EE7\u7EED\u63A8\u8FDB\u8FD9\u6761\u4E3B\u7EBF") });
    copy.createEl("p", { text: goal.recap || "\u4FDD\u6301\u8282\u594F\uFF0C\u8BB0\u5F55\u771F\u5B9E\u53D8\u5316\u3002" });
    const ring = overview.createDiv({ cls: "mym-progress-ring", attr: { style: `--mym-progress:${goal.progress ?? 0}` } });
    const ringText = ring.createDiv();
    ringText.createEl("strong", { text: goal.progress === void 0 ? "\u2014" : `${goal.progress}%` });
    ringText.createSpan({ text: "\u5F53\u524D\u8FDB\u5EA6" });
    if (media.length) {
      this.heading(page, "\u6700\u8FD1\u5A92\u4F53", `${media.length} \u9879`);
      this.renderMediaGallery(page, media.slice(0, 4));
    }
    this.renderRecent(page, recent, "\u6700\u8FD1\u8BB0\u5F55", "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u76F8\u5173\u8BB0\u5F55\u3002");
  }
  renderRecent(page, files, title, emptyText) {
    this.heading(page, title, "\u751F\u6D3B\u7559\u4E0B\u7684\u75D5\u8FF9");
    const stream = page.createDiv({ cls: "mym-detail-stream", attr: { "data-mym-section": "records" } });
    if (!files.length) stream.createDiv({ cls: "mym-empty mym-empty-soft", text: emptyText });
    files.slice(0, 4).forEach((file) => {
      const model = this.plugin.presentation(file);
      const row = stream.createEl("button", { cls: "mym-detail-entry" });
      const visual = row.createDiv({ cls: "mym-entry-media" });
      const image = model.media.find((item) => item.kind === "image");
      if (image) visual.style.backgroundImage = `url("${this.app.vault.getResourcePath(image.file)}")`;
      else (0, import_obsidian.setIcon)(visual, "notebook-pen");
      const copy = row.createDiv();
      copy.createEl("strong", { text: model.displayTitle });
      copy.createSpan({ text: `${model.date} \xB7 ${model.previewText}` });
      row.addEventListener("click", () => this.openNote(file));
    });
  }
  renderMediaGallery(parent, media) {
    const gallery = parent.createDiv({ cls: media.length === 1 ? "mym-media-gallery is-single" : "mym-media-gallery" });
    media.forEach((item) => {
      const frame = gallery.createDiv({ cls: `mym-media-tile is-${item.kind}` });
      const source = this.app.vault.getResourcePath(item.file);
      if (item.kind === "image") frame.createEl("img", { attr: { src: source, alt: "\u8BB0\u5F55\u56FE\u7247", decoding: "async" } });
      else if (item.kind === "video") {
        const video = frame.createEl("video", { attr: { src: source, preload: "metadata", playsinline: "", controls: "" } });
        video.addEventListener("click", (event) => event.stopPropagation());
      } else frame.createEl("audio", { attr: { src: source, preload: "none", controls: "" } });
      if (item.kind === "image") frame.addEventListener("click", () => new MediaPreviewModal(this.app, item).open());
    });
  }
  daysText(raw) {
    const days = Math.ceil((new Date(raw).getTime() - Date.now()) / 864e5);
    return Number.isFinite(days) ? days >= 0 ? `${days} \u5929` : `\u5DF2\u8FC7 ${Math.abs(days)} \u5929` : "\u65E5\u671F\u5F85\u786E\u8BA4";
  }
  formatDate(raw) {
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date) : raw;
  }
  heading(parent, title, label) {
    const row = parent.createDiv({ cls: "mym-detail-heading" });
    row.createEl("h2", { text: title });
    row.createSpan({ text: label });
  }
  stat(parent, label, value, note) {
    const card = parent.createDiv({ cls: "mym-stat" });
    card.createSpan({ text: label });
    card.createEl("strong", { text: value });
    card.createEl("small", { text: note });
  }
};
var TimelineView = class extends MymView {
  constructor() {
    super(...arguments);
    this.category = "\u5168\u90E8";
  }
  getViewType() {
    return TIMELINE_VIEW;
  }
  getDisplayText() {
    return "\u4EBA\u751F\u65F6\u95F4\u6D41";
  }
  getIcon() {
    return "calendar-days";
  }
  async onOpen() {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }
  async renderSafely() {
    try {
      await this.plugin.hydrate(this.plugin.dailyFiles());
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.renderSafely());
    }
  }
  render() {
    const page = this.shell(TIMELINE_VIEW);
    const head = page.createDiv({ cls: "mym-title-row" });
    const words = head.createDiv();
    words.createEl("h1", { text: "\u65F6\u95F4" });
    words.createEl("p", { text: "\u4EBA\u751F\u7ECF\u5386\u3001\u601D\u60F3\u4E0E\u91CC\u7A0B\u7891\uFF0C\u7559\u5728\u4E00\u6761\u7EBF\u4E0A\u3002" });
    const add = head.createEl("button", { cls: "mym-icon-button", attr: { "aria-label": "\u5FEB\u901F\u8BB0\u5F55" } });
    (0, import_obsidian.setIcon)(add, "plus");
    add.addEventListener("click", () => new CaptureModal(this.app).open());
    const chips = page.createDiv({ cls: "mym-filter-chips" });
    ["\u5168\u90E8", "\u7ECF\u5386", "\u601D\u60F3", "\u60C5\u7EEA", "\u91CC\u7A0B\u7891"].forEach((label) => {
      const chip = chips.createEl("button", { cls: this.category === label ? "is-active" : "", text: label });
      chip.addEventListener("click", () => {
        this.category = label;
        this.renderSafely();
      });
    });
    const files = this.plugin.dailyFiles().filter((file) => {
      if (this.category === "\u5168\u90E8") return true;
      const fm = this.plugin.frontmatter(file);
      return asText(fm.category, asText(fm.kind)).includes(this.category) || ((0, import_obsidian.getAllTags)(this.app.metadataCache.getFileCache(file) || {}) || []).some((tag) => tag.includes(this.category));
    });
    if (!files.length) {
      page.createDiv({ cls: "mym-empty", text: "\u65F6\u95F4\u7EBF\u4E0A\u8FD8\u6CA1\u6709\u5185\u5BB9\u3002\u70B9\u53F3\u4E0A\u89D2\u8BB0\u5F55\u6B64\u523B\u3002" });
      return;
    }
    const timeline = page.createDiv({ cls: "mym-timeline" });
    files.slice(0, 90).forEach((file) => {
      const item = timeline.createEl("button", { cls: "mym-time-item" });
      const model = this.plugin.presentation(file);
      const rail = item.createDiv({ cls: "mym-time-rail" });
      rail.createSpan({ text: model.date });
      rail.createDiv({ cls: "mym-time-dot" });
      const card = item.createDiv({ cls: "mym-time-card" });
      const media = model.media.find((entry) => entry.kind === "image" || entry.kind === "video");
      if (media) {
        const image = card.createDiv({ cls: "mym-time-media" });
        const source = this.app.vault.getResourcePath(media.file);
        if (media.kind === "image") image.style.backgroundImage = `url("${source}")`;
        else {
          const video = image.createEl("video", { attr: { src: source, preload: "metadata", muted: "", playsinline: "" } });
          const play = image.createDiv({ cls: "mym-media-play" });
          (0, import_obsidian.setIcon)(play, "play");
          const start = (event) => {
            event.stopPropagation();
            video.controls = true;
            video.muted = false;
            play.hide();
            void video.play();
          };
          video.addEventListener("click", start);
          play.addEventListener("click", start);
        }
      } else {
        const image = card.createDiv({ cls: "mym-time-media is-placeholder" });
        (0, import_obsidian.setIcon)(image, "notebook-pen");
      }
      const body = card.createDiv({ cls: "mym-time-copy" });
      body.createEl("h2", { text: model.displayTitle });
      body.createEl("p", { text: model.previewText });
      body.createSpan({ cls: "mym-time-meta", text: `${model.time} \xB7 ${model.category}` });
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
  async onOpen() {
    try {
      await this.plugin.hydrate(this.app.vault.getMarkdownFiles());
      this.render();
    } catch (error) {
      this.renderFailure(error, () => void this.onOpen());
    }
    this.startMobileLifecycle(() => {
      void this.plugin.hydrate(this.app.vault.getMarkdownFiles()).then(() => this.render()).catch((error) => this.renderFailure(error, () => void this.onOpen()));
    });
  }
  render() {
    const page = this.shell(SEARCH_VIEW);
    page.createEl("h1", { text: "\u641C\u7D22" });
    page.createEl("p", { text: "\u641C\u7D22\u76EE\u6807\u3001\u77E5\u8BC6\u4E0E\u4EBA\u751F\u8BB0\u5F55\u3002" });
    const searchBox = page.createDiv({ cls: "mym-search-box" });
    (0, import_obsidian.setIcon)(searchBox.createSpan(), "search");
    const input = searchBox.createEl("input", { type: "search", placeholder: "\u641C\u7D22\u76EE\u6807\u3001\u77E5\u8BC6\u3001\u6807\u7B7E\u2026", attr: { enterkeyhint: "search" } });
    const results = page.createDiv({ cls: "mym-search-results" });
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
      if (!matches.length) results.createDiv({ cls: "mym-empty", text: "\u6CA1\u6709\u627E\u5230\u76F8\u5173\u5185\u5BB9\uFF0C\u6362\u4E00\u4E2A\u5173\u952E\u8BCD\u8BD5\u8BD5\u3002" });
      matches.forEach((file) => {
        const row = results.createEl("button", { cls: "mym-search-result" });
        const model = this.plugin.presentation(file);
        const body = row.createDiv();
        body.createEl("strong", { text: model.displayTitle });
        body.createSpan({ text: model.previewText });
        row.createSpan({ cls: "mym-search-path", text: model.category });
        row.addEventListener("click", () => this.openNote(file));
      });
    };
    const debouncedUpdate = debounce(() => update(), 80);
    input.addEventListener("input", () => debouncedUpdate());
    window.setTimeout(() => input.focus(), 60);
  }
};
var GoalsView = class extends MymView {
  constructor() {
    super(...arguments);
    this.status = "focus";
  }
  getViewType() {
    return GOALS_VIEW;
  }
  getDisplayText() {
    return "\u76EE\u6807\u7BA1\u7406";
  }
  getIcon() {
    return "list-checks";
  }
  async onOpen() {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }
  async renderSafely() {
    try {
      await this.plugin.hydrate(this.app.vault.getMarkdownFiles().filter((file) => asText(this.plugin.frontmatter(file).type) === "goal"));
      this.render();
    } catch (error) {
      this.renderFailure(error, () => this.renderSafely());
    }
  }
  render() {
    const page = this.detailShell("\u9996\u9875");
    const title = page.createDiv({ cls: "mym-title-row" });
    const copy = title.createDiv();
    copy.createEl("h1", { text: "\u6211\u7684\u76EE\u6807" });
    copy.createEl("p", { text: "\u6240\u6709\u76EE\u6807\uFF0C\u7EDF\u4E00\u7BA1\u7406\u3002\u9996\u9875\u53EA\u4FDD\u7559\u5F53\u524D\u91CD\u70B9\u3002" });
    const tabs = page.createDiv({ cls: "mym-filter-chips mym-goal-tabs" });
    const options = [["focus", "\u8FDB\u884C\u4E2D"], ["done", "\u5DF2\u5B8C\u6210"], ["paused", "\u5DF2\u6682\u505C"]];
    options.forEach(([value, label]) => {
      const button = tabs.createEl("button", { cls: this.status === value ? "is-active" : "", text: label });
      button.addEventListener("click", () => {
        this.status = value;
        this.renderSafely();
      });
    });
    const goals = this.plugin.goals().filter((goal) => this.status === "all" || (this.status === "focus" ? ["focus", "active"].includes(goal.status) : goal.status === this.status));
    const list = page.createDiv({ cls: "mym-manage-list" });
    if (!goals.length) list.createDiv({ cls: "mym-empty", text: this.status === "done" ? "\u8FD8\u6CA1\u6709\u5B8C\u6210\u7684\u76EE\u6807\u3002" : this.status === "paused" ? "\u8FD8\u6CA1\u6709\u6682\u505C\u7684\u76EE\u6807\u3002" : "\u8FD8\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u76EE\u6807\u3002\u70B9\u53F3\u4E0B\u89D2\u5F00\u59CB\u4E00\u4E2A\u65B0\u76EE\u6807\u3002" });
    goals.forEach((goal) => {
      const row = list.createEl("button", { cls: "mym-manage-row" });
      const visual = row.createDiv({ cls: "mym-manage-thumb" });
      const image = this.plugin.heroFor(goal.file) || this.plugin.mediaFor(goal.file).find((item) => item.kind === "image")?.file;
      if (image) visual.style.backgroundImage = `url("${this.app.vault.getResourcePath(image)}")`;
      else (0, import_obsidian.setIcon)(visual, this.plugin.iconFor(goal));
      const body = row.createDiv({ cls: "mym-manage-copy" });
      body.createEl("strong", { text: goal.title });
      body.createSpan({ text: goal.metric || goal.recap || "\u8FD8\u6CA1\u6709\u72B6\u6001\u63CF\u8FF0" });
      const track = body.createDiv({ cls: "mym-progress" });
      track.createDiv({ attr: { style: `width:${clamp(goal.progress ?? 0, 0, 100)}%` } });
      const end = row.createDiv({ cls: "mym-manage-end" });
      end.createEl("strong", { text: goal.progress === void 0 ? "\u2014" : `${goal.progress}%` });
      end.createSpan({ text: goal.due ? calendarDate(goal.due) : goal.status === "done" ? "\u5DF2\u5B8C\u6210" : goal.status === "paused" ? "\u5DF2\u6682\u505C" : "\u8FDB\u884C\u4E2D" });
      if (this.status === "focus" && goal.status !== "focus") {
        const focus = end.createEl("span", { cls: "mym-focus-toggle", attr: { role: "button", tabindex: "0", "aria-label": "\u8BBE\u4E3A\u5F53\u524D\u91CD\u70B9" } });
        (0, import_obsidian.setIcon)(focus, "target");
        focus.addEventListener("click", (event) => {
          event.stopPropagation();
          void this.plugin.setGoalFocus(goal);
        });
      }
      row.addEventListener("click", () => void this.plugin.openGoal(goal));
    });
    const add = page.createEl("button", { cls: "mym-floating-add", attr: { "aria-label": "\u65B0\u5EFA\u76EE\u6807" } });
    (0, import_obsidian.setIcon)(add, "plus");
    add.addEventListener("click", () => void this.plugin.createGoal());
  }
};
var ProfileView = class extends MymView {
  getViewType() {
    return PROFILE_VIEW;
  }
  getDisplayText() {
    return "\u6211\u7684";
  }
  getIcon() {
    return "user-round";
  }
  onOpen() {
    this.renderSafely();
    this.startMobileLifecycle(() => this.renderSafely());
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
    const page = this.shell(PROFILE_VIEW);
    const home = this.plugin.fileByType("home");
    const cover = home ? this.plugin.heroFor(home) : void 0;
    const hero = page.createDiv({ cls: `mym-profile-hero${cover ? " has-image" : ""}` });
    if (cover) hero.style.setProperty("--mym-profile-image", `url("${this.app.vault.getResourcePath(cover)}")`);
    hero.createDiv({ cls: "mym-profile-avatar", text: "MYM" });
    hero.createEl("h1", { text: "\u66F4\u597D\u7684\u81EA\u5DF1" });
    hero.createEl("p", { text: "\u6301\u7EED\u6210\u957F\uFF0C\u4FDD\u6301\u6E05\u9192\u3002" });
    const menu = page.createDiv({ cls: "mym-settings-list" });
    this.menu(menu, "chart-no-axes-column-increasing", "\u6570\u636E\u7EDF\u8BA1", `${this.plugin.goals().length} \u4E2A\u76EE\u6807 \xB7 ${this.plugin.dailyFiles().length} \u6761\u8BB0\u5F55`, () => new import_obsidian.Notice("\u7EDF\u8BA1\u4EC5\u5728\u672C\u673A\u5B8C\u6210"));
    this.menu(menu, "palette", "\u4E3B\u9898\u8BBE\u7F6E", "MYM \u6D45\u8272\u4E3B\u9898", () => new import_obsidian.Notice("\u5F53\u524D\u4F7F\u7528 MYM \u6D45\u8272\u4E3B\u9898"));
    this.menu(menu, "archive-restore", "\u5907\u4EFD\u4E0E\u6062\u590D", "\u6240\u6709\u5185\u5BB9\u90FD\u4FDD\u5B58\u5728\u672C\u5730", () => new import_obsidian.Notice("\u8BF7\u7EE7\u7EED\u4F7F\u7528\u4F60\u7684\u540C\u6B65\u6216\u5907\u4EFD\u65B9\u6848"));
    this.menu(menu, "info", "\u5173\u4E8E MYM Life", "\u7248\u672C 1.2.1 \xB7 \u5B8C\u5168\u79BB\u7EBF", () => new import_obsidian.Notice("MYM Life 1.2.1"));
  }
  menu(parent, iconName, title, subtitle, action) {
    const row = parent.createEl("button", { cls: "mym-settings-row" });
    const icon = row.createDiv({ cls: "mym-settings-icon" });
    (0, import_obsidian.setIcon)(icon, iconName);
    const copy = row.createDiv();
    copy.createEl("strong", { text: title });
    copy.createSpan({ text: subtitle });
    (0, import_obsidian.setIcon)(row.createSpan({ cls: "mym-entry-arrow" }), "chevron-right");
    row.addEventListener("click", action);
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
    this.dragNode = -1;
    this.centerPath = "";
    this.domainFilter = "\u5168\u90E8";
    this.nodeLimit = 30;
    this.nodeImages = /* @__PURE__ */ new Map();
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
  getState() {
    return { centerPath: this.centerPath };
  }
  async setState(state, result) {
    await super.setState(state, result);
    this.centerPath = asText(state.centerPath);
    if (this.contentEl.isConnected) {
      try {
        this.build();
        this.updatePreview?.();
      } catch (error) {
        this.renderFailure(error, () => this.onOpen());
      }
    }
  }
  async onOpen() {
    try {
      await this.plugin.hydrate(this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("03 Knowledge/") || file.path === this.centerPath));
      this.render();
    } catch (error) {
      this.renderFailure(error, () => void this.onOpen());
    }
    this.startMobileLifecycle(() => {
      try {
        this.build();
      } catch (error) {
        this.renderFailure(error, () => void this.onOpen());
      }
    });
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
    const back = top.createEl("button", { cls: "mym-graph-back", attr: { "aria-label": "\u8FD4\u56DE\u4E0A\u4E00\u9875" } });
    (0, import_obsidian.setIcon)(back, "chevron-left");
    back.addEventListener("click", () => void this.plugin.back());
    top.createDiv({ cls: "mym-graph-title", text: "\u77E5\u8BC6\u7A7A\u95F4" });
    const controls = top.createDiv({ cls: "mym-graph-controls" });
    const search = controls.createEl("button", { attr: { "aria-label": "\u641C\u7D22\u77E5\u8BC6" } });
    (0, import_obsidian.setIcon)(search, "search");
    search.addEventListener("click", () => void this.plugin.push(SEARCH_VIEW, {}, "\u77E5\u8BC6\u7A7A\u95F4"));
    const filters = wrap.createDiv({ cls: "mym-graph-filters" });
    ["\u5168\u90E8", "\u5065\u8EAB", "CPA", "\u82F1\u8BED", "\u751F\u6D3B"].forEach((domain) => {
      const chip = filters.createEl("button", { cls: this.domainFilter === domain ? "is-active" : "", text: domain });
      chip.addEventListener("click", () => {
        this.domainFilter = domain;
        this.centerPath = "";
        this.nodeLimit = 30;
        filters.querySelectorAll("button").forEach((button) => button.toggleClass("is-active", button === chip));
        this.build();
        this.updatePreview?.();
      });
    });
    this.canvas = wrap.createEl("canvas", { cls: "mym-graph-canvas", attr: { "aria-label": "\u53EF\u7F29\u653E\u77E5\u8BC6\u56FE\u8C31" } });
    this.ctx = this.canvas.getContext("2d") || void 0;
    const preview = wrap.createDiv({ cls: "mym-graph-preview" });
    const label = preview.createDiv({ cls: "mym-graph-preview-label", text: "\u5F53\u524D\u8282\u70B9" });
    const title = preview.createEl("h2");
    const summary = preview.createEl("p");
    const previewMeta = preview.createDiv({ cls: "mym-graph-preview-meta" });
    const previewTags = preview.createDiv({ cls: "mym-graph-preview-tags" });
    const open = preview.createEl("button", { text: "\u8FDB\u5165\u8BE6\u60C5" });
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
      const model = this.plugin.presentation(node.file);
      title.setText(model.displayTitle);
      summary.setText(model.previewText);
      const relations = this.edges.filter((edge) => edge.from === this.selected || edge.to === this.selected).length;
      previewMeta.setText(`${relations} \u4E2A\u5173\u8054\u7B14\u8BB0 \xB7 ${relations} \u4E2A\u94FE\u63A5`);
      previewTags.empty();
      const cache = this.app.metadataCache.getFileCache(node.file);
      const tags = cache ? (0, import_obsidian.getAllTags)(cache) || [] : [];
      (tags.length ? tags : [node.domain]).slice(0, 4).forEach((tag) => previewTags.createSpan({ text: tag.startsWith("#") ? tag : `#${tag}` }));
    };
    this.updatePreview = updatePreview;
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas?.setPointerCapture(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      this.dragNode = this.hitTest(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.pointer.moved = true;
      if (this.dragNode >= 0 && this.nodes[this.dragNode]) {
        this.nodes[this.dragNode].x += dx / this.scale;
        this.nodes[this.dragNode].y += dy / this.scale;
      } else {
        this.panX += dx;
        this.panY += dy;
      }
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.draw();
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.pointer) return;
      if (!this.pointer.moved) {
        const index = this.hitTest(event.clientX, event.clientY);
        if (index >= 0) {
          this.centerPath = this.nodes[index].file.path;
          this.scale = 1;
          this.panX = 0;
          this.panY = 0;
          this.build();
          updatePreview();
        }
      }
      this.pointer = void 0;
      this.dragNode = -1;
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
    const knowledge = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("03 Knowledge/") && this.matchesDomain(file));
    const requested = this.centerPath ? this.app.vault.getAbstractFileByPath(this.centerPath) : void 0;
    this.center = requested instanceof import_obsidian.TFile ? requested : knowledge[0] || (active && active.extension === "md" ? active : this.app.vault.getMarkdownFiles()[0]);
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
    while (queue.length && chosen.size < this.nodeLimit) {
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
    this.loadNodeImages();
    this.resizeCanvas();
  }
  loadNodeImages() {
    this.nodes.forEach((node) => {
      const media = this.plugin.heroFor(node.file) || this.plugin.mediaFor(node.file).find((item) => item.kind === "image")?.file;
      if (!media || this.nodeImages.has(node.file.path)) return;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => this.draw();
      image.src = this.app.vault.getResourcePath(media);
      this.nodeImages.set(node.file.path, image);
    });
  }
  matchesDomain(file) {
    if (this.domainFilter === "\u5168\u90E8") return true;
    const fm = this.plugin.frontmatter(file);
    const haystack = `${file.path} ${asText(fm.domain)} ${asText(fm.tags)}`.toLocaleLowerCase();
    if (this.domainFilter === "\u5065\u8EAB") return /健身|身体|训练/.test(haystack);
    if (this.domainFilter === "CPA") return /cpa|会计|审计|财管|税法/.test(haystack);
    return haystack.includes(this.domainFilter.toLocaleLowerCase());
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
    const labels = [];
    this.nodes.forEach((node, index) => {
      const point = this.screen(node);
      const active = adjacent.has(index);
      const selected = index === this.selected;
      const radius = (selected ? 34 : node.level === 0 ? 30 : node.level === 1 ? 21 : 12) * Math.sqrt(this.scale);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + (selected ? 6 : 0), 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(108, 230, 171, .24)" : "transparent";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      const palette = ["#77dfaa", "#7fbead", "#8ea5d9", "#d9b987"];
      ctx.fillStyle = active ? palette[Math.abs(this.hash(node.domain)) % palette.length] : "#34534b";
      ctx.fill();
      const image = this.nodeImages.get(node.file.path);
      if (image?.complete && image.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(1, radius - 2), 0, Math.PI * 2);
        ctx.clip();
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sx = (image.naturalWidth - side) / 2;
        const sy = (image.naturalHeight - side) / 2;
        ctx.drawImage(image, sx, sy, side, side, point.x - radius, point.y - radius, radius * 2, radius * 2);
        ctx.restore();
      }
      if (selected || node.level === 0) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(196,255,221,.88)";
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.stroke();
      }
      if (node.level < 2 || selected || active) {
        ctx.font = `${selected ? 600 : 500} ${selected ? 14 : 12}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = active ? "rgba(239,250,245,.94)" : "rgba(197,215,208,.43)";
        const display = this.plugin.presentation(node.file).displayTitle;
        const label = display.length > 12 ? `${display.slice(0, 11)}\u2026` : display;
        const width = ctx.measureText(label).width;
        const top = point.y + radius + 7;
        const box = { left: point.x - width / 2 - 3, right: point.x + width / 2 + 3, top, bottom: top + (selected ? 18 : 15) };
        const overlaps = labels.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
        if (!overlaps || selected) {
          ctx.fillText(label, point.x, top);
          labels.push(box);
        }
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
var MediaPreviewModal = class extends import_obsidian.Modal {
  constructor(app, media) {
    super(app);
    this.media = media;
  }
  onOpen() {
    this.modalEl.addClass("mym-media-preview-modal");
    const source = this.app.vault.getResourcePath(this.media.file);
    if (this.media.kind === "image") this.contentEl.createEl("img", { attr: { src: source, alt: "\u672C\u5730\u56FE\u7247\u9884\u89C8" } });
    else if (this.media.kind === "video") this.contentEl.createEl("video", { attr: { src: source, controls: "", autoplay: "", playsinline: "", preload: "metadata" } });
    else this.contentEl.createEl("audio", { attr: { src: source, controls: "", autoplay: "", preload: "metadata" } });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CaptureModal = class extends import_obsidian.Modal {
  constructor() {
    super(...arguments);
    this.moods = /* @__PURE__ */ new Set();
    this.category = "\u65E5\u8BB0";
    this.pendingFiles = [];
  }
  onOpen() {
    this.modalEl.addClass("mym-capture-modal");
    this.titleEl.setText("\u65B0\u5EFA\u8BB0\u5F55");
    const categories = this.contentEl.createDiv({ cls: "mym-capture-categories" });
    ["\u65E5\u8BB0", "\u7075\u611F", "\u60F3\u6CD5", "\u60C5\u7EEA", "\u5F85\u529E"].forEach((category) => {
      const button = categories.createEl("button", { cls: category === this.category ? "is-active" : "", text: category });
      button.addEventListener("click", () => {
        this.category = category;
        categories.querySelectorAll("button").forEach((item) => item.toggleClass("is-active", item === button));
      });
    });
    const input = this.contentEl.createEl("textarea", { placeholder: "\u6B64\u523B\u7684\u60F3\u6CD5\u2026", attr: { rows: "7", enterkeyhint: "done" } });
    const tools = this.contentEl.createDiv({ cls: "mym-capture-tools" });
    const fileInput = tools.createEl("input", { type: "file", attr: { multiple: "", accept: "image/*" } });
    fileInput.hidden = true;
    const addMedia = (iconName, label, accept, capture = false) => {
      const button = tools.createEl("button", { attr: { "aria-label": label, title: label } });
      (0, import_obsidian.setIcon)(button, iconName);
      button.createSpan({ text: label });
      button.addEventListener("click", () => {
        fileInput.accept = accept;
        if (capture) fileInput.setAttribute("capture", "");
        else fileInput.removeAttribute("capture");
        fileInput.click();
      });
    };
    addMedia("image", "\u56FE\u7247", "image/*");
    addMedia("mic", "\u5F55\u97F3", "audio/*", true);
    addMedia("paperclip", "\u9644\u4EF6", "*/*");
    const moodToggle = tools.createEl("button", { attr: { "aria-label": "\u9009\u62E9\u60C5\u7EEA", title: "\u60C5\u7EEA" } });
    (0, import_obsidian.setIcon)(moodToggle, "smile");
    moodToggle.createSpan({ text: "\u60C5\u7EEA" });
    const attachmentState = tools.createSpan({ cls: "mym-attachment-state" });
    fileInput.addEventListener("change", () => {
      this.pendingFiles = Array.from(fileInput.files || []);
      attachmentState.setText(this.pendingFiles.length ? `${this.pendingFiles.length} \u4E2A\u9644\u4EF6` : "");
    });
    const moodRow = this.contentEl.createDiv({ cls: "mym-moods" });
    moodRow.hidden = true;
    moodToggle.addEventListener("click", () => {
      moodRow.hidden = !moodRow.hidden;
    });
    ["\u5F88\u5DEE", "\u4F4E\u843D", "\u5E73\u9759", "\u6109\u5FEB", "\u5F88\u597D"].forEach((mood) => {
      const button = moodRow.createEl("button", { text: mood });
      button.addEventListener("click", () => {
        this.moods.clear();
        this.moods.add(mood);
        moodRow.querySelectorAll("button").forEach((item) => item.toggleClass("is-active", item === button));
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
      try {
        const attachmentLinks = [];
        if (this.pendingFiles.length) {
          const attachmentFolder = "Attachments";
          if (!this.app.vault.getAbstractFileByPath(attachmentFolder)) await this.app.vault.createFolder(attachmentFolder);
          for (const pending of this.pendingFiles.slice(0, 5)) {
            const safeName = pending.name.replace(/[\\/:*?"<>|]/g, "-");
            let mediaPath = `${attachmentFolder}/${safeName}`;
            if (this.app.vault.getAbstractFileByPath(mediaPath)) mediaPath = `${attachmentFolder}/${Date.now()}-${safeName}`;
            await this.app.vault.createBinary(mediaPath, await pending.arrayBuffer());
            attachmentLinks.push(`![[${mediaPath}]]`);
          }
        }
        const attachmentText = attachmentLinks.length ? `

${attachmentLinks.join("\n")}` : "";
        const block = `

## ${stamp} \xB7 ${this.category}

${text}
#\u7C7B\u578B/${this.category}${moodText}${attachmentText}
`;
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
  constructor() {
    super(...arguments);
    this.navStack = [];
    this.contentCache = /* @__PURE__ */ new Map();
  }
  async onload() {
    this.registerView(HOME_VIEW, (leaf) => new HomeView(leaf, this));
    this.registerView(DETAIL_VIEW, (leaf) => new DetailView(leaf, this));
    this.registerView(TIMELINE_VIEW, (leaf) => new TimelineView(leaf, this));
    this.registerView(GRAPH_VIEW, (leaf) => new GraphView(leaf, this));
    this.registerView(SEARCH_VIEW, (leaf) => new SearchView(leaf, this));
    this.registerView(GOALS_VIEW, (leaf) => new GoalsView(leaf, this));
    this.registerView(PROFILE_VIEW, (leaf) => new ProfileView(leaf, this));
    this.addRibbonIcon("sprout", "\u6253\u5F00 MYM \u4EBA\u751F\u9996\u9875", () => void this.openRoot(HOME_VIEW));
    this.addCommand({ id: "open-life-home", name: "\u6253\u5F00\u4EBA\u751F\u9996\u9875", callback: () => void this.openRoot(HOME_VIEW) });
    this.addCommand({ id: "quick-capture", name: "\u5FEB\u901F\u8BB0\u5F55\u5230\u4ECA\u5929", callback: () => new CaptureModal(this.app).open() });
    this.addCommand({ id: "open-life-graph", name: "\u6253\u5F00\u5C40\u90E8\u77E5\u8BC6\u56FE\u8C31", callback: () => void this.openRoot(GRAPH_VIEW) });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof import_obsidian.TFile) this.contentCache.delete(file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => this.contentCache.delete(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.contentCache.delete(oldPath);
      this.contentCache.delete(file.path);
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncHostChrome()));
    this.app.workspace.onLayoutReady(() => {
      void this.openRoot(HOME_VIEW).catch((error) => {
        console.error("[MYM Life] failed to activate home view", error);
        new import_obsidian.Notice("MYM \u4EBA\u751F\u9996\u9875\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u518D\u6B21\u70B9\u51FB\u53F6\u5B50\u56FE\u6807");
      });
    });
  }
  enterMym(_view) {
    this.setHostChrome(true);
  }
  leaveMym(_view) {
    window.setTimeout(() => this.syncHostChrome(), 0);
  }
  syncHostChrome() {
    const active = this.app.workspace.getMostRecentLeaf();
    this.setHostChrome(Boolean(active && MYM_VIEWS.includes(active.view.getViewType())));
  }
  setHostChrome(active) {
    document.body.toggleClass("mym-life-active", active);
    document.body.toggleClass("mym-life-mobile", active && import_obsidian.Platform.isMobile);
  }
  hostBottomInset(root) {
    const viewport = window.visualViewport;
    const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
    const selectors = [".mobile-toolbar", ".mobile-navbar", ".workspace-drawer-vault-switcher", ".workspace-tab-header-container"];
    let overlap = 0;
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (element.closest(".mym-root") || getComputedStyle(element).display === "none") return;
        const rect = element.getBoundingClientRect();
        if (rect.height <= 0 || rect.top < visibleBottom * 0.55 || rect.top >= visibleBottom) return;
        overlap = Math.max(overlap, Math.max(0, visibleBottom - rect.top));
      });
    });
    const host = root.parentElement?.getBoundingClientRect();
    if (host && host.bottom < visibleBottom) overlap = Math.max(overlap, visibleBottom - host.bottom);
    return Math.round(overlap);
  }
  async hydrate(files) {
    await Promise.all(files.map(async (file) => {
      if (this.contentCache.has(file.path)) return;
      try {
        this.contentCache.set(file.path, await this.app.vault.cachedRead(file));
      } catch {
        this.contentCache.set(file.path, "");
      }
    }));
  }
  currentMymLeaf() {
    const recent = this.app.workspace.getMostRecentLeaf();
    if (recent && MYM_VIEWS.includes(recent.view.getViewType())) return recent;
    return MYM_VIEWS.flatMap((type) => this.app.workspace.getLeavesOfType(type)).find((candidate) => candidate.view.containerEl.isConnected);
  }
  async transition(type, state = {}) {
    let leaf = this.currentMymLeaf();
    if (leaf) {
      await leaf.setViewState({ type, state, active: true });
    } else {
      const existing = this.app.workspace.getLeavesOfType(type);
      leaf = existing.find((candidate) => candidate.view.containerEl.isConnected) || existing[0];
      if (!leaf) leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type, state, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    await leaf.loadIfDeferred();
  }
  async openRoot(type) {
    this.navStack = [];
    await this.transition(type);
  }
  async push(type, state = {}, label = "\u9996\u9875") {
    const leaf = this.currentMymLeaf();
    if (leaf) {
      const current = leaf.getViewState();
      this.navStack.push({ type: current.type, state: current.state || {}, label });
      if (this.navStack.length > 2) this.navStack.shift();
    } else this.navStack.push({ type: HOME_VIEW, state: {}, label: "\u9996\u9875" });
    await this.transition(type, state);
  }
  async back() {
    const previous = this.navStack.pop();
    if (previous) await this.transition(previous.type, previous.state);
    else await this.openRoot(HOME_VIEW);
  }
  previousLabel() {
    return this.navStack[this.navStack.length - 1]?.label || "\u9996\u9875";
  }
  async openGoal(goal) {
    await this.push(DETAIL_VIEW, { goalPath: goal.file.path }, "\u9996\u9875");
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
  fileByType(type) {
    return this.app.vault.getMarkdownFiles().find((file) => asText(this.frontmatter(file).type) === type);
  }
  heroFor(file) {
    const fm = this.frontmatter(file);
    const raw = asText(fm.hero) || asText(fm.cover) || asText(fm.image);
    if (!raw) return void 0;
    const link = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0];
    const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
    return target instanceof import_obsidian.TFile && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(target.extension.toLowerCase()) ? target : void 0;
  }
  iconFor(goal) {
    const value = `${goal.title} ${goal.domain || ""}`.toLocaleLowerCase();
    if (/健身|身体|训练/.test(value)) return "dumbbell";
    if (/cpa|学习|考试/.test(value)) return "graduation-cap";
    if (/表达|英语|语言/.test(value)) return "messages-square";
    if (/工作|研究/.test(value)) return "briefcase-business";
    if (/旅行|生活/.test(value)) return "compass";
    return "target";
  }
  goals() {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && asText(this.frontmatter(file).type) === "goal").map((file) => {
      const fm = this.frontmatter(file);
      const rawProgress = Number(fm.progress);
      return {
        file,
        title: this.presentation(file).displayTitle,
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
  goalForPath(path) {
    return this.goals().find((goal) => goal.file.path === path);
  }
  relatedKnowledge(file) {
    const found = /* @__PURE__ */ new Map();
    const cache = this.app.metadataCache.getFileCache(file);
    [...cache?.links || [], ...cache?.embeds || []].forEach((link) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (target?.extension === "md") found.set(target.path, target);
    });
    const outgoing = this.app.metadataCache.resolvedLinks[file.path] || {};
    Object.keys(outgoing).forEach((path) => {
      const target = this.app.vault.getAbstractFileByPath(path);
      if (target instanceof import_obsidian.TFile && target.extension === "md") found.set(target.path, target);
    });
    Object.entries(this.app.metadataCache.resolvedLinks).forEach(([source, targets]) => {
      if (!targets[file.path]) return;
      const target = this.app.vault.getAbstractFileByPath(source);
      if (target instanceof import_obsidian.TFile && target.extension === "md") found.set(target.path, target);
    });
    return Array.from(found.values()).filter((target) => target.path.startsWith("03 Knowledge/")).slice(0, 24);
  }
  mediaFor(file) {
    const image = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
    const video = /* @__PURE__ */ new Set(["mp4", "mov", "m4v", "webm"]);
    const audio = /* @__PURE__ */ new Set(["m4a", "mp3", "wav", "aac", "ogg"]);
    const cache = this.app.metadataCache.getFileCache(file);
    const media = [];
    (cache?.embeds || []).map((embed) => this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path)).filter((target) => target instanceof import_obsidian.TFile).forEach((target) => {
      const extension = target.extension.toLowerCase();
      if (image.has(extension)) media.push({ file: target, kind: "image" });
      else if (video.has(extension)) media.push({ file: target, kind: "video" });
      else if (audio.has(extension)) media.push({ file: target, kind: "audio" });
    });
    return media;
  }
  dailyFiles() {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && (file.path.startsWith("02 Daily/") || asText(this.frontmatter(file).type) === "daily")).sort((a, b) => b.basename.localeCompare(a.basename) || b.stat.mtime - a.stat.mtime);
  }
  dailyTitle(file) {
    return this.presentation(file).displayTitle;
  }
  relatedDaily(goal) {
    return this.dailyFiles().filter((file) => Boolean(this.app.metadataCache.resolvedLinks[file.path]?.[goal.path]));
  }
  weekStatus(goal) {
    const linked = new Set(this.relatedDaily(goal).map((file) => file.basename));
    const formatter = new Intl.DateTimeFormat("zh-CN", { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) => {
      const date = /* @__PURE__ */ new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { label: formatter.format(date), active: linked.has(key) };
    });
  }
  async createGoal() {
    const folder = "04 Goals";
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const stamp = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(/* @__PURE__ */ new Date()).replace(/\D/g, "");
    const path = `${folder}/\u65B0\u76EE\u6807-${stamp}.md`;
    const file = await this.app.vault.create(path, `---
type: goal
title: \u65B0\u76EE\u6807
status: active
progress: 0
---
# \u65B0\u76EE\u6807

\u5199\u4E0B\u771F\u6B63\u60F3\u63A8\u8FDB\u7684\u53D8\u5316\u3002
`);
    await this.app.workspace.getLeaf("tab").openFile(file);
  }
  async setGoalFocus(goal) {
    await this.app.fileManager.processFrontMatter(goal.file, (frontmatter) => {
      frontmatter.status = "focus";
    });
    new import_obsidian.Notice(`${goal.title} \u5DF2\u8BBE\u4E3A\u5F53\u524D\u91CD\u70B9`);
  }
  summary(file) {
    return this.presentation(file).previewText;
  }
  presentation(file) {
    const fm = this.frontmatter(file);
    const raw = this.contentCache.get(file.path) || "";
    const body = raw.replace(/^---\s*[\s\S]*?\n---\s*/m, "");
    const clean = (value) => value.replace(/!\[\[[^\]]+\]\]/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias || target).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`{1,3}[^`]*`{1,3}/g, "").replace(/^\s*(?:#{1,6}|>|[-*+] |\d+\. )\s*/g, "").replace(/(^|\s)#[^\s#]+/g, " ").replace(/[~*_]{1,3}/g, "").replace(/\s+/g, " ").trim();
    const isTechnical = (line) => !line || /^\d{4}-\d{2}-\d{2}$/.test(line) || /^\d{1,2}:\d{2}\s*[·\-]/.test(line) || /^(日记|灵感|想法|情绪|待办)$/.test(line);
    const meaningful = body.split(/\r?\n/).map((line) => clean(line)).filter((line) => !isTechnical(line));
    const h1 = Array.from(body.matchAll(/^#\s+(.+)$/gm)).map((match) => clean(match[1])).find((line) => !isTechnical(line));
    const compress = (value, max) => {
      const natural = value.replace(/^(今天|今日|刚刚)[，,:：\s]*/u, "").replace(/(感觉|终于|其实|真的)/g, "").trim();
      const sentence = natural.split(/[。！？!?]/)[0] || natural;
      return sentence.length > max ? `${sentence.slice(0, max).trim()}\u2026` : sentence;
    };
    const fallbackName = file.basename.replace(/^\d{4}-\d{2}-\d{2}[-_\s]*/, "").replace(/[-_]/g, " ").trim();
    const titleSource = asText(fm.title) || h1 || meaningful[0] || fallbackName || "\u672A\u547D\u540D\u8BB0\u5F55";
    const displayTitle = compress(titleSource, 22);
    const previewSource = asText(fm.summary) || asText(fm.recap) || meaningful.find((line) => line !== h1 && line !== displayTitle) || meaningful[0] || asText(fm.metric) || "\u8FD8\u6CA1\u6709\u5199\u4E0B\u6458\u8981\u3002";
    const previewText = compress(previewSource, 58);
    const rawDate = asText(fm.date);
    const parsed = rawDate ? new Date(rawDate).getTime() : Number.NaN;
    const epoch = Number.isFinite(parsed) ? parsed : file.stat.mtime;
    const capturedTime = body.match(/^##\s+(\d{1,2}:\d{2})/m)?.[1];
    const tagType = body.match(/#类型\/([^\s#]+)/)?.[1];
    const isDaily = asText(fm.type) === "daily" || file.path.startsWith("02 Daily/");
    const linkedGoal = isDaily ? Object.keys(this.app.metadataCache.resolvedLinks[file.path] || {}).map((path) => this.app.vault.getAbstractFileByPath(path)).find((target) => target instanceof import_obsidian.TFile && asText(this.frontmatter(target).type) === "goal") : void 0;
    const category = asText(fm.category) || asText(fm.kind) || (linkedGoal ? asText(this.frontmatter(linkedGoal).domain) || this.presentation(linkedGoal).displayTitle : "") || tagType || "\u751F\u6D3B";
    const subtitle = asText(fm.subtitle) || asText(fm.metric) || asText(fm.recap) || previewText;
    return {
      displayTitle,
      subtitle: compress(subtitle, 42),
      date: dateLabel(epoch),
      time: capturedTime || timeLabel(file.stat.mtime),
      previewText,
      media: this.mediaFor(file),
      category,
      metric: asText(fm.metric)
    };
  }
  onunload() {
    document.body.removeClass("mym-life-active", "mym-life-mobile");
    document.body.style.removeProperty("--mym-vv-height");
    document.body.style.removeProperty("--mym-vv-top");
    MYM_VIEWS.forEach((type) => this.app.workspace.detachLeavesOfType(type));
  }
};
