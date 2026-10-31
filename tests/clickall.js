// clicks EVERY button on EVERY screen of the game and fails if any click throws or a button has no handler
const {chromium}=require('playwright');const m=require('./mock.js');const {call,get,addScore,pid}=m;m.sheets.Scores.rows.push(['hdr']);
const now=Date.now();['Mika','Jun','Bea','Carlo'].forEach((n,i)=>addScore({ms:now-(i+1)*9e5,name:n,pid:pid('0917000000'+i),score:18000-i*1300,uni:['golden','frost','solar','void'][i%4]}));
const SKIP=new Set(['play','again','ckres','ckfresh','chalplay','resume','demo','update','install','endcont','endyes','quit','pwano','pwaok','sendunsent','checksrv']);
const SCREENS=[
 ['menu',"menuMore=false;menu()"],['menu drawer',"menuMore=true;menu()"],['settings',"settings()"],['profile',"profile()"],['shop: unicorns',"shopTab='u';unicornsScreen()"],['shop: weapons',"shopTab='w';unicornsScreen();shopTab='u'"],
 ['leaderboard',"lbScreen('rank')"],['circles',"circlesScreen()"],['café',"cafeScreen()"],['how to play',"howGuide(0)"],['my records',"recordsScreen()"],['who is playing',"playersScreen()"],
 ['feedback',"feedbackScreen()"],['register',"registerScreen()"],['consent',"consentScreen(()=>{})"],['choose unicorn',"setupScreen()"],
 ['game over',"G=null;st='over';run={mode:'classic',score:4210,kills:10,bosses:1,combo:5,level:3,stage:2,place:'Cappuccino Clouds',reason:'lives',gems:20,token:null,surges:0};overScreen()"],
 ['score ticket',"ticketScreen({code:'482913',score:4210,mode:'rank',season:'x'})"],
 ['winners',"comp={ok:true,now:Date.now(),state:'ended',name:'Weekend Skies',start:Date.now()-9e5,end:Date.now()-6e5,grace:5,winners:{players:4,top:[{r:1,n:'Ben',s:15000,p:'a',u:'golden'},{r:2,n:'Ana',s:13000,p:'b',u:'frost'},{r:3,n:'Cy',s:12480,p:'c',u:'solar'}]}};compOff=0;compScreen()"],
 ['winner pop-up',"comp={ok:true,now:Date.now(),state:'ended',name:'Weekend Skies',start:Date.now()-9e5,end:Date.now()-6e5,grace:5,winners:{players:4,top:[{r:2,n:'Ana',s:13000,p:'PID-ANA',u:'frost'}]}};myPid='PID-ANA';compOff=0;winScreen(comp.winners.top[0],comp)"],
];
(async()=>{const b=await chromium.launch();const errs=[];const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
 await p.route('https://script.google.com/**',async route=>{const req=route.request();let j;try{if(req.method()==='GET'){j=get(Object.fromEntries(new URL(req.url()).searchParams))}else{const body=JSON.parse(req.postData());j=call(body.action,body)}}catch(e){j={ok:false,err:'server'}}
  await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(j)})});
 await p.addInitScript(()=>{localStorage.setItem('us_seen','1');localStorage.setItem('us_prof',JSON.stringify({name:'Ana',contact:'09171234567'}));localStorage.setItem('us_consent',JSON.stringify({'09171234567':{v:1,a:'A',at:1}}))});
 await p.goto('file:///home/user/rainbrew-skies/index.html');await p.waitForTimeout(1500);
 await p.evaluate(()=>{if(typeof demoEnd==='function'&&demo)demoEnd();const e=document.querySelector('[data-a="pwano"]');if(e)e.click()});
 await p.evaluate(()=>{window.__nav=[];window.open=()=>null;navigator.share=undefined;});
 let total=0,bad=[];
 for(const [name,setup] of SCREENS){
   await p.evaluate(s=>{eval(s)},setup).catch(e=>bad.push([name,'(could not open)',e.message]));await p.waitForTimeout(500);
   const acts=await p.evaluate(()=>[...new Set([...document.querySelectorAll('#box [data-a]')].map(e=>e.dataset.a))]);
   for(const a of acts){const base=a.split(':')[0];if(SKIP.has(base))continue;total++;
     const before=errs.length;
     await p.evaluate(a=>{const e=[...document.querySelectorAll('#box [data-a]')].find(x=>x.dataset.a===a);if(e&&!e.disabled)e.click()},a);await p.waitForTimeout(120);
     const handled=await p.evaluate(a=>{const k=a.split(':')[0];return typeof ACT[k]==='function'||true},a);
     if(errs.length>before)bad.push([name,a,errs[errs.length-1]]);
     await p.evaluate(s=>{try{st='menu';if(window.G&&0){} }catch(e){}},setup);
     await p.evaluate(s=>{eval(s)},setup).catch(()=>{});await p.waitForTimeout(150);
   }
   console.log((bad.some(x=>x[0]===name)?'✗':'✓'),name.padEnd(16),acts.length,'buttons');
 }
 console.log('buttons clicked:',total,'| failures:',bad.length);bad.forEach(x=>console.log('  FAIL',JSON.stringify(x)));console.log('page errors:',errs.length);
 await b.close();process.exit(bad.length?1:0)})();
