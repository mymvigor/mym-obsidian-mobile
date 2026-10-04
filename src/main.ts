import {
  App,
  ItemView,
  Modal,
  Notice,
  Platform,
  Plugin,
  TFile,
  WorkspaceLeaf,
  getAllTags,
  setIcon
} from "obsidian";

const HOME_VIEW = "mym-life-home";
const DETAIL_VIEW = "mym-life-detail";
const TIMELINE_VIEW = "mym-life-timeline";
const GRAPH_VIEW = "mym-life-graph";
const SEARCH_VIEW = "mym-life-search";
const GOALS_VIEW = "mym-life-goals";
const PROFILE_VIEW = "mym-life-profile";

const MYM_VIEWS = [HOME_VIEW, DETAIL_VIEW, TIMELINE_VIEW, GRAPH_VIEW, SEARCH_VIEW, GOALS_VIEW, PROFILE_VIEW] as const;

interface NavEntry {
  type: string;
  state: Record<string, unknown>;
  label: string;
}

type Frontmatter = Record<string, unknown>;
type GoalStatus = "focus" | "active" | "paused" | "done";

interface Goal {
  file: TFile;
  title: string;
  status: GoalStatus;
  progress?: number;
  metric?: string;
  recap?: string;
  due?: string;
  domain?: string;
  updated: number;
}

interface MediaItem {
  file: TFile;
  kind: "image" | "video" | "audio";
}

interface PresentationModel {
  displayTitle: string;
  subtitle: string;
  date: string;
  time: string;
  previewText: string;
  media: MediaItem[];
  category: string;
  metric: string;
}

interface GraphNode {
  file: TFile;
  x: number;
  y: number;
  level: number;
  domain: string;
}

interface GraphEdge { from: number; to: number; }

function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function statusOf(value: unknown): GoalStatus {
  const status = asText(value).toLowerCase();
  if (["focus", "active", "paused", "done"].includes(status)) return status as GoalStatus;
  return "active";
}

function dateLabel(epoch: number): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(epoch));
}

function heroDate(epoch: number): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(epoch));
}

function timeLabel(epoch: number): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(epoch));
}

function calendarDate(raw: string): string {
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(date) : raw;
}

function localDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, wait: number): (...args: TArgs) => void {
  let timer = 0;
  return (...args: TArgs) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

interface MobileLayoutMetrics {
  viewportWidth: number;
  viewportHeight: number;
  viewportTop: number;
  shellHeight: number;
  hostTop: number;
  hostBottom: number;
  safeTop: number;
  safeBottom: number;
  headerHeight: number;
  navHeight: number;
  keyboardOpen: boolean;
}

class MobileLayoutController {
  private frame = 0;
  private safeTopProbe?: HTMLElement;
  private safeBottomProbe?: HTMLElement;
  private baselineByOrientation = new Map<string, number>();
  private readonly syncBound = (): void => this.schedule();

  constructor(private readonly root: HTMLElement, private readonly plugin: MymLifePlugin) {}

  start(): void {
    this.safeTopProbe = document.body.createDiv({ cls: "mym-safe-probe mym-safe-probe-top" });
    this.safeBottomProbe = document.body.createDiv({ cls: "mym-safe-probe mym-safe-probe-bottom" });
    window.addEventListener("resize", this.syncBound);
    window.addEventListener("orientationchange", this.syncBound);
    window.visualViewport?.addEventListener("resize", this.syncBound);
    window.visualViewport?.addEventListener("scroll", this.syncBound);
    this.root.addEventListener("focusin", this.syncBound);
    this.root.addEventListener("focusout", this.syncBound);
    this.schedule();
  }

  stop(): void {
    window.cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.syncBound);
    window.removeEventListener("orientationchange", this.syncBound);
    window.visualViewport?.removeEventListener("resize", this.syncBound);
    window.visualViewport?.removeEventListener("scroll", this.syncBound);
    this.root.removeEventListener("focusin", this.syncBound);
    this.root.removeEventListener("focusout", this.syncBound);
    this.safeTopProbe?.remove();
    this.safeBottomProbe?.remove();
  }

  schedule(): void {
    window.cancelAnimationFrame(this.frame);
    this.frame = window.requestAnimationFrame(() => this.sync());
  }

  private sync(): void {
    const viewport = window.visualViewport;
    const viewportWidth = Math.round(viewport?.width || window.innerWidth);
    const viewportHeight = Math.round(viewport?.height || window.innerHeight);
    const viewportTop = Math.round(viewport?.offsetTop || 0);
    const viewportBottom = viewportTop + viewportHeight;
    const orientation = viewportWidth > viewportHeight ? "landscape" : "portrait";
    const focused = document.activeElement;
    const editableFocused = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || (focused instanceof HTMLElement && focused.isContentEditable);
    const baseline = this.baselineByOrientation.get(orientation) || viewportHeight;
    if (!this.baselineByOrientation.has(orientation) || (!editableFocused && viewportHeight > baseline)) this.baselineByOrientation.set(orientation, viewportHeight);
    const keyboardOpen = editableFocused && baseline - viewportHeight > 80;

    const hostRect = this.root.parentElement?.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const hostTop = hostRect ? Math.max(0, Math.round(hostRect.top - viewportTop)) : 0;
    const hostBottom = hostRect ? Math.max(0, Math.round(viewportBottom - hostRect.bottom)) : 0;
    const safeTop = Math.round(this.safeTopProbe?.getBoundingClientRect().height || 0);
    const safeBottom = Math.round(this.safeBottomProbe?.getBoundingClientRect().height || 0);
    const rootTop = Math.max(rootRect.top, viewportTop);
    const availableAtRoot = Math.max(320, Math.round(viewportBottom - rootTop));
    const shellHeight = hostRect ? Math.max(320, Math.min(availableAtRoot, Math.round(hostRect.bottom - rootTop))) : availableAtRoot;
    const headerHeight = Math.round(this.root.querySelector<HTMLElement>(".mym-app-header")?.getBoundingClientRect().height || 0);
    const nav = this.root.querySelector<HTMLElement>(".mym-dock");
    const navHeight = nav && getComputedStyle(nav).display !== "none" ? Math.round(nav.getBoundingClientRect().height) : 0;
    const effectiveSafeTop = Math.max(0, safeTop - hostTop);
    const effectiveSafeBottom = Math.max(0, safeBottom - hostBottom);
    const metrics: MobileLayoutMetrics = { viewportWidth, viewportHeight, viewportTop, shellHeight, hostTop, hostBottom, safeTop, safeBottom, headerHeight, navHeight, keyboardOpen };

    this.root.style.setProperty("--mym-shell-height", `${shellHeight}px`);
    this.root.style.setProperty("--mym-viewport-height", `${viewportHeight}px`);
    this.root.style.setProperty("--mym-viewport-top", `${viewportTop}px`);
    this.root.style.setProperty("--mym-host-top", `${hostTop}px`);
    this.root.style.setProperty("--mym-host-bottom", `${hostBottom}px`);
    this.root.style.setProperty("--mym-safe-top", `${safeTop}px`);
    this.root.style.setProperty("--mym-safe-bottom", `${safeBottom}px`);
    this.root.style.setProperty("--mym-effective-safe-top", `${effectiveSafeTop}px`);
    this.root.style.setProperty("--mym-effective-safe-bottom", `${effectiveSafeBottom}px`);
    this.root.style.setProperty("--mym-header-height", `${headerHeight}px`);
    this.root.style.setProperty("--mym-measured-nav-height", `${navHeight}px`);
    document.body.style.setProperty("--mym-vv-height", `${viewportHeight}px`);
    document.body.style.setProperty("--mym-vv-top", `${viewportTop}px`);
    document.body.style.setProperty("--mym-effective-safe-bottom", `${effectiveSafeBottom}px`);
    this.root.toggleClass("is-keyboard-open", keyboardOpen);
    this.root.toggleClass("mym-no-custom-dock", this.plugin.hasHostNavConflict(this.root));
    this.updateDebug(metrics);
    const editableElement = editableFocused && focused instanceof HTMLElement ? focused : undefined;
    if (editableElement && keyboardOpen) {
      window.requestAnimationFrame(() => editableElement.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  }

  private updateDebug(metrics: MobileLayoutMetrics): void {
    const enabled = document.body.hasClass("mym-layout-debug-mode");
    let overlay = this.root.querySelector<HTMLElement>(".mym-layout-debug");
    if (!enabled) { overlay?.remove(); return; }
    overlay ||= this.root.createDiv({ cls: "mym-layout-debug", attr: { "aria-live": "polite" } });
    overlay.setText([
      `viewport ${metrics.viewportWidth}×${metrics.viewportHeight} @${metrics.viewportTop}`,
      `shell ${metrics.shellHeight} · host ${metrics.hostTop}/${metrics.hostBottom}`,
      `safe ${metrics.safeTop}/${metrics.safeBottom} · header ${metrics.headerHeight} · nav ${metrics.navHeight}`,
      `keyboard ${metrics.keyboardOpen ? "open" : "closed"}`
    ].join("\n"));
  }
}

abstract class MymView extends ItemView {
  plugin: MymLifePlugin;
  private cleanups: Array<() => void> = [];
  private layout?: MobileLayoutController;

  constructor(leaf: WorkspaceLeaf, plugin: MymLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  onClose(): Promise<void> {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.plugin.leaveMym(this);
    return Promise.resolve();
  }

  protected watchVault(render: () => void): void {
    const refresh = debounce(() => render(), 220);
    this.registerEvent(this.app.metadataCache.on("changed", () => refresh()));
    this.registerEvent(this.app.vault.on("create", () => refresh()));
    this.registerEvent(this.app.vault.on("delete", () => refresh()));
    this.registerEvent(this.app.vault.on("rename", () => refresh()));
  }

  protected startMobileLifecycle(render: () => void): void {
    this.plugin.enterMym(this);
    this.layout?.stop();
    this.layout = new MobileLayoutController(this.contentEl, this.plugin);
    this.layout.start();
    this.register(() => this.layout?.stop());
    this.watchVault(render);
  }

  protected shell(active: string, title = this.getDisplayText()): HTMLElement {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const shell = this.contentEl.createDiv({ cls: "mym-app-shell" });
    const header = shell.createDiv({ cls: "mym-app-header" });
    header.createEl("h1", { text: title });
    const page = shell.createDiv({ cls: "mym-page mym-scroll", attr: { tabindex: "-1" } });
    const dock = shell.createDiv({ cls: "mym-dock", attr: { role: "navigation", "aria-label": "主导航" } });
    const items: Array<{ icon: string; label: string; type?: string; capture?: boolean }> = [
      { icon: "home", label: "首页", type: HOME_VIEW },
      { icon: "clock-3", label: "时间", type: TIMELINE_VIEW },
      { icon: "plus", label: "记录", capture: true },
      { icon: "book-open", label: "知识", type: GRAPH_VIEW },
      { icon: "user-round", label: "我的", type: PROFILE_VIEW }
    ];
    items.forEach((item) => {
      const button = dock.createEl("button", {
        cls: `${item.type === active ? "is-active" : ""}${item.capture ? " mym-dock-capture" : ""}`.trim(),
        attr: { "aria-label": item.label, ...(item.type === active ? { "aria-current": "page" } : {}) }
      });
      setIcon(button.createSpan(), item.icon);
      button.createSpan({ text: item.label });
      if (item.capture) button.addEventListener("click", () => new CaptureModal(this.app).open());
      else if (item.type) {
        const type = item.type;
        button.addEventListener("click", () => void this.plugin.openRoot(type));
      }
    });
    return page;
  }

  protected detailShell(title: string, parentLabel = "首页"): HTMLElement {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const shell = this.contentEl.createDiv({ cls: "mym-app-shell" });
    const nav = shell.createDiv({ cls: "mym-app-header mym-app-nav" });
    const back = nav.createEl("button", { cls: "mym-back", attr: { "aria-label": `返回${parentLabel}` } });
    setIcon(back.createSpan(), "chevron-left");
    back.createSpan({ text: title });
    back.addEventListener("click", () => void this.plugin.back());
    const page = shell.createDiv({ cls: "mym-page mym-scroll mym-detail-page", attr: { tabindex: "-1" } });
    return page;
  }

  protected renderFailure(error: unknown, retry: () => void): void {
    console.error(`[MYM Life] ${this.getViewType()} render failed`, error);
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const shell = this.contentEl.createDiv({ cls: "mym-app-shell" });
    const header = shell.createDiv({ cls: "mym-app-header" });
    header.createEl("h1", { text: this.getDisplayText() });
    const page = shell.createDiv({ cls: "mym-page mym-scroll mym-error-page" });
    const card = page.createDiv({ cls: "mym-error", attr: { role: "alert" } });
    const icon = card.createDiv({ cls: "mym-error-icon" });
    setIcon(icon, "circle-alert");
    card.createEl("h1", { text: "页面暂时没有加载出来" });
    card.createEl("p", { text: "你的内容没有丢失。请重新加载当前页面。" });
    const button = card.createEl("button", { text: "重新加载" });
    button.addEventListener("click", retry);
  }

  protected openNote(file: TFile): void {
    void this.app.workspace.getLeaf(false).openFile(file);
  }
}

class HomeView extends MymView {
  getViewType(): string { return HOME_VIEW; }
  getDisplayText(): string { return "人生首页"; }
  getIcon(): string { return "sprout"; }

  async onOpen(): Promise<void> {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }

  private async renderSafely(): Promise<void> {
    try {
      const files = this.app.vault.getMarkdownFiles().filter((file) => {
        const type = asText(this.plugin.frontmatter(file).type);
        return type === "goal" || type === "daily" || type === "home" || file.path.startsWith("02 Daily/");
      });
      await this.plugin.hydrate(files);
      this.render();
    }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    const page = this.shell(HOME_VIEW);
    const goals = this.plugin.goals();
    const homeFile = this.plugin.fileByType("home");
    const homeFrontmatter = homeFile ? this.plugin.frontmatter(homeFile) : {};
    const heroFile = homeFile ? this.plugin.heroFor(homeFile) : undefined;
    const hero = page.createDiv({ cls: `mym-home-hero${heroFile ? " has-image" : ""}` });
    if (heroFile) hero.style.setProperty("--mym-hero-image", `url("${this.app.vault.getResourcePath(heroFile)}")`);
    const heroTop = hero.createDiv({ cls: "mym-home-hero-top" });
    heroTop.createSpan({ text: heroDate(Date.now()) });
    const heroAction = heroTop.createEl("button", { attr: { "aria-label": "打开搜索" } });
    setIcon(heroAction, "search");
    heroAction.addEventListener("click", () => void this.plugin.push(SEARCH_VIEW, {}, "首页"));
    const heroCopy = hero.createDiv({ cls: "mym-home-hero-copy" });
    heroCopy.createEl("h1", { text: asText(homeFrontmatter.headline, "更自律\n更强壮\n更自由") });
    heroCopy.createEl("p", { text: asText(homeFrontmatter.motto, "把注意力放在真正重要的事情上。") });

    const heading = page.createDiv({ cls: "mym-section-heading mym-section-action" });
    heading.createEl("h2", { text: "当前重点" });
    const allGoals = heading.createEl("button", { text: "全部" });
    allGoals.addEventListener("click", () => void this.plugin.push(GOALS_VIEW, {}, "首页"));
    const focus = goals.filter((goal) => goal.status === "focus").slice(0, 5);
    if (focus.length === 0) this.emptyState(page);
    else {
      const list = page.createDiv({ cls: "mym-focus-compact" });
      focus.forEach((goal) => {
        const card = list.createEl("button", { cls: "mym-focus-row" });
        const thumb = card.createDiv({ cls: "mym-focus-thumb" });
        const image = this.plugin.heroFor(goal.file) || this.plugin.mediaFor(goal.file)[0]?.file;
        if (image) thumb.style.backgroundImage = `url("${this.app.vault.getResourcePath(image)}")`;
        else setIcon(thumb, this.plugin.iconFor(goal));
        const copy = card.createDiv({ cls: "mym-focus-copy" });
        copy.createEl("strong", { text: goal.title });
        copy.createSpan({ text: goal.metric || goal.recap || "继续推进" });
        if (goal.progress !== undefined) {
          const track = copy.createDiv({ cls: "mym-progress", attr: { role: "progressbar", "aria-valuenow": String(goal.progress), "aria-valuemin": "0", "aria-valuemax": "100" } });
          track.createDiv({ attr: { style: `width:${clamp(goal.progress, 0, 100)}%` } });
        }
        const value = card.createDiv({ cls: "mym-focus-value" });
        const dueDays = goal.due ? Math.ceil((new Date(goal.due).getTime() - Date.now()) / 86400000) : undefined;
        value.createEl("strong", { text: goal.progress !== undefined ? `${goal.progress}%` : dueDays !== undefined && dueDays >= 0 ? `${dueDays} 天` : goal.metric || "进行中" });
        if (goal.due) {
          value.createSpan({ text: dueDays !== undefined && dueDays >= 0 ? "倒计时" : "已到期" });
        }
        card.addEventListener("click", () => void this.plugin.openGoal(goal));
      });
    }

    this.sectionHeading(page, "最近人生", "你的生活，不是数据表");
    const recent = this.plugin.dailyFiles().slice(0, 6);
    const stream = page.createDiv({ cls: "mym-life-strip" });
    if (!recent.length) stream.createDiv({ cls: "mym-empty", text: "还没有最近记录。点底部“记录”写下第一条。" });
    recent.forEach((file) => {
      const card = stream.createEl("button", { cls: "mym-life-card" });
      const visual = card.createDiv({ cls: "mym-life-card-media" });
      const model = this.plugin.presentation(file);
      this.mediaThumb(visual, model.media[0]);
      card.createEl("strong", { text: model.displayTitle });
      card.createSpan({ text: `${model.date}${model.time ? ` · ${model.time}` : ""}` });
      card.addEventListener("click", () => this.openNote(file));
    });
  }

  private quickButton(parent: HTMLElement, icon: string, label: string, action: () => void): void {
    const button = parent.createEl("button", { cls: "mym-quick-button" });
    setIcon(button.createSpan({ cls: "mym-quick-icon" }), icon);
    button.createSpan({ text: label });
    button.addEventListener("click", action);
  }

  private sectionHeading(parent: HTMLElement, title: string, subtitle: string): void {
    const heading = parent.createDiv({ cls: "mym-section-heading" });
    heading.createEl("h2", { text: title });
    heading.createSpan({ text: subtitle });
  }

  private mediaThumb(parent: HTMLElement, media?: MediaItem): void {
    if (!media) { setIcon(parent, "image"); return; }
    const source = this.app.vault.getResourcePath(media.file);
    if (media.kind === "image") { parent.style.backgroundImage = `url("${source}")`; return; }
    if (media.kind === "video") {
      const video = parent.createEl("video", { attr: { src: source, preload: "metadata", muted: "", playsinline: "" } });
      const play = parent.createDiv({ cls: "mym-media-play" });
      setIcon(play, "play");
      const duration = parent.createSpan({ cls: "mym-media-duration", text: "视频" });
      video.addEventListener("loadedmetadata", () => {
        const total = Math.round(video.duration || 0);
        duration.setText(total ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : "视频");
      }, { once: true });
      const start = (event: Event): void => {
        event.stopPropagation();
        video.controls = true; video.muted = false; play.hide(); duration.hide();
        void video.play();
      };
      video.addEventListener("click", start);
      play.addEventListener("click", start);
      return;
    }
    setIcon(parent, "audio-lines");
  }

  private emptyState(parent: HTMLElement): void {
    const box = parent.createDiv({ cls: "mym-empty" });
    box.createEl("strong", { text: "当前还没有重点目标" });
    box.createSpan({ text: "从目标页选择你现在最想投入的事情。" });
    const button = box.createEl("button", { text: "选择目标" });
    button.addEventListener("click", () => void this.plugin.push(GOALS_VIEW, {}, "首页"));
  }

  private goalCard(parent: HTMLElement, goal: Goal, primary: boolean): void {
    const card = parent.createEl("button", { cls: `mym-goal-card${primary ? " is-primary" : ""}` });
    const top = card.createDiv({ cls: "mym-goal-top" });
    top.createSpan({ cls: "mym-goal-domain", text: goal.domain || "当前目标" });
    top.createSpan({ text: goal.progress === undefined ? "进行中" : `${goal.progress}%` });
    card.createEl("h3", { text: goal.title });
    if (goal.metric) card.createEl("strong", { cls: "mym-goal-metric", text: goal.metric });
    if (goal.recap) card.createEl("p", { text: goal.recap });
    if (goal.progress !== undefined) {
      const track = card.createDiv({ cls: "mym-progress", attr: { role: "progressbar", "aria-valuenow": String(goal.progress), "aria-valuemin": "0", "aria-valuemax": "100" } });
      track.createDiv({ attr: { style: `width:${clamp(goal.progress, 0, 100)}%` } });
    }
    if (goal.due) {
      const days = Math.ceil((new Date(goal.due).getTime() - Date.now()) / 86400000);
      card.createSpan({ cls: "mym-goal-due", text: days >= 0 ? `还有 ${days} 天` : `已过 ${Math.abs(days)} 天` });
    }
    card.addEventListener("click", () => void this.plugin.openGoal(goal));
  }
}

class DetailView extends MymView {
  private goalPath = "";

  getViewType(): string { return DETAIL_VIEW; }
  getDisplayText(): string { return "主线详情"; }
  getIcon(): string { return "leaf"; }

  getState(): Record<string, unknown> { return { goalPath: this.goalPath }; }

  async setState(state: Record<string, unknown>, result: unknown): Promise<void> {
    await super.setState(state, result as never);
    this.goalPath = asText(state.goalPath);
    if (this.contentEl.isConnected) this.renderSafely();
  }

  async onOpen(): Promise<void> {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }

  private async renderSafely(): Promise<void> {
    try {
      const relevant = this.app.vault.getMarkdownFiles().filter((file) => {
        const type = asText(this.plugin.frontmatter(file).type);
        return file.path === this.goalPath || type === "goal" || type === "daily" || file.path.startsWith("02 Daily/") || file.path.startsWith("03 Knowledge/");
      });
      await this.plugin.hydrate(relevant);
      this.render();
    }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    if (!this.goalPath) {
      const page = this.detailShell("主线", "首页");
      const loading = page.createDiv({ cls: "mym-state-card mym-loading", attr: { role: "status", "aria-live": "polite" } });
      loading.createDiv({ cls: "mym-state-orb" });
      loading.createEl("h1", { text: "正在打开主线" });
      loading.createEl("p", { text: "MYM 正在整理这一段人生。" });
      return;
    }
    const goal = this.plugin.goalForPath(this.goalPath);
    if (!goal) {
      const page = this.detailShell("主线", "首页");
      const missing = page.createDiv({ cls: "mym-state-card" });
      const icon = missing.createDiv({ cls: "mym-state-icon" });
      setIcon(icon, "file-question");
      missing.createEl("h1", { text: "这条主线暂时找不到" });
      missing.createEl("p", { text: "笔记可能刚刚移动或重命名。返回首页后，MYM 会根据最新索引重新整理。" });
      const button = missing.createEl("button", { cls: "mym-primary-button", text: "返回首页" });
      button.addEventListener("click", () => void this.plugin.openRoot(HOME_VIEW));
      return;
    }

    const page = this.detailShell(goal.title, "首页");

    const isCpa = /cpa|考试|审计|会计/i.test(`${goal.title} ${goal.domain || ""}`);
    const isFitness = /健身|身体|训练|体脂/i.test(`${goal.title} ${goal.domain || ""}`);
    const fm = this.plugin.frontmatter(goal.file);
    const heroFile = this.plugin.heroFor(goal.file) || this.plugin.mediaFor(goal.file).find((item) => item.kind === "image")?.file;
    const hero = page.createDiv({ cls: `mym-line-hero${heroFile ? " has-image" : ""}` });
    if (heroFile) hero.style.setProperty("--mym-line-image", `url("${this.app.vault.getResourcePath(heroFile)}")`);
    hero.createEl("h1", { text: goal.title });
    hero.createEl("p", { text: asText(fm.subtitle) || (isFitness ? "更强壮，更有能量的自己" : isCpa ? "一次通过，给未来更多可能" : goal.recap || "持续投入，保持清醒。") });

    const tabs = page.createDiv({ cls: "mym-detail-tabs", attr: { role: "tablist", "aria-label": `${goal.title} 页面导航` } });
    const tabItems = isCpa ? [["总览","overview"],["计划","stage"],["记录","records"],["知识","knowledge"],["资料","source"]] : [["总览","overview"],["记录","records"],["数据","data"],["知识","knowledge"],["资源","source"]];
    tabItems.forEach(([label, target], index) => {
      const button = tabs.createEl("button", { cls: index === 0 ? "is-active" : "", text: label, attr: { role: "tab" } });
      button.addEventListener("click", () => page.querySelector<HTMLElement>(`[data-mym-section="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    const recent = this.plugin.relatedDaily(goal.file).slice(0, 7);
    const knowledge = this.plugin.relatedKnowledge(goal.file);
    const media = this.plugin.mediaFor(goal.file);
    if (isFitness) this.renderFitness(page, goal, fm, media, recent);
    else if (isCpa) this.renderCpa(page, goal, fm, recent);
    else this.renderGeneric(page, goal, fm, media, recent);

    this.heading(page, "相关知识", knowledge.length ? `${knowledge.length} 个连接` : "局部图谱");
    const knowledgeCard = page.createEl("button", { cls: "mym-knowledge-entry", attr: { "data-mym-section": "knowledge" } });
    const knowledgeIcon = knowledgeCard.createDiv({ cls: "mym-knowledge-icon" });
    setIcon(knowledgeIcon, "orbit");
    const knowledgeCopy = knowledgeCard.createDiv();
    knowledgeCopy.createEl("strong", { text: knowledge.length ? "进入沉浸知识图谱" : "从这条主线建立知识连接" });
    knowledgeCopy.createSpan({ text: knowledge.length ? knowledge.slice(0, 3).map((file) => this.plugin.presentation(file).displayTitle).join(" · ") : "从相关内容中建立连接" });
    setIcon(knowledgeCard.createSpan({ cls: "mym-entry-arrow" }), "arrow-up-right");
    knowledgeCard.addEventListener("click", () => void this.plugin.push(GRAPH_VIEW, { centerPath: goal.file.path }, goal.title));

    const edit = page.createEl("button", { cls: "mym-edit-source", attr: { "data-mym-section": "source" } });
    setIcon(edit.createSpan(), "pencil");
    edit.createSpan({ text: "编辑主线内容" });
    edit.addEventListener("click", () => this.openNote(goal.file));

    const floating = page.createEl("button", { cls: "mym-floating-add", attr: { "aria-label": "快速记录" } });
    setIcon(floating, "plus");
    floating.addEventListener("click", () => new CaptureModal(this.app).open());
  }

  private renderFitness(page: HTMLElement, goal: Goal, fm: Frontmatter, media: MediaItem[], recent: TFile[]): void {
    const target = asText(fm.target) || goal.metric || "还没有设置当前目标";
    const overview = page.createDiv({ cls: "mym-fitness-target", attr: { "data-mym-section": "overview" } });
    const copy = overview.createDiv();
    copy.createSpan({ cls: "mym-kicker", text: "当前目标" });
    copy.createEl("h2", { text: target });
    copy.createEl("p", { text: goal.due ? `目标：${this.formatDate(goal.due)}` : "给目标设定一个清晰日期" });
    const ring = overview.createDiv({ cls: "mym-progress-ring", attr: { style: `--mym-progress:${goal.progress ?? 0}` } });
    const ringText = ring.createDiv();
    ringText.createEl("strong", { text: goal.progress === undefined ? "—" : `${goal.progress}%` });
    ringText.createSpan({ text: goal.due ? this.daysText(goal.due) : "进行中" });

    const stats = page.createDiv({ cls: "mym-stat-grid", attr: { "data-mym-section": "data" } });
    this.stat(stats, "体重", asText(fm.weight, "—"), asText(fm.weightChange, "等待记录"));
    this.stat(stats, "体脂率", asText(fm.bodyFat, "—"), asText(fm.bodyFatChange, "等待记录"));
    this.stat(stats, "力量", asText(fm.strength, "—"), asText(fm.strengthChange, "等待记录"));

    this.heading(page, "变化对比", media.filter((item) => item.kind === "image").length >= 2 ? "真实变化" : "等待第二张照片");
    const images = media.filter((item) => item.kind === "image").slice(0, 2);
    if (images.length) {
      const compare = page.createDiv({ cls: "mym-compare" });
      compare.toggleClass("is-single", images.length === 1);
      images.forEach((item, index) => {
        const frame = compare.createEl("button", { cls: "mym-compare-frame", attr: { "aria-label": "全屏查看照片" } });
        frame.createEl("img", { attr: { src: this.app.vault.getResourcePath(item.file), alt: index ? "当前照片" : "之前照片", decoding: "async" } });
        frame.createSpan({ text: asText(index ? fm.afterDate : fm.beforeDate, index ? "现在" : "之前") });
        frame.addEventListener("click", () => new MediaPreviewModal(this.app, item).open());
      });
      if (images.length === 2) { const arrow = compare.createDiv({ cls: "mym-compare-arrow" }); setIcon(arrow, "arrow-right"); }
    } else page.createDiv({ cls: "mym-empty mym-empty-soft", text: "记录两张照片，就能在这里看见真实变化。" });

    this.renderRecent(page, recent, "最近记录", "还没有健身记录。");
  }

  private renderCpa(page: HTMLElement, goal: Goal, fm: Frontmatter, recent: TFile[]): void {
    const countdown = page.createDiv({ cls: "mym-cpa-countdown", attr: { "data-mym-section": "overview" } });
    countdown.createSpan({ cls: "mym-kicker", text: "距离考试还有" });
    countdown.createEl("h2", { text: goal.due ? this.daysText(goal.due) : "尚未设置" });
    countdown.createEl("p", { text: goal.due ? this.formatDate(goal.due) : "设置考试日期后显示倒计时" });
    const calendar = countdown.createDiv({ cls: "mym-countdown-icon" }); setIcon(calendar, "calendar-days");

    const progressCard = page.createDiv({ cls: "mym-study-progress", attr: { "data-mym-section": "data" } });
    const progressTitle = progressCard.createDiv();
    progressTitle.createEl("strong", { text: "学习进度" });
    progressTitle.createSpan({ text: goal.progress === undefined ? "—" : `${goal.progress}%` });
    const track = progressCard.createDiv({ cls: "mym-progress", attr: { role: "progressbar", "aria-valuenow": String(goal.progress ?? 0), "aria-valuemin": "0", "aria-valuemax": "100" } });
    track.createDiv({ attr: { style: `width:${goal.progress ?? 0}%` } });
    const subjects = progressCard.createDiv({ cls: "mym-subject-grid" });
    [["会计",fm.accounting],["审计",fm.audit],["财管",fm.finance],["税法",fm.tax]].forEach(([label, value]) => {
      const subject = subjects.createDiv({ cls: "mym-subject" });
      subject.createSpan({ text: String(label) });
      subject.createEl("strong", { text: asText(value, "—") });
    });

    this.heading(page, "本周状态", "7 天");
    const week = page.createDiv({ cls: "mym-week-strip" });
    this.plugin.weekStatus(goal.file).forEach((item) => {
      const day = week.createDiv({ cls: item.active ? "is-active" : "" });
      day.createDiv();
      day.createSpan({ text: item.label });
    });
    this.heading(page, "当前阶段", "计划");
    const stage = page.createDiv({ cls: "mym-stage-card", attr: { "data-mym-section": "stage" } });
    stage.createEl("strong", { text: asText(fm.stage, "还没有设置当前阶段") });
    stage.createSpan({ text: asText(fm.next, goal.metric || "写下这周最重要的下一步") });
    this.renderRecent(page, recent, "最近学习", "还没有学习记录。");
  }

  private renderGeneric(page: HTMLElement, goal: Goal, fm: Frontmatter, media: MediaItem[], recent: TFile[]): void {
    const overview = page.createDiv({ cls: "mym-fitness-target", attr: { "data-mym-section": "overview" } });
    const copy = overview.createDiv();
    copy.createSpan({ cls: "mym-kicker", text: "当前目标" });
    copy.createEl("h2", { text: goal.metric || asText(fm.target, "继续推进这条主线") });
    copy.createEl("p", { text: goal.recap || "保持节奏，记录真实变化。" });
    const ring = overview.createDiv({ cls: "mym-progress-ring", attr: { style: `--mym-progress:${goal.progress ?? 0}` } });
    const ringText = ring.createDiv(); ringText.createEl("strong", { text: goal.progress === undefined ? "—" : `${goal.progress}%` }); ringText.createSpan({ text: "当前进度" });
    if (media.length) {
      this.heading(page, "最近媒体", `${media.length} 项`);
      this.renderMediaGallery(page, media.slice(0, 4));
    }
    this.renderRecent(page, recent, "最近记录", "这里还没有相关记录。");
  }

  private renderRecent(page: HTMLElement, files: TFile[], title: string, emptyText: string): void {
    this.heading(page, title, "生活留下的痕迹");
    const stream = page.createDiv({ cls: "mym-detail-stream", attr: { "data-mym-section": "records" } });
    if (!files.length) stream.createDiv({ cls: "mym-empty mym-empty-soft", text: emptyText });
    files.slice(0, 4).forEach((file) => {
      const model = this.plugin.presentation(file);
      const row = stream.createEl("button", { cls: "mym-detail-entry" });
      const visual = row.createDiv({ cls: "mym-entry-media" });
      const image = model.media.find((item) => item.kind === "image");
      if (image) visual.style.backgroundImage = `url("${this.app.vault.getResourcePath(image.file)}")`; else setIcon(visual, "notebook-pen");
      const copy = row.createDiv();
      copy.createEl("strong", { text: model.displayTitle });
      copy.createSpan({ text: `${model.date} · ${model.previewText}` });
      row.addEventListener("click", () => this.openNote(file));
    });
  }

  private renderMediaGallery(parent: HTMLElement, media: MediaItem[]): void {
    const gallery = parent.createDiv({ cls: media.length === 1 ? "mym-media-gallery is-single" : "mym-media-gallery" });
    media.forEach((item) => {
      const frame = gallery.createDiv({ cls: `mym-media-tile is-${item.kind}` });
      const source = this.app.vault.getResourcePath(item.file);
      if (item.kind === "image") frame.createEl("img", { attr: { src: source, alt: "记录图片", decoding: "async" } });
      else if (item.kind === "video") {
        const video = frame.createEl("video", { attr: { src: source, preload: "metadata", playsinline: "", controls: "" } });
        video.addEventListener("click", (event) => event.stopPropagation());
      } else frame.createEl("audio", { attr: { src: source, preload: "none", controls: "" } });
      if (item.kind === "image") frame.addEventListener("click", () => new MediaPreviewModal(this.app, item).open());
    });
  }

  private daysText(raw: string): string {
    const days = Math.ceil((new Date(raw).getTime() - Date.now()) / 86400000);
    return Number.isFinite(days) ? days >= 0 ? `${days} 天` : `已过 ${Math.abs(days)} 天` : "日期待确认";
  }

  private formatDate(raw: string): string {
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date) : raw;
  }

  private heading(parent: HTMLElement, title: string, label: string): void {
    const row = parent.createDiv({ cls: "mym-detail-heading" });
    row.createEl("h2", { text: title });
    row.createSpan({ text: label });
  }

  private stat(parent: HTMLElement, label: string, value: string, note: string): void {
    const card = parent.createDiv({ cls: "mym-stat" });
    card.createSpan({ text: label });
    card.createEl("strong", { text: value });
    card.createEl("small", { text: note });
  }
}

class TimelineView extends MymView {
  private category = "全部";
  getViewType(): string { return TIMELINE_VIEW; }
  getDisplayText(): string { return "人生时间流"; }
  getIcon(): string { return "calendar-days"; }

  async onOpen(): Promise<void> {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }

  private async renderSafely(): Promise<void> {
    try { await this.plugin.hydrate(this.plugin.dailyFiles()); this.render(); }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    const page = this.shell(TIMELINE_VIEW);
    const head = page.createDiv({ cls: "mym-title-row" });
    const words = head.createDiv();
    words.createEl("p", { text: "人生经历、思想与里程碑，留在一条线上。" });
    const add = head.createEl("button", { cls: "mym-icon-button", attr: { "aria-label": "快速记录" } });
    setIcon(add, "plus");
    add.addEventListener("click", () => new CaptureModal(this.app).open());

    const chips = page.createDiv({ cls: "mym-filter-chips" });
    ["全部", "经历", "思想", "情绪", "里程碑"].forEach((label) => {
      const chip = chips.createEl("button", { cls: this.category === label ? "is-active" : "", text: label });
      chip.addEventListener("click", () => { this.category = label; this.renderSafely(); });
    });

    const files = this.plugin.dailyFiles().filter((file) => {
      if (this.category === "全部") return true;
      const fm = this.plugin.frontmatter(file);
      return asText(fm.category, asText(fm.kind)).includes(this.category) || (getAllTags(this.app.metadataCache.getFileCache(file) || {}) || []).some((tag) => tag.includes(this.category));
    });
    if (!files.length) {
      page.createDiv({ cls: "mym-empty", text: "时间线上还没有内容。点右上角记录此刻。" });
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
          const play = image.createDiv({ cls: "mym-media-play" }); setIcon(play, "play");
          const start = (event: Event): void => { event.stopPropagation(); video.controls = true; video.muted = false; play.hide(); void video.play(); };
          video.addEventListener("click", start); play.addEventListener("click", start);
        }
      } else {
        const image = card.createDiv({ cls: "mym-time-media is-placeholder" });
        setIcon(image, "notebook-pen");
      }
      const body = card.createDiv({ cls: "mym-time-copy" });
      body.createEl("h2", { text: model.displayTitle });
      body.createEl("p", { text: model.previewText });
      body.createSpan({ cls: "mym-time-meta", text: `${model.time} · ${model.category}` });
      item.addEventListener("click", () => this.openNote(file));
    });
  }
}

class SearchView extends MymView {
  getViewType(): string { return SEARCH_VIEW; }
  getDisplayText(): string { return "全局搜索"; }
  getIcon(): string { return "search"; }

  async onOpen(): Promise<void> {
    try { await this.plugin.hydrate(this.app.vault.getMarkdownFiles()); this.render(); }
    catch (error) { this.renderFailure(error, () => void this.onOpen()); }
    this.startMobileLifecycle(() => {
      void this.plugin.hydrate(this.app.vault.getMarkdownFiles()).then(() => this.render()).catch((error) => this.renderFailure(error, () => void this.onOpen()));
    });
  }

  private render(): void {
    const page = this.shell(SEARCH_VIEW);
    page.createEl("p", { text: "搜索目标、知识与人生记录。" });
    const searchBox = page.createDiv({ cls: "mym-search-box" });
    setIcon(searchBox.createSpan(), "search");
    const input = searchBox.createEl("input", { type: "search", placeholder: "搜索目标、知识、标签…", attr: { enterkeyhint: "search" } });
    const results = page.createDiv({ cls: "mym-search-results" });
    const update = (): void => {
      results.empty();
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) {
        results.createDiv({ cls: "mym-muted", text: "输入关键词开始搜索。" });
        return;
      }
      const matches = this.app.vault.getMarkdownFiles().filter((file) => {
        const fm = this.plugin.frontmatter(file);
        const cache = this.app.metadataCache.getFileCache(file);
        const tags = cache ? getAllTags(cache) || [] : [];
        const haystack = `${file.basename} ${file.path} ${tags.join(" ")} ${Object.values(fm).map((value) => asText(value)).join(" ")}`.toLocaleLowerCase();
        return haystack.includes(query);
      }).slice(0, 60);
      if (!matches.length) results.createDiv({ cls: "mym-empty", text: "没有找到相关内容，换一个关键词试试。" });
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

}

class GoalsView extends MymView {
  private status: GoalStatus | "all" = "focus";

  getViewType(): string { return GOALS_VIEW; }
  getDisplayText(): string { return "目标管理"; }
  getIcon(): string { return "list-checks"; }

  async onOpen(): Promise<void> {
    await this.renderSafely();
    this.startMobileLifecycle(() => void this.renderSafely());
  }

  private async renderSafely(): Promise<void> {
    try {
      await this.plugin.hydrate(this.app.vault.getMarkdownFiles().filter((file) => asText(this.plugin.frontmatter(file).type) === "goal"));
      this.render();
    }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    const page = this.detailShell("我的目标", "首页");
    const title = page.createDiv({ cls: "mym-title-row" });
    const copy = title.createDiv();
    copy.createEl("p", { text: "所有目标，统一管理。首页只保留当前重点。" });
    const tabs = page.createDiv({ cls: "mym-filter-chips mym-goal-tabs" });
    const options: Array<[GoalStatus | "all", string]> = [["focus","进行中"],["done","已完成"],["paused","已暂停"]];
    options.forEach(([value, label]) => {
      const button = tabs.createEl("button", { cls: this.status === value ? "is-active" : "", text: label });
      button.addEventListener("click", () => { this.status = value; this.renderSafely(); });
    });
    const goals = this.plugin.goals().filter((goal) => this.status === "all" || (this.status === "focus" ? ["focus","active"].includes(goal.status) : goal.status === this.status));
    const list = page.createDiv({ cls: "mym-manage-list" });
    if (!goals.length) list.createDiv({ cls: "mym-empty", text: this.status === "done" ? "还没有完成的目标。" : this.status === "paused" ? "还没有暂停的目标。" : "还没有进行中的目标。点右下角开始一个新目标。" });
    goals.forEach((goal) => {
      const row = list.createEl("button", { cls: "mym-manage-row" });
      const visual = row.createDiv({ cls: "mym-manage-thumb" });
      const image = this.plugin.heroFor(goal.file) || this.plugin.mediaFor(goal.file).find((item) => item.kind === "image")?.file;
      if (image) visual.style.backgroundImage = `url("${this.app.vault.getResourcePath(image)}")`;
      else setIcon(visual, this.plugin.iconFor(goal));
      const body = row.createDiv({ cls: "mym-manage-copy" });
      body.createEl("strong", { text: goal.title });
      body.createSpan({ text: goal.metric || goal.recap || "还没有状态描述" });
      const track = body.createDiv({ cls: "mym-progress" });
      track.createDiv({ attr: { style: `width:${clamp(goal.progress ?? 0,0,100)}%` } });
      const end = row.createDiv({ cls: "mym-manage-end" });
      end.createEl("strong", { text: goal.progress === undefined ? "—" : `${goal.progress}%` });
      end.createSpan({ text: goal.due ? calendarDate(goal.due) : goal.status === "done" ? "已完成" : goal.status === "paused" ? "已暂停" : "进行中" });
      if (this.status === "focus" && goal.status !== "focus") {
        const focus = end.createEl("span", { cls: "mym-focus-toggle", attr: { role: "button", tabindex: "0", "aria-label": "设为当前重点" } });
        setIcon(focus, "target");
        focus.addEventListener("click", (event) => { event.stopPropagation(); void this.plugin.setGoalFocus(goal); });
      }
      row.addEventListener("click", () => void this.plugin.openGoal(goal));
    });
    const add = page.createEl("button", { cls: "mym-floating-add", attr: { "aria-label": "新建目标" } });
    setIcon(add, "plus");
    add.addEventListener("click", () => void this.plugin.createGoal());
  }
}

class ProfileView extends MymView {
  getViewType(): string { return PROFILE_VIEW; }
  getDisplayText(): string { return "我的"; }
  getIcon(): string { return "user-round"; }

  onOpen(): Promise<void> {
    this.renderSafely();
    this.startMobileLifecycle(() => this.renderSafely());
    return Promise.resolve();
  }

  private renderSafely(): void {
    try { this.render(); }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    const page = this.shell(PROFILE_VIEW);
    const home = this.plugin.fileByType("home");
    const cover = home ? this.plugin.heroFor(home) : undefined;
    const hero = page.createDiv({ cls: `mym-profile-hero${cover ? " has-image" : ""}` });
    if (cover) hero.style.setProperty("--mym-profile-image", `url("${this.app.vault.getResourcePath(cover)}")`);
    hero.createDiv({ cls: "mym-profile-avatar", text: "MYM" });
    hero.createEl("h1", { text: "更好的自己" });
    hero.createEl("p", { text: "持续成长，保持清醒。" });
    const menu = page.createDiv({ cls: "mym-settings-list" });
    this.menu(menu, "chart-no-axes-column-increasing", "数据统计", `${this.plugin.goals().length} 个目标 · ${this.plugin.dailyFiles().length} 条记录`, () => new Notice("统计仅在本机完成"));
    this.menu(menu, "palette", "主题设置", "MYM 浅色主题", () => new Notice("当前使用 MYM 浅色主题"));
    this.menu(menu, "archive-restore", "备份与恢复", "所有内容都保存在本地", () => new Notice("请继续使用你的同步或备份方案"));
    this.menu(menu, "info", "关于 MYM Life", "版本 1.2.2 · 完全离线", () => new Notice("MYM Life 1.2.2"));
  }

  private menu(parent: HTMLElement, iconName: string, title: string, subtitle: string, action: () => void): void {
    const row = parent.createEl("button", { cls: "mym-settings-row" });
    const icon = row.createDiv({ cls: "mym-settings-icon" });
    setIcon(icon, iconName);
    const copy = row.createDiv();
    copy.createEl("strong", { text: title });
    copy.createSpan({ text: subtitle });
    setIcon(row.createSpan({ cls: "mym-entry-arrow" }), "chevron-right");
    row.addEventListener("click", action);
  }
}

class GraphView extends MymView {
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private center?: TFile;
  private selected = 0;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private pointer?: { id: number; x: number; y: number; moved: boolean };
  private dragNode = -1;
  private resize?: ResizeObserver;
  private centerPath = "";
  private domainFilter = "全部";
  private nodeLimit = 30;
  private updatePreview?: () => void;
  private nodeImages = new Map<string, HTMLImageElement>();

  getViewType(): string { return GRAPH_VIEW; }
  getDisplayText(): string { return "知识图谱"; }
  getIcon(): string { return "orbit"; }

  getState(): Record<string, unknown> { return { centerPath: this.centerPath }; }

  async setState(state: Record<string, unknown>, result: unknown): Promise<void> {
    await super.setState(state, result as never);
    this.centerPath = asText(state.centerPath);
    if (this.contentEl.isConnected) {
      try { this.build(); this.updatePreview?.(); }
      catch (error) { this.renderFailure(error, () => this.onOpen()); }
    }
  }

  async onOpen(): Promise<void> {
    try {
      await this.plugin.hydrate(this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("03 Knowledge/") || file.path === this.centerPath));
      this.render();
    }
    catch (error) { this.renderFailure(error, () => void this.onOpen()); }
    this.startMobileLifecycle(() => {
      try { this.build(); }
      catch (error) { this.renderFailure(error, () => void this.onOpen()); }
    });
  }

  onClose(): Promise<void> {
    this.resize?.disconnect();
    return super.onClose();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root", "mym-graph-root");
    const wrap = this.contentEl.createDiv({ cls: "mym-app-shell mym-graph-wrap" });
    const top = wrap.createDiv({ cls: "mym-app-header mym-graph-top" });
    const back = top.createEl("button", { cls: "mym-graph-back", attr: { "aria-label": "返回上一页" } });
    setIcon(back, "chevron-left");
    back.addEventListener("click", () => void this.plugin.back());
    top.createDiv({ cls: "mym-graph-title", text: "知识空间" });
    const controls = top.createDiv({ cls: "mym-graph-controls" });
    const search = controls.createEl("button", { attr: { "aria-label": "搜索知识" } });
    setIcon(search, "search");
    search.addEventListener("click", () => void this.plugin.push(SEARCH_VIEW, {}, "知识空间"));
    const stage = wrap.createDiv({ cls: "mym-graph-stage mym-scroll" });
    const filters = stage.createDiv({ cls: "mym-graph-filters" });
    ["全部", "健身", "CPA", "英语", "生活"].forEach((domain) => {
      const chip = filters.createEl("button", { cls: this.domainFilter === domain ? "is-active" : "", text: domain });
      chip.addEventListener("click", () => {
        this.domainFilter = domain;
        this.centerPath = "";
        this.nodeLimit = 30;
        filters.querySelectorAll("button").forEach((button) => button.toggleClass("is-active", button === chip));
        this.build(); this.updatePreview?.();
      });
    });
    this.canvas = stage.createEl("canvas", { cls: "mym-graph-canvas", attr: { "aria-label": "可缩放知识图谱" } });
    this.ctx = this.canvas.getContext("2d") || undefined;
    const preview = stage.createDiv({ cls: "mym-graph-preview" });
    const label = preview.createDiv({ cls: "mym-graph-preview-label", text: "当前节点" });
    const title = preview.createEl("h2");
    const summary = preview.createEl("p");
    const previewMeta = preview.createDiv({ cls: "mym-graph-preview-meta" });
    const previewTags = preview.createDiv({ cls: "mym-graph-preview-tags" });
    const open = preview.createEl("button", { text: "进入详情" });
    open.addEventListener("click", () => { const node = this.nodes[this.selected]; if (node) this.openNote(node.file); });

    const updatePreview = (): void => {
      const node = this.nodes[this.selected];
      if (!node) { title.setText("暂无知识节点"); summary.setText("在 03 Knowledge 中添加链接笔记。 "); return; }
      label.setText(node.level === 0 ? "中心节点" : node.domain || "关联知识");
      const model = this.plugin.presentation(node.file);
      title.setText(model.displayTitle);
      summary.setText(model.previewText);
      const relations = this.edges.filter((edge) => edge.from === this.selected || edge.to === this.selected).length;
      previewMeta.setText(`${relations} 个关联笔记 · ${relations} 个链接`);
      previewTags.empty();
      const cache = this.app.metadataCache.getFileCache(node.file);
      const tags = cache ? getAllTags(cache) || [] : [];
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
          this.scale = 1; this.panX = 0; this.panY = 0;
          this.build(); updatePreview();
        }
      }
      this.pointer = undefined;
      this.dragNode = -1;
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.scale = clamp(this.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.55, 2.4);
      this.draw();
    }, { passive: false });
    let pinchDistance = 0;
    const touches = new Map<number, PointerEvent>();
    this.canvas.addEventListener("pointerdown", (event) => { touches.set(event.pointerId, event); });
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
    const endTouch = (event: PointerEvent): void => { touches.delete(event.pointerId); if (touches.size < 2) pinchDistance = 0; };
    this.canvas.addEventListener("pointerup", endTouch);
    this.canvas.addEventListener("pointercancel", endTouch);
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(this.canvas);
    this.build();
    updatePreview();
  }

  private build(): void {
    const active = this.app.workspace.getActiveFile();
    const knowledge = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("03 Knowledge/") && this.matchesDomain(file));
    const requested = this.centerPath ? this.app.vault.getAbstractFileByPath(this.centerPath) : undefined;
    this.center = requested instanceof TFile ? requested : knowledge[0] || (active && active.extension === "md" ? active : this.app.vault.getMarkdownFiles()[0]);
    if (!this.center) { this.nodes = []; this.edges = []; this.draw(); return; }
    const reverse = new Map<string, string[]>();
    Object.entries(this.app.metadataCache.resolvedLinks).forEach(([source, targets]) => {
      Object.keys(targets).forEach((target) => {
        const sources = reverse.get(target) || [];
        sources.push(source);
        reverse.set(target, sources);
      });
    });
    const chosen = new Map<string, number>();
    const queue: Array<{ file: TFile; level: number }> = [{ file: this.center, level: 0 }];
    const edges: GraphEdge[] = [];
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
      const file = this.app.vault.getAbstractFileByPath(path) as TFile;
      const level = path === this.center?.path ? 0 : this.neighbors(this.center as TFile, reverse).some((item) => item.path === path) ? 1 : 2;
      const peers = entries.filter(([peer]) => peer !== this.center?.path && (level === 1 || this.neighbors(file, reverse).some((neighbor) => neighbor.path === peer)));
      const angle = index === 0 ? 0 : (Math.PI * 2 * (index - 1)) / Math.max(1, entries.length - 1);
      const radius = level === 0 ? 0 : level === 1 ? 125 : 230 + (index % 3) * 18;
      const fm = this.plugin.frontmatter(file);
      return { file, level, domain: asText(fm.domain, file.parent?.name || "知识"), x: Math.cos(angle) * radius, y: Math.sin(angle) * radius + (peers.length % 2) * 8 };
    });
    nodes.forEach((node, from) => this.neighbors(node.file, reverse).forEach((neighbor) => {
      const to = chosen.get(neighbor.path);
      if (to !== undefined && from < to) edges.push({ from, to });
    }));
    this.nodes = nodes;
    this.edges = edges;
    this.selected = 0;
    this.loadNodeImages();
    this.resizeCanvas();
  }

  private loadNodeImages(): void {
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

  private matchesDomain(file: TFile): boolean {
    if (this.domainFilter === "全部") return true;
    const fm = this.plugin.frontmatter(file);
    const haystack = `${file.path} ${asText(fm.domain)} ${asText(fm.tags)}`.toLocaleLowerCase();
    if (this.domainFilter === "健身") return /健身|身体|训练/.test(haystack);
    if (this.domainFilter === "CPA") return /cpa|会计|审计|财管|税法/.test(haystack);
    return haystack.includes(this.domainFilter.toLocaleLowerCase());
  }

  private neighbors(file: TFile, reverse: Map<string, string[]>): TFile[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const paths = new Set<string>();
    [...(cache?.links || []), ...(cache?.embeds || [])].forEach((link) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (target?.extension === "md") paths.add(target.path);
    });
    (reverse.get(file.path) || []).forEach((path) => paths.add(path));
    return Array.from(paths).map((path) => this.app.vault.getAbstractFileByPath(path)).filter((item): item is TFile => item instanceof TFile);
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private screen(node: GraphNode): { x: number; y: number } {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.width / 2 + this.panX + node.x * this.scale, y: rect.height / 2 + this.panY + node.y * this.scale };
  }

  private draw(): void {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, rect.width, rect.height);
    const gradient = ctx.createRadialGradient(rect.width / 2, rect.height / 2, 10, rect.width / 2, rect.height / 2, Math.max(rect.width, rect.height));
    gradient.addColorStop(0, "#152d2a"); gradient.addColorStop(1, "#081412");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, rect.width, rect.height);
    const adjacent = new Set<number>([this.selected]);
    this.edges.forEach((edge) => { if (edge.from === this.selected) adjacent.add(edge.to); if (edge.to === this.selected) adjacent.add(edge.from); });
    this.edges.forEach((edge) => {
      const a = this.screen(this.nodes[edge.from]); const b = this.screen(this.nodes[edge.to]);
      const active = edge.from === this.selected || edge.to === this.selected;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = active ? "rgba(126, 224, 179, .58)" : "rgba(154, 190, 178, .14)";
      ctx.lineWidth = active ? 1.6 : 1; ctx.stroke();
    });
    const labels: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    this.nodes.forEach((node, index) => {
      const point = this.screen(node); const active = adjacent.has(index); const selected = index === this.selected;
      const radius = (selected ? 34 : node.level === 0 ? 30 : node.level === 1 ? 21 : 12) * Math.sqrt(this.scale);
      ctx.beginPath(); ctx.arc(point.x, point.y, radius + (selected ? 6 : 0), 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(108, 230, 171, .24)" : "transparent"; ctx.fill();
      ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      const palette = ["#77dfaa", "#7fbead", "#8ea5d9", "#d9b987"];
      ctx.fillStyle = active ? palette[Math.abs(this.hash(node.domain)) % palette.length] : "#34534b"; ctx.fill();
      const image = this.nodeImages.get(node.file.path);
      if (image?.complete && image.naturalWidth) {
        ctx.save();
        ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(1, radius - 2), 0, Math.PI * 2); ctx.clip();
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sx = (image.naturalWidth - side) / 2; const sy = (image.naturalHeight - side) / 2;
        ctx.drawImage(image, sx, sy, side, side, point.x - radius, point.y - radius, radius * 2, radius * 2);
        ctx.restore();
      }
      if (selected || node.level === 0) {
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(196,255,221,.88)"; ctx.lineWidth = selected ? 2.5 : 1.5; ctx.stroke();
      }
      if (node.level < 2 || selected || active) {
        ctx.font = `${selected ? 600 : 500} ${selected ? 14 : 12}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = active ? "rgba(239,250,245,.94)" : "rgba(197,215,208,.43)";
        const display = this.plugin.presentation(node.file).displayTitle;
        const label = display.length > 12 ? `${display.slice(0, 11)}…` : display;
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

  private hitTest(clientX: number, clientY: number): number {
    if (!this.canvas) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left; const y = clientY - rect.top;
    let nearest = -1; let distance = 32;
    this.nodes.forEach((node, index) => {
      const point = this.screen(node); const current = Math.hypot(point.x - x, point.y - y);
      if (current < distance) { nearest = index; distance = current; }
    });
    return nearest;
  }

  private hash(input: string): number {
    let value = 0; for (let i = 0; i < input.length; i++) value = ((value << 5) - value + input.charCodeAt(i)) | 0; return value;
  }
}

class MediaPreviewModal extends Modal {
  constructor(app: App, private readonly media: MediaItem) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("mym-media-preview-modal");
    const source = this.app.vault.getResourcePath(this.media.file);
    if (this.media.kind === "image") this.contentEl.createEl("img", { attr: { src: source, alt: "本地图片预览" } });
    else if (this.media.kind === "video") this.contentEl.createEl("video", { attr: { src: source, controls: "", autoplay: "", playsinline: "", preload: "metadata" } });
    else this.contentEl.createEl("audio", { attr: { src: source, controls: "", autoplay: "", preload: "metadata" } });
  }

  onClose(): void { this.contentEl.empty(); }
}

class CaptureModal extends Modal {
  private moods = new Set<string>();
  private category = "日记";
  private pendingFiles: File[] = [];
  private viewportSync?: () => void;

  onOpen(): void {
    this.viewportSync = (): void => {
      const viewport = window.visualViewport;
      document.body.style.setProperty("--mym-vv-height", `${Math.round(viewport?.height || window.innerHeight)}px`);
      document.body.style.setProperty("--mym-vv-top", `${Math.round(viewport?.offsetTop || 0)}px`);
    };
    this.viewportSync();
    window.addEventListener("resize", this.viewportSync);
    window.visualViewport?.addEventListener("resize", this.viewportSync);
    window.visualViewport?.addEventListener("scroll", this.viewportSync);
    this.modalEl.addClass("mym-capture-modal");
    this.titleEl.setText("新建记录");
    const categories = this.contentEl.createDiv({ cls: "mym-capture-categories" });
    ["日记", "灵感", "想法", "情绪", "待办"].forEach((category) => {
      const button = categories.createEl("button", { cls: category === this.category ? "is-active" : "", text: category });
      button.addEventListener("click", () => {
        this.category = category;
        categories.querySelectorAll("button").forEach((item) => item.toggleClass("is-active", item === button));
      });
    });
    const input = this.contentEl.createEl("textarea", { placeholder: "此刻的想法…", attr: { rows: "7", enterkeyhint: "done" } });
    const tools = this.contentEl.createDiv({ cls: "mym-capture-tools" });
    const fileInput = tools.createEl("input", { type: "file", attr: { multiple: "", accept: "image/*" } });
    fileInput.hidden = true;
    const addMedia = (iconName: string, label: string, accept: string, capture = false): void => {
      const button = tools.createEl("button", { attr: { "aria-label": label, title: label } });
      setIcon(button, iconName);
      button.createSpan({ text: label });
      button.addEventListener("click", () => {
        fileInput.accept = accept;
        if (capture) fileInput.setAttribute("capture", ""); else fileInput.removeAttribute("capture");
        fileInput.click();
      });
    };
    addMedia("image", "图片", "image/*");
    addMedia("mic", "录音", "audio/*", true);
    addMedia("paperclip", "附件", "*/*");
    const moodToggle = tools.createEl("button", { attr: { "aria-label": "选择情绪", title: "情绪" } });
    setIcon(moodToggle, "smile");
    moodToggle.createSpan({ text: "情绪" });
    const attachmentState = tools.createSpan({ cls: "mym-attachment-state" });
    fileInput.addEventListener("change", () => {
      this.pendingFiles = Array.from(fileInput.files || []);
      attachmentState.setText(this.pendingFiles.length ? `${this.pendingFiles.length} 个附件` : "");
    });
    const moodRow = this.contentEl.createDiv({ cls: "mym-moods" });
    moodRow.hidden = true;
    moodToggle.addEventListener("click", () => { moodRow.hidden = !moodRow.hidden; });
    ["很差", "低落", "平静", "愉快", "很好"].forEach((mood) => {
      const button = moodRow.createEl("button", { text: mood });
      button.addEventListener("click", () => {
        this.moods.clear(); this.moods.add(mood);
        moodRow.querySelectorAll("button").forEach((item) => item.toggleClass("is-active", item === button));
      });
    });
    const actions = this.contentEl.createDiv({ cls: "mym-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "保存到今天" });
    save.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) { new Notice("先写一点内容"); input.focus(); return; }
      save.disabled = true;
      const folder = "02 Daily"; const path = `${folder}/${localDate()}.md`;
      const existing = this.app.vault.getAbstractFileByPath(path);
      const stamp = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      const moodText = this.moods.size ? `\n情绪：${Array.from(this.moods).map((item) => `#情绪/${item}`).join(" ")}` : "";
      try {
        const attachmentLinks: string[] = [];
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
        const attachmentText = attachmentLinks.length ? `\n\n${attachmentLinks.join("\n")}` : "";
        const block = `\n\n## ${stamp} · ${this.category}\n\n${text}\n#类型/${this.category}${moodText}${attachmentText}\n`;
        if (existing instanceof TFile) await this.app.vault.process(existing, (content) => content + block);
        else {
          if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
          await this.app.vault.create(path, `---\ntype: daily\ndate: ${localDate()}\n---\n# ${localDate()}${block}`);
        }
        new Notice("已保存到今天"); this.close();
      } catch (error) { save.disabled = false; console.error(error); new Notice("保存失败，原内容未被删除"); }
    });
    window.setTimeout(() => input.focus(), 80);
  }

  onClose(): void {
    if (this.viewportSync) {
      window.removeEventListener("resize", this.viewportSync);
      window.visualViewport?.removeEventListener("resize", this.viewportSync);
      window.visualViewport?.removeEventListener("scroll", this.viewportSync);
    }
    this.viewportSync = undefined;
    this.contentEl.empty();
  }
}

export default class MymLifePlugin extends Plugin {
  private navStack: NavEntry[] = [];
  private contentCache = new Map<string, string>();
  private hostChromeStyles = new Map<HTMLElement, string | null>();

  async onload(): Promise<void> {
    this.registerView(HOME_VIEW, (leaf) => new HomeView(leaf, this));
    this.registerView(DETAIL_VIEW, (leaf) => new DetailView(leaf, this));
    this.registerView(TIMELINE_VIEW, (leaf) => new TimelineView(leaf, this));
    this.registerView(GRAPH_VIEW, (leaf) => new GraphView(leaf, this));
    this.registerView(SEARCH_VIEW, (leaf) => new SearchView(leaf, this));
    this.registerView(GOALS_VIEW, (leaf) => new GoalsView(leaf, this));
    this.registerView(PROFILE_VIEW, (leaf) => new ProfileView(leaf, this));
    this.addRibbonIcon("sprout", "打开 MYM 人生首页", () => void this.openRoot(HOME_VIEW));
    this.addCommand({ id: "open-life-home", name: "打开人生首页", callback: () => void this.openRoot(HOME_VIEW) });
    this.addCommand({ id: "quick-capture", name: "快速记录到今天", callback: () => new CaptureModal(this.app).open() });
    this.addCommand({ id: "open-life-graph", name: "打开局部知识图谱", callback: () => void this.openRoot(GRAPH_VIEW) });
    this.addCommand({
      id: "toggle-mobile-layout-debug",
      name: "切换移动布局调试",
      callback: () => {
        document.body.toggleClass("mym-layout-debug-mode", !document.body.hasClass("mym-layout-debug-mode"));
        window.dispatchEvent(new Event("resize"));
        new Notice(document.body.hasClass("mym-layout-debug-mode") ? "MYM 布局调试已开启" : "MYM 布局调试已关闭");
      }
    });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile) this.contentCache.delete(file.path);
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
        new Notice("MYM 人生首页加载失败，请再次点击叶子图标");
      });
    });
  }

  enterMym(_view: MymView): void {
    this.setHostChrome(true);
  }

  leaveMym(_view: MymView): void {
    window.setTimeout(() => this.syncHostChrome(), 0);
  }

  private syncHostChrome(): void {
    const active = this.app.workspace.getMostRecentLeaf();
    this.setHostChrome(Boolean(active && MYM_VIEWS.includes(active.view.getViewType() as typeof MYM_VIEWS[number])));
  }

  private setHostChrome(active: boolean): void {
    document.body.toggleClass("mym-life-active", active);
    document.body.toggleClass("mym-life-mobile", active && Platform.isMobile);
    if (active) this.hideHostChromeForActiveLeaf();
    else this.restoreHostChrome();
  }

  private hideHostChromeForActiveLeaf(): void {
    this.restoreHostChrome();
    const leaf = this.app.workspace.getMostRecentLeaf();
    const viewHeader = leaf?.view.containerEl.querySelector<HTMLElement>(".view-header");
    if (viewHeader) this.hideHostElement(viewHeader);
    if (!Platform.isMobile && !document.body.hasClass("is-mobile")) return;
    [".mobile-toolbar", ".mobile-navbar", ".workspace-drawer-vault-switcher"].forEach((selector) => {
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (!element.closest(".mym-root") && this.isBottomHostChrome(element)) this.hideHostElement(element);
      });
    });
  }

  private hideHostElement(element: HTMLElement): void {
    if (!this.hostChromeStyles.has(element)) this.hostChromeStyles.set(element, element.getAttribute("style"));
    element.dataset.mymHostHidden = "true";
    element.style.setProperty("display", "none", "important");
  }

  private restoreHostChrome(): void {
    this.hostChromeStyles.forEach((style, element) => {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
      delete element.dataset.mymHostHidden;
    });
    this.hostChromeStyles.clear();
  }

  private isBottomHostChrome(element: HTMLElement): boolean {
    const viewport = window.visualViewport;
    const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && rect.height > 0 && rect.top >= visibleBottom * 0.55 && rect.top < visibleBottom;
  }

  hasHostNavConflict(root: HTMLElement): boolean {
    if (!Platform.isMobile && !document.body.hasClass("is-mobile")) return false;
    const selectors = [".mobile-toolbar", ".mobile-navbar", ".workspace-drawer-vault-switcher"];
    const visibleHostBar = selectors.some((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)).some((element) => !element.closest(".mym-root") && this.isBottomHostChrome(element)));
    if (visibleHostBar) return true;
    const viewport = window.visualViewport;
    const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
    const hostBottom = root.parentElement?.getBoundingClientRect().bottom || visibleBottom;
    return visibleBottom - hostBottom > 12;
  }

  async hydrate(files: TFile[]): Promise<void> {
    await Promise.all(files.map(async (file) => {
      if (this.contentCache.has(file.path)) return;
      try { this.contentCache.set(file.path, await this.app.vault.cachedRead(file)); }
      catch { this.contentCache.set(file.path, ""); }
    }));
  }

  private currentMymLeaf(): WorkspaceLeaf | undefined {
    const recent = this.app.workspace.getMostRecentLeaf();
    if (recent && MYM_VIEWS.includes(recent.view.getViewType() as typeof MYM_VIEWS[number])) return recent;
    return MYM_VIEWS.flatMap((type) => this.app.workspace.getLeavesOfType(type)).find((candidate) => candidate.view.containerEl.isConnected);
  }

  private async transition(type: string, state: Record<string, unknown> = {}): Promise<void> {
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

  async openRoot(type: string): Promise<void> {
    this.navStack = [];
    await this.transition(type);
  }

  async push(type: string, state: Record<string, unknown> = {}, label = "首页"): Promise<void> {
    const leaf = this.currentMymLeaf();
    if (leaf) {
      const current = leaf.getViewState();
      this.navStack.push({ type: current.type, state: (current.state || {}) as Record<string, unknown>, label });
      if (this.navStack.length > 2) this.navStack.shift();
    } else this.navStack.push({ type: HOME_VIEW, state: {}, label: "首页" });
    await this.transition(type, state);
  }

  async back(): Promise<void> {
    const previous = this.navStack.pop();
    if (previous) await this.transition(previous.type, previous.state);
    else await this.openRoot(HOME_VIEW);
  }

  previousLabel(): string { return this.navStack[this.navStack.length - 1]?.label || "首页"; }

  async openGoal(goal: Goal): Promise<void> {
    await this.push(DETAIL_VIEW, { goalPath: goal.file.path }, "首页");
  }

  async openToday(): Promise<void> {
    const path = `02 Daily/${localDate()}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) { await this.app.workspace.getLeaf(false).openFile(existing); return; }
    if (!this.app.vault.getAbstractFileByPath("02 Daily")) await this.app.vault.createFolder("02 Daily");
    const file = await this.app.vault.create(path, `---\ntype: daily\ndate: ${localDate()}\n---\n# ${localDate()}\n\n`);
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  frontmatter(file: TFile): Frontmatter {
    return (this.app.metadataCache.getFileCache(file)?.frontmatter || {}) as Frontmatter;
  }

  fileByType(type: string): TFile | undefined {
    return this.app.vault.getMarkdownFiles().find((file) => asText(this.frontmatter(file).type) === type);
  }

  heroFor(file: TFile): TFile | undefined {
    const fm = this.frontmatter(file);
    const raw = asText(fm.hero) || asText(fm.cover) || asText(fm.image);
    if (!raw) return undefined;
    const link = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0];
    const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
    return target instanceof TFile && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(target.extension.toLowerCase()) ? target : undefined;
  }

  iconFor(goal: Goal): string {
    const value = `${goal.title} ${goal.domain || ""}`.toLocaleLowerCase();
    if (/健身|身体|训练/.test(value)) return "dumbbell";
    if (/cpa|学习|考试/.test(value)) return "graduation-cap";
    if (/表达|英语|语言/.test(value)) return "messages-square";
    if (/工作|研究/.test(value)) return "briefcase-business";
    if (/旅行|生活/.test(value)) return "compass";
    return "target";
  }

  goals(): Goal[] {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && asText(this.frontmatter(file).type) === "goal").map((file) => {
      const fm = this.frontmatter(file);
      const rawProgress = Number(fm.progress);
      return {
        file,
        title: this.presentation(file).displayTitle,
        status: statusOf(fm.status),
        progress: Number.isFinite(rawProgress) ? clamp(rawProgress, 0, 100) : undefined,
        metric: asText(fm.metric) || undefined,
        recap: asText(fm.recap) || undefined,
        due: asText(fm.due) || undefined,
        domain: asText(fm.domain) || undefined,
        updated: file.stat.mtime
      };
    }).sort((a, b) => b.updated - a.updated);
  }

  goalForPath(path: string): Goal | undefined {
    return this.goals().find((goal) => goal.file.path === path);
  }

  relatedKnowledge(file: TFile): TFile[] {
    const found = new Map<string, TFile>();
    const cache = this.app.metadataCache.getFileCache(file);
    [...(cache?.links || []), ...(cache?.embeds || [])].forEach((link) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (target?.extension === "md") found.set(target.path, target);
    });
    const outgoing = this.app.metadataCache.resolvedLinks[file.path] || {};
    Object.keys(outgoing).forEach((path) => {
      const target = this.app.vault.getAbstractFileByPath(path);
      if (target instanceof TFile && target.extension === "md") found.set(target.path, target);
    });
    Object.entries(this.app.metadataCache.resolvedLinks).forEach(([source, targets]) => {
      if (!targets[file.path]) return;
      const target = this.app.vault.getAbstractFileByPath(source);
      if (target instanceof TFile && target.extension === "md") found.set(target.path, target);
    });
    return Array.from(found.values()).filter((target) => target.path.startsWith("03 Knowledge/")).slice(0, 24);
  }

  mediaFor(file: TFile): MediaItem[] {
    const image = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
    const video = new Set(["mp4", "mov", "m4v", "webm"]);
    const audio = new Set(["m4a", "mp3", "wav", "aac", "ogg"]);
    const cache = this.app.metadataCache.getFileCache(file);
    const media: MediaItem[] = [];
    (cache?.embeds || []).map((embed) => this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path)).filter((target): target is TFile => target instanceof TFile).forEach((target) => {
      const extension = target.extension.toLowerCase();
      if (image.has(extension)) media.push({ file: target, kind: "image" });
      else if (video.has(extension)) media.push({ file: target, kind: "video" });
      else if (audio.has(extension)) media.push({ file: target, kind: "audio" });
    });
    return media;
  }

  dailyFiles(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && (file.path.startsWith("02 Daily/") || asText(this.frontmatter(file).type) === "daily")).sort((a, b) => b.basename.localeCompare(a.basename) || b.stat.mtime - a.stat.mtime);
  }

  dailyTitle(file: TFile): string {
    return this.presentation(file).displayTitle;
  }

  relatedDaily(goal: TFile): TFile[] {
    return this.dailyFiles().filter((file) => Boolean(this.app.metadataCache.resolvedLinks[file.path]?.[goal.path]));
  }

  weekStatus(goal: TFile): Array<{ label: string; active: boolean }> {
    const linked = new Set(this.relatedDaily(goal).map((file) => file.basename));
    const formatter = new Intl.DateTimeFormat("zh-CN", { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { label: formatter.format(date), active: linked.has(key) };
    });
  }

  async createGoal(): Promise<void> {
    const folder = "04 Goals";
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const stamp = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/\D/g, "");
    const path = `${folder}/新目标-${stamp}.md`;
    const file = await this.app.vault.create(path, `---\ntype: goal\ntitle: 新目标\nstatus: active\nprogress: 0\n---\n# 新目标\n\n写下真正想推进的变化。\n`);
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  async setGoalFocus(goal: Goal): Promise<void> {
    await this.app.fileManager.processFrontMatter(goal.file, (frontmatter) => { frontmatter.status = "focus"; });
    new Notice(`${goal.title} 已设为当前重点`);
  }

  summary(file: TFile): string {
    return this.presentation(file).previewText;
  }

  presentation(file: TFile): PresentationModel {
    const fm = this.frontmatter(file);
    const raw = this.contentCache.get(file.path) || "";
    const body = raw.replace(/^---\s*[\s\S]*?\n---\s*/m, "");
    const clean = (value: string): string => value
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias || target)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/^\s*(?:#{1,6}|>|[-*+] |\d+\. )\s*/g, "")
      .replace(/(^|\s)#[^\s#]+/g, " ")
      .replace(/[~*_]{1,3}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const isTechnical = (line: string): boolean => !line || /^\d{4}-\d{2}-\d{2}$/.test(line) || /^\d{1,2}:\d{2}\s*[·\-]/.test(line) || /^(日记|灵感|想法|情绪|待办)$/.test(line);
    const meaningful = body.split(/\r?\n/).map((line) => clean(line)).filter((line) => !isTechnical(line));
    const h1 = Array.from(body.matchAll(/^#\s+(.+)$/gm)).map((match) => clean(match[1])).find((line) => !isTechnical(line));
    const compress = (value: string, max: number): string => {
      const natural = value.replace(/^(今天|今日|刚刚)[，,:：\s]*/u, "").replace(/(感觉|终于|其实|真的)/g, "").trim();
      const sentence = natural.split(/[。！？!?]/)[0] || natural;
      return sentence.length > max ? `${sentence.slice(0, max).trim()}…` : sentence;
    };
    const fallbackName = file.basename.replace(/^\d{4}-\d{2}-\d{2}[-_\s]*/, "").replace(/[-_]/g, " ").trim();
    const titleSource = asText(fm.title) || h1 || meaningful[0] || fallbackName || "未命名记录";
    const displayTitle = compress(titleSource, 22);
    const previewSource = asText(fm.summary) || asText(fm.recap) || meaningful.find((line) => line !== h1 && line !== displayTitle) || meaningful[0] || asText(fm.metric) || "还没有写下摘要。";
    const previewText = compress(previewSource, 58);
    const rawDate = asText(fm.date);
    const parsed = rawDate ? new Date(rawDate).getTime() : Number.NaN;
    const epoch = Number.isFinite(parsed) ? parsed : file.stat.mtime;
    const capturedTime = body.match(/^##\s+(\d{1,2}:\d{2})/m)?.[1];
    const tagType = body.match(/#类型\/([^\s#]+)/)?.[1];
    const isDaily = asText(fm.type) === "daily" || file.path.startsWith("02 Daily/");
    const linkedGoal = isDaily ? Object.keys(this.app.metadataCache.resolvedLinks[file.path] || {}).map((path) => this.app.vault.getAbstractFileByPath(path)).find((target): target is TFile => target instanceof TFile && asText(this.frontmatter(target).type) === "goal") : undefined;
    const category = asText(fm.category) || asText(fm.kind) || (linkedGoal ? asText(this.frontmatter(linkedGoal).domain) || this.presentation(linkedGoal).displayTitle : "") || tagType || "生活";
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

  onunload(): void {
    this.restoreHostChrome();
    document.body.removeClass("mym-life-active", "mym-life-mobile", "mym-layout-debug-mode");
    document.body.style.removeProperty("--mym-vv-height");
    document.body.style.removeProperty("--mym-vv-top");
    document.body.style.removeProperty("--mym-effective-safe-bottom");
    MYM_VIEWS.forEach((type) => this.app.workspace.detachLeavesOfType(type));
  }
}
