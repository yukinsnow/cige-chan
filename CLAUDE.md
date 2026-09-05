# CLAUDE.md

词格酱（cige-chan）是一个基于 Tauri + Vue + Vite 开发的词格逐字填词中文歌词写作台。

Vibe Coding 是该项目的主要开发方式，由于项目贡献者逐渐增多，考虑到后续发展与重构，特编写此文件详细阐述本项目情况与规范。

## 注释

默认不写。命名清楚的常规代码不需要注释。

只有四类值得写，其余一律不写：

- 反直觉的约束。代码看着像能简化或换掉，其实不能。
- 外部契约。从代码里推不出来的外部约定。
- 陷阱。不按这个前提或顺序写就会出错。
- 已知限制。故意不处理的情况，写清楚免得被当 bug「修」。

不属于这四类的信息不是不要，是放错了地方：

| 内容 | 该去哪 |
|---|---|
| 复述代码在做什么 | 删掉 |
| 项目架构、模块职责 | CLAUDE.md |
| 路线图、下一步计划 | 计划文档或 issue |
| 「以前是 X 现在改成 Y」 | commit message |

要写就短，像 IM 里说一句话，不要写成段落：

```js
// 这里得先 normAll 否则 render 会拿到空 lines
// midi keyswitch 不占格子 velocity 不看
```

修注释的办法通常是改写，不是删掉。反面，它把改动过程叙述了一遍：

```js
/* 一整句都还没填时以前输出空串，而空行在 parseTxt 里是段落分隔符：导出再
   导入会在这里断成两段，格数也丢了。退回词格的 XXXX 写法，PH_RE 认得。 */
if(!s) s = L.g.map(n=>"X".repeat(n)).join(" ");
```

正面，同样的知识一行说完：

```js
// 空行在 parseTxt 里是段落分隔符 整句未填必须退回 XXXX 否则导入时会断段
if(!s) s = L.g.map(n=>"X".repeat(n)).join(" ");
```

反过来，这种即使长也要留，它拦的是一个具体的错误改法：

```js
/* 拗音（きゃ）和半角浊点（ﾃﾞ）在 Unicode 里是两个独立字素簇，
   Intl.Segmenter 不会合并，而词格要求它们共占一格。别换。 */
function CL(s){
```

判据是信息量，不是长度。领域知识该留就留，废话一行都不要。

一个文件里注释语言统一，默认中文。keyswitch、grapheme 这类术语直接用英文。

## Commit

`type: 中文简述`，type 用 feat / fix / refactor / chore / docs / test。

改动小就只写标题，不必凑要点列表。需要正文时说清为什么这么改，不复述改了什么，也不罗列文件清单，git 有。

## 结构

```
index.html          Vite 入口，只有骨架和挂载点
src/main.js         导入导出 IO 与启动
src/ai.js           AI 填词，纯逻辑不碰 DOM
src/core/           纯逻辑，不碰 DOM
  clusters.js       格子切分与字符/格子索引换算
  state.js          工程数据模型
  txt.js            词格 TXT 与歌词文本的解析和导出
  midi.js           MIDI 解析与序列化
  theme.js          底色、主题色、背景图
  persist.js        localStorage 存取
src/components/     Vue 组件，App.vue 是根
src/i18n/index.js   给出 t()，文案本体在 public/i18n/
src/ui/             DOM 小工具、toast、菜单、弹层开关
src/platform/       平台差异，桌面走 Tauri 浏览器退回原生
public/             原样拷进产物，favicon、宣传页、i18n 文案
src-tauri/          Rust，只做 Web 做不到的事
tests/              node 直接跑，没有测试框架
```

词格本体（WordGrid.vue）是命令式渲染，render() 往 #doc 里写 DOM，不是模板。外部改了整篇（导入、AI 填词、切语言）调 redraw() 递增 ui.rev 触发重画。

加一种界面语言：在 public/i18n/ 放一个 JSON，再把语言代码加进同目录的 index.json。都是数据文件，改完刷新就生效，不用重新构建。文件里 _name 是菜单显示名，_locale 给 toLocaleString，_order 决定菜单顺序；带变量的文案用 {0} {1} 占位，accentName 那种查表型直接写成嵌套对象。

文案是 fetch 回来的，所以 boot() 是 async，挂载必须在 await loadLocales() 之后。tests/ 拿 node 直接跑、没有相对路径的 fetch，用 install() 把文案读进去。

## 代码

这是个客户端工具，不是纯网页。浏览器和 webview 自带的东西——右键菜单、tooltip、滚动条、滑块、下拉、对话框、window 装饰——外观都由系统决定，混在自己的界面里一眼就是网页味，而且各平台长得还不一样。能在合理成本内自绘的就自绘，走同一套 token，跨平台观感才一致。已经自绘的：窗口装饰、滚动条、tooltip、右键菜单、滑块。

但别为了自绘牺牲能力。文本输入框、IME、剪贴板这些必须用原生：
词格就是靠透明 input 才拿到中文输入法的候选词和选区。判据是「自绘之后会不会丢掉用户已有的能力」，会丢就别碰。

原生控件真要改样式时，-webkit- 和 -moz- 的伪元素不能写进同一条规则——任一个选择器不认识，整条规则会被整体丢弃，必须分开写。

模块依赖单向：clusters → state → i18n → txt。core 不许 import platform，也不碰
DOM。

state 是 reactive，命令式那半和 Vue 组件共享同一个 proxy。不要对 state 子对象做
身份比较（=== / Set / indexOf），proxy 会破坏。工程数据放 state，它会被
JSON.stringify 存进 localStorage；只在本次会话有意义的界面状态放 ui。

词格交互（透明 input、逐格画字、光标、选区格子高亮）不要重写。迁移时当命令式组件逐字搬，用 ref 操作 DOM。那套是踩了好几轮才立住的。

import 绑定是只读的。被重新赋值的变量不能直接搬进模块，要么留在原处，要么改成 reactive 对象的属性。

工作区是 CRLF，写文件时不要改成 LF，否则 diff 里全是行尾噪声。

不要跑 cargo fmt。上游代码本身就不是 fmt 干净的，跑了会混进无关改动。

Web 版必须和客户端平权，往 Rust 挪逻辑前先想清楚：两边结果不一致算 bug 就不能有两份实现，算 feature 才可以分叉。

## 命令

```
npm run dev:web    浏览器
npm run dev        Tauri
npm test           文本往返测试
npm run build:web
```

改过 core/txt.js 或 core/clusters.js 一定要跑 npm test。那 11 项钉的是「导出的歌词能被原样导入回来」，这里出过三个 bug。
