// every data-a button in the game must have a handler: this catches a handler that was lost by accident
const {chromium}=require('playwright');const fs=require('fs');
const src=fs.readFileSync('/home/user/rainbrew-skies/index.html','utf8');
const names=new Set();for(const m of src.matchAll(/data-a="([a-zA-Z0-9_]+)(?::|")/g))names.add(m[1]);
for(const m of src.matchAll(/data-a=\\?"\$\{[^}]*\}/g)){}
(async()=>{const b=await chromium.launch();const p=await (await b.newContext()).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('us_seen','1')});await p.goto('file:///home/user/rainbrew-skies/index.html');await p.waitForTimeout(1200);
 const chain=await p.evaluate(()=>{const f=String(box.__proto__&&0)||'';return ''});
 const handlers=await p.evaluate(()=>Object.keys(ACT));
 // names handled by the if-chain in the click listener
 const m=src.match(/box\.addEventListener\('click'[\s\S]*?\n\}\);/)[0];const inChain=new Set([...m.matchAll(/a === '([a-zA-Z0-9_]+)'/g)].map(x=>x[1]));
 const missing=[...names].filter(n=>!handlers.includes(n)&&!inChain.has(n)&&!['pwano','pwaok'].includes(n));
 console.log('buttons found:',names.size,'| handlers in ACT:',handlers.length,'| in chain:',inChain.size);
 console.log('buttons WITHOUT a handler:',missing.length?missing.join(', '):'none');
 console.log('errors',errs);await b.close();process.exit(missing.length?1:0)})();
