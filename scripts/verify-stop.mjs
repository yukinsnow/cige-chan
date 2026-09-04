// AI 停止按钮 + 新交互验证
// 重点：AbortController 停止在途请求、已完成的句子保留、运行指示灯、运行中关/开面板
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
    setTimeout(() => { if(pending.has(id)){ pending.delete(id); reject(new Error("timeout: " + method)); } }, 25000);
  });
}
ws.onmessage = e => { const m = JSON.parse(e.data); if(m.id && pending.has(m.id)){ const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
await new Promise(r => { ws.onopen = r; });
await send("Page.enable");
await send("Page.navigate", { url: APP });
await new Promise(r => setTimeout(r, 1500));
await ev("localStorage.clear(); location.reload(); 'clean'");
await new Promise(r => setTimeout(r, 1500));

async function ev(expr){
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if(r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || "").slice(0, 400));
  return r.result.value;
}
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log((ok ? "PASS" : "FAIL") + "  " + n + (d !== undefined ? " → " + JSON.stringify(d) : "")); };

// 配置 + 慢速 mock（每个响应 1.2s，且第一句成功、之后一直成功）
await ev(`document.querySelector('#aiurl').value='http://mock/v1'; document.querySelector('#aiurl').dispatchEvent(new Event('input',{bubbles:true}))`);
await ev(`document.querySelector('#aikey').value='k'; document.querySelector('#aikey').dispatchEvent(new Event('input',{bubbles:true}))`);
await ev(`document.querySelector('#aimodel').value='m'; document.querySelector('#aimodel').dispatchEvent(new Event('input',{bubbles:true}))`);
await ev(`
window.__calls = 0;
window.fetch = async (url, opts) => {
  window.__calls++;
  const body = JSON.parse(opts.body);
  const usr = [...body.messages].reverse().find(m => m.role === 'user' && !m.content.includes('没有通过校验')).content;
  const m = usr.match(new RegExp('词格 ([0-9/]+）)'));
  const g = m ? m[1].replace(/）/, '').split('/').map(Number) : [2];
  // 模拟真实 fetch：signal 中止时 reject AbortError（否则测不到"中断在途请求"）
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 1200);
    if(opts.signal) opts.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  const parts = g.map(n => '月'.repeat(n));
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ line: parts.join(' '), note: 'x' }) } }] }), { status: 200 });
};
'ok'`);
await ev("state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); render(); 'reset'");

// ---- 场景 1：启动后立即停止（第一句还在途）----
const runP = ev("aiRunAll('fill').then(() => 'done', e => 'err:' + e.message)");
await new Promise(r => setTimeout(r, 400));   // 已进入第一句请求
check("运行中顶栏按钮亮指示灯", await ev("document.querySelector('#aibtn').classList.contains('ai-running')"));
check("顶栏按钮文字变运行中", await ev("document.querySelector('#aibtn').textContent") === "AI 运行中");
check("面板内停止按钮可见", await ev("document.querySelector('#aistop').style.display !== 'none'"));
check("配置输入框已锁", await ev("document.querySelector('#aiurl').disabled"));

// 运行中关面板再打开（新交互）
await ev("aiClosePanel()");
check("运行中允许关面板", await ev("!document.querySelector('#aip').classList.contains('show')"));
check("关了面板指示灯仍在", await ev("document.querySelector('#aibtn').classList.contains('ai-running')"));
await ev("document.querySelector('#aibtn').click()");
check("运行中点顶栏按钮重开面板", await ev("document.querySelector('#aip').classList.contains('show')"));

// 点停止
check("停止按钮变停止中文案", await ev("document.querySelector('#aistop').click(), document.querySelector('#aistop').textContent") === "正在停止…");
const r1 = await runP;
await new Promise(r => setTimeout(r, 300));
check("流程结束", r1 === 'done', r1);
check("aiBusy 复位", await ev("aiBusy === false"));
check("指示灯熄灭", await ev("!document.querySelector('#aibtn').classList.contains('ai-running')"));
check("顶栏文字复原", await ev("document.querySelector('#aibtn').textContent") === "AI 填词");
const after1 = await ev("state.sections[0].lines[0].t");
check("第一句被中断：未写入或已写入但为有效填词", await ev(`(function(){ const v = ${JSON.stringify(after1)}; return v === "" || CL(RT(v)).length === cap(state.sections[0].lines[0]); })()`), after1);
check("中断后其余句子仍空", await ev("state.sections[0].lines[1].t === '' && state.sections[1].lines[3].t === ''"));
check("摘要注明已停止", await ev("document.querySelector('#aiprogtext').textContent").then(s => s.includes("已停止")), await ev("document.querySelector('#aiprogtext').textContent"));

// ---- 场景 2：填两句后再停（验证已完成句子保留）----
await ev("state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); render(); window.__calls = 0; 'reset'");
const runP2 = ev("aiRunAll('fill').then(() => 'done', e => 'err:' + e.message)");
// 轮询等前两句完成（aiProgDone>=2）即点停止，此时第三句必然在途
for(let i = 0; i < 40; i++){
  await new Promise(r => setTimeout(r, 100));
  if(await ev("aiProgDone >= 2 && aiBusy").catch(() => false)) break;
}
await ev("document.querySelector('#aistop').click()");
const r2 = await runP2;
await new Promise(r => setTimeout(r, 200));
check("第二轮结束", r2 === 'done', r2);
const l0 = await ev("CL(RT(state.sections[0].lines[0].t)).length"), c0 = await ev("cap(state.sections[0].lines[0])");
const l1 = await ev("CL(RT(state.sections[0].lines[1].t)).length"), c1 = await ev("cap(state.sections[0].lines[1])");
check("第一句已完成并保留", l0 === c0, l0 + "/" + c0);
check("第二句被中断未写入", await ev("state.sections[0].lines[1].t === ''") || l1 === c1);
check("后面的句子保持为空", await ev("state.sections[0].lines[2].t === '' && state.sections[0].lines[3].t === ''"), await ev("JSON.stringify([state.sections[0].lines[2].t, state.sections[0].lines[3].t])"));
check("总调用次数 ≤ 3（停止后不再发起新请求）", await ev("window.__calls") <= 3, await ev("window.__calls"));

// ---- 场景 3：停止后立刻可再次启动（无卡死）----
await ev("document.querySelector('#aigo').click()");
await new Promise(r => setTimeout(r, 300));
check("停止后可立即重新启动", await ev("aiBusy === true"));
await ev("document.querySelector('#aistop').click()");
await new Promise(r => setTimeout(r, 200));

// 空闲时进度摘要仍显示
check("空闲时进度条显示摘要", await ev("document.querySelector('#aiprog').style.display") !== "none");

// 截图
const shot = await send("Page.captureScreenshot", { format: "png" });
await import("node:fs").then(fs => fs.writeFileSync("verify-stop.png", Buffer.from(shot.data, "base64")));

const fails = results.filter(x => !x).length;
console.log("\\n== " + (results.length - fails) + "/" + results.length + " passed ==");
process.exit(fails ? 1 : 0);
