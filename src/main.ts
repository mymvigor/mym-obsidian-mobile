import {
  App,
  ItemView,
  Modal,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  getAllTags,
  setIcon
} from "obsidian";

const HOME_VIEW = "mym-life-home";
const TIMELINE_VIEW = "mym-life-timeline";
const GRAPH_VIEW = "mym-life-graph";
const SEARCH_VIEW = "mym-life-search";

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

abstract class MymView extends ItemView {
  plugin: MymLifePlugin;
  private cleanups: Array<() => void> = [];

  constructor(leaf: WorkspaceLeaf, plugin: MymLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  onClose(): Promise<void> {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    return Promise.resolve();
  }

  protected watchVault(render: () => void): void {
    const refresh = debounce(() => render(), 220);
    this.registerEvent(this.app.metadataCache.on("changed", () => refresh()));
    this.registerEvent(this.app.vault.on("create", () => refresh()));
    this.registerEvent(this.app.vault.on("delete", () => refresh()));
    this.registerEvent(this.app.vault.on("rename", () => refresh()));
  }

  protected shell(active: string): HTMLElement {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page" });
    const dock = this.contentEl.createDiv({ cls: "mym-dock", attr: { "aria-label": "主导航" } });
    [
      ["home", "首页", HOME_VIEW],
      ["calendar-days", "时间", TIMELINE_VIEW],
      ["search", "搜索", SEARCH_VIEW]
    ].forEach(([icon, label, type]) => {
      const button = dock.createEl("button", { cls: type === active ? "is-active" : "" });
      setIcon(button.createSpan(), icon);
      button.createSpan({ text: label });
      button.addEventListener("click", () => void this.plugin.activate(type));
    });
    return page;
  }

  protected renderFailure(error: unknown, retry: () => void): void {
    console.error(`[MYM Life] ${this.getViewType()} render failed`, error);
    this.contentEl.empty();
    this.contentEl.addClass("mym-root");
    const page = this.contentEl.createDiv({ cls: "mym-page mym-error-page" });
    const card = page.createDiv({ cls: "mym-error", attr: { role: "alert" } });
    const icon = card.createDiv({ cls: "mym-error-icon" });
    setIcon(icon, "circle-alert");
    card.createEl("h1", { text: "首页暂时没有加载出来" });
    card.createEl("p", { text: "MYM 已保护你的数据。可以立即重试；如果仍失败，错误已写入开发者控制台。" });
    const detail = error instanceof Error ? error.message : String(error);
    card.createEl("code", { text: detail || "未知渲染错误" });
    const button = card.createEl("button", { text: "重新加载首页" });
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

  onOpen(): Promise<void> {
    this.renderSafely();
    this.watchVault(() => this.renderSafely());
    return Promise.resolve();
  }

  private renderSafely(): void {
    try { this.render(); }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    const page = this.shell(HOME_VIEW);
    const hour = new Date().getHours();
    const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
    const hero = page.createDiv({ cls: "mym-hero" });
    hero.createDiv({ cls: "mym-eyebrow", text: dateLabel(Date.now()) });
    hero.createEl("h1", { text: greeting });
    hero.createEl("p", { text: "看清正在发生的变化，然后继续生活。" });

    const quick = page.createDiv({ cls: "mym-quick" });
    this.quickButton(quick, "plus", "记录", () => new CaptureModal(this.app).open());
    this.quickButton(quick, "calendar-check", "今天", () => void this.plugin.openToday());
    this.quickButton(quick, "orbit", "图谱", () => void this.plugin.activate(GRAPH_VIEW));

    const goals = this.plugin.goals();
    this.sectionHeading(page, "当前重点", "只放真正投入的事");
    const focus = goals.filter((goal) => goal.status === "focus").slice(0, 5);
    if (focus.length === 0) this.emptyState(page, "把目标的 status 改为 focus，它就会出现在这里。", "04 Goals/目标使用说明.md");
    else {
      const list = page.createDiv({ cls: "mym-focus-list" });
      focus.forEach((goal, index) => this.goalCard(list, goal, index === 0));
    }

    const recapRank: Record<GoalStatus, number> = { focus: 0, active: 1, paused: 2, done: 3 };
    const recaps = goals.filter((goal) => goal.recap || goal.metric).sort((a, b) => recapRank[a.status] - recapRank[b.status] || b.updated - a.updated).slice(0, 4);
    this.sectionHeading(page, "最近变化", "只反馈真实状态与成果");
    const recapGrid = page.createDiv({ cls: "mym-recap-grid" });
    recaps.forEach((goal) => {
      const card = recapGrid.createEl("button", { cls: "mym-recap" });
      card.createSpan({ cls: "mym-recap-domain", text: goal.domain || goal.title });
      card.createEl("strong", { text: goal.metric || (goal.progress === undefined ? "状态更新" : `${goal.progress}%`) });
      card.createSpan({ text: goal.recap || "进度已更新" });
      card.addEventListener("click", () => this.openNote(goal.file));
    });
    if (recaps.length === 0) recapGrid.createDiv({ cls: "mym-muted", text: "在目标属性中填写 metric 或 recap 后显示。" });

    const groups: Array<[GoalStatus, string]> = [["active", "其他进行中"], ["paused", "暂停 / 等待"], ["done", "已完成 / 已走过"]];
    groups.forEach(([status, label]) => {
      const items = goals.filter((goal) => goal.status === status);
      if (!items.length) return;
      this.sectionHeading(page, label, `${items.length} 项`);
      const compact = page.createDiv({ cls: "mym-goal-compact-list" });
      items.forEach((goal) => {
        const row = compact.createEl("button", { cls: "mym-goal-compact" });
        row.createSpan({ text: goal.title });
        row.createSpan({ cls: "mym-muted", text: goal.metric || (goal.progress === undefined ? "查看" : `${goal.progress}%`) });
        row.addEventListener("click", () => this.openNote(goal.file));
      });
    });

    this.sectionHeading(page, "最近发生", "Markdown 时间流");
    const recent = this.plugin.dailyFiles().slice(0, 4);
    const stream = page.createDiv({ cls: "mym-stream" });
    if (!recent.length) stream.createDiv({ cls: "mym-empty", text: "还没有最近记录。点上方“记录”写下第一条。" });
    recent.forEach((file) => {
      const row = stream.createEl("button", { cls: "mym-stream-row" });
      row.createSpan({ cls: "mym-stream-date", text: file.basename.slice(5) || dateLabel(file.stat.mtime) });
      const body = row.createDiv();
      body.createEl("strong", { text: file.basename });
      body.createSpan({ text: this.plugin.summary(file) });
      row.addEventListener("click", () => this.openNote(file));
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

  private emptyState(parent: HTMLElement, text: string, path: string): void {
    const box = parent.createDiv({ cls: "mym-empty" });
    box.createSpan({ text });
    const button = box.createEl("button", { text: "查看说明" });
    button.addEventListener("click", () => void this.app.workspace.openLinkText(path, "", false));
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
    card.addEventListener("click", () => this.openNote(goal.file));
  }
}

class TimelineView extends MymView {
  getViewType(): string { return TIMELINE_VIEW; }
  getDisplayText(): string { return "人生时间流"; }
  getIcon(): string { return "calendar-days"; }

  onOpen(): Promise<void> {
    this.renderSafely();
    this.watchVault(() => this.renderSafely());
    return Promise.resolve();
  }

  private renderSafely(): void {
    try { this.render(); }
    catch (error) { this.renderFailure(error, () => this.renderSafely()); }
  }

  private render(): void {
    const page = this.shell(TIMELINE_VIEW);
    const head = page.createDiv({ cls: "mym-title-row" });
    const words = head.createDiv();
    words.createEl("h1", { text: "人生时间流" });
    words.createEl("p", { text: "不用打卡，只看真正留下的东西。" });
    const add = head.createEl("button", { cls: "mym-icon-button", attr: { "aria-label": "快速记录" } });
    setIcon(add, "plus");
    add.addEventListener("click", () => new CaptureModal(this.app).open());

    const files = this.plugin.dailyFiles();
    if (!files.length) {
      page.createDiv({ cls: "mym-empty", text: "还没有 Daily Note。点右上角开始第一条记录。" });
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
      const tags = cache ? getAllTags(cache) || [] : [];
      if (tags.length) card.createSpan({ cls: "mym-tags", text: tags.slice(0, 3).join("  ") });
      item.addEventListener("click", () => this.openNote(file));
    });
  }
}

class SearchView extends MymView {
  getViewType(): string { return SEARCH_VIEW; }
  getDisplayText(): string { return "全局搜索"; }
  getIcon(): string { return "search"; }

  onOpen(): Promise<void> {
    try { this.render(); }
    catch (error) { this.renderFailure(error, () => this.onOpen()); }
    return Promise.resolve();
  }

  private render(): void {
    const page = this.shell(SEARCH_VIEW);
    page.createEl("h1", { text: "搜索" });
    page.createEl("p", { text: "标题、路径、标签与属性即时筛选；正文交给 Obsidian 原生搜索。" });
    const searchBox = page.createDiv({ cls: "mym-search-box" });
    setIcon(searchBox.createSpan(), "search");
    const input = searchBox.createEl("input", { type: "search", placeholder: "搜索目标、知识、标签…", attr: { enterkeyhint: "search" } });
    const results = page.createDiv({ cls: "mym-search-results" });
    const native = page.createEl("button", { cls: "mym-native-search", text: "打开 Obsidian 全文搜索" });
    native.addEventListener("click", () => void this.openNativeSearch());

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
      if (!matches.length) results.createDiv({ cls: "mym-empty", text: "属性索引中没有结果，可试试全文搜索。" });
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

  private async openNativeSearch(): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: "search", active: true });
    await this.app.workspace.revealLeaf(leaf);
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
  private resize?: ResizeObserver;

  getViewType(): string { return GRAPH_VIEW; }
  getDisplayText(): string { return "知识图谱"; }
  getIcon(): string { return "orbit"; }

  onOpen(): Promise<void> {
    try { this.render(); }
    catch (error) { this.renderFailure(error, () => this.onOpen()); }
    this.watchVault(() => {
      try { this.build(); }
      catch (error) { this.renderFailure(error, () => this.onOpen()); }
    });
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.resize?.disconnect();
    return super.onClose();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.addClass("mym-root", "mym-graph-root");
    const wrap = this.contentEl.createDiv({ cls: "mym-graph-wrap" });
    const top = wrap.createDiv({ cls: "mym-graph-top" });
    const back = top.createEl("button", { attr: { "aria-label": "返回首页" } });
    setIcon(back, "chevron-left");
    back.addEventListener("click", () => void this.plugin.activate(HOME_VIEW));
    top.createDiv({ cls: "mym-graph-title", text: "局部知识图谱" });
    const reset = top.createEl("button", { attr: { "aria-label": "重置视图" } });
    setIcon(reset, "locate-fixed");
    reset.addEventListener("click", () => { this.scale = 1; this.panX = 0; this.panY = 0; this.draw(); });
    this.canvas = wrap.createEl("canvas", { cls: "mym-graph-canvas", attr: { "aria-label": "可缩放知识图谱" } });
    this.ctx = this.canvas.getContext("2d") || undefined;
    const preview = wrap.createDiv({ cls: "mym-graph-preview" });
    const label = preview.createDiv({ cls: "mym-graph-preview-label", text: "当前节点" });
    const title = preview.createEl("h2");
    const summary = preview.createEl("p");
    const open = preview.createEl("button", { text: "打开笔记" });
    open.addEventListener("click", () => { const node = this.nodes[this.selected]; if (node) this.openNote(node.file); });

    const updatePreview = (): void => {
      const node = this.nodes[this.selected];
      if (!node) { title.setText("暂无知识节点"); summary.setText("在 03 Knowledge 中添加链接笔记。 "); return; }
      label.setText(node.level === 0 ? "中心节点" : node.domain || "关联知识");
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
        if (index >= 0) { this.selected = index; updatePreview(); this.draw(); }
      }
      this.pointer = undefined;
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
    const knowledge = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("03 Knowledge/"));
    this.center = active && active.extension === "md" ? active : knowledge[0] || this.app.vault.getMarkdownFiles()[0];
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
    this.resizeCanvas();
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
    this.nodes.forEach((node, index) => {
      const point = this.screen(node); const active = adjacent.has(index); const selected = index === this.selected;
      const radius = (selected ? 13 : node.level === 0 ? 11 : node.level === 1 ? 7 : 4.5) * Math.sqrt(this.scale);
      ctx.beginPath(); ctx.arc(point.x, point.y, radius + (selected ? 6 : 0), 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(108, 230, 171, .16)" : "transparent"; ctx.fill();
      ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      const palette = ["#77dfaa", "#7fbead", "#8ea5d9", "#d9b987"];
      ctx.fillStyle = active ? palette[Math.abs(this.hash(node.domain)) % palette.length] : "#34534b"; ctx.fill();
      if (node.level < 2 || selected || active) {
        ctx.font = `${selected ? 600 : 500} ${selected ? 14 : 12}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = active ? "rgba(239,250,245,.94)" : "rgba(197,215,208,.43)";
        const label = node.file.basename.length > 12 ? `${node.file.basename.slice(0, 11)}…` : node.file.basename;
        ctx.fillText(label, point.x, point.y + radius + 7);
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

class CaptureModal extends Modal {
  private moods = new Set<string>();

  onOpen(): void {
    this.modalEl.addClass("mym-capture-modal");
    this.titleEl.setText("记一下");
    const input = this.contentEl.createEl("textarea", { placeholder: "此刻发生了什么？", attr: { rows: "6", enterkeyhint: "done" } });
    this.contentEl.createDiv({ cls: "mym-field-label", text: "情绪（可多选，也可以不选）" });
    const moodRow = this.contentEl.createDiv({ cls: "mym-moods" });
    ["开心", "平静", "焦虑", "低落", "愤怒", "疲惫", "期待"].forEach((mood) => {
      const button = moodRow.createEl("button", { text: mood });
      button.addEventListener("click", () => {
        if (this.moods.has(mood)) this.moods.delete(mood); else this.moods.add(mood);
        button.toggleClass("is-active", this.moods.has(mood));
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
      const block = `\n\n## ${stamp}\n\n${text}${moodText}\n`;
      try {
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

  onClose(): void { this.contentEl.empty(); }
}

export default class MymLifePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(HOME_VIEW, (leaf) => new HomeView(leaf, this));
    this.registerView(TIMELINE_VIEW, (leaf) => new TimelineView(leaf, this));
    this.registerView(GRAPH_VIEW, (leaf) => new GraphView(leaf, this));
    this.registerView(SEARCH_VIEW, (leaf) => new SearchView(leaf, this));
    this.addRibbonIcon("sprout", "打开 MYM 人生首页", () => void this.activate(HOME_VIEW));
    this.addCommand({ id: "open-life-home", name: "打开人生首页", callback: () => void this.activate(HOME_VIEW) });
    this.addCommand({ id: "quick-capture", name: "快速记录到今天", callback: () => new CaptureModal(this.app).open() });
    this.addCommand({ id: "open-life-graph", name: "打开局部知识图谱", callback: () => void this.activate(GRAPH_VIEW) });
    this.app.workspace.onLayoutReady(() => {
      void this.activate(HOME_VIEW).catch((error) => {
        console.error("[MYM Life] failed to activate home view", error);
        new Notice("MYM 人生首页加载失败，请再次点击叶子图标");
      });
    });
  }

  async activate(type: string): Promise<void> {
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

  goals(): Goal[] {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && asText(this.frontmatter(file).type) === "goal").map((file) => {
      const fm = this.frontmatter(file);
      const rawProgress = Number(fm.progress);
      return {
        file,
        title: asText(fm.title, file.basename),
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

  dailyFiles(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) => !file.path.startsWith("Templates/") && (file.path.startsWith("02 Daily/") || asText(this.frontmatter(file).type) === "daily")).sort((a, b) => b.basename.localeCompare(a.basename) || b.stat.mtime - a.stat.mtime);
  }

  summary(file: TFile): string {
    const fm = this.frontmatter(file);
    return asText(fm.recap) || asText(fm.summary) || asText(fm.metric) || file.path;
  }

  onunload(): void {
    [HOME_VIEW, TIMELINE_VIEW, GRAPH_VIEW, SEARCH_VIEW].forEach((type) => this.app.workspace.detachLeavesOfType(type));
  }
}
