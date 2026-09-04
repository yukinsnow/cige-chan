// 词格酱 AI 填词功能 — 本地 CDP 验证脚本
// 前置：本地静态服务器 python -m http.server 8741 --directory src；CDP 浏览器 9223
// 用法：node scripts/verify-ai.mjs
const CDP = "http://127.0.0.1:9223";
const APP = "http://127.0.0.1:8741/index.html";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tabs = await (await fetch(CDP + "/json")).json();
const page = tabs.find(t => t.type === "page" && !t.url.startsWith("chrome://"));
if(!page){ console.error("no page target"); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let mid = 0;
const pending = new Map();
function send(method, params){
  return new Promise((resolve, reject) => {
    const id = ++mid;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if(pending.has(id)){ pending.delete(id); reject(new Error("timeout: " + method)); } }, 30000);
  });
}
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if(m.id && pending.has(m.id)){
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
};
await new Promise(r => { ws.onopen = r; });

const results = [];
function check(name, ok, detail){ results.push({ name, ok }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail !== undefined ? "  → " + JSON.stringify(detail) : "")); }

async function ev(expr){
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if(r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || expr.slice(0,80)));
  return r.result.value;
}

// ---- 0. 干净加载 ----
await send("Page.navigate", { url: APP });
await sleep(1500);
await ev("localStorage.clear(); location.reload(); 'clean'");
await sleep(1500);
check("页面标题", await ev("document.title.includes('词格酱')"));
check("AI 按钮存在且 i18n", await ev("document.querySelector('#aibtn')?.textContent.trim() === 'AI 填词'"));
check("帮助面板有 AI 说明", await ev("[...document.querySelectorAll('#help .card h4')].some(h => h.textContent.includes('AI 填词'))"));

// ---- 1. 面板与控件 ----
await ev("document.querySelector('#aibtn').click()");
check("点按钮弹出面板", await ev("document.querySelector('#aip').classList.contains('show')"));
check("停止按钮存在且空闲时隐藏", await ev("!!document.querySelector('#aistop') && document.querySelector('#aistop').style.display === 'none'"));
check("测试按钮存在", await ev("!!document.querySelector('#aitest')"));
check("范围下拉存在且默认整首", await ev("document.querySelector('#aiscope').value === 'all'"));
check("待填计数显示", await ev("document.querySelector('#aipending').textContent.includes('8')"), await ev("document.querySelector('#aipending').textContent"));

// ---- 2. 配置写入 ----
await ev("document.querySelector('#aiurl').value='http://127.0.0.1:8742/v1'; document.querySelector('#aiurl').dispatchEvent(new Event('input',{bubbles:true}))");
await ev("document.querySelector('#aikey').value='test-key'; document.querySelector('#aikey').dispatchEvent(new Event('input',{bubbles:true}))");
await ev("document.querySelector('#aimodel').value='test-model'; document.querySelector('#aimodel').dispatchEvent(new Event('input',{bubbles:true}))");
await ev("document.querySelector('#aistyle').value='测试风格：押 ang 韵'; document.querySelector('#aistyle').dispatchEvent(new Event('input',{bubbles:true}))");
const saved = await ev("JSON.parse(localStorage.getItem('cige.ai.v1')||'{}')");
check("设置写进 localStorage", saved.baseUrl === "http://127.0.0.1:8742/v1" && saved.model === "test-model" && saved.style.includes("ang 韵"));

// Escape 现在关面板（空闲态允许关）
await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
check("空闲时 Escape 关闭面板", await ev("!document.querySelector('#aip').classList.contains('show')"));

// ---- 3. 校验/写回函数单测 ----
check("校验：正确填词通过", await ev("aiCheckFill('春风 吹过 山与海', [2,2,3]) === null"));
check("校验：分句数不对被拦", await ev("typeof aiCheckFill('春风 吹过 山海', [2,2,3]) === 'string'"));
check("校验：字数不对被拦", await ev("typeof aiCheckFill('春风了 吹过 山与海', [2,2,3]) === 'string'"));
check("写回：原写法自动存备选", await ev(`(() => {
  const L = { g:[4,3], t:"春风吹过 山与海", alts:[], note:"" };
  aiApplyLineText(L, "明月照在 故乡河");
  return L.alts.includes("春风吹过 山与海");
})()`));
check("写回：空格不足留空不报错", await ev(`(() => { const L={g:[2,2],t:'',alts:[],note:''}; aiApplyLineText(L,'春 风'); return L.t === '春 风 '; })()`));

