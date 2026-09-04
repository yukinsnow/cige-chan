// 主题色功能验证：色板渲染、切换、CSS 变量生效、持久化
const CDP = "http://127.0.0.1:9223";
const APP = "http://127.0.0.1:8741/index.html";
const tabs = await (await fetch(CDP + "/json")).json();
const page = tabs.find(t => t.type === "page" && !t.url.startsWith("chrome://"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let mid = 0; const pending = new Map();
function send(method, params){
  return new Promise((resolve, reject) => {
    const id = ++mid; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error("timeout")), 20000);
  });
}
ws.onmessage = e => { const m = JSON.parse(e.data); if(m.id && pending.has(m.id)){ const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
await new Promise(r => { ws.onopen = r; });
await send("Page.enable");
await send("Page.navigate", { url: APP });
await new Promise(r => setTimeout(r, 1500));
// 清掉上次跑残留的 state（theme/accent 等），从干净状态开始
await ev("localStorage.clear(); location.reload(); 'clean'");
await new Promise(r => setTimeout(r, 1500));
async function ev(expr){
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if(r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || "").slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (n, ok, d) => { results.push([n, ok]); console.log((ok ? "PASS" : "FAIL") + "  " + n + (d !== undefined ? " → " + JSON.stringify(d) : "")); };

// 打开背景面板
await ev("document.querySelector('#bgb').click()");
check("面板打开且主题色区块存在", await ev("!!document.querySelector('#accrow')"));
check("9 个色块渲染", await ev("document.querySelectorAll('#accrow .swatch').length") === 9);
check("auto 色块选中", await ev("document.querySelector('#accrow .swatch[data-acc=auto]').classList.contains('on')"));
check("原版 accent", await ev("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") === "#e0a83f");

// 切到水蓝
await ev("document.querySelector('#accrow .swatch[data-acc=blue]').click()");
await new Promise(r => setTimeout(r, 600));   // save() 有 400ms 防抖
check("blue 生效 data-accent", await ev("document.documentElement.dataset.accent === 'blue'"));
check("blue 生效 --accent", await ev("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") === "#5ab4d8");
check("blue 持久化", await ev("JSON.parse(localStorage.getItem('cige.v1')).accent") === "blue");

// 刷新后恢复
await send("Page.navigate", { url: APP });
await new Promise(r => setTimeout(r, 1500));
check("刷新后 accent 恢复", await ev("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") === "#5ab4d8");
check("刷新后 data-accent 保持", await ev("document.documentElement.dataset.accent === 'blue'"));

// 切底色档位：paper 下 blue 用品牌色 #3389D1（此时仍处于 blue 选中态）
await ev("document.querySelector('#bgb').click()");
await ev("document.querySelector('#bgp .pre[data-th=paper]').click()");
check("paper 档 blue=#3389D1", await ev("document.documentElement.dataset.accent === 'blue' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") === "#3389D1");
check("paper 色板刷新", await ev("document.querySelector('#accrow .swatch[data-acc=blue]').style.background") === "rgb(51, 137, 209)");

// auto 兜底：无效值回 auto，auto 移除 data-accent
await ev("state.accent='auto'; applyAccent(); syncAccentPanel(); 'ok'");
check("auto 移除 data-accent", await ev("!document.documentElement.dataset.accent"));
check("auto 回到 paper 原版赭色", await ev("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") === "#a8632a");

// 每种 accent 的两档变量都正确（恢复 dark 档再测）
const table = await ev(`(() => {
  state.theme = 'dark'; applyBg();
  const out = {};
  for(const id of ['blue','green','violet','rose','cyan','orange','slate','red']){
    document.documentElement.dataset.accent = id;
    out[id] = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  }
  delete document.documentElement.dataset.accent;
  return out;
})()`);
check("8 色变量表", Object.keys(table).length === 8 && table.blue === "#5ab4d8" && table.red === "#e06655", table);

// 截图留档
const shot = await send("Page.captureScreenshot", { format: "png" });
await import("node:fs").then(fs => fs.writeFileSync("verify-accent.png", Buffer.from(shot.data, "base64")));

const fails = results.filter(r => !r[1]);
console.log("\\n== " + (results.length - fails.length) + "/" + results.length + " passed ==");
process.exit(fails.length ? 1 : 0);
