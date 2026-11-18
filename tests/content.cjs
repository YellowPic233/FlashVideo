const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
class Video extends EventTarget {
 constructor(){super();this.localName='video';this.isConnected=true;this.rate=1;}
 get playbackRate(){return this.rate;}
 set playbackRate(value){if(value>16)throw new Error('Unsupported rate');this.rate=value;queueMicrotask(()=>this.dispatchEvent(new Event('ratechange')));}
}
const items=[new Video(),new Video(),new Video()],handlers={},observers=[];
let timer,settings={enabled:true,speed:1,autoApply:true,remember:true};
const document={querySelectorAll:()=>items.filter(v=>v.isConnected),addEventListener:()=>{}};
const window={addEventListener:()=>{}};window.top=window;
class Observer {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}}
const chrome={runtime:{sendMessage:async()=>({settings}),onMessage:{addListener:fn=>handlers.message=fn}}};
const context=vm.createContext({window,document,chrome,MutationObserver:Observer,console,Date,setTimeout,clearTimeout,setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8'),context);
const settle=()=>new Promise(resolve=>setTimeout(resolve,160));
const update=patch=>{settings={...settings,...patch};handlers.message({type:'settings',settings},{},()=>{});};
(async()=>{
 await settle(); update({speed:2}); await settle();assert.ok(items.every(v=>v.playbackRate===2));
 update({speed:3.7});await settle();assert.ok(items.every(v=>v.playbackRate===3.7));
 items.push(new Video());observers[0].fn();await settle();assert.equal(items[3].playbackRate,3.7);
 items[0].playbackRate=1;await settle();assert.equal(items[0].playbackRate,3.7);
 update({enabled:false});items[0].playbackRate=1;await settle();assert.equal(items[0].playbackRate,1);
 update({enabled:true});await settle();assert.equal(items[0].playbackRate,3.7);
 update({autoApply:false});items.push(new Video());timer();await settle();assert.equal(items[4].playbackRate,1);
 update({speed:2});await settle();assert.equal(items[4].playbackRate,2);
 update({speed:20});await settle();let status;handlers.message({type:'status'},{},reply=>status=reply.text);assert.match(status,/不支持/);
 update({speed:3});await settle();assert.ok(items.every(v=>v.playbackRate===3));
 items[0].isConnected=false;timer();assert.equal(items[0].playbackRate,3);
 console.log('PASS: actual content.js with DOM test doubles: multiple videos, 2x, 3.7x, MutationObserver discovery, rate recovery, disable/re-enable, autoApply off, unsupported speed, recovery, detached video cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