// ---- 4. 填词流水线（mock 中转站，第一轮故意错、第二轮对；系统提示词检查）----
await ev(`
window.__aiCalls = [];
window.__sysSeen = null;
window.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  window.__aiCalls.push({ url, model: body.model, auth: opts.headers['Authorization'], msgs: body.messages.length });
  if(!window.__sysSeen) window.__sysSeen = body.messages.find(m => m.role === 'system').content;
  // 重试轮的最后一条 user 是错误反馈，真正的填词指令在它前面那条
  const usr = [...body.messages].reverse().find(m => m.role === 'user' && !m.content.includes('没有通过校验')).content;
  const m = usr.match(new RegExp('词格 ([0-9/]+）)'));
  const g = m ? m[1].replace(/）/,'').split('/').map(Number) : null;
  const prevWrong = body.messages.filter(x => x.role === 'user' && x.content.includes('没有通过校验')).length === 0;
  let parts;
  if(g && prevWrong) parts = g.map(n => '错'.repeat(n + 1));
  else if(g) parts = g.map(n => '风'.repeat(n));
  else parts = null;
  const content = parts ? JSON.stringify({ line: parts.join(' '), note: '测试思路' }) : JSON.stringify({ suggestions: [] });
  await new Promise(r => setTimeout(r, 250));
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
'fetch-mocked'`);
await ev("state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); render(); 'reset'");
await ev("document.querySelector('#aibtn').click()");   // 重新打开面板（上节测试期间关过）

const runPromise = ev("aiRunAll('fill').then(() => 'done', e => 'err:' + e.message)");
await sleep(120);
check("填词期间 aiBusy=true", await ev("aiBusy") === true);
check("填词期间按钮换成停止", await ev("document.querySelector('#aistop').style.display !== 'none' && document.querySelector('#aigo').style.display === 'none'"));
check("填词期间配置上锁", await ev("document.querySelector('#aiurl').disabled === true"));
check("运行中可关面板，顶栏指示灯保持", await ev("(aiClosePanel(), !document.querySelector('#aip').classList.contains('show') && document.querySelector('#aibtn').classList.contains('ai-running'))"));
await ev("aiOpenPanel()");   // 重开面板，继续后续面板内断言
check("进度条可见", await ev("document.querySelector('#aiprog').style.display !== 'none'"));
const runResult = await runPromise;
check("填词流程完成", runResult === 'done', runResult);
check("aiBusy 复位", await ev("aiBusy === false"));
check("动作按钮恢复", await ev("document.querySelector('#aigo').style.display !== 'none' && document.querySelector('#aistop').style.display === 'none'"));
const calls = await ev("window.__aiCalls.length");
check("调用次数=句数×2（重试生效）", calls === 16, calls);
check("请求走 mock URL + Bearer", await ev("window.__aiCalls.every(c => c.url === 'http://127.0.0.1:8742/v1/chat/completions' && c.auth === 'Bearer test-key' && c.model === 'test-model')"));
check("重试请求带了错误反馈", await ev("window.__aiCalls.some(c => c.msgs >= 3)"));
check("系统提示词带风格限制", await ev("window.__sysSeen.includes('押 ang 韵')"));
check("全部句子按词格填满", await ev(`(() => {
  for(const sec of state.sections) for(const L of sec.lines){
    const cl = CL(RT(L.t));
    if(cl.length !== cap(L)) return false;
    if(cl.some(c => c !== '风')) return false;
  }
  return true;
})()`));
check("待填计数归零", await ev("(aiSyncPanel(), document.querySelector('#aipending').textContent.includes('没有空格'))"));

// ---- 5. 停止：慢速 mock 跑到一半点停止 ----
await ev(`
window.__aiCalls = [];
window.fetch = async (url, opts) => {
  window.__aiCalls.push(1);
  const body = JSON.parse(opts.body);
  const usr = [...body.messages].reverse().find(m => m.role === 'user' && !m.content.includes('没有通过校验')).content;
  const m = usr.match(new RegExp('词格 ([0-9/]+）)'));
  const g = m ? m[1].replace(/）/,'').split('/').map(Number) : [2,2];
  const content = JSON.stringify({ line: g.map(n => '雨'.repeat(n)).join(' '), note: 'x' });
  // 每请求 1.2 秒，且尊重 AbortSignal
  await new Promise((res, rej) => {
    const id = setTimeout(res, 1200);
    if(opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(id); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
  });
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 });
};
'ok'`);
await ev("state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); render(); 'reset2'");
const stopRun = ev("aiRunAll('fill').then(() => 'done', e => 'err:' + e.message)");
await sleep(1400);   // 第 1 句应已完成，第 2 句在途
await ev("document.querySelector('#aistop').click()");
const stopResult = await stopRun;
check("停止后流程返回", stopResult === 'done', stopResult);
check("停止后 aiBusy 复位", await ev("aiBusy === false"));
const stoppedState = await ev(`(() => {
  const all = [];
  for(const sec of state.sections) for(const L of sec.lines) all.push(CL(RT(L.t)).length === cap(L));
  return { filled: all.filter(Boolean).length, total: all.length, calls: window.__aiCalls.length };
})()`);
check("停止：已填句保留、后续未跑", stoppedState.filled >= 1 && stoppedState.filled < stoppedState.total, stoppedState);
check("停止：调用数远小于全程", stoppedState.calls < 16, stoppedState.calls);
check("停止：日志记录已停止", await ev("document.querySelector('#ailog').textContent.includes('已停止')"));

