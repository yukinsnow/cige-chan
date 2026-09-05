/* 词格酱 · 应用主脚本
 *
 * 3.0 迁移第一步：只搬不改。原来是三个 classic script 共享一个全局作用域
 * （i18n.js / ai.js / index.html 里的内联脚本），忠实的模块翻译就是一个模块，
 * 所以 ai.js 的内容按原加载顺序并在了前面，内容逐字未动。
 *
 * 不拆成两个模块是因为 ai.js 和内联脚本是双向依赖的：ai.js 用了 state / t /
 * toast / render / save / CL / RT / LOCALE / el / $，内联脚本又调 aiBind /
 * aiClosePanel / aiInjectHelp。拆开就是循环 import，那是把耦合固化成结构。
 * 第二步抽出 core/ 之后，ai.js 会作为单向依赖 core 的正常模块拆回来。
 *
 * ES 模块本身就是严格模式，原来两个文件开头的 "use strict" 已去掉。
 */
import './style.css';
import { cap, RT, CL, charToCell, cellToChar } from './core/clusters.js';
import { SAMPLE, state, newLine, norm, normAll } from './core/state.js';
import { I18N, t, LANG_NAME, LOCALE } from './i18n/index.js';
import { parseTxt, parseGroups, lineOut, patTxt, lyrTxt } from './core/txt.js';

/* ================= 以下为原 src/ai.js，逐字搬入 ================= */
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

/* ================= 以下为原 index.html 内联脚本，逐字搬入 ================= */

const $ = s => document.querySelector(s);
const el = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };

/* ================= state ================= */
let focusRef = null;      // {si,li,pos}
let composing = false;

/* ================= i18n ================= */
/* 界面语言：中文 / 日本語 / 한국어。state.lang 决定用哪一份文案，
   t(key, ...args) 是所有"动态生成"文案（提示语、按钮 title 等）的统一入口；
   静态 HTML 里的文案改用 data-i18n / data-i18n-title / data-i18n-placeholder
   标记，交给 applyI18n() 在切换语言时统一刷新。没有母语者校对过，
   日语/韩语翻译如果读着别扭，欢迎指出来再改。
   文案字典 I18N 本体已拆到 src/i18n.js（见文件顶部的 <script src="i18n.js">）。 */

/* 刷新所有静态 HTML 里标了 data-i18n* 的文案；JS 动态生成的部分（各行的
   工具栏、提示语等）走 t() 直接取当前语言，render() 一跑就是新语言了，
   不需要在这里额外处理。 */
