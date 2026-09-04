"use strict";
/* ================= 词格酱 · AI 填词模块 =================
   支持任意「OpenAI 兼容」接口（各种中转站基本都是这个格式）：
   POST {base}/chat/completions，body 里 model + messages，Authorization: Bearer <key>。

   面板的设置（BASE_URL / API_KEY / MODEL / 风格提示词 / 处理范围）都只存本机
   localStorage（cige.ai.v1），不进工程文件、不导出、不上传。

   填词流水线（aiRunAll → aiFillLine 循环）：
   1. 拼系统提示词：全曲设定 + 本句词格（逐分句的格数和已填内容）+ 用户风格提示词
   2. 请求 AI 返回 JSON：{ line: "逐分句用空格分隔的填词", note: "一句话说明思路" }
   3. 本地校验：按 CL()（跟主程序同一套拗音/浊点拼格规则）数每个分句的字数，
      对不上就带着具体错误信息再发给 AI，最多重试 3 次
   4. 全部通过才写回 state，绝不写一句字数不对的词进词格

   交互：
   - 运行中：动作按钮换成「停止」（AbortController 中断在途请求），配置输入框上锁，
     面板不允许关闭（防误关丢进度），底部进度条实时显示 n/m 与当前句
   - 「测试连接」：一次最小对话请求，验证地址 / Key / 模型名
   - 「处理范围」：整首，或只处理某一段
   - AI 改写已有句子时，原来的写法自动存进该句的备选版本，不丢稿
   - 「检查全篇」：整首歌交给 AI 审（押韵/意象/连贯），返回逐句替换建议，
     同样逐句本地校验格数，不合格的句子自动丢弃、只保留改对了的
*/

const AI_STORE_KEY = "cige.ai.v1";

/* ---------- 设置（只存本机） ---------- */
let aiCfg = { baseUrl: "", apiKey: "", model: "", style: "", maxTokens: 3000, temperature: 0.9, scope: "all" };
try{
  const s = localStorage.getItem(AI_STORE_KEY);
  if(s){ const o = JSON.parse(s); if(o && typeof o === "object") aiCfg = Object.assign(aiCfg, o); }
}catch(e){}

function aiSaveCfg(){
  try{ localStorage.setItem(AI_STORE_KEY, JSON.stringify(aiCfg)); }catch(e){}
}

function aiNormBase(url){
  url = String(url || "").trim().replace(/\/+$/, "");
  if(url && !/\/chat\/completions$/.test(url) && !/\/v\d+(\/|$)/.test(url)) url += "/v1";
  return url;
}

/* ---------- 与主程序共享的格子计数（index.html 里定义，这里只引用） ---------- */
/* cap / CL / RT / state / t / toast / render / save 均由 index.html 提供 */

/* ---------- 请求 ---------- */
function aiHeaders(){
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + aiCfg.apiKey
  };
}

/* 用户主动停止时抛出的可识别错误 */
function aiAbortedErr(){ const e = new Error(t("aiErrAborted")); e.aiAborted = true; return e; }

async function aiChat(messages, opts){
  opts = opts || {};
  const base = aiNormBase(aiCfg.baseUrl);
  if(!base) throw new Error(t("aiErrNoBaseUrl"));
  if(!aiCfg.apiKey) throw new Error(t("aiErrNoKey"));
  const body = {
    model: aiCfg.model,
    messages,
    temperature: opts.temperature !== undefined ? opts.temperature : aiCfg.temperature,
    stream: false
  };
  const maxTok = opts.maxTokens || aiCfg.maxTokens;
  if(maxTok) body.max_tokens = maxTok;
  let resp;
  try{
    resp = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: aiHeaders(),
      body: JSON.stringify(body),
      signal: opts.signal
    });
  }catch(e){
    if(e && (e.name === "AbortError" || e.code === 20)) throw aiAbortedErr();
    throw new Error(t("aiErrNetwork") + e.message);
  }
  if(!resp.ok){
    let detail = "";
    try{ const j = await resp.json(); detail = (j.error && (j.error.message || j.error.code)) || JSON.stringify(j).slice(0, 300); }
    catch(e){ try{ detail = (await resp.text()).slice(0, 300); }catch(e2){} }
    throw new Error(t("aiErrHttp", resp.status, detail));
  }
  const data = await resp.json();
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  const text = msg && typeof msg.content === "string" ? msg.content
    : (msg && Array.isArray(msg.content) ? msg.content.map(c => c.text || "").join("") : "");
  if(!text) throw new Error(t("aiErrEmpty"));
  return text;
}

