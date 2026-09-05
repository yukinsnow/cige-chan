import { reactive } from 'vue';
import { state, redraw } from './core/state.js';
import { cap, CL, RT } from './core/clusters.js';
import { t, LOCALE } from './i18n/index.js';
import { save } from './core/persist.js';
import { $, el } from './ui/dom.js';
import { toast } from './ui/toast.js';

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
const aiCfg = reactive({ baseUrl: "", apiKey: "", model: "", style: "", maxTokens: 3000, temperature: 0.9, scope: "all", agreed: false });
try{
  const s = localStorage.getItem(AI_STORE_KEY);
  if(s){ const o = JSON.parse(s); if(o && typeof o === "object") Object.assign(aiCfg, o); }
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
const aiUi = reactive({ busy:false, shown:false, testing:false, done:0, total:0, msg:"", stopping:false, log:[] });
let aiAbort = null;          // { cancelled, ctrl:AbortController }



function aiSetBusy(b){
  aiUi.busy = b;
  aiUi.stopping = !!(aiAbort && aiAbort.cancelled);
}
function aiSetProgress(done, total, msg){
  aiUi.done = done; aiUi.total = total; aiUi.msg = msg || "";
}
function aiStop(){
  if(!aiUi.busy || !aiAbort || aiAbort.cancelled) return;
  aiAbort.cancelled = true;
  try{ aiAbort.ctrl.abort(); }catch(e){}
  aiUi.stopping = true;
  aiSetProgress(aiUi.done, aiUi.total, t("aiStopping"));
}

async function aiRunAll(mode){
  if(aiUi.busy) return;
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
  aiUi.done = 0; aiUi.total = mode === "fill" ? todo.length : Math.max(todo.length, 1);
  aiSetProgress(0, aiUi.total, mode === "fill" ? t("aiWorkingFill") : t("aiWorkingCheck"));
  const startedAt = Date.now();
  let ok = 0, skip = 0, stopped = false, notes = [];
  try{
    if(mode === "fill"){
      for(const item of todo){
        if(aiAbort.cancelled){ stopped = true; break; }
        aiSetProgress(aiUi.done, aiUi.total, t("aiProgress", item.si + 1, item.li + 1));
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
        aiUi.done++;
        redraw();
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
      aiUi.total = Math.max(sug.length, 1);
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
      redraw();
    }
  }catch(e){
    if(e.aiAborted) stopped = true;
    else toast(t("aiToastFail", e.message));
  }finally{
    aiAbort = null;
    aiSetBusy(false);
    redraw();
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    let summary;
    if(stopped) summary = t("aiDoneStopped", ok, skip, secs);
    else summary = mode === "fill" ? t("aiDoneFill", ok, skip, secs) : t("aiDoneCheck", ok, skip, secs);
    aiSetProgress(aiUi.done, aiUi.total, summary);
    if(notes.length){
      aiLog(summary + "\n" + notes.join("\n"));
      toast(t("aiToastSeeLog"));
    }else{
      aiLog(summary);
      toast(summary);
    }
    save();
  }
}

/* ---------- 测试连接 ---------- */
async function aiTest(){
  if(aiUi.busy) return;
  if(!aiNormBase(aiCfg.baseUrl) || !aiCfg.apiKey || !aiCfg.model){
    aiOpenPanel();
    toast(t("aiToastNeedCfg"));
    return;
  }
  aiUi.testing = true;
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
    aiUi.testing = false;
  }
}

/* ---------- 运行日志 ---------- */
function aiLog(msg){
  const stamp = new Date().toLocaleTimeString(LOCALE[state.lang] || "zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  aiUi.log.unshift("[" + stamp + "] " + msg);
  if(aiUi.log.length > 40) aiUi.log.length = 40;
}
function aiOpenPanel(){ aiUi.shown = true; }
/* 运行中允许关面板：每句填完即已写入工程，不会丢；顶栏按钮亮着运行指示灯，
   随时点开回来看进度或停止——比把用户锁在面板上更合理。 */
function aiClosePanel(){ if(!aiUi.busy) aiUi.shown = false; }

export { aiCfg, aiUi, aiOpenPanel, aiClosePanel, aiRunAll, aiTest, aiStop, aiPendingLines, aiSaveCfg };
