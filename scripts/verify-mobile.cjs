// Run: npm install --no-save playwright && npx playwright install chromium
// Then: node scripts/verify-mobile.cjs (BROWSER_CHANNEL=msedge is also supported).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'../src');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
for(const f of ['ai.js','i18n.js']) new vm.Script(fs.readFileSync(path.join(root,f),'utf8'));
const server = http.createServer((req,res)=>{
  const file = path.join(root,req.url === '/' ? 'index.html' : req.url.slice(1));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    assert.ok(await page.locator('.row').count()); assert.deepEqual(errors,[]);
    console.log('PASS mobile boot and JavaScript syntax');
    const ime=await page.evaluate(()=>{
      const io=document.querySelector('.io');io.focus();io.dispatchEvent(new CompositionEvent('compositionstart'));
      const e=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true});io.dispatchEvent(e);
      const result=!e.defaultPrevented && document.activeElement===io;
      io.dispatchEvent(new CompositionEvent('compositionend'));return result;
    });assert.equal(ime,true);console.log('PASS IME candidate Enter does not navigate');
    assert.equal(await page.evaluate(()=>{
      state.title='pending draft';save();window.dispatchEvent(new Event('pagehide'));
      return JSON.parse(localStorage.getItem('cige.v1')).title;
    }),'pending draft');console.log('PASS pending save flushes on pagehide');
    assert.equal(await page.evaluate(()=>{
      const before=JSON.stringify(state);
      for(const sections of [[null],[{lines:[null]}],[{lines:[{g:[-1]}]}],[{lines:[{g:[100000000]}]}]]) applyJson(JSON.stringify({title:'bad',sections}));
      return JSON.stringify(state)===before;
    }),true);console.log('PASS invalid imports leave current draft unchanged');
    assert.equal(await page.evaluate(()=>{
      applyJson(JSON.stringify({title:'imported',sections:[{name:'verse',lines:[{g:[2],t:'你好'}]}]}));
      const backup=localStorage.getItem('cige.recovery.v1');
      const ok=JSON.parse(backup).title==='pending draft' && state.title==='imported';
      applyJson(backup);return ok && state.title==='pending draft';
    }),true);console.log('PASS checkpoint and recovery swap projects');
    assert.equal(await page.evaluate(()=>{
      const write=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota')};
      state.title='unsaved';save();const result=flushSave();const dirty=saveDirty;
      Storage.prototype.setItem=write;return result===false && dirty && flushSave()===true;
    }),true);console.log('PASS storage failure retains dirty state for retry');
    assert.equal(await page.evaluate(async()=>{
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError')}});
      return shareExport('test.txt',new Blob(['test'],{type:'text/plain'}));
    }),true);console.log('PASS cancelled share does not trigger fallback download');
    assert.equal(await page.evaluate(async()=>{
      Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw Error('unsupported')}});
      return shareExport('test.txt',new Blob(['test'],{type:'text/plain'}));
    }),false);console.log('PASS failed share permits download fallback');
    assert.equal(await page.evaluate(async()=>{
      state.sections=[{name:'verse',lines:[newLine([2])]}];focusRef=null;render();
      aiCfg.baseUrl='https://example.test/v1';aiCfg.apiKey='test';aiCfg.model='test';
      const original=aiFillLine;let resolve;aiFillLine=()=>new Promise(r=>resolve=r);
      const row=document.querySelector('.row'),io=row.querySelector('.io');
      const running=aiRunAll('fill');
      state.sections[0].lines[0].t='新稿';io.value='新稿';
      resolve({text:'旧稿',note:''});await running;aiFillLine=original;
      return state.sections[0].lines[0].t==='新稿' && row===document.querySelector('.row') && io===row.querySelector('.io');
    }),true);console.log('PASS AI skips concurrent edits and preserves input DOM');
    assert.equal(await page.evaluate(async()=>{
      state.sections=[{name:'verse',lines:[newLine([2])]}];focusRef=null;render();
      const io=document.querySelector('.io');io.focus();const original=aiFillLine;
      aiFillLine=async()=>({text:'你好',note:''});await aiRunAll('fill');aiFillLine=original;
      return io===document.activeElement && io.value==='你好' && state.sections[0].lines[0].t==='你好';
    }),true);console.log('PASS AI updates focused input without replacing it');
    assert.equal(await page.evaluate(()=>{
      const b=document.querySelector('.tools button');return b.getBoundingClientRect().height>=44;
    }),true);console.log('PASS coarse-pointer controls have 44px touch height');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
    assert.deepEqual(errors,[]);console.log('PASS narrow viewport fits without runtime errors');
    assert.equal(await page.evaluate(()=>{
      const vv=window.visualViewport;
      Object.defineProperty(vv,'height',{configurable:true,value:400});
      document.querySelector('.io').focus();syncViewport();aiOpenPanel();
      const card=document.querySelector('#aip .card');
      const ok=document.documentElement.classList.contains('keyboard-open') && getComputedStyle(document.querySelector('footer')).display==='none' && card.getBoundingClientRect().height<=352;
      delete vv.height;aiClosePanel();syncViewport();return ok;
    }),true);console.log('PASS simulated keyboard shrinks modal and hides footer');
    for(const width of [320,375,768]){
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(w=>document.documentElement.scrollWidth<=w,width),true);
    }
    await page.setViewportSize({width:390,height:844});
    console.log('PASS 320px, 375px and iPad-width layouts');
    if(process.env.SCREENSHOT) await page.screenshot({path:process.env.SCREENSHOT,fullPage:true});
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