/* 从回复里抠 JSON（容错：剥 ```json 代码栅栏、截取第一个 { 到最后一个 }） */
function aiParseJson(text){
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if(a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

/* ---------- 提示词 ---------- */
function aiSongBrief(){
  const secs = state.sections.map(sec => {
    const lines = sec.lines.map(L => {
      const cl = CL(RT(L.t)), C = cap(L);
      const parts = [];
      let i = 0;
      for(const n of L.g){
        const seg = [];
        for(let k = 0; k < n; k++){ const c = cl[i]; seg.push(c !== undefined && c !== " " && c !== "　" ? c : "□"); i++; }
        parts.push(seg.join(""));
      }
      return L.g.join("/") + "：" + parts.join(" ");
    }).join("\n");
    return "【" + sec.name + "】\n" + lines;
  }).join("\n\n");
  return "《" + (state.title || t("untitled")) + "》\n" + secs;
}

function aiSystemPrompt(){
  let p = "你是一位中文歌词创作助手，正在「词格酱」里按固定词格填词。词格就是作曲定好的旋律骨架："
    + "每句的格子数是死的，多一字少一字都不行；分句（用 / 分隔，如 2/2/3）是句内的停顿分组。"
    + "「□」表示这一格还空着，需要你填上；已经有字的格子原则上保留，除非用户要求改写。"
    + "\n\n硬性规则（违反任何一条都算失败）："
    + "\n1. 每个字占一格，一个格子不多不少正好一个汉字（或一个英文字母/数字/假名）——"
    + "英文字母和数字也按字符数占格，不要把一个单词塞进一格。"
    + "\n2. 标点符号占格。如果一个停顿分组还剩最后一格且用户没要求标点，优先填字而不是标点。"
    + "\n3. 返回的 line 里，各分句之间用一个空格分隔，分句内部的字必须连写（内部不要加空格）。"
    + "\n4. 输出必须是严格的 JSON：{\"line\":\"...\",\"note\":\"...\"}，不要输出 JSON 之外的任何文字。"
    + "\n\n创作要求：口语自然、能唱，避免生硬的书面腔；注意句与句之间的衔接和全曲意象的统一。";
  if(aiCfg.style.trim()) p += "\n\n用户的风格要求（必须遵守）：\n" + aiCfg.style.trim();
  return p;
}

/* 每个分句的格数和当前内容，都摊平成提示词里的一行 */
function aiLineBrief(L){
  const cl = CL(RT(L.t)), C = cap(L);
  const parts = [];
  let i = 0;
  for(const n of L.g){
    const seg = [];
    for(let k = 0; k < n; k++){ const c = cl[i]; seg.push(c === undefined || c === " " || c === "　" ? "□" : c); i++; }
    parts.push(seg.join(""));
  }
  return L.g.join("/") + "：" + parts.join(" ");
}

/* ---------- 本地校验：返回 null 表示通过，否则返回错误说明（喂回给 AI 重试） ---------- */
function aiCheckFill(text, g){
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if(parts.length !== g.length)
    return t("aiCheckSegCount", parts.length, g.length);
  for(let i = 0; i < g.length; i++){
    const cl = CL(parts[i]);
    if(cl.length !== g[i])
      return t("aiCheckSegLen", i + 1, cl.length, g[i], parts[i]);
  }
  return null;
}

/* 把「分句间空格分隔」的文本写回一句（格子钉死的规则跟手填一致：多余截掉、不足留空）。
   原写法若非空且变了，自动存进该句的备选版本——跟应用「不会丢稿」的规矩一致。 */
function aiApplyLineText(L, text){
  const parts = text.split(/\s+/).filter(Boolean);
  let out = "";
  for(let gi = 0; gi < L.g.length; gi++){
    const cl = CL(parts[gi] || "");
    for(let k = 0; k < L.g[gi]; k++) out += cl[k] !== undefined ? cl[k] : " ";
  }
  const prev = RT(L.t), next = RT(out);
  if(prev && next !== prev && Array.isArray(L.alts) && !L.alts.includes(prev)) L.alts.push(prev);
  L.t = out;
}

/* ---------- 处理范围 ---------- */
function aiScopeIndex(){
  const m = /^sec-(\d+)$/.exec(aiCfg.scope || "all");
  if(!m) return null;
  return +m[1] < state.sections.length ? +m[1] : null;   // 段落被删了就退回整首
}
function aiLinesInScope(){
  const si = aiScopeIndex();
  const out = [];
  state.sections.forEach((sec, i) => {
    if(si !== null && i !== si) return;
    sec.lines.forEach((L, li) => out.push({ sec, L, si: i, li }));
  });
  return out;
}
function aiPendingLines(){
  return aiLinesInScope().filter(x => CL(RT(x.L.t)).length < cap(x.L));
}

/* ---------- 单句 AI 填词（含校验-重试循环） ---------- */
const AI_MAX_RETRY = 3;

async function aiFillLine(sec, L, opts){
  const messages = [
    { role: "system", content: aiSystemPrompt() },
    { role: "user", content:
        "全曲词格与当前进度（□ 是空格，每句开头的 2/2/3 是分句格数）：\n\n" + aiSongBrief() +
        "\n\n现在只处理这一句（词格 " + L.g.join("/") + "）：\n" + aiLineBrief(L) +
        "\n\n请把这一句的空格 □ 填上。全句已填满、或你判断现有文字已经足够好时，可以原样返回（不要硬改）。" +
        "\nnote 里用一句话说明你的填写思路。" }
  ];
  let lastErr = "";
  for(let attempt = 0; attempt <= AI_MAX_RETRY; attempt++){
    if(aiAbort && aiAbort.cancelled) throw aiAbortedErr();
    const msgs = messages.slice();
    if(lastErr) msgs.push({ role: "user", content: t("aiRetryPrompt", lastErr) });
    const raw = await aiChat(msgs, opts);
    let j;
    try{ j = aiParseJson(raw); }
    catch(e){ lastErr = t("aiCheckJson"); continue; }
    const line = typeof j.line === "string" ? j.line : (typeof j === "string" ? j : "");
    const chk = aiCheckFill(line, L.g);
    if(chk === null){ return { text: line, note: typeof j.note === "string" ? j.note : "" }; }
    lastErr = chk;
  }
  throw new Error(t("aiErrNotFit", AI_MAX_RETRY + 1, lastErr));
}

let aiTestCtrl = null;       // 测试连接的独立中止器

/* ---------- 运行控制 / 进度 ---------- */
let aiBusy = false;
let aiAbort = null;          // { cancelled, ctrl:AbortController }
let aiProgDone = 0, aiProgTotal = 0;

const AI_BUSY_INPUTS = ["#aiurl", "#aikey", "#aimodel", "#aistyle", "#aimax", "#aitemp", "#aiscope", "#aitest", "#aiclose"];

function aiSetBusy(b){
  aiBusy = b;
  const show = (id, on) => { const e = $(id); if(e) e.style.display = on ? "" : "none"; };
  show("#aigo", !b); show("#aichk", !b); show("#aitest", !b); show("#aistop", b);
  const stop = $("#aistop");
  if(stop) stop.textContent = aiAbort && aiAbort.cancelled ? t("aiStopping") : t("aiStop");
  AI_BUSY_INPUTS.forEach(s => { const e = $(s); if(e) e.disabled = b; });
  const prog = $("#aiprog");
  if(prog && !b) prog.style.display = aiProgTotal ? "" : "none";
  /* 顶栏按钮变运行指示灯：面板关了也能看出后台在跑，随时点开回来看/停 */
  const top = $("#aibtn");
  if(top){
    top.classList.toggle("ai-running", b);
    top.title = b ? t("aiBtnRunningTitle") : t("aiBtnTitle");
    top.textContent = b ? t("aiBtnRunning") : t("aiBtn");
  }
}

function aiSetProgress(done, total, msg){
  aiProgDone = done; aiProgTotal = total;
  const prog = $("#aiprog"); if(prog) prog.style.display = "";
  const bar = $("#aifillbar");
  if(bar) bar.style.width = (total > 0 ? Math.round(done / total * 100) : 0) + "%";
  const txt = $("#aiprogtext");
  if(txt) txt.textContent = msg || t("aiProg", done, total);
}

function aiStop(){
  if(!aiBusy || !aiAbort || aiAbort.cancelled) return;
  aiAbort.cancelled = true;
  try{ aiAbort.ctrl.abort(); }catch(e){}
  const stop = $("#aistop"); if(stop) stop.textContent = t("aiStopping");
  aiSetProgress(aiProgDone, aiProgTotal, t("aiStopping"));
}

async function aiRunAll(mode){
  if(aiBusy) return;
  if(!aiNormBase(aiCfg.baseUrl) || !aiCfg.apiKey || !aiCfg.model){
    aiOpenPanel();
    toast(t("aiToastNeedCfg"));
    return;
  }
  const scopeLines = aiLinesInScope();
  const todo = mode === "fill" ? scopeLines.filter(x => CL(RT(x.L.t)).length < cap(x.L)) : scopeLines;
  if(mode === "fill" && !todo.length && !confirm(t("aiConfirmAllFilled"))) return;

  aiSaveCfg();
  aiAbort = { cancelled: false, ctrl: new AbortController() };
  const signal = aiAbort.ctrl.signal;
  aiSetBusy(true);
  aiProgDone = 0; aiProgTotal = mode === "fill" ? todo.length : Math.max(todo.length, 1);
  aiSetProgress(0, aiProgTotal, mode === "fill" ? t("aiWorkingFill") : t("aiWorkingCheck"));
  const startedAt = Date.now();
  let ok = 0, skip = 0, stopped = false, notes = [];
  try{
    if(mode === "fill"){
      for(const item of todo){
        if(aiAbort.cancelled){ stopped = true; break; }
        aiSetProgress(aiProgDone, aiProgTotal, t("aiProgress", item.si + 1, item.li + 1));
        try{
          const r = await aiFillLine(item.sec, item.L, { signal });
          aiApplyLineText(item.L, r.text);
          if(r.note) notes.push(t("aiNoteLine", item.si + 1, item.li + 1) + " " + r.note);
          ok++;
        }catch(e){
          if(e.aiAborted){ stopped = true; break; }
          skip++;
          notes.push(t("aiNoteLine", item.si + 1, item.li + 1) + " " + t("aiSkipFail", e.message));
        }
        aiProgDone++;
        render();
      }
    }else{
      /* 检查/润色：整首一起交给 AI 审，返回逐句建议，逐句本地校验后才采用 */
      const scopeSi = aiScopeIndex();
      const messages = [
        { role: "system", content: aiSystemPrompt() },
        { role: "user", content:
            "这是当前的歌词工程（每句开头是分句格数，□ 是空格）：\n\n" + aiSongBrief() +
            (scopeSi !== null ? t("aiScopeHintSec", scopeSi + 1, state.sections[scopeSi].name) : "") +
            "\n\n请通读全篇，从押韵、意象、口吻、叙事连贯的角度，挑出值得改写的句子并给出替换文本。" +
            "\n只改确实更好的句子，不要为了改而改；替换文本必须严格符合该句词格。" +
            "\n输出 JSON：{\"suggestions\":[{\"sec\":段落序号(从1起),\"line\":句序号(段内从1起),\"text\":\"替换文本(分句间用空格分隔)\",\"why\":\"一句话理由\"}]}。" +
            "\n没有值得改的就返回 {\"suggestions\":[]}。" }
      ];
      const raw = await aiChat(messages, { signal });
      let j;
      try{ j = aiParseJson(raw); }
      catch(e){ throw new Error(t("aiCheckJson")); }
      const sug = Array.isArray(j.suggestions) ? j.suggestions : [];
      aiProgTotal = Math.max(sug.length, 1);
      for(let i = 0; i < sug.length; i++){
        const s = sug[i];
        if(aiAbort.cancelled){ stopped = true; break; }
        aiSetProgress(i, sug.length, t("aiProg", i, sug.length));
        const sec = state.sections[(s.sec | 0) - 1];
        const L = sec && sec.lines[(s.line | 0) - 1];
        if(!L) continue;
        if(scopeSi !== null && (s.sec | 0) - 1 !== scopeSi) continue;   // 范围外建议直接忽略，不计失败
        const chk = aiCheckFill(s.text, L.g);
        if(chk !== null){ skip++; notes.push(t("aiNoteLine", s.sec, s.line) + " " + t("aiSkipFail", chk)); continue; }
        const oldText = RT(L.t) || t("versionEmpty");
        aiApplyLineText(L, s.text);   // 原写法在 aiApplyLineText 里自动存备选
        if(s.why) notes.push(t("aiNoteLine", s.sec, s.line) + " " + oldText + " → " + RT(L.t) + "（" + s.why + "）");
        ok++;
      }
      render();
    }
  }catch(e){
    if(e.aiAborted) stopped = true;
    else toast(t("aiToastFail", e.message));
  }finally{
    aiAbort = null;
    aiSetBusy(false);
    render();
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    let summary;
    if(stopped) summary = t("aiDoneStopped", ok, skip, secs);
    else summary = mode === "fill" ? t("aiDoneFill", ok, skip, secs) : t("aiDoneCheck", ok, skip, secs);
    aiSetProgress(aiProgDone, aiProgTotal, summary);
    if(notes.length){
      aiLog(summary + "\n" + notes.join("\n"));
      toast(t("aiToastSeeLog"));
    }else{
      aiLog(summary);
      toast(summary);
    }
    const pend = $("#aipending"); if(pend) pend.textContent = t("aiPending", aiPendingLines().length);
    save();
  }
}

/* ---------- 测试连接 ---------- */
async function aiTest(){
  if(aiBusy) return;
  if(!aiNormBase(aiCfg.baseUrl) || !aiCfg.apiKey || !aiCfg.model){
    aiOpenPanel();
    toast(t("aiToastNeedCfg"));
    return;
  }
  const btn = $("#aitest");
  btn.disabled = true; btn.textContent = t("aiTesting");
  aiTestCtrl = new AbortController();
  try{
    const r = await aiChat([{ role: "user", content: "请只回复两个字：正常" }], { temperature: 0, maxTokens: 16, signal: aiTestCtrl.signal });
    const reply = String(r).trim().slice(0, 60);
    aiLog(t("aiToastTestOk", reply)); toast(t("aiToastTestOk", reply));
  }catch(e){
    if(e.aiAborted) aiLog(t("aiErrAborted"));   // 测试连接被中止：静默记日志即可
    else { aiLog(t("aiToastTestFail", e.message)); toast(t("aiToastTestFail", e.message)); }
  }finally{
    aiTestCtrl = null;
    btn.textContent = t("aiTestBtn");
    btn.disabled = aiBusy;
    aiSyncPanel();
  }
}

/* ---------- 运行日志 ---------- */
function aiLog(msg){
  const box = $("#ailog");
  if(!box) return;
  const stamp = new Date().toLocaleTimeString(LOCALE[state.lang] || "zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const row = el("div", "ailog-row");
  row.textContent = "[" + stamp + "] " + msg;
  box.insertBefore(row, box.firstChild);
  while(box.children.length > 40) box.removeChild(box.lastChild);
}

/* ---------- 面板 UI ---------- */
function aiOpenPanel(){ $("#aip").classList.add("show"); aiSyncPanel(); }
/* 运行中允许关面板：每句填完即已写入工程，不会丢；顶栏按钮亮着运行指示灯，
   随时点开回来看进度或停止——比把用户锁在面板上更合理。 */
function aiClosePanel(){ $("#aip").classList.remove("show"); }

function aiSyncPanel(){
  $("#aiurl").value = aiCfg.baseUrl;
  $("#aikey").value = aiCfg.apiKey;
  $("#aimodel").value = aiCfg.model;
  $("#aistyle").value = aiCfg.style;
  $("#aimax").value = aiCfg.maxTokens;
  $("#aimaxv").textContent = aiCfg.maxTokens;
  $("#aitemp").value = aiCfg.temperature;
  $("#aitempv").textContent = Number(aiCfg.temperature).toFixed(1);
  /* 范围下拉：段落名可能改过，每次打开重建 */
  const sel = $("#aiscope");
  const want = aiScopeIndex() === null ? "all" : "sec-" + aiScopeIndex();
  sel.innerHTML = "";
  const o0 = el("option"); o0.value = "all"; o0.textContent = t("aiScopeAll"); sel.appendChild(o0);
  state.sections.forEach((sec, i) => {
    const o = el("option"); o.value = "sec-" + i; o.textContent = t("aiScopeSec", i + 1, sec.name); sel.appendChild(o);
  });
  sel.value = want; aiCfg.scope = want;
  const pend = $("#aipending");
  if(pend) pend.textContent = t("aiPending", aiPendingLines().length);
  if(!aiBusy){ aiSetBusy(false); }
}

function aiBind(){
  const inp = (sel, key, num) => $(sel).addEventListener("input", e => {
    aiCfg[key] = num ? +e.target.value : e.target.value;
    aiSaveCfg();
  });
  inp("#aiurl", "baseUrl");
  inp("#aikey", "apiKey");
  inp("#aimodel", "model");
  $("#aistyle").addEventListener("input", e => { aiCfg.style = e.target.value; aiSaveCfg(); });
  $("#aimax").addEventListener("input", e => { aiCfg.maxTokens = +e.target.value; $("#aimaxv").textContent = e.target.value; aiSaveCfg(); });
  $("#aitemp").addEventListener("input", e => { aiCfg.temperature = +e.target.value; $("#aitempv").textContent = Number(e.target.value).toFixed(1); aiSaveCfg(); });
  $("#aiscope").addEventListener("change", e => {
    aiCfg.scope = e.target.value; aiSaveCfg();
    const pend = $("#aipending"); if(pend) pend.textContent = t("aiPending", aiPendingLines().length);
  });

  $("#aibtn").onclick = () => {
    const shown = $("#aip").classList.contains("show");
    /* 运行中点顶栏按钮总是打开面板（方便回来看进度/停止）；空闲时才是开关切换 */
    if(!shown) aiOpenPanel();
    else if(!aiBusy) aiClosePanel();
  };
  $("#aiclose").onclick = aiClosePanel;
  $("#aip").onclick = e => { if(e.target.id === "aip") aiClosePanel(); };
  $("#aigo").onclick = () => aiRunAll("fill");
  $("#aichk").onclick = () => aiRunAll("check");
  $("#aitest").onclick = aiTest;
  $("#aistop").onclick = aiStop;

  /* Escape 关面板，跟 help/exp/bgp 一致（运行中会被 aiClosePanel 拦下） */
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && $("#aip").classList.contains("show")) aiClosePanel();
  });
}

/* 帮助面板里追加一段 AI 说明（i18n key：aiHelp*)，由 index.html boot 时触发 */
function aiInjectHelp(){
  const anchor = document.querySelector("#help .card .credit");
  if(!anchor) return;
  const h4 = el("h4"); h4.dataset.i18n = "aiHelpH4"; h4.textContent = t("aiHelpH4");
  const p1 = el("p"); p1.dataset.i18n = "aiHelpP1"; p1.innerHTML = t("aiHelpP1");
  const p2 = el("p"); p2.dataset.i18n = "aiHelpP2"; p2.innerHTML = t("aiHelpP2");
  const p3 = el("p"); p3.dataset.i18n = "aiHelpP3"; p3.innerHTML = t("aiHelpP3");
  const pd = el("p"); pd.dataset.i18n = "aiDisclaimer"; pd.innerHTML = t("aiDisclaimer"); pd.style.color = "var(--ovf)";
  anchor.parentNode.insertBefore(h4, anchor);
  anchor.parentNode.insertBefore(p1, anchor);
  anchor.parentNode.insertBefore(p2, anchor);
  anchor.parentNode.insertBefore(p3, anchor);
  anchor.parentNode.insertBefore(pd, anchor);
}
