(() => {
  'use strict';
  if (globalThis.__flashSpeedLoaded) return;
  globalThis.__flashSpeedLoaded = true;
  let settings, host, ui, scanTimer, stopped = false;
  const videos = new Map(), roots = new Map(), children = new Map();
  const topFrame = window === window.top;
  const send = message => chrome.runtime.sendMessage(message);
  const same = (a,b) => Math.abs(a-b) <= Math.max(1e-8, Math.abs(b)*1e-9);
  function apply(video, state) {
    if (!settings?.enabled || !state.managed || state.blocked || same(video.playbackRate,settings.speed)) return;
    const now = Date.now();
    state.attempts = state.attempts.filter(time => now-time < 5000);
    // Stop fighting hostile players after five corrections in five seconds.
    // Explicit user changes / new media allow another bounded attempt.
    if (state.attempts.length >= 5) { state.blocked = true; render(); return; }
    state.attempts.push(now);
    try {
      video.playbackRate = settings.speed;
      state.failed = !same(video.playbackRate, settings.speed);
    } catch { state.failed = true; }
    if(state.failed) state.blocked = true;
  }
  function attach(video, initial) {
    if (videos.has(video)) return;
    const state = {managed:initial || settings.autoApply, attempts:[], blocked:false, failed:false};
    state.rate = () => { apply(video,state); render(); };
    state.metadata = () => { state.attempts=[]; state.blocked=false; state.failed=false; apply(video,state); render(); };
    video.addEventListener('ratechange',state.rate);
    video.addEventListener('loadedmetadata',state.metadata);
    videos.set(video,state); apply(video,state);
  }
  function scan(root = document, initial = false) {
    if (!roots.has(root)) {
      const observer = new MutationObserver(() => {
        if (!scanTimer) scanTimer = setTimeout(() => { scanTimer=0; discover(); },100);
      });
      observer.observe(root,{childList:true,subtree:true}); roots.set(root,observer);
    }
    for(const element of root.querySelectorAll('video, *')) {
      if (element === host) continue;
      if (element.localName === 'video') attach(element,initial);
      if (element.shadowRoot) scan(element.shadowRoot,initial);
    }
  }
  function discover(initial = false) {
    if(stopped || !settings) return;
    for(const [video,state] of videos) if(!video.isConnected) {
      video.removeEventListener('ratechange',state.rate); video.removeEventListener('loadedmetadata',state.metadata); videos.delete(video);
    }
    for(const [root,observer] of roots) if(root.host && !root.host.isConnected) { observer.disconnect(); roots.delete(root); }
    scan(document,initial); render(); report();
  }
  function localReport() {
    return {count:videos.size,failed:[...videos.values()].filter(s=>s.failed || s.blocked).length,
      unmanaged:[...videos.values()].filter(s=>!s.managed).length};
  }
  function statusText() {
    const report = localReport();
    for(const [id,entry] of children) {
      if(Date.now()-entry.time > 12000) { children.delete(id); continue; }
      for(const key of ['count','failed','unmanaged']) report[key] += entry.report[key] || 0;
    }
    if(!settings.enabled) return '已禁用 · 不再修改视频速度（保留视频当前倍率）';
    if(!report.count) return '当前页面没有发现可控制的 HTML5 视频';
    if(report.failed) return `检测到 ${report.count} 个视频，${report.failed} 个可能不支持倍速或持续重置；已暂停重试，请重新设置倍率。`;
    return `发现 ${report.count} 个视频 · 目标 ${settings.speed}×${report.unmanaged ? ` · ${report.unmanaged} 个新视频未自动应用` : ''}`;
  }
  function report() {
    if(!topFrame) send({type:'frameReport',report:localReport()}).catch(() => {});
  }
  function change(patch) {
    send({type:'update',patch}).then(response => {
      if(response.error) throw new Error(response.error);
      receive(response.settings);
    }).catch(error => { if(ui) ui.querySelector('#status').textContent = `设置失败：${error.message}。若扩展已更新，请刷新网页。`; });
  }
  function receive(next) {
    const reapply = !settings || next.speed !== settings.speed || (!settings.enabled && next.enabled) || (!settings.autoApply && next.autoApply);
    settings = next;
    if(reapply) for(const [video,state] of videos) {
      state.managed=true; state.blocked=false; state.failed=false; state.attempts=[]; apply(video,state);
    }
    render(); report();
  }
  function render() {
    if(!ui || !settings) return;
    ui.querySelector('#current').textContent = `${Number(settings.speed.toPrecision(8))}×`;
    const input = ui.querySelector('#speed');
    if(ui.activeElement !== input) input.value = settings.speed;
    for(const key of ['enabled','autoApply','remember']) ui.querySelector(`#${key}`).checked = settings[key];
    ui.querySelector('#status').textContent = statusText();
    ui.querySelectorAll('[data-speed]').forEach(button => button.classList.toggle('active', Number(button.dataset.speed) === settings.speed));
  }
  function clampPosition(x,y) {
    const width = host.getBoundingClientRect().width || 276;
    const height = host.getBoundingClientRect().height || 330;
    return {x:Math.max(0,Math.min(x,innerWidth-width)),y:Math.max(0,Math.min(y,innerHeight-height))};
  }
  function place(position) {
    const p = clampPosition(position.x,position.y);
    host.style.setProperty('left',`${p.x}px`,'important'); host.style.setProperty('top',`${p.y}px`,'important');
  }
  function mount() {
    host = document.createElement('div');
    // Closed root prevents page selectors/styles from reaching controls.
    ui = host.attachShadow({mode:'closed'});
    const link = document.createElement('link'); link.rel='stylesheet'; link.href=chrome.runtime.getURL('styles/content.css'); ui.append(link);
    const panel = document.createElement('section');
    panel.innerHTML = `<header><span>ϟ Flash <small>VIDEO SPEED</small></span><button id="close" title="隐藏面板" aria-label="隐藏面板">×</button></header><div class="body"><label class="toggle"><input id="enabled" type="checkbox"> 启用倍速控制</label><div id="current">1×</div><div class="adjust"><button id="minus" aria-label="降低 0.1 倍">−</button><input id="speed" type="number" min="0" step="any" aria-label="自定义播放倍率"><button id="plus" aria-label="提高 0.1 倍">＋</button></div><div class="presets">${[0.5,1,1.5,2,3,5].map(n=>`<button data-speed="${n}">${n}×</button>`).join('')}</div><label><input id="autoApply" type="checkbox"> 自动应用新视频</label><label><input id="remember" type="checkbox"> 记住当前速度</label><p id="status" role="status"></p><small>任意正数 · 推荐 0.1–16× · 回车应用</small></div>`;
    ui.append(panel); document.documentElement.append(host);
    host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;width:276px!important;max-width:100vw!important;display:block!important;color-scheme:dark!important;';
    const position = settings.position || {x:innerWidth-296,y:80}; place(position);
    ui.querySelector('#close').onclick = () => { host.style.setProperty('display','none','important'); };
    for(const key of ['enabled','autoApply','remember']) ui.querySelector(`#${key}`).onchange = event => change({[key]:event.target.checked});
    ui.querySelector('#speed').onchange = event => change({speed:Number(event.target.value)});
    ui.querySelector('#speed').onkeydown = event => { if(event.key === 'Enter') event.target.blur(); };
    ui.querySelector('#minus').onclick = () => change({speed:Math.max(0.1,Math.round((settings.speed-0.1)*1e8)/1e8)});
    ui.querySelector('#plus').onclick = () => change({speed:Math.round((settings.speed+0.1)*1e8)/1e8});
    ui.querySelectorAll('[data-speed]').forEach(button => button.onclick = () => change({speed:Number(button.dataset.speed)}));
    const header = ui.querySelector('header'); let drag;
    header.onpointerdown = event => {
      if(event.target.closest('button') || event.button !== 0) return;
      const rect = host.getBoundingClientRect(); drag={dx:event.clientX-rect.left,dy:event.clientY-rect.top};
      header.setPointerCapture(event.pointerId); event.preventDefault();
    };
    header.onpointermove = event => { if(drag) place({x:event.clientX-drag.dx,y:event.clientY-drag.dy}); };
    const end = () => { if(!drag) return; drag=null; const rect=host.getBoundingClientRect(); change({position:{x:rect.left,y:rect.top}}); };
    header.onpointerup=end; header.onpointercancel=end;
    render();
  }
  function fullscreen() {
    const target = document.fullscreenElement;
    // A native <video> is a replaced element and cannot render child controls.
    if(target && !['VIDEO','IFRAME'].includes(target.tagName)) target.append(host);
    else document.documentElement.append(host);
    if(target?.tagName === 'VIDEO') host.style.setProperty('display','none','important');
  }
  chrome.runtime.onMessage.addListener((message,_sender,respond) => {
    if(message.type === 'settings') receive(message.settings);
    if(message.type === 'childReport' && topFrame) { children.set(message.frameId,{report:message.report,time:Date.now()}); render(); }
    if(message.type === 'status') { respond({text:settings ? statusText() : '正在初始化…'}); }
    if(message.type === 'panel' && topFrame && settings) {
      if(!host) mount(); else host.style.setProperty('display',host.style.display === 'none' ? 'block' : 'none','important');
      respond({ok:true});
    }
  });
  send({type:'get'}).then(response => {
    if(response.error) throw new Error(response.error);
    receive(response.settings); discover(true);
    // A low frequency discovery catches attachShadow() on existing hosts, which
    // MutationObserver cannot see. No playback-rate polling is performed.
    const timer = setInterval(() => discover(),5000);
    window.addEventListener('pagehide',event => {
      if(event.persisted) return;
      stopped=true; clearInterval(timer); clearTimeout(scanTimer);
      roots.forEach(observer=>observer.disconnect()); roots.clear();
      videos.forEach((state,video)=>{video.removeEventListener('ratechange',state.rate);video.removeEventListener('loadedmetadata',state.metadata);}); videos.clear();
    },{once:true});
    window.addEventListener('resize',() => { if(host) { const rect=host.getBoundingClientRect(); place({x:rect.left,y:rect.top}); } });
    document.addEventListener('fullscreenchange',() => { if(host) fullscreen(); });
  }).catch(() => {});
})();
