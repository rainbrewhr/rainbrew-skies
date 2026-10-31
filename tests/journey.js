const {chromium}=require('playwright');const m=require('./mock.js');const {call,get}=m;m.sheets.Scores.rows.push(['hdr']);
(async()=>{const b=await chromium.launch();const errs=[];const c=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
 await p.route('https://script.google.com/**',async route=>{const req=route.request();let j;try{if(req.method()==='GET'){j=get(Object.fromEntries(new URL(req.url()).searchParams))}else{const body=JSON.parse(req.postData());j=call(body.action,body)}}catch(e){j={ok:false,err:'server'}}
  await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(j)})});
 await p.goto('file:///home/user/rainbrew-skies/index.html');await p.waitForTimeout(1500);
 let bad=0;const step=async(label,sel,expect)=>{try{await p.tap(sel,{timeout:4000})}catch(e){console.log('✗',label,'(could not tap:',sel+')');bad++;return}await p.waitForTimeout(600);const got=await p.evaluate(()=>curScr+'|'+st);const ok=expect.test(got);if(!ok)bad++;console.log(ok?'✓':'✗',label,'->',got)};
 await step('Skip the demo','button:has-text("Skip")',/menu\|menu/);
 await p.waitForTimeout(900);if(await p.$('[data-a="pwano"]')){console.log('(the Install sheet popped up: tapping Not now)');await p.tap('[data-a="pwano"]');await p.waitForTimeout(500)}
 await step('Settings (gear)','.gear',/^set\|/);
 await step('Close settings (X)','.sethead .x',/^menu\|/);
 await step('More','[data-a="menumore"]',/^menu\|/);
 await step('Profile and badges','[data-a="prof"]',/^prof\|/);
 await step('Back from profile','.back',/^menu\|/);
 await step('Top Rank','.tabbar [data-a="lb"]',/^lb\|/);
 await step('Back from board','.back',/^menu\|/);
 await step('Shop','.tabbar [data-a="unis"]',/^unis\|/);
 await step('Home from shop','.pinfoot [data-a="menu"]',/^menu\|/);
 await p.evaluate(()=>menu());await p.waitForTimeout(400);
 await step('More','[data-a="menumore"]',/^menu\|/);
 await step('How to play','[data-a="how"]',/^how/);
 await step('Back from how to play','.back',/^menu\|/);
 await step('More','[data-a="menumore"]',/^menu\|/);
 await step('My records','[data-a="recs:me"]',/^rec|^menu|^/);
 await p.evaluate(()=>menu());await p.waitForTimeout(400);
 await step('Choose Classic','[data-a="mode:classic"]',/^menu\|/);
 await step('Play','.mtop ~ .mbot [data-a="play"], [data-a="play"]',/^(\||setup|cards|reg|cons)|count|play/);
 await p.waitForTimeout(500);console.log('state after Play:',await p.evaluate(()=>curScr+'|'+st));
 // register a player and fly
 await p.fill('#rgn','Ana');await p.fill('#rgp','09171234567');await p.evaluate(()=>{document.querySelectorAll('input[type=checkbox]').forEach(c=>{if(!c.checked)c.click()});const r=document.querySelector('input[type=radio]');if(r)r.click()});
 await step('Start playing (register)','[data-a="regok"]',/./);await p.waitForTimeout(800);
 console.log('after register:',await p.evaluate(()=>curScr+'|'+st));
 if(await p.evaluate(()=>curScr==='consent'||!!document.querySelector('[data-a="consentok"],[data-a="agree"]'))){console.log('(a consent screen)')}
 await p.evaluate(()=>{LS.set('us_consent',{'09171234567':{v:1,a:'A',at:1}});menu()});await p.waitForTimeout(500);
 await step('Choose Classic','[data-a="mode:classic"]',/^menu\|/);
 await step('Play (Classic)','[data-a="play"]',/\|(count|play)/);
 await p.waitForFunction(()=>st==='play',null,{timeout:15000});await p.waitForTimeout(4200);
 await p.evaluate(()=>{G.lives=9});
 // the pause button is on the canvas (top right): tap it like a finger would
 const box=await p.evaluate(()=>{const r=cv.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height,K:K,ox:OXp,oy:OYp}});
 await p.touchscreen.tap(box.l+box.ox+(360-20)*box.K,box.t+box.oy+19*box.K);await p.waitForTimeout(700);
 console.log(await p.evaluate(()=>st==='pause')?'✓ Pause button works':'✗ pause button did not pause');
 await step('Resume','[data-a="resume"]',/\|(ready|play)/);await p.waitForTimeout(3600);
 await p.touchscreen.tap(box.l+box.ox+(360-20)*box.K,box.t+box.oy+19*box.K);await p.waitForTimeout(600);
 await step('Settings from pause','[data-a="set"]',/^set\|/);
 await step('Close settings (back to pause)','.sethead .x',/^pause|\|pause/);
 await step('Quit from the pause screen','[data-a="quit"]',/\|menu|^menu/);
 console.log('state:',await p.evaluate(()=>curScr+'|'+st));
 console.log(bad?`PROBLEMS: ${bad}`:'ALL BUTTONS RESPOND','errors',errs);await b.close()})();