// ---- 6. 处理范围：只处理第 2 段 ----
await ev(`
window.__aiCalls = [];
window.fetch = async (url, opts) => {
  window.__aiCalls.push(1);
  const body = JSON.parse(opts.body);
  const usr = [...body.messages].reverse().find(m => m.role === 'user' && !m.content.includes('没有通过校验')).content;
  const m = usr.match(new RegExp('词格 ([0-9/]+）)'));
  const g = m ? m[1].replace(/）/,'').split('/').map(Number) : [2,2];
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ line: g.map(n => '雪'.repeat(n)).join(' '), note: 'x' }) } }] }), { status: 200 });
};
'ok'`);
await ev("state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); aiCfg.scope='sec-1'; aiRunAll('fill'); 'go'");
await sleep(600);
const scopeState = await ev(`(() => {
  const s1 = state.sections[0].lines.every(L => !RT(L.t));
  const s2 = state.sections[1].lines.every(L => CL(RT(L.t)).length === cap(L) && RT(L.t).includes('雪'));
  return { s1, s2 };
})()`);
check("范围：只处理第 2 段", scopeState.s1 && scopeState.s2, scopeState);
await ev("aiCfg.scope='all'; 'reset'");

// ---- 7. 检查全篇 + 越界/错格建议拦截 ----
await ev(`
window.__aiCalls = [];
window.fetch = async (url, opts) => {
  window.__aiCalls.push(1);
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ suggestions: [
    { sec: 1, line: 1, text: '春风明月 照山岗', why: '测试替换' },
    { sec: 99, line: 1, text: '不存在的段落', why: '越界' },
    { sec: 1, line: 2, text: '错 错 错 错 错 错 错', why: '这条应该被拦' }
  ]}) } }] }), { status: 200 });
};
'ok'`);
await ev("aiRunAll('check')");
await sleep(300);
check("检查全篇：合格建议被采用", await ev("RT(state.sections[0].lines[0].t)") === "春风明月照山岗", await ev("RT(state.sections[0].lines[0].t)"));
check("检查全篇：错格建议被拦", await ev("RT(state.sections[0].lines[1].t) === ''"), await ev("RT(state.sections[0].lines[1].t)"));
check("检查全篇：一次调用", await ev("window.__aiCalls.length === 1"));

// ---- 8. 测试连接 ----
await ev(`
window.__aiCalls = [];
window.fetch = async (url, opts) => {
  window.__aiCalls.push(JSON.parse(opts.body));
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '正常' } }] }), { status: 200 });
};
'ok'`);
await ev("aiTest()");
await sleep(300);
check("测试连接：小请求 + 低 token", await ev(`(() => { const b = window.__aiCalls[0]; return b.messages.length === 1 && b.messages[0].content.length < 30 && b.max_tokens === 16; })()`));
check("测试连接：成功写入日志", await ev("document.querySelector('#ailog').textContent.includes('连接成功')"));

// ---- 9. 未配置拦截 ----
await ev("aiCfg.baseUrl=''; aiSaveCfg(); aiClosePanel(); window.__aiCalls = [];");
await ev("aiRunAll('fill')");
await sleep(200);
check("没配置时：面板自动打开提示", await ev("window.__aiCalls.length === 0 && document.querySelector('#aip').classList.contains('show')"));
await ev("aiCfg.baseUrl='http://127.0.0.1:8742/v1'; aiSaveCfg(); aiClosePanel();");

// ---- 截图留档 ----
await ev("aiOpenPanel()");
await sleep(400);
const shot = await send("Page.captureScreenshot", { format: "png" });
await import("node:fs").then(fs => fs.writeFileSync("verify-ai-panel.png", Buffer.from(shot.data, "base64")));

const fails = results.filter(r => !r.ok);
console.log("\n== " + (results.length - fails.length) + "/" + results.length + " passed ==");
process.exit(fails.length ? 1 : 0);
