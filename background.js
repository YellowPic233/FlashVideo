/* All writes are serialized, including rapid shortcut presses. Local holds durable
 * preferences; session holds the speed when Remember is off. */
const DEFAULTS = {enabled:true, speed:1, autoApply:true, remember:true, position:null};
const STEPS = [0.1,0.25,0.5,0.75,1,1.25,1.5,2,2.5,3,4,5,8,10,16];
async function readSettings() {
  const [{settings}, {temporarySpeed}] = await Promise.all([
    chrome.storage.local.get('settings'), chrome.storage.session.get('temporarySpeed')
  ]);
  const result = {...DEFAULTS, ...settings};
  if (!result.remember) result.speed = temporarySpeed ?? 1;
  if (!Number.isFinite(result.speed) || result.speed <= 0) result.speed = 1;
  return result;
}
async function broadcast(settings) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {type:'settings',settings})));
}
async function update(patch) {
  const settings = await readSettings();
  for (const key of ['enabled','autoApply','remember']) if (typeof patch[key] === 'boolean') settings[key] = patch[key];
  if ('speed' in patch) {
    if (!Number.isFinite(patch.speed) || patch.speed <= 0) throw new Error('请输入有限的正数倍率');
    settings.speed = patch.speed;
  }
  if ('position' in patch && patch.position && Number.isFinite(patch.position.x) && Number.isFinite(patch.position.y)) settings.position = patch.position;
  await chrome.storage.session.set({temporarySpeed:settings.speed});
  await chrome.storage.local.set({settings:{...settings,speed:settings.remember ? settings.speed : 1}});
  await broadcast(settings);
  return settings;
}
let queue = Promise.resolve();
function enqueue(task) { const next = queue.then(task); queue = next.catch(() => {}); return next; }
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'frameReport' && sender.tab && sender.frameId !== 0) {
    chrome.tabs.sendMessage(sender.tab.id,{type:'childReport',frameId:sender.frameId,report:message.report},{frameId:0}).catch(() => {});
  }
  if (message.type === 'get' || message.type === 'update') {
    enqueue(() => message.type === 'get' ? readSettings() : update(message.patch || {}))
      .then(settings => respond({settings}), error => respond({error:error.message}));
    return true;
  }
});
chrome.commands.onCommand.addListener(command => {
  if (!['slower','faster','reset'].includes(command)) return;
  enqueue(async () => {
    const {speed} = await readSettings();
    const next = command === 'reset' ? 1 : command === 'faster'
      ? STEPS.find(value => value > speed + 1e-8) ?? speed
      : [...STEPS].reverse().find(value => value < speed - 1e-8) ?? speed;
    await update({speed:next});
  }).catch(console.error);
});
