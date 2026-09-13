import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {chromium}=require('playwright');
const root='docs/reviews/illustrated-room-ui-evidence';await fs.mkdir(root,{recursive:true});
const b=await chromium.launch();
const cases=[['desktop','light',1440,900],['phone','dark',390,844]];
const units=[['about','About'],['books','Book Notes'],['weightlifting','Weightlifting'],['systems','Personal Systems'],['projects','Projects'],['musings','Musings'],['talks','Featured Talks']];
const results=[];
try{
for(const [view,theme,width,height] of cases){
 const p=await b.newPage({viewport:{width,height},colorScheme:theme});const errors=[],models=[];
 await p.addInitScript(()=>{window.__webglCalls=0;const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).startsWith('webgl')||type==='experimental-webgl'){window.__webglCalls++;return null;}return orig.call(this,type,...args);};});
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/\.(glb|gltf|ktx2|hdr)(\?|$)/.test(r.url()))models.push(r.url());});
 await p.goto(`http://localhost:3330/admin/room-boot-comparison?variant=illustrated&unit=about&theme=${theme}`,{waitUntil:'networkidle',timeout:90000});
 for(const [unit,label] of units){
  errors.length=0;
  const navLabel=unit==='books'?'Books':unit==='systems'?'Systems':unit==='talks'?'Talks':label;
  await p.getByRole('navigation',{name:'Explore the shelves'}).getByRole('button',{name:navLabel,exact:true}).click();
  await p.waitForFunction(unit=>document.querySelector('main.illustrated-room')?.dataset.unit===unit,unit);
  await p.waitForSelector(unit==='about'?'[data-boot-book-face]':'.room-drawing [data-part]');
  await p.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.room-drawing image,[data-boot-book-face]')].map(async e=>{const i=new Image();i.src=e.getAttribute('href');await i.decode();}));});
  await p.screenshot({path:`${root}/${unit}-${theme}-${view}.png`});
  const open=p.getByRole('button',{name:`Explore ${label}`,exact:true});await open.focus();await p.keyboard.press('Enter');
  const dialog=p.getByRole('dialog');await dialog.waitFor();await p.waitForTimeout(600);
  const content=await dialog.innerText();const links=await dialog.locator('a[href]').count();
  if(content.length<25||!links)throw new Error(`${unit}: missing real content`);
  const metrics=await p.evaluate(()=>({webgl:window.__webglCalls,canvas:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:document.querySelector('[role=dialog]').scrollWidth>document.querySelector('[role=dialog]').clientWidth,controlsOutside:[...document.querySelectorAll('.illustrated-nav button,.illustrated-actions button')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1||r.bottom>innerHeight+1||r.top<-1;}).length}));
  if(metrics.webgl||metrics.canvas||metrics.overflow||metrics.dialogOverflow||metrics.controlsOutside||errors.length||models.length)throw new Error(JSON.stringify({unit,view,metrics,errors,models}));
  await p.screenshot({path:`${root}/${unit}-${theme}-${view}-content.png`});
  await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  const focus=await open.evaluate(e=>document.activeElement===e);if(!focus)throw new Error(`${unit}: focus not restored`);
  results.push({unit,view,theme,contentCharacters:content.length,links,...metrics,errors:[...errors],models:models.length,keyboardFocusRestored:focus});
  await fs.writeFile(`${root}/checks.json`,JSON.stringify(results,null,2)+'\n');
  console.log(`${unit} ${theme}/${view}: passed`);
 }
 await p.close();
}
await fs.writeFile(`${root}/checks.json`,JSON.stringify(results,null,2)+'\n');
}finally{await b.close();}
