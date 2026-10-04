import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("release versions and required assets match", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const pkg = JSON.parse(read("package.json"));
  assert.equal(manifest.version, "1.2.1");
  assert.equal(pkg.version, manifest.version);
  assert.equal(manifest.isDesktopOnly, false);
  for (const file of ["main.js", "manifest.json", "styles.css"]) assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} missing`);
});

test("runtime has no network or desktop-only dependency", () => {
  const source = read("src/main.ts");
  const bundle = read("main.js");
  for (const forbidden of ["from \"fs\"", "from \"path\"", "electron", "fetch(", "XMLHttpRequest", "https://", "http://"])
    assert.equal(source.includes(forbidden) || bundle.includes(forbidden), false, `forbidden runtime dependency: ${forbidden}`);
});

test("view lifecycle cannot be shadowed and failures remain visible", () => {
  const source = read("src/main.ts");
  assert.equal(/protected open\(/.test(source), false);
  assert.match(source, /protected openNote\(/);
  assert.match(source, /await leaf\.loadIfDeferred\(\)/);
  assert.match(source, /renderFailure\(error/);
  assert.match(source, /还没有最近记录/);
});

test("mobile layout guards are present", () => {
  const source = read("src/main.ts");
  const css = read("styles.css");
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /button\.mym-goal-card/);
  assert.match(css, /100dvh/);
  assert.match(css, /is-keyboard-open/);
  assert.match(source, /visualViewport/);
  assert.match(source, /hostBottomInset/);
  assert.match(source, /mym-life-active/);
  assert.match(source, /scrollIntoView/);
});

test("mobile app navigation and detail view stay inside MYM", () => {
  const source = read("src/main.ts");
  assert.match(source, /class DetailView extends MymView/);
  assert.match(source, /navStack/);
  assert.match(source, /async push\(/);
  assert.match(source, /async back\(/);
  assert.match(source, /openGoal\(goal/);
  assert.match(source, /mediaFor\(file/);
  assert.match(source, /class GoalsView extends MymView/);
  assert.match(source, /class ProfileView extends MymView/);
  assert.match(source, /mym-dock-capture/);
  assert.match(source, /class CaptureModal extends Modal/);
});

test("knowledge graph is local, bounded, image-aware, and refocusable", () => {
  const source = read("src/main.ts");
  assert.match(source, /private nodeLimit = 30/);
  assert.match(source, /const overlaps = labels\.some/);
  assert.match(source, /metadataCache\.resolvedLinks/);
  assert.match(source, /this\.dragNode/);
  assert.match(source, /loadNodeImages/);
  assert.match(source, /this\.centerPath = this\.nodes\[index\]\.file\.path/);
});

test("1.2.1 follows the supplied page construction with the requested light default", () => {
  const css = read("styles.css");
  const source = read("src/main.ts");
  for (const token of ["#f7f7f3", "#fff", "#171a18", "#727972", "#347a52", "#e7f0e8", "#e2e6e1"]) assert.ok(css.toLowerCase().includes(token));
  for (const cls of ["mym-home-hero", "mym-focus-row", "mym-life-strip", "mym-detail-tabs", "mym-week-strip", "mym-manage-list", "mym-profile-hero", "mym-graph-filters", "mym-capture-categories"])
    assert.ok(css.includes(`.${cls}`) || source.includes(cls), `missing ${cls}`);
  assert.match(source, /interface PresentationModel/);
  assert.match(source, /displayTitle/);
  assert.match(source, /previewText/);
  assert.doesNotMatch(source, /把目标的 status 改为 focus/);
});

test("repository ignore rules block vaults, notes, media, and Obsidian state", () => {
  const ignore = read(".gitignore");
  for (const pattern of ["Vault/", "Attachments/", ".obsidian/", "workspace*.json", "*.mp4", "*.m4a", "*.png", "*.md"])
    assert.ok(ignore.includes(pattern), `missing ignore rule: ${pattern}`);
});
