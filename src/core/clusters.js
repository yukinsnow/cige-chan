const cap = L => L.g.reduce((a,b)=>a+b,0);

/* 一句的文字里允许出现空格，代表「这个格子先空着」——
   这样光标可以停在任意格子上，比如先把句尾那几个字写好、前面留空慢慢填。
   RT 去掉尾部的占位空格。 */
const RT = s => String(s).replace(/[ 　]+$/,"");

/* 日语拗音（きゃ しゅ ちょ…）跟前一个假名拼成一格，不单占格；
   促音 っ／ッ 不在这个集合里——它数拍时本来就该自己占一整格。
   韩语谚文音节本身就是一个 Unicode 字符，天然一格一个，不用特殊处理。 */
const YOON = new Set([..."ぁぃぅぇぉゃゅょゎゕゖァィゥェォャュョヮヵヶｧｨｩｪｫｬｭｮ"]);
/* 半角片假名的浊点/半浊点是独立字符（不像全角"だ"是预组合好的一个字），
   比如「ﾃﾞ」是 ﾃ+ﾞ 两个码位却是一个音；这两个符号永远往前拼，
   拼完之后这一格仍然能再接一个拗音（比如「ﾃﾞｨ」＝ te+浊点+小 i）。 */
const DAKU = new Set([..."ﾞﾟ゙゚"]);

/* 把一句文字切成"格子"数组（可能一格两个字符），后面凡是要按格子数数、
   定位光标的地方都改用它，不再直接假设一个字符等于一格。
   注意 CL 是拿一整句的文字囫囵个拼的，不知道句内分句（L.g）在哪里断开；
   正常情况下没问题，唯一的已知边界情况是：某个分句恰好被填满、紧接着
   下一个分句又是拗音开头，这个拗音会拼到上一分句的最后一格里，
   显示上多算进前一段——概率很低（正常日语没人会拿拗音开头分句），
   暂时按已知限制处理，没有强行按 g 分段去堵这个口子。 */
// 拗音和半角浊点在 Unicode 里是两个字素簇 Intl.Segmenter 不会合并 别换
function CL(s){
  const out = [];
  for(const c of String(s)){
    const prev = out[out.length-1];
    const attachable = prev && prev !== " " && prev !== "　";
    if(attachable && DAKU.has(c)) out[out.length-1] = prev + c;
    else if(attachable && YOON.has(c) && !YOON.has(prev[prev.length-1])) out[out.length-1] = prev + c;
    else out.push(c);
  }
  return out;
}

/* 原生输入框的 selectionStart 是字符下标，格子下标是簇下标，两者不再相等，
   这两个函数负责互转：一个在光标事件里读出"在第几格"，一个在要把光标
   放到第几格时算出真正该传给 setSelectionRange 的字符下标。 */
function charToCell(clusters,charIdx){
  let n = 0;
  for(let i=0;i<clusters.length;i++){
    if(charIdx <= n) return i;
    n += clusters[i].length;
    if(charIdx < n) return i;
  }
  return clusters.length;
}
function cellToChar(clusters,cellIdx){
  let n = 0;
  for(let i=0;i<Math.min(cellIdx,clusters.length);i++) n += clusters[i].length;
  return n;
}

export { cap, RT, YOON, DAKU, CL, charToCell, cellToChar };
