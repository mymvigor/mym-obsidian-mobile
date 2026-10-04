import fs from "node:fs";
import path from "node:path";

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const target = targets.find((item) => item.type === "page" && item.url === "app://obsidian.md/index.html" && item.title.includes("Vault"));
if (!target) throw new Error("Obsidian CDP target not found on port 9222");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") runtimeErrors.push(message.params.entry.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capture = async (name) => {
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const output = path.resolve("test-artifacts", name);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.from(shot.data, "base64"));
};
const dimensions = [[375,667],[390,844],[393,852],[430,932]];
const pages = [
  ["mym-life-home", {}],
  ["mym-life-detail", {}],
  ["mym-life-timeline", {}],
  ["mym-life-goals", {}],
  ["mym-life-profile", {}],
  ["mym-life-graph", {}],
  ["mym-life-search", {}]
];
const results = [];

await send("Runtime.enable");
await send("Log.enable");
await evaluate(`(async()=>{const p=app.plugins.plugins["mym-life"];if(p)await app.plugins.disablePlugin("mym-life");await app.plugins.enablePlugin("mym-life");return true})()`);
await pause(500);
await evaluate(`(()=>{document.querySelectorAll(".modal-close-button").forEach((button)=>button.click());document.querySelectorAll(".modal-container").forEach((modal)=>modal.remove());return true})()`);
await pause(80);

for (const [width, height] of dimensions) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 3, mobile: true, screenWidth: width, screenHeight: height });
  for (const [type, state] of pages) {
    const stateExpression = type === "mym-life-detail" ? `({goalPath:app.plugins.plugins["mym-life"].goals()[0]?.file.path||""})` : JSON.stringify(state);
    await evaluate(`app.plugins.plugins["mym-life"].transition(${JSON.stringify(type)},${stateExpression})`);
    await pause(180);
    if (width === 390 && height === 844) await capture(`layout-1.2.2-${type.replace("mym-life-", "")}-top.png`);
    const metrics = await evaluate(`(()=>{const root=document.querySelector(".workspace-leaf.mod-active .mym-root")||document.querySelector(".mym-root");const shell=root?.querySelector(".mym-app-shell");const header=root?.querySelector(".mym-app-header");const scroll=root?.querySelector(".mym-scroll");const dock=root?.querySelector(".mym-dock");if(!root||!shell||!header||!scroll)return {error:"missing shell",type:${JSON.stringify(type)}};scroll.scrollTop=scroll.scrollHeight;const rr=root.getBoundingClientRect(),sr=shell.getBoundingClientRect(),hr=header.getBoundingClientRect(),cr=scroll.getBoundingClientRect(),dr=dock?.getBoundingClientRect();const children=[...scroll.children].filter(e=>e.getBoundingClientRect().height>0);const last=children.at(-1)?.getBoundingClientRect();return {type:${JSON.stringify(type)},width:innerWidth,height:innerHeight,root:[rr.top,rr.bottom],shell:[sr.top,sr.bottom],header:[hr.top,hr.bottom],scroll:[cr.top,cr.bottom],dock:dr?[dr.top,dr.bottom]:null,last:last?[last.top,last.bottom]:null,overflowX:scroll.scrollWidth-scroll.clientWidth,scrollable:scroll.scrollHeight>=scroll.clientHeight,keyboard:root.classList.contains("is-keyboard-open")}})()`);
    const epsilon = 3;
    if (metrics.error) throw new Error(`${width}x${height} ${type}: ${metrics.error}`);
    if (metrics.overflowX > epsilon) throw new Error(`${width}x${height} ${type}: horizontal overflow ${metrics.overflowX}`);
    if (metrics.header[0] < metrics.root[0] - epsilon) throw new Error(`${width}x${height} ${type}: header clipped`);
    if (metrics.dock && metrics.dock[1] > metrics.root[1] + epsilon) throw new Error(`${width}x${height} ${type}: dock clipped`);
    if (metrics.last && metrics.last[1] > metrics.scroll[1] + epsilon) throw new Error(`${width}x${height} ${type}: final content hidden`);
    if (width === 390 && height === 844) await capture(`layout-1.2.2-${type.replace("mym-life-", "")}-bottom.png`);
    results.push(metrics);
  }
}