function applyI18n(){
  document.documentElement.lang = LOCALE[state.lang] || "zh-CN";
  document.querySelectorAll("[data-i18n]").forEach(e=>{ e.innerHTML = t(e.dataset.i18n); });
  document.querySelectorAll("[data-i18n-title]").forEach(e=>{ e.title = t(e.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(e=>{ e.placeholder = t(e.dataset.i18nPlaceholder); });
  document.title = state.title + " · " + t("brand");
  const langLab = $("#langLabel"); if(langLab) langLab.textContent = LANG_NAME[state.lang] || LANG_NAME.zh;
  /* 机翻说明只在日语/韩语下出现，中文两版的 aiTransNote 是空串。 */
  const aiNote = $("#aiNote");
  if(aiNote){
    const s = t("aiTransNote") || "";
    aiNote.innerHTML = s;
    aiNote.style.display = s ? "" : "none";
  }
}


const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ================= render ================= */
function render(){
  const doc = $("#doc"); doc.innerHTML = "";
  state.sections.forEach((sec,si)=>{
    const S = el("div","sec"); S.dataset.si = si;

    const head = el("div","sechead");
    const nm = el("input","secname"); nm.value = sec.name; nm.spellcheck = false;
    nm.oninput = ()=>{ sec.name = nm.value; save(); };
    head.appendChild(nm);
    const meta = el("span","secmeta");
    meta.textContent = t("secMeta", sec.lines.length, sec.lines.reduce((a,l)=>a+cap(l),0));
    head.appendChild(meta);
    const st = el("div","sectools");
    st.appendChild(btn("↑",t("secUp"),()=>moveSec(si,-1)));
    st.appendChild(btn("↓",t("secDown"),()=>moveSec(si,1)));
    st.appendChild(btn("⧉",t("secDup"),()=>{ state.sections.splice(si+1,0,JSON.parse(JSON.stringify(sec))); render(); }));
    st.appendChild(btn(t("secAdd"),t("secAddTitle"),()=>{ state.sections.splice(si+1,0,{name:t("newSectionName"),lines:[newLine()]}); render(); }));
    st.appendChild(btn("✕",t("secDel"),()=>{ if(confirm(t("confirmDeleteSec",sec.name))){ state.sections.splice(si,1); render(); } }));
    head.appendChild(st);
    S.appendChild(head);

    sec.lines.forEach((L,li)=> S.appendChild(rowEl(sec,si,L,li)));

    const add = el("button","addline"); add.textContent = t("addLine");
    add.onclick = ()=>{ const last = sec.lines[sec.lines.length-1];
      sec.lines.push(newLine(last ? last.g : [7]));
      focusRef = {si, li:sec.lines.length-1, pos:0}; render(); };
    S.appendChild(add);
    doc.appendChild(S);
  });

  const addSec = el("button","addline"); addSec.textContent = t("addSection"); addSec.style.marginLeft = "0";
  addSec.onclick = ()=>{ state.sections.push({name:t("newSectionName"),lines:[newLine()]}); render(); };
  doc.appendChild(addSec);

  restoreFocus(); stats(); save();
}

function btn(txt,title,fn){ const b = el("button"); b.textContent = txt; b.title = title; b.onclick = fn; return b; }

function rowEl(sec,si,L,li){
  const R = el("div","row"); R.dataset.si = si; R.dataset.li = li;

  const ln = el("div","ln"); ln.textContent = li+1; R.appendChild(ln);

  const pat = el("button","pat"); pat.textContent = L.g.join("/"); pat.title = t("patTitle");
  pat.onclick = ()=>editPattern(pat,L); R.appendChild(pat);

  const wrap = el("div","wrap");
  const grid = el("div","grid");
  let idx = 0;
  L.g.forEach(n=>{
    const G = el("div","grp");
    for(let k=0;k<n;k++){ const c = el("i","cell"); c.dataset.i = idx++; G.appendChild(c); }
    grid.appendChild(G);
  });
  const ovf = el("span","ovf"); ovf.style.display = "none"; grid.appendChild(ovf);
  wrap.appendChild(grid);

  let curPos = 0;   // 本句光标所在格序号（失焦后仍保留，供工具按钮使用）
  const io = el("input","io"); io.type = "text"; io.autocomplete = "off"; io.spellcheck = false; io.value = L.t;
  const comp = el("span","comp");
  wrap.appendChild(io); wrap.appendChild(comp);
  R.appendChild(wrap);

  const cnt = el("div","cnt"); R.appendChild(cnt);

  const tools = el("div","tools");
  tools.appendChild(btn("−",t("rowMinusTitle"),()=>{ chg(L,-1,curPos); redrawRow(si,li,curPos); }));
  tools.appendChild(btn("+",t("rowPlusTitle"),()=>{ chg(L,1,curPos); redrawRow(si,li,curPos); }));
  tools.appendChild(btn("／",t("rowSplitTitle"),()=>{ const m = splitAt(L,curPos); redrawRow(si,li,curPos); if(m) toast(m); }));
  // 整句左右挪一格，跟 Alt+←/→ 同一个操作——手机上没有 Alt 键，只能靠这两个按钮
  tools.appendChild(btn("←",t("rowShiftLeftTitle"),()=>{
    const blocked = shiftLine(L,-1); if(blocked){ toast(blocked); return; }
    redrawRow(si,li,Math.max(0,curPos-1)); }));
  tools.appendChild(btn("→",t("rowShiftRightTitle"),()=>{
    const blocked = shiftLine(L,1); if(blocked){ toast(blocked); return; }
    redrawRow(si,li,Math.min(curPos+1,cap(L))); }));
  tools.appendChild(btn("⧉",t("rowDupTitle"),()=>{ sec.lines.splice(li+1,0,newLine(L.g)); focusRef={si,li:li+1,pos:0}; render(); }));
  tools.appendChild(btn("✕",t("rowDelTitle"),()=>{ sec.lines.splice(li,1); if(!sec.lines.length) sec.lines.push(newLine()); focusRef={si,li:Math.max(0,li-1),pos:0}; render(); }));
  R.appendChild(tools);

  /* ---- 备选版本 + 备注 ---- */
  norm(L);
  R.classList.toggle("hasx", !!(L.alts.length || L.note));
  const ex = el("div","extra");
  const vlab = el("span","vlab"); vlab.textContent = t("versionLabel"); ex.appendChild(vlab);
  const vw = el("span","vwrap"); ex.appendChild(vw);

  /* L.alts 是这句存下来的版本清单；L.t 是此刻正在编辑的文字。
     L.t 不在清单里就说明是还没存的新写法，单独用一个「未存」方块表示。
     文字一变版本条就要跟着变，所以单独抽成函数，输入时也调用。 */
  const short = s => [...s].slice(0,7).join("") + ([...s].length > 7 ? "…" : "");
  function buildVers(){
    vw.innerHTML = "";
    const cur = RT(L.t);
    const unsaved = !!cur && !L.alts.includes(cur);

    if(unsaved){
      const c = el("button","vc on"); c.textContent = t("unsavedPrefix") + short(cur);
      c.title = t("unsavedTitle", cur);
      vw.appendChild(c);
    }

    L.alts.forEach((txt,i)=>{
      const on = txt === cur;
      const c = el("button","vc" + (on ? " on" : ""));
      c.textContent = (i+1) + "· " + (short(txt) || t("versionEmpty"));
      c.title = (on ? t("versionCurrentTitle") : t("versionSwitchTitle")) + txt;
      if(!on) c.onclick = ()=>{
        if(cur && !L.alts.includes(cur)) L.alts.push(cur);   // 先把未存的写法保住，绝不丢稿
        L.t = txt; redrawRow(si,li,0); toast(t("toastSwitchedVersion", i+1));
      };
      const x = el("span","vx"); x.textContent = "×"; x.title = t("versionDeleteTitle");
      x.onclick = e=>{ e.stopPropagation(); L.alts.splice(i,1); redrawRow(si,li,curPos); };
      c.appendChild(x);
      vw.appendChild(c);
    });

    if(unsaved){
      const vadd = btn(t("addAlt"),t("addAltTitle"),()=>{
        L.alts.push(cur); redrawRow(si,li,curPos); toast(t("toastSavedVersion", L.alts.length));
      });
      vadd.className = "vadd"; vw.appendChild(vadd);
    }
    R.classList.toggle("hasx", !!(L.alts.length || L.note));
  }
  buildVers();
  R._vers = buildVers;

  const nt = el("input","note"); nt.type = "text"; nt.spellcheck = false;
  nt.value = L.note; nt.placeholder = t("notePlaceholder");
  nt.oninput = ()=>{ L.note = nt.value; R.classList.toggle("hasx", !!(L.alts.length || L.note)); save(); };
  // 备注框放在版本条后面，这样重建版本条不会打断正在输入的备注
  nt.onkeydown = e=>{ if(e.key === "Enter" || e.key === "Escape"){ e.preventDefault(); io.focus(); } };
  ex.appendChild(nt);
  R.appendChild(ex);

  /* ---- events ---- */
  io.addEventListener("compositionstart",()=>{ composing = true; });
  io.addEventListener("compositionupdate",e=>{ showComp(R,comp,io,e.data); });
  io.addEventListener("compositionend",()=>{ composing = false; comp.style.display="none"; onInput(); });
  io.addEventListener("input",()=>{ if(composing){ return; } onInput(); });

  function onInput(){
    const pos0 = io.selectionStart;
    // 全角空格、制表符统一成半角空格；空格保留，代表「这个格子先空着」
    let clean = io.value.replace(/[\t\n\r　]/g," ");

    /* 格子是钉死的：一句里每个字待在自己那一格，不会因为别处的增删整体挪位。
       原生输入框默认是插入/删除后面跟着流动，这里按"这次输入多出或少了几格"
       把它掰回来，光标位置就是发生变化的那一格：
         多出 n 格（打字、粘贴）→ 吃掉光标后面的 n 格，即覆盖，
                                  否则先写好的句尾会被一路推出词格截断丢掉；
         少了 n 格（退格、删除）→ 在光标处补 n 个占位空格，
                                  否则后面写好的字会整体往前挪，跟旋律错开。
       按格子（CL）数算而不是字符数——拗音跟前一个假名并成一格，格数没变就不动。
       占位空格不计入字数，句尾多余的空格在失焦和导出时会自动去掉。 */
    let cl = CL(clean);
    const added = cl.length - CL(L.t).length;
    if(added !== 0){
      const pc = charToCell(cl, Math.min(pos0, clean.length));
      if(added > 0) cl.splice(pc, added);
      else cl.splice(pc, 0, ...Array(-added).fill(" "));
      clean = cl.join("");
    }

    // 词格是几格就最多容纳几格，多打/多粘贴的字直接截掉，不再允许溢出；
    // 想装下更多字，请先用 ＋ 或改词格数字把格子加够。注意这里按格子（CL）数，
    // 不是按字符数——拗音跟前一个假名拼成一格，不占单独的名额。
    const C = cap(L);
    cl = CL(clean);
    if(cl.length > C){ clean = cl.slice(0,C).join(""); toast(t("toastAtCap")); }
    if(clean !== io.value){
      io.value = clean;
      const p = Math.min(pos0, clean.length);
      try{ io.setSelectionRange(p,p); }catch(e){}
    }
    L.t = clean;
    paint(R,L); buildVers(); mark(io.selectionStart); stats(); save();
  }
  // p 是原生输入框的字符下标；mark 把它换算成格子下标再记下来、画光标，
  // 这样 curPos/focusRef.pos 在跨行导航和 ＋－ 工具按钮里统一按"第几格"算。
  function mark(p){ const cellPos = charToCell(CL(io.value), p); curPos = cellPos; focusRef = {si,li,pos:cellPos}; caret(R,L,cellPos); paintSel(R); }
  R._mark = mark;   // 供 redrawRow / restoreFocus 在重建行后同步光标位置

  io.addEventListener("focus",()=>{ R.classList.add("active"); mark(io.selectionStart); });
  io.addEventListener("blur",()=>{
    if(RT(L.t) !== L.t){ L.t = RT(L.t); io.value = L.t; paint(R,L); buildVers(); stats(); save(); }
    R.classList.remove("active"); R.querySelectorAll(".cell").forEach(c=>c.classList.remove("caret","end","sel")); R.querySelectorAll(".grp").forEach(g=>g.classList.remove("cur")); });
  io.addEventListener("keyup",()=>mark(io.selectionStart));
  // 拖选、全选(Ctrl/⌘+A)、Shift+方向键、长按都会触发 select，这里把选区实时重画到格子上，
  // 划到哪高亮到哪，和平常选文本一致。
  io.addEventListener("select",()=>paintSel(R));
  io.addEventListener("click",e=>{
    // 拖动鼠标选出了一段范围（selectionStart≠End）时，别把它当普通点击去收拢光标——
    // 保留这段选区（和平常选择一致），光标画在拖动的那一端；只有真正的单击才定位光标。
    if(io.selectionStart !== io.selectionEnd){
      mark(io.selectionDirection === "backward" ? io.selectionStart : io.selectionEnd); return;
    }
    // 点/触摸格子内任意位置都定位到这一格本身（不再按左右半格判断"上一格/下一格"，
    // 半格判断在鼠标下没问题，但在触摸屏上误差大，容易点右半边却跳到下一格）。
    // 词格很长时会自动换行成好几排，这里必须先按纵向（行）匹配，行内再比横向距离，
    // 否则手机上点第二排的格子，很容易被判定成第一排里横坐标凑巧接近的格子——
    // 表现出来就是"点了没反应"或者"点哪个格子都定位到别的格子"。
    const cells = [...R.querySelectorAll(".cell")];
    if(!cells.length){ setTimeout(()=>{ seek(0); },0); return; }
    let best = 0, bd = Infinity, bestRect = null;
    cells.forEach((c,i)=>{
      const r = c.getBoundingClientRect();
      const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
      const d = dy*1000 + dx;   // 纵向权重拉满：先锁定是哪一行，行内再比水平距离
      if(d < bd){ bd = d; best = i; bestRect = r; }
    });
    // 点在最后一格右边界之外（整句末尾的空白处）不触发定位，交互上更符合预期：
    // 词格填满了就是填满了，末尾空白不该还能把光标甩过去。
    if(best === cells.length-1 && e.clientX > bestRect.right) return;
    setTimeout(()=>{ seek(best); },0);
  });

  /* 把光标放到第 p 格（格子下标，不是字符下标）。若这句还没写到那儿，
     先用空格把前面的格子占住，否则浏览器会把光标钳回最后一个字之后——
     那样看到的光标位置就是假的。 */
  function seek(p){
    p = Math.max(0, Math.min(p, cap(L)));
    let clusters = CL(io.value);
    if(p > clusters.length){
      io.value = io.value + " ".repeat(p - clusters.length);
      L.t = io.value; paint(R,L); buildVers(); stats(); save();
      clusters = CL(io.value);
    }
    const charPos = cellToChar(clusters, p);
    io.setSelectionRange(charPos,charPos);
    mark(io.selectionStart);   // 以真实光标为准，绝不画一个骗人的光标
  }
  R._seek = seek;

  io.addEventListener("keydown",e=>{
    const mod = e.metaKey || e.ctrlKey;
    const p = charToCell(CL(io.value), io.selectionStart);   // 当前光标所在格子下标
    if(mod && e.key === "]"){ e.preventDefault(); chg(L,1,p);  redrawRow(si,li,p); return; }
    if(mod && e.key === "["){ e.preventDefault(); chg(L,-1,p); redrawRow(si,li,p); return; }
    if(mod && e.key === "\\"){ e.preventDefault(); const m = splitAt(L,p); redrawRow(si,li,p); if(m) toast(m); return; }
    if(e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")){
      // Alt+←/→ 整句左右挪一格，跟 Alt+↑/↓ 整句上下挪是一对
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      const blocked = shiftLine(L,d);
      if(blocked){ toast(blocked); return; }
      redrawRow(si,li,Math.max(0,Math.min(p+d,cap(L)))); return;
    }
    if(e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")){
      e.preventDefault(); const d = e.key === "ArrowUp" ? -1 : 1; const j = li+d;
      if(j<0 || j>=sec.lines.length) return;
      sec.lines.splice(j,0,sec.lines.splice(li,1)[0]); focusRef={si,li:j,pos:p}; render(); return;
    }
    if(e.key === "Enter"){ e.preventDefault(); step(si,li,1,0); return; }
    if(e.key === "Tab"){ e.preventDefault(); step(si,li,e.shiftKey?-1:1,0); return; }
    if(e.key === "ArrowUp"){ e.preventDefault(); step(si,li,-1,p); return; }
    if(e.key === "ArrowDown"){ e.preventDefault(); step(si,li,1,p); return; }
    if(e.key === "Backspace" && !RT(L.t) && io.selectionStart === 0){
      e.preventDefault();
      if(sec.lines.length > 1){ sec.lines.splice(li,1); focusRef={si,li:Math.max(0,li-1),pos:9999}; render(); }
      else step(si,li,-1,9999);
      return;
    }
    if(e.key === "ArrowLeft" && io.selectionStart === 0){ e.preventDefault(); step(si,li,-1,9999); }
    if(e.key === "ArrowRight" && io.selectionStart === io.value.length){ e.preventDefault(); step(si,li,1,0); }
  });

  paint(R,L);
  return R;
}

function showComp(R,comp,io,data){
  if(!data){ comp.style.display="none"; return; }
  const cells = [...R.querySelectorAll(".cell")];
  const cellPos = charToCell(CL(io.value), io.selectionStart);
  const c = cells[Math.min(cellPos, cells.length-1)];
  comp.textContent = data;
  if(c){ const w = R.querySelector(".wrap").getBoundingClientRect(); const r = c.getBoundingClientRect(); comp.style.left = (r.left-w.left)+"px"; }
  comp.style.display = "block";
}

function paint(R,L){
  const cells = R.querySelectorAll(".cell");
  const t = CL(RT(L.t)), C = cap(L);
  const has = i => t[i] !== undefined && t[i] !== " " && t[i] !== "　";
  cells.forEach((c,i)=>{
    c.classList.toggle("filled", has(i));
    if(!has(i)){ c.textContent = ""; return; }
    const cl = t[i];
    if(cl.length > 1){
      c.textContent = "";
      c.appendChild(document.createTextNode(cl[0]));
      const tail = el("span","tail"); tail.textContent = cl.slice(1);
      c.appendChild(tail);
    }else{
      c.textContent = cl;
    }
  });
  const over = t.slice(C).join("");
  const ov = R.querySelector(".ovf");
  ov.textContent = over ? "＋"+over : ""; ov.style.display = over ? "" : "none";
  R.querySelector(".cnt").textContent = t.slice(0,C).filter(c=>c !== " " && c !== "　").length + "/" + C;
  R.querySelector(".pat").textContent = L.g.join("/");
}

function caret(R,L,pos){
  const cells = R.querySelectorAll(".cell");
  cells.forEach(c=>c.classList.remove("caret","end"));
  R.querySelectorAll(".grp").forEach(g=>g.classList.remove("cur"));
  if(!cells.length) return;
  const i = Math.min(pos, cells.length-1);
  cells[i].classList.add("caret");
  if(pos >= cells.length) cells[i].classList.add("end");
  const grps = R.querySelectorAll(".grp");
  const gi = groupAt(L, Math.min(pos, cells.length)).gi;
  if(grps[gi]) grps[gi].classList.add("cur");
}

/* 把输入框里的选区映射成"格子高亮"。透明输入框是单行的，原生选区高亮会沿单行画、
   和折行后的格子对不上；这里按 selectionStart/End 给区间内的格子加 .sel，高亮就永远
   跟着格子走。注意 selectionStart/End 是字符下标，要先经 charToCell 换成格子（簇）下标，
   否则遇到拗音/emoji 等多码点的格子会错位。选区为空（普通光标）时不高亮。 */
function paintSel(R){
  const io = R.querySelector(".io");
  const cells = R.querySelectorAll(".cell");
  const clusters = CL(io.value);
  const a = charToCell(clusters, io.selectionStart);
  const b = charToCell(clusters, io.selectionEnd);
  const s = Math.min(a,b), e = Math.max(a,b);
  cells.forEach((c,i)=> c.classList.toggle("sel", e > s && i >= s && i < e));
}

function redrawRow(si,li,pos){
  const R = document.querySelector('.row[data-si="'+si+'"][data-li="'+li+'"]');
  const L = state.sections[si].lines[li];
  const io = R.querySelector(".io");
  let p = pos === undefined ? charToCell(CL(io.value), io.selectionStart) : pos;   // 格子下标
  p = Math.min(p, cap(L));
  const nR = rowEl(state.sections[si], si, L, li);
  R.replaceWith(nR);
  const nio = nR.querySelector(".io");
  const charPos = cellToChar(CL(nio.value), p);
  nio.focus(); nio.setSelectionRange(charPos,charPos); nR._mark(nio.selectionStart);   // 读回真实光标
  stats(); save();
}

/* 光标所在的分句：返回 {gi 分句序号, start 该分句首格的全局序号, off 光标在分句内的位置} */
function groupAt(L,pos){
  let start = 0;
  for(let i=0;i<L.g.length;i++){
    if(pos < start + L.g[i] || i === L.g.length-1) return {gi:i, start, off:pos-start};
    start += L.g[i];
  }
  return {gi:0, start:0, off:0};
}

/* 在光标所在的分句里加 / 减一格 */
function chg(L,d,pos){
  const {gi} = groupAt(L, Math.max(0,pos|0));
  if(d > 0) L.g[gi]++;
  else if(L.g[gi] > 1) L.g[gi]--;
  else if(L.g.length > 1) L.g.splice(gi,1);
}

/* 在光标处断开分句；光标已在分句边界时则与相邻分句合并 */
function splitAt(L,pos){
  const {gi,off} = groupAt(L, Math.max(0,pos|0));
  const n = L.g[gi];
  if(off > 0 && off < n){ L.g.splice(gi,1,off,n-off); return t("toastSplitDone"); }
  if(off === 0 && gi > 0){ L.g.splice(gi-1,2,L.g[gi-1]+n); return t("toastMergedPrev"); }
  if(off >= n && gi < L.g.length-1){ L.g.splice(gi,2,n+L.g[gi+1]); return t("toastMergedNext"); }
  return null;
}

/* 整句左移 / 右移一格。格子钉死之后没法再靠退格把写偏的一句整体挪回来，
   所以单给一个操作：只挪字，词格（L.g）一格不动。
   右移要求句尾还有空格子、左移要求第一格是空的，否则就会把字挤出词格丢掉——
   这两种情况直接拦住并说明原因，绝不悄悄吞字。
   返回值：拦住了就返回提示语，挪成了返回 null。 */
function shiftLine(L,d){
  const cur = RT(L.t), cl = CL(cur);
  if(!cl.length) return t("toastShiftEmpty");
  if(d > 0){
    if(cl.length >= cap(L)) return t("toastShiftNoRoom");
    L.t = " " + cur;
  }else{
    if(cl[0] !== " ") return t("toastShiftHead");
    L.t = cl.slice(1).join("");
  }
  return null;
}

function step(si,li,d,pos){
  let s = si, l = li + d;
  while(s >= 0 && s < state.sections.length){
    const n = state.sections[s].lines.length;
    if(l >= 0 && l < n) break;
    s += d; l = d > 0 ? 0 : (state.sections[s] ? state.sections[s].lines.length-1 : -1);
  }
  if(s < 0 || s >= state.sections.length) return;
  focusRef = {si:s, li:l, pos}; restoreFocus();
}

function restoreFocus(){
  if(!focusRef) return;
  const R = document.querySelector('.row[data-si="'+focusRef.si+'"][data-li="'+focusRef.li+'"]');
  if(!R) return;
  const io = R.querySelector(".io");
  const clusters = CL(io.value);
  const p = Math.min(focusRef.pos, clusters.length);   // focusRef.pos 是格子下标
  const charPos = cellToChar(clusters, p);
  io.focus(); io.setSelectionRange(charPos,charPos); R._mark(io.selectionStart);   // 读回真实光标
}

function moveSec(si,d){
  const j = si+d; if(j<0 || j>=state.sections.length) return;
  state.sections.splice(j,0,state.sections.splice(si,1)[0]); focusRef=null; render();
}

function editPattern(pat,L){
  const inp = el("input","pat-edit"); inp.value = L.g.join(" ");
  inp.placeholder = t("patEditPlaceholder");
  pat.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = ok=>{ if(done) return; done = true;
    if(ok){ const g = parseGroups(inp.value); if(g) L.g = g; }
    focusRef = null; render(); };
  inp.onkeydown = e=>{ if(e.key === "Enter"){ e.preventDefault(); commit(true); } if(e.key === "Escape") commit(false); };
  inp.onblur = ()=>commit(true);
}

function stats(){
  let filled = 0, total = 0, over = 0, lines = 0;
  for(const sec of state.sections) for(const L of sec.lines){
    const C = cap(L), cl = CL(RT(L.t));
    total += C; filled += cl.slice(0,C).filter(c=>c !== " " && c !== "　").length; over += Math.max(0, cl.length - C); lines++;
  }
  $("#s1").textContent = filled; $("#s2").textContent = total;
  $("#s3").textContent = total ? Math.round(filled/total*100)+"%" : "0%";
  $("#s4").textContent = over; $("#s5").textContent = lines;
}

/* ================= persistence ================= */
let saveT = null;
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(()=>{ try{ localStorage.setItem("cige.v1", JSON.stringify(state)); $("#saved").textContent = t("autosavedAt", new Date().toLocaleTimeString(LOCALE[state.lang]||"zh-CN",{hour:"2-digit",minute:"2-digit"})); }catch(e){ $("#saved").textContent = t("autosaveUnavailable"); } },400);
}
function load(){
  try{ const s = localStorage.getItem("cige.v1"); if(!s) return false;
    const o = JSON.parse(s);
    if(o && Array.isArray(o.sections) && o.sections.length){ Object.assign(state,o); return true; }
  }catch(e){}
  return false;
}

/* ================= import / export ================= */
/* 桌面版（Tauri）里走系统的保存对话框；在浏览器里就还是下载。
   两种环境共用同一份代码，浏览器打开这个文件时行为和以前完全一样。 */
const TAURI = (typeof window !== "undefined" && window.__TAURI__) ? window.__TAURI__ : null;

async function download(name,text){
  if(TAURI){
    const ext = (name.split(".").pop() || "txt").toLowerCase();
    try{
      const p = await TAURI.core.invoke("save_text",{
        defaultName: name,
        filterName: ext === "json" ? t("dlgFilterProject") : t("dlgFilterText"),
        exts: [ext],
        contents: text
      });
      /* 安卓只有 content:// URI，说不出存到哪；p 为 null 才是取消。 */
      if(p !== null) toast(p ? t("toastSavedTo", p) : t("toastSaved"));
    }catch(e){ toast(t("toastSaveFail", e)); }
    return;
  }
  const b = new Blob([text],{type:"text/plain;charset=utf-8"});
  const a = el("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
/* MIDI 是二进制，不能走上面那套（save_text 用 String 存内容，非 UTF-8
   字节会被弄坏），单独走 save_binary。 */
async function downloadBinary(name, bytes){
  if(TAURI){
    try{
      const p = await TAURI.core.invoke("save_binary", {
        defaultName: name, filterName: t("dlgFilterMidi"), exts: ["mid"], contents: Array.from(bytes)
      });
      /* 安卓只有 content:// URI，说不出存到哪；p 为 null 才是取消。 */
      if(p !== null) toast(p ? t("toastSavedTo", p) : t("toastSaved"));
    }catch(e){ toast(t("toastSaveFail", e)); }
    return;
  }
  const b = new Blob([bytes], {type:"audio/midi"});
  const a = el("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function applyTxt(text){
  const { title, secs } = parseTxt(text);
  if(!secs.length){ toast(t("toastNoParse")); return; }
  if(title){ state.title = title; $("#title").value = title; }
  state.sections = secs; normAll(); focusRef = null; render();
  toast(t("toastImported", secs.length, secs.reduce((a,s)=>a+s.lines.length,0)));
}
/* ================= MIDI 导入（实验功能） =================
   约定（Studio One 里实测确认过的音符编号）：
     C0  = 24  分句断点（一句里的停顿，对应 L.g 里的一个分组）
     C#0 = 25  换句（一句结束）
     D0  = 26  换段落
   这三个 keyswitch 只是"标记"，不占格子；velocity 不看，事件存在就算数。
   其余任何 note-on（velocity>0）都算一个字/一格。三个标记跟真正唱的音符
   假定在同一条音轨里，靠音高区分，不需要专门找"哪条音轨是人声"。 */
const MIDI_KS = { 24:"sub", 25:"line", 26:"sec" };

/* 完整解析一份 Standard MIDI File，保留"改完再写回去"需要的一切：
   头信息（format/ntrks/division）+ 每条音轨的事件列表（tick 是绝对时值，
   不是相对 delta，方便后面删事件、插事件时不用操心连锁重算）。
   没有 keyswitch 的音轨会整条保留原始字节（raw），改的时候直接照抄，
   保证跟本次改动无关的部分永远跟原文件一模一样。 */
function parseMidiFile(buf){
  const dv = new DataView(buf);
  let p = 0;
  const u8 = () => dv.getUint8(p++);
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const str = n => { let s=""; for(let i=0;i<n;i++) s+=String.fromCharCode(u8()); return s; };
  const vlq = () => { let v=0,b; do{ b=u8(); v=(v<<7)|(b&0x7f); }while(b&0x80); return v>>>0; };
  const bytes = n => { const a = new Uint8Array(buf, p, n); p += n; return Array.from(a); };

  if(buf.byteLength < 14 || str(4) !== "MThd") throw new Error(t("errNotMidi"));
  const hlen = u32();
  const format = u16(), ntrks = u16(), division = u16();
  p += hlen - 6;                   // 头块理论上正好 6 字节，多出来的跳过以防万一

  const tracks = [];
  for(let ti=0; ti<ntrks; ti++){
    const trackStart = p;
    if(str(4) !== "MTrk") throw new Error(t("errNoMTrk", ti+1));
    const tlen = u32();
    const trackEnd = p + tlen;
    const events = [];
    let tick = 0, running = 0;
    while(p < trackEnd){
      tick += vlq();
      let status = u8();
      if(status < 0x80){ p--; status = running; }               // running status：这个字节其实是数据
      else if(status !== 0xFF && status !== 0xF0 && status !== 0xF7) running = status;
      else running = 0;                                          // meta/sysex 之后不能沿用 running status
      // 注意：不能写成 `p += vlq()`——vlq() 内部会通过 u8() 副作用推进 p，
      // 复合赋值的左值却是在算 RHS 之前就取好的旧 p，两个改动会互相打架、
      // 把刚读掉的变长字节又“吐”回去，导致后面全错位。必须分两步。
      if(status === 0xFF){
        const metaType = u8(); const len = vlq(); const data = bytes(len);
        events.push({tick, kind:"meta", metaType, data});
      }else if(status === 0xF0 || status === 0xF7){
        const len = vlq(); const data = bytes(len);
        events.push({tick, kind:"sysex", status, data});
      }else{
        const hi = status & 0xF0;
        const data = bytes((hi===0xC0||hi===0xD0) ? 1 : 2);
        events.push({tick, kind:"channel", status, data});
      }
    }
    const raw = new Uint8Array(buf, trackStart, p - trackStart);   // 这条音轨的原始字节（含 MTrk 头）
    tracks.push({raw, events});
    p = trackEnd;
  }
  return {format, ntrks, division, tracks};
}

/* 把所有音轨的 note-on（velocity>0）事件合并、按 tick 排序，返回
   [{tick, note}, ...]（这里也包含 keyswitch 本身，识别哪个是 keyswitch
   由调用方按音高判断）。 */
function collectNoteOns(parsed){
  const notes = [];
  for(const trk of parsed.tracks) for(const e of trk.events)
    if(e.kind === "channel" && (e.status & 0xF0) === 0x90 && e.data[1] > 0)
      notes.push({tick: e.tick, note: e.data[0]});
  notes.sort((a,b)=>a.tick-b.tick);
  return notes;
}

/* 把按时间排好序的 note 事件切成 段落 → 句 → 分句：
   遇到 D0/C#0/C0 就把"刚刚攒的这几个音符"收成一个分句/句/段落，
   两个 keyswitch 之间一个音符都没有就跳过、不生成空分句/空句/空段落。 */
function midiNotesToSections(notes){
  const sections = [];
  let curSec = null, curG = [], count = 0, secN = 0;
  const ensureSec = () => { if(!curSec){ secN++; curSec = {name:t("autoSectionName", secN), lines:[]}; } };
  const endGroup = () => { if(count > 0){ curG.push(count); count = 0; } };
  const endLine = () => { endGroup(); if(curG.length){ ensureSec(); curSec.lines.push(newLine(curG)); } curG = []; };
  const endSection = () => { endLine(); if(curSec && curSec.lines.length) sections.push(curSec); curSec = null; };

  for(const {note} of notes){
    const ks = MIDI_KS[note];
    if(ks === "sec") endSection();
    else if(ks === "line") endLine();
    else if(ks === "sub") endGroup();
    else count++;
  }
  endSection();   // 文件末尾兜底：最后一段没有 D0 收尾也要算数
  return sections;
}

/* 当前导入的 MIDI 原始结构，供后面「导出」用；只放在内存里，不进 state、
   不进工程文件、也不写 localStorage——刷新页面或者切换工程就没了，
   到时候需要导出的话重新导入一次 MIDI 即可。 */
let midiImport = null;

function applyMidi(buf){
  let parsed, notes, secs;
  try{
    parsed = parseMidiFile(buf);
    notes = collectNoteOns(parsed);
    secs = midiNotesToSections(notes);
  }catch(e){ toast(t("toastMidiParseFail", e.message)); return; }
  if(!secs.length){ toast(t("toastMidiNoStructure")); return; }
  /* 整份文件一个 keyswitch 都没有：所有音符会挤成一句，导进来还得自己一句句
     切开。先把话说清楚再让人决定，免得白导一次、还把当前内容顶掉。 */
  if(!notes.some(n => MIDI_KS[n.note]) && !confirm(t("confirmMidiNoKs", notes.length))) return;
  midiImport = {parsed, notes};
  state.sections = secs; normAll(); focusRef = null; render();
  toast(t("toastMidiImported", secs.length, secs.reduce((a,s)=>a+s.lines.length,0)));
}

/* ---- MIDI 导出：纯净版 / 带歌词版 ---- */

/* 变长时值编码（vlq 解码的反过程） */
function vlqEncode(v){
  const b = [v & 0x7f]; v = v >>> 7;
  while(v > 0){ b.unshift((v & 0x7f) | 0x80); v = v >>> 7; }
  return b;
}

/* 哪几条音轨含 keyswitch（正常应该只有一条，人声和 keyswitch 混在一起）。 */
function keyswitchTrackIndices(parsed){
  const idx = [];
  parsed.tracks.forEach((trk,i)=>{
    if(trk.events.some(e => e.kind==="channel" && (e.status&0xF0)===0x90 && e.data[1]>0 && MIDI_KS[e.data[0]] !== undefined)) idx.push(i);
  });
  return idx;
}

/* 去掉一条音轨事件列表里 keyswitch 的 note-on/note-off 配对，其余原样保留。 */
function stripKeyswitch(events){
  const out = [], held = new Set();
  for(const e of events){
    if(e.kind === "channel"){
      const hi = e.status & 0xF0, note = e.data[0];
      if(hi === 0x90 && e.data[1] > 0 && MIDI_KS[note] !== undefined){ held.add(note); continue; }
      if(held.has(note) && (hi === 0x80 || (hi === 0x90 && e.data[1] === 0))){ held.delete(note); continue; }
    }
    out.push(e);
  }
  return out;
}

/* 把一条音轨的事件列表重新序列化成 MTrk 字节块。永远写完整的 status byte、
   不用 running status——这只是个可选的省字节技巧，写不写都是合法文件，
   不写更简单也更不容易出错。events 必须已经按 tick 排好序，且已经包含
   原有的 End of Track（0xFF 0x2F）事件，不用另外补一个。 */
function serializeTrack(events){
  const body = [];
  let prevTick = 0;
  for(const e of events){
    body.push(...vlqEncode(e.tick - prevTick));
    prevTick = e.tick;
    if(e.kind === "meta") body.push(0xFF, e.metaType, ...vlqEncode(e.data.length), ...e.data);
    else if(e.kind === "sysex") body.push(e.status, ...vlqEncode(e.data.length), ...e.data);
    else body.push(e.status, ...e.data);
  }
  const head = [0x4D,0x54,0x72,0x6B, (body.length>>>24)&0xff,(body.length>>>16)&0xff,(body.length>>>8)&0xff,body.length&0xff];
  return new Uint8Array([...head, ...body]);
}

function serializeMidiFile(parsed, trackBytesList){
  const head = [
    0x4D,0x54,0x68,0x64, 0,0,0,6,
    (parsed.format>>>8)&0xff, parsed.format&0xff,
    (parsed.ntrks>>>8)&0xff, parsed.ntrks&0xff,
    (parsed.division>>>8)&0xff, parsed.division&0xff,
  ];
  let total = head.length;
  for(const t of trackBytesList) total += t.length;
  const out = new Uint8Array(total);
  out.set(head, 0);
  let off = head.length;
  for(const t of trackBytesList){ out.set(t, off); off += t.length; }
  return out;
}

/* 纯净导出：把含 keyswitch 的音轨重新序列化去掉 keyswitch，其余音轨原始
   字节直接照抄。返回 null 表示这次会话里还没导入过 MIDI。 */
function buildCleanMidi(){
  if(!midiImport) return null;
  const { parsed } = midiImport;
  const ks = new Set(keyswitchTrackIndices(parsed));
  const trackBytesList = parsed.tracks.map((trk,i)=> ks.has(i) ? serializeTrack(stripKeyswitch(trk.events)) : trk.raw);
  return serializeMidiFile(parsed, trackBytesList);
}

/* 逐句 / 逐分句比对当前词格和这次导入的 MIDI 是否还对得上（万一导入之后
   手动加减过格子/句/段，就会跟 MIDI 对不上，带歌词导出必须先拦住这种
   情况，不然歌词会对错位）。完全一致返回 null，否则返回哪里不对的说明。 */
function midiMismatch(){
  if(!midiImport) return t("toastNoMidiForCheck");
  const a = state.sections, b = midiNotesToSections(midiImport.notes);
  if(a.length !== b.length) return t("toastSecCountMismatch", a.length, b.length);
  for(let si=0; si<a.length; si++){
    const la = a[si].lines, lb = b[si].lines;
    if(la.length !== lb.length) return t("toastLineCountMismatch", si+1, a[si].name, la.length, lb.length);
    for(let li=0; li<la.length; li++){
      const ga = la[li].g, gb = lb[li].g;
      if(ga.length !== gb.length || ga.some((n,i)=>n !== gb[i]))
        return t("toastPatternMismatch", si+1, a[si].name, li+1, ga.join("/"), gb.join("/"));
    }
  }
  return null;
}

/* 按 段落→句→格子 的顺序摊平成一串字符（拗音按 CL 算一格，跟格子计数
   规则完全一致），用来跟 MIDI 里"演唱音符"的先后顺序一一对应。 */
function flattenChars(){
  const out = [];
  for(const sec of state.sections) for(const L of sec.lines){
    const cl = CL(RT(L.t)), C = cap(L);
    for(let i=0;i<C;i++){ const c = cl[i]; out.push(c !== undefined && c !== " " && c !== "　" ? c : ""); }
  }
  return out;
}

/* 带歌词导出：先做逐句校验，通不过就直接报错、不生成文件。通过之后，
   在去掉 keyswitch 的同时，往每个"演唱音符"的同一个 tick 上插一个
   Lyric meta event（0xFF 0x05，UTF-8 文本），跟导入时的顺序完全对应。 */
function buildLyricMidi(){
  const mismatch = midiMismatch();
  if(mismatch) return { error: mismatch };
  const { parsed, notes } = midiImport;
  const chars = flattenChars();
  const sungCount = notes.filter(n => MIDI_KS[n.note] === undefined).length;
  if(chars.length !== sungCount) return { error: t("toastInternalCountMismatch") };

  const ks = new Set(keyswitchTrackIndices(parsed));
  const enc = new TextEncoder();
  const trackBytesList = parsed.tracks.map((trk,i)=>{
    if(!ks.has(i)) return trk.raw;
    const cleaned = stripKeyswitch(trk.events);
    const withLyrics = [];
    let ci = 0;
    for(const e of cleaned){
      if(e.kind === "channel" && (e.status & 0xF0) === 0x90 && e.data[1] > 0){
        withLyrics.push({tick: e.tick, kind:"meta", metaType:0x05, data: Array.from(enc.encode(chars[ci++] || ""))});
      }
      withLyrics.push(e);
    }
    withLyrics.sort((x,y)=>x.tick-y.tick);   // 稳定排序：同一 tick 上歌词事件仍排在它对应的 note-on 前面
    return serializeTrack(withLyrics);
  });
  return { bytes: serializeMidiFile(parsed, trackBytesList) };
}

function applyJson(text){
  try{ const o = JSON.parse(text);
    if(!o.sections || !Array.isArray(o.sections)) throw 0;
    state.title = o.title || t("untitled"); state.sections = o.sections;
    if(o.exp) state.exp = {alts:!!o.exp.alts, note:!!o.exp.note};
    normAll();
    $("#title").value = state.title; focusRef = null; render(); toast(t("toastProjectOpened"));
  }catch(e){ toast(t("toastInvalidProject")); }
}
/* 按文件名或内容自动判断是工程还是词格 */
function applyText(name, text){
  if(/\.json$/i.test(name || "") || /^\s*\{/.test(text)) applyJson(text); else applyTxt(text);
}
function readFile(f){
  if(/^image\//.test(f.type || "") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name)){ loadBgImage(f); return; }
  const r = new FileReader();
  r.onload = ()=>applyText(f.name, String(r.result));
  r.readAsText(f,"utf-8");
}

function pick(accept){ const f = $("#file"); f.accept = accept; f.value = ""; f.click(); }

/* 打开文件：桌面版走系统原生对话框，浏览器里退回 <input type=file> */
async function openText(kind){
  if(TAURI){
    try{
      const r = await TAURI.core.invoke("open_text", kind === "json"
        ? {filterName:t("dlgFilterProject"), exts:["json"]}
        : {filterName:t("dlgFilterLyricsPattern"), exts:["txt","md"]});
      if(r) applyText(r.name, r.contents);
    }catch(e){ toast(t("toastOpenFail", e)); }
    return;
  }
  pick(kind === "json" ? ".json" : ".txt,.md");
}
/* MIDI 是二进制，跟文本导入分开走一套：桌面版调新的 open_binary 命令，
   浏览器版用另一个隐藏的 <input type=file>（accept 已经锁定 .mid/.midi，
   不需要像文本那样跑时再切换 accept）。 */
async function openMidi(){
  if(TAURI){
    try{
      const bytes = await TAURI.core.invoke("open_binary", {filterName:t("dlgFilterMidi"), exts:["mid","midi"]});
      if(bytes) applyMidi(new Uint8Array(bytes).buffer);
    }catch(e){ toast(t("toastOpenFail", e)); }
    return;
  }
  const f = $("#filemidi"); f.value = ""; f.click();
}
$("#imp").onclick  = ()=>openText("txt");
$("#impj").onclick = ()=>openText("json");
$("#impm").onclick = openMidi;
$("#file").onchange = e=>{ const f = e.target.files[0]; if(f) readFile(f); };
$("#filemidi").onchange = e=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onerror = ()=>toast(t("toastFileUnreadable"));
  r.onload = ()=>applyMidi(r.result);
  r.readAsArrayBuffer(f);
};
$("#expP").onclick = ()=>download(state.title+t("fnPattern"), patTxt());
$("#expJ").onclick = ()=>{
  const o = Object.assign({}, state); delete o.bg;   // 背景是本机偏好，不写进工程
  download(state.title+t("fnProjectExt"), JSON.stringify(o,null,2));
};
$("#expMc").onclick = ()=>{
  const bytes = buildCleanMidi();
  if(!bytes){ toast(t("toastNoMidiSession")); return; }
  downloadBinary(state.title + t("fnMidiClean"), bytes);
};
$("#expMl").onclick = ()=>{
  const r = buildLyricMidi();
  if(r.error){ toast(r.error); return; }
  downloadBinary(state.title + t("fnMidiLyric"), r.bytes);
};

/* ---- 导出歌词：勾选对话框 ---- */
function expOpts(){ return {alts: $("#ck1").checked, note: $("#ck2").checked}; }
function expPreview(){
  const o = expOpts();
  state.exp = o; save();
  const sec = state.sections[0];
  let txt = sec ? "["+sec.name+"]\n" + sec.lines.slice(0,6).map(L=>lineOut(L,o) || t("expEmptyLine")).join("\n") : t("expEmptyAll");
  const n = state.sections.reduce((a,s)=>a+s.lines.filter(L=>L.alts.filter(x=>x!==RT(L.t)).length).length,0);
  const m = state.sections.reduce((a,s)=>a+s.lines.filter(L=>L.note).length,0);
  $("#expPrev").textContent = t("expPreviewLabel") + "\n\n" + txt
    + "\n\n———\n" + t("expSummary", n, m);
}
$("#expL").onclick = ()=>{
  $("#ck1").checked = !!(state.exp && state.exp.alts);
  $("#ck2").checked = !!(state.exp && state.exp.note);
  expPreview(); $("#exp").classList.add("show");
};
$("#ck1").onchange = expPreview;
$("#ck2").onchange = expPreview;
$("#expNo").onclick = ()=>$("#exp").classList.remove("show");
$("#exp").onclick = e=>{ if(e.target.id === "exp") $("#exp").classList.remove("show"); };
$("#expGo").onclick = ()=>{
  const o = expOpts();
  const tag = (o.alts ? t("fnTagAlts") : "") + (o.note ? t("fnTagNote") : "");
  download(state.title + t("fnLyricBase") + tag + ".txt", lyrTxt(o));
  $("#exp").classList.remove("show");
};

/* ================= toolbar ================= */
$("#title").oninput = ()=>{ state.title = $("#title").value; document.title = state.title + " · " + t("brand"); save(); };
$("#big").onclick   = ()=>setCell(state.cell+4);
$("#small").onclick = ()=>setCell(state.cell-4);
function setCell(v){ state.cell = Math.max(28,Math.min(72,v)); document.documentElement.style.setProperty("--cell",state.cell+"px"); save(); }
/* ================= 背景 =================
   背景是个人偏好，只存在这台电脑上：
   设置项跟着 state 走，图片本身单独存一个 localStorage 键。
   分开存是为了万一图片撑爆配额，歌词的自动保存不会跟着一起失败。 */
let bgImg = "";
try{ bgImg = localStorage.getItem("cige.bg") || ""; }catch(e){}

/* ---------- 主题色（换色调） ---------- */
const ACCENTS = [
  { id:"auto",   dark:"#e0a83f", paper:"#a8632a" },   // 原版配色
  { id:"blue",   dark:"#5ab4d8", paper:"#3389D1" },
  { id:"green",  dark:"#7fbf8e", paper:"#3e7d4f" },
  { id:"violet", dark:"#b39ddb", paper:"#6a4fa3" },
  { id:"rose",   dark:"#e08a97", paper:"#b5485d" },
  { id:"cyan",   dark:"#6fd6c8", paper:"#2a8f85" },
  { id:"orange", dark:"#f0a35e", paper:"#c96f1f" },
  { id:"slate",  dark:"#9aa7b5", paper:"#5a6673" },
  { id:"red",    dark:"#e06655", paper:"#b03a2e" },
];

function applyAccent(){
  const a = state.accent;
  if(a && a !== "auto" && ACCENTS.some(x => x.id === a)) document.documentElement.dataset.accent = a;
  else delete document.documentElement.dataset.accent;   // auto：走主题自带配色
}

function syncAccentPanel(){
  const box = $("#accrow");
  if(!box.children.length){
    ACCENTS.forEach(a=>{
      const b = el("button","swatch");
      b.title = t("accentName", a.id);
      b.dataset.acc = a.id;
      b.onclick = ()=>{ state.accent = a.id; applyAccent(); syncAccentPanel(); save(); };
      box.appendChild(b);
    });
  }
  const isPaper = state.theme === "paper";   // dark/paper 各一档，底色换档时跟着重刷
  box.querySelectorAll(".swatch").forEach(b=>{
    const a = ACCENTS.find(x => x.id === (b.dataset.acc || "auto"));
    b.style.background = isPaper ? a.paper : a.dark;
    b.classList.toggle("on", (b.dataset.acc || "auto") === (state.accent || "auto"));
    b.style.outline = b.classList.contains("on") ? "2px solid var(--accent)" : "";
    b.style.outlineOffset = "2px";
  });
}


function saveBg(){
  try{
    if(bgImg) localStorage.setItem("cige.bg", bgImg);
    else localStorage.removeItem("cige.bg");
  }catch(e){ toast(t("toastImgTooBig")); }
}

function applyBg(){
  const b = state.bg, root = document.documentElement;
  const img = $("#bgimg"), mask = $("#bgmask");
  root.dataset.theme = state.theme;
  if(b.mode === "image" && bgImg){
    img.style.backgroundImage = 'url("' + bgImg + '")';
    img.style.backgroundColor = "";
    img.style.filter = b.blur ? "blur(" + b.blur + "px)" : "";
    img.style.transform = b.blur ? "scale(1.1)" : "";   // 放大一点，盖住模糊后的透明边
    mask.style.display = ""; mask.style.opacity = b.dim;
    root.classList.add("has-bg");
  }else if(b.mode === "color"){
    img.style.backgroundImage = "none";
    img.style.backgroundColor = b.color;
    img.style.filter = ""; img.style.transform = "";
    mask.style.display = "none";
    root.classList.add("has-bg");
  }else{
    img.style.backgroundImage = "none";
    img.style.backgroundColor = "";
    img.style.filter = ""; img.style.transform = "";
    mask.style.display = "none";
    root.classList.remove("has-bg");
  }
}

/* 颜色的相对亮度，用来决定配深色还是浅色的字 */
function lum(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if(!m) return 0;
  const n = parseInt(m[1],16), f = v=>{ v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
  return .2126*f(n>>16&255) + .7152*f(n>>8&255) + .0722*f(n&255);
}

const SWATCH = ["#12100e","#1b2430","#24201a","#2b2430","#e9e2d3","#f0ece1","#dfe6e3","#f5e6d3"];

function syncBgPanel(){
  const b = state.bg;
  $("#bgcolor").value = b.color;
  $("#bgdim").value  = Math.round(b.dim*100);  $("#bgdimv").textContent  = Math.round(b.dim*100) + "%";
  $("#bgblur").value = b.blur;                 $("#bgblurv").textContent = b.blur + " px";
  $("#bgadj").style.display = (b.mode === "image" && bgImg) ? "" : "none";
  const th = $("#bgthumb");
  if(b.mode === "image" && bgImg){ th.style.display = "block"; th.style.backgroundImage = 'url("' + bgImg + '")'; }
  else th.style.display = "none";
  $("#bgp").querySelectorAll(".pre").forEach(p=>p.classList.toggle("on", p.dataset.th === state.theme));
}

function setBgColor(c){
  state.bg.color = c; state.bg.mode = "color";
  state.theme = lum(c) > .5 ? "paper" : "dark";   // 亮底自动配深色字，反之亦然
  applyBg(); syncBgPanel(); save();
}

function loadBgImage(file){
  if(!file || !/^image\//.test(file.type || "")){ toast(t("toastNotImage")); return; }
  const fr = new FileReader();
  fr.onerror = ()=>toast(t("toastFileUnreadable"));
  fr.onload = ()=>{
    const im = new Image();
    im.onerror = ()=>toast(t("toastImageUnopenable"));
    im.onload = ()=>{
      const MAX = 1920;
      const s = Math.min(1, MAX / Math.max(im.width, im.height));
      const w = Math.max(1,Math.round(im.width*s)), h = Math.max(1,Math.round(im.height*s));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(im,0,0,w,h);
      let uri = cv.toDataURL("image/jpeg", .82);
      if(uri.length > 2.6e6) uri = cv.toDataURL("image/jpeg", .6);   // 还是太大就再压一档
      bgImg = uri; state.bg.mode = "image";
      applyBg(); saveBg(); save(); syncBgPanel();
      toast(t("toastBgChanged", w, h, Math.round(uri.length/1365)));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}

$("#bgb").onclick = ()=>{ syncBgPanel(); syncAccentPanel(); $("#bgp").classList.add("show"); };
$("#bgok").onclick = ()=>$("#bgp").classList.remove("show");
$("#bgp").onclick = e=>{ if(e.target.id === "bgp") $("#bgp").classList.remove("show"); };
$("#bgp").querySelectorAll(".pre").forEach(p=>{
  p.onclick = ()=>{ state.theme = p.dataset.th; applyBg(); syncBgPanel(); syncAccentPanel(); save(); };   // 底色换档时刷新色板（dark/paper 各一档颜色）
});
$("#bgcolor").oninput = e=>setBgColor(e.target.value);
$("#bgpick").onclick = ()=>pick("image/*");
$("#bgnone").onclick = ()=>{
  state.bg.mode = "none"; bgImg = "";
  applyBg(); saveBg(); save(); syncBgPanel(); toast(t("toastBgReset"));
};
$("#bgdim").oninput  = e=>{ state.bg.dim  = +e.target.value/100; $("#bgdimv").textContent  = e.target.value + "%"; applyBg(); save(); };
$("#bgblur").oninput = e=>{ state.bg.blur = +e.target.value;     $("#bgblurv").textContent = e.target.value + " px"; applyBg(); save(); };

(function(){
  const box = $("#bgswatch");
  SWATCH.forEach(c=>{
    const b = el("button","swatch"); b.style.background = c; b.title = c;
    b.onclick = ()=>setBgColor(c);
    box.appendChild(b);
  });
})();
$("#new").onclick = ()=>{ if(!confirm(t("confirmNew"))) return;
  state.title = t("untitled"); state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); $("#title").value = state.title; focusRef=null; render(); };
$("#helpb").onclick = ()=>$("#help").classList.add("show");
$("#helpClose").onclick = ()=>$("#help").classList.remove("show");
$("#help").onclick = e=>{ if(e.target.id === "help") $("#help").classList.remove("show"); };
addEventListener("keydown",e=>{ if(e.key === "Escape"){ $("#help").classList.remove("show"); $("#exp").classList.remove("show"); $("#bgp").classList.remove("show"); if(window.aiClosePanel) aiClosePanel(); closeAllMenus(); } });
$("#reflow").onclick = ()=>{
  let moved = 0;
  for(const sec of state.sections){
    for(let i=0;i<sec.lines.length;i++){
      const L = sec.lines[i], C = cap(L), chars = [...RT(L.t)];
      if(chars.length > C){
        const over = chars.slice(C).join(""); L.t = RT(chars.slice(0,C).join("")); moved += over.length;
        if(i+1 < sec.lines.length) sec.lines[i+1].t = over + sec.lines[i+1].t.replace(/^ +/,"");
        else { const nl = newLine([over.length]); nl.t = over; sec.lines.push(nl); }
      }
    }
  }
  focusRef = null; render(); toast(moved ? t("toastReflowed", moved) : t("toastNoOverflow"));
};

let tT = null;
function toast(m){ const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(()=>t.classList.remove("show"),2200); }

/* drag & drop */
let dc = 0;
addEventListener("dragenter",e=>{ e.preventDefault(); if(++dc) $("#drop").classList.add("show"); });
addEventListener("dragover",e=>e.preventDefault());
addEventListener("dragleave",()=>{ if(--dc <= 0){ dc = 0; $("#drop").classList.remove("show"); } });
addEventListener("drop",e=>{ e.preventDefault(); dc = 0; $("#drop").classList.remove("show");
  const f = e.dataTransfer.files[0]; if(f) readFile(f); });

/* ================= 头部下拉菜单（导入/导出/语言） =================
   触发按钮点一下切换显示，点菜单里任意按钮或点菜单外任何地方都收起来，
   Escape 也收起（跟已有的 help/exp/bgp 弹窗共用下面那个 Escape 监听）。 */
function closeAllMenus(){
  document.querySelectorAll(".menu.show").forEach(m=>m.classList.remove("show"));
  document.querySelectorAll(".menubtn.open").forEach(b=>b.classList.remove("open"));
}
/* 展开后按实际视口位置纠偏：默认贴触发按钮左边，超出视口右边界就往左挪，
   挪完万一又顶到左边界（窄屏、菜单本身比可用空间宽）就贴住左边界，不强求
   贴合按钮位置——总之保证菜单整个都在视口里，不会有一截看不见点不到。 */
function positionMenu(menu){
  menu.style.left = "0px";
  const pad = 8;
  const r = menu.getBoundingClientRect();
  const overflowRight = r.right - (innerWidth - pad);
  if(overflowRight > 0) menu.style.left = (-overflowRight) + "px";
  const r2 = menu.getBoundingClientRect();
  if(r2.left < pad) menu.style.left = (parseFloat(menu.style.left) + (pad - r2.left)) + "px";
}
function initMenu(btnSel, menuSel){
  const btn = $(btnSel), menu = $(menuSel);
  btn.onclick = e=>{
    e.stopPropagation();
    const willOpen = !menu.classList.contains("show");
    closeAllMenus();
    if(willOpen){ menu.classList.add("show"); btn.classList.add("open"); positionMenu(menu); }
  };
  menu.addEventListener("click", e=>{ if(e.target.closest("button")) closeAllMenus(); });
}
initMenu("#impBtn", "#impMenu");
initMenu("#expBtn", "#expMenu");
initMenu("#langBtn", "#langMenu");
addEventListener("click", closeAllMenus);

/* ================= 语言切换 ================= */
$("#langMenu").querySelectorAll("button[data-lang]").forEach(b=>{
  b.onclick = ()=>{
    // 标题还是各语言默认的"未命名"占位符时（用户没自己改过），跟着语言一起换；
    // 已经自己写了标题的话就不去动它。
    const wasDefaultTitle = Object.values(I18N).some(d => d.untitled === state.title);
    state.lang = b.dataset.lang;
    if(wasDefaultTitle) state.title = t("untitled");
    $("#title").value = state.title;
    applyI18n(); render(); save();
  };
});

/* ================= boot ================= */
load();
if(!state.exp) state.exp = {alts:false, note:false};
normAll();
if(!state.bg) state.bg = {mode:"none", color:"#1a1614", dim:.55, blur:0};
if(state.bg.mode === "image" && !bgImg) state.bg.mode = "none";   // 图片没存住就退回默认
if(!I18N[state.lang]) state.lang = "zh";
// 词格很长的一句在手机窄屏上，默认 44px 一格很容易比屏幕还宽，把整个页面撑出横向滚动。
// 没动过字号（还是出厂默认 44）又赶上窄屏，就先给个更适配的默认值；已经自己调过大小的
// 不去动它——A−/A+ 存下来的选择要一直尊重。
if(state.cell === 44 && innerWidth < 480) state.cell = 32;
if(!state.accent || !["auto","blue","green","violet","rose","cyan","orange","slate","red"].includes(state.accent)) state.accent = "auto";
applyBg();
applyAccent();
// 顶栏和帮助面板里的图标直接复用 <link rel="icon"> 那份 base64，不再多存一份
{ const ico = document.querySelector('link[rel="icon"]');
  if(ico) document.querySelectorAll("img.logo").forEach(im=>{ im.src = ico.href; }); }
applyI18n();
$("#title").value = state.title;
setCell(state.cell);
aiBind();          // AI 填词面板（ai.js）：绑定事件、面板显隐、按钮
aiInjectHelp();    // 帮助面板末尾追加 AI 使用说明
render();
