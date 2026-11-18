// Dependency-free tests for the actual service worker, including storage,
// serialization, commands and malformed input. Run: node tests/unit.cjs
const vm=require('node:vm'), fs=require('node:fs'), assert=require('node:assert/strict');
const local={},session={},handlers={};
const area=data=>({get:async key=>({[key]:data[key]}),set:async value=>Object.assign(data,value)});
const chrome={storage:{local:area(local),session:area(session)},tabs:{query:async()=>[],sendMessage:async()=>{}},runtime:{onMessage:{addListener:fn=>handlers.message=fn}},commands:{onCommand:{addListener:fn=>handlers.command=fn}}};
const context=vm.createContext({chrome,console});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8'),context);
const request=message=>new Promise(resolve=>handlers.message(message,{},resolve));
(async()=>{
 assert.equal((await request({type:'get'})).settings.speed,1);
 for(const speed of [2,3.7,6.25,12,0.01]) assert.equal((await request({type:'update',patch:{speed}})).settings.speed,speed);
 for(const speed of [0,-1,NaN,Infinity]) assert.ok((await request({type:'update',patch:{speed}})).error);
 await request({type:'update',patch:{speed:3.7,remember:true}}); assert.equal(local.settings.speed,3.7);
 await request({type:'update',patch:{remember:false}}); assert.equal(local.settings.speed,1); assert.equal((await request({type:'get'})).settings.speed,3.7);
 delete session.temporarySpeed; assert.equal((await request({type:'get'})).settings.speed,1);
 await request({type:'update',patch:{enabled:false}}); assert.equal(local.settings.enabled,false);
 await request({type:'update',patch:{enabled:true,speed:1}});
 handlers.command('faster'); assert.equal((await request({type:'get'})).settings.speed,1.25);
 handlers.command('slower'); assert.equal((await request({type:'get'})).settings.speed,1);
 await request({type:'update',patch:{speed:3.7}}); handlers.command('reset'); assert.equal((await request({type:'get'})).settings.speed,1);
 await Promise.all([2,3,4].map(speed=>request({type:'update',patch:{speed}}))); assert.equal((await request({type:'get'})).settings.speed,4);
 const manifest=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../manifest.json'),'utf8'));
 assert.equal(manifest.manifest_version,3);
 for(const file of [manifest.background.service_worker,manifest.action.default_popup,...manifest.content_scripts[0].js,...Object.values(manifest.icons)]) assert.ok(fs.existsSync(require('node:path').join(__dirname,'..',file)),file);
 console.log('PASS: settings, arbitrary positive rates, invalid rates, persistence, session reset, enable toggle, three commands, serialized writes, manifest assets');
})().catch(error=>{console.error(error);process.exitCode=1});
