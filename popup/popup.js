const $ = id => document.getElementById(id);
let settings, activeTab;
async function request(message) { const response = await chrome.runtime.sendMessage(message); if (response.error) throw new Error(response.error); return response.settings; }
function render() {
  for (const key of ['enabled','autoApply','remember']) $(key).checked = settings[key];
  if (document.activeElement !== $('speed')) $('speed').value = settings.speed;
  document.querySelectorAll('[data-speed]').forEach(button => button.classList.toggle('active',Number(button.dataset.speed) === settings.speed));
}
async function status() {
  if (!activeTab) return;
  try {
    const result = await chrome.tabs.sendMessage(activeTab.id,{type:'status'},{frameId:0});
    $('status').textContent = result.text;
  } catch { $('status').textContent = '无法连接此页面。安装后请刷新已有网页；Edge 内部页、扩展商店等受保护页面不支持。'; }
}
async function save(patch) {
  try { settings = await request({type:'update',patch}); render(); await status(); }
  catch(error) { $('status').textContent = error.message; }
}
for (const speed of [0.1,0.25,0.5,0.75,1,1.25,1.5,2,2.5,3,4,5,8,10,16]) {
  const button = document.createElement('button'); button.textContent = `${speed}×`; button.dataset.speed = speed;
  button.onclick = () => save({speed}); $('presets').append(button);
}
$('speed').onchange = () => save({speed:Number($('speed').value)});
$('speed').onkeydown = event => { if(event.key === 'Enter') $('speed').blur(); };
$('minus').onclick = () => save({speed:Math.max(0.1, Math.round((settings.speed-0.1)*1e8)/1e8)});
$('plus').onclick = () => save({speed:Math.round((settings.speed+0.1)*1e8)/1e8});
for (const key of ['enabled','autoApply','remember']) $(key).onchange = () => save({[key]:$(key).checked});
$('panel').onclick = async () => {
  try { await chrome.tabs.sendMessage(activeTab.id,{type:'panel'},{frameId:0}); await status(); }
  catch { $('status').textContent = '当前页面无法显示面板，请刷新普通网页后重试。'; }
};
chrome.runtime.onMessage.addListener(message => { if(message.type === 'settings') { settings = message.settings; render(); status(); } });
(async () => { settings = await request({type:'get'}); [activeTab] = await chrome.tabs.query({active:true,currentWindow:true}); render(); await status(); })().catch(error => $('status').textContent = error.message);
