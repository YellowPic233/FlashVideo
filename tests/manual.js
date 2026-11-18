let source;
const videos = () => [...document.querySelectorAll('video'),...document.querySelector('iframe').contentDocument.querySelectorAll('video')];
document.querySelector('#file').onchange = event => {
  if(source) URL.revokeObjectURL(source);
  if(!event.target.files[0]) return;
  source=URL.createObjectURL(event.target.files[0]); videos().forEach(video=>video.src=source);
};
document.querySelector('#add').onclick = () => { const video=document.createElement('video'); video.controls=true; if(source) video.src=source; document.querySelector('#container').append(video); };
document.querySelector('#reset').onclick = () => videos().forEach(video=>video.playbackRate=1);
document.querySelector('#full').onclick = () => document.querySelector('#container').requestFullscreen();
setInterval(()=>{document.querySelector('#output').textContent=videos().map((video,index)=>`video ${index+1}: ${video.playbackRate}x`).join('\n');},500);