const navigation = await evaluate(`(async()=>{const p=app.plugins.plugins["mym-life"];await p.openRoot("mym-life-home");const goal=p.goals()[0];if(goal)await p.openGoal(goal);const detail=app.workspace.getMostRecentLeaf()?.view.getViewType();await p.back();const home=app.workspace.getMostRecentLeaf()?.view.getViewType();const leaves=[...new Set(["mym-life-home","mym-life-detail","mym-life-timeline","mym-life-graph","mym-life-search","mym-life-goals","mym-life-profile"].flatMap(t=>app.workspace.getLeavesOfType(t)))].length;return {detail,home,leaves}})()`);
if (navigation.detail !== "mym-life-detail" || navigation.home !== "mym-life-home" || navigation.leaves !== 1) throw new Error(`navigation stack failed: ${JSON.stringify(navigation)}`);

const hostChrome = await evaluate(`(()=>{const p=app.plugins.plugins["mym-life"],bar=document.body.createDiv({cls:"mobile-toolbar"});bar.style.cssText="position:fixed;bottom:0;height:52px;width:100%;display:block";document.body.classList.add("is-mobile");p.setHostChrome(true);const hidden=getComputedStyle(bar).display==="none";p.setHostChrome(false);const restored=getComputedStyle(bar).display!=="none"&&!bar.dataset.mymHostHidden;bar.remove();document.body.classList.remove("is-mobile");return {hidden,restored}})()`);
if (!hostChrome.hidden || !hostChrome.restored) throw new Error(`host chrome lease failed: ${JSON.stringify(hostChrome)}`);

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await evaluate(`app.plugins.plugins["mym-life"].transition("mym-life-search",{})`);
await pause(150);
await evaluate(`document.querySelector(".mym-search-box input")?.focus()`);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 560, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await evaluate(`(()=>{const root=document.querySelector(".mym-root"),input=document.querySelector(".mym-search-box input");root?.classList.add("is-keyboard-open");input?.scrollIntoView({block:"nearest"});return true})()`);
await pause(180);
const keyboard = await evaluate(`(()=>{const r=document.querySelector(".mym-root"),d=r?.querySelector(".mym-dock"),i=document.querySelector(".mym-search-box input"),b=i?.getBoundingClientRect();return {open:r?.classList.contains("is-keyboard-open"),dock:d?getComputedStyle(d).display:null,input:b?{top:b.top,bottom:b.bottom}:null,active:document.activeElement?.tagName,viewport:visualViewport?.height}})()`);
if (!keyboard.open || keyboard.dock !== "none" || keyboard.input.bottom > keyboard.viewport + 2) throw new Error(`keyboard layout failed: ${JSON.stringify(keyboard)}`);

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await evaluate(`app.plugins.plugins["mym-life"].openRoot("mym-life-home")`);
await pause(120);
await evaluate(`document.querySelector(".mym-dock-capture")?.click()`);
await pause(120);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 560, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await evaluate(`(()=>{window.dispatchEvent(new Event("resize"));visualViewport?.dispatchEvent(new Event("resize"));return true})()`);
await pause(120);
const sheet = await evaluate(`(()=>{const m=document.querySelector(".mym-capture-modal"),r=m?.getBoundingClientRect(),c=m?.closest(".modal-container"),cr=c?.getBoundingClientRect(),cs=c?getComputedStyle(c):null,top=visualViewport?.offsetTop||0,height=visualViewport?.height||innerHeight;return r?{top:r.top,bottom:r.bottom,height:r.height,viewportTop:top,viewportBottom:top+height,container:cr?{top:cr.top,bottom:cr.bottom,height:cr.height}:null,containerStyle:cs?{top:cs.top,bottom:cs.bottom,height:cs.height,maxHeight:cs.maxHeight}:null,bodyHeight:getComputedStyle(document.body).getPropertyValue("--mym-vv-height")}:null})()`);
if (!sheet || sheet.bottom > sheet.viewportBottom + 2 || sheet.top < sheet.viewportTop - 2) throw new Error(`bottom sheet layout failed: ${JSON.stringify(sheet)}`);
await evaluate(`document.querySelector(".modal-close-button")?.click()`);

await send("Emulation.clearDeviceMetricsOverride");
await evaluate(`app.plugins.plugins["mym-life"].openRoot("mym-life-home")`);
await pause(160);
if (runtimeErrors.length) throw new Error(`runtime errors: ${runtimeErrors.join(" | ")}`);

const output = path.resolve("test-artifacts", "layout-1.2.2.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ version: "1.2.2", checkedAt: new Date().toISOString(), dimensions, pages: results, navigation, hostChrome, keyboard, sheet }, null, 2));
socket.close();
console.log(`Live layout checks passed (${results.length} page/viewport combinations + navigation + host chrome + keyboard state + bottom sheet).`);
