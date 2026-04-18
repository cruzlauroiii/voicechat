const VOICES={
 'US Female':['af_alloy','af_aoede','af_bella','af_heart','af_jessica','af_kore','af_nicole','af_nova','af_river','af_sarah','af_sky'],
 'US Male':['am_adam','am_echo','am_eric','am_fenrir','am_liam','am_michael','am_onyx','am_puck'],
 'UK Female':['bf_alice','bf_emma','bf_isabella','bf_lily'],'UK Male':['bm_daniel','bm_fable','bm_george','bm_lewis'],
 'Japanese':['jf_alpha','jf_gongitsune','jf_nezumi','jf_tebukuro','jm_kumo'],
 'Chinese':['zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang'],
 'French':['ff_siwis'],'Italian':['if_sara','im_nicola'],
};
const MODELS=[
{name:'Haru',cat:'Girls',url:'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json'},
{name:'Hiyori',cat:'Girls',url:'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Hiyori/Hiyori.model3.json'},
{name:'Mao',cat:'Girls',url:'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Mao/Mao.model3.json'},
{name:'Natori',cat:'Girls',url:'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Natori/Natori.model3.json'},
{name:'Rice',cat:'Girls',url:'https://cdn.jsdelivr.net/gh/Live2D-Garage/CubismWebARSample/assets/models/Rice/Rice.model3.json'},
{name:'Mark',cat:'Boys',url:'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Mark/Mark.model3.json'},
{name:'Wanko',cat:'Mascot',url:'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Wanko/Wanko.model3.json'},
{name:'Shizuku',cat:'Classic',url:'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json'},
];
let voice=localStorage.getItem('vc-v')||'af_heart';
let modelUrl=localStorage.getItem('vc-m')||MODELS[0].url;
let connected=false,ttsOk=false,audioCtx=null;
let ws=null;
const WSS_URL=new URLSearchParams(location.search).get('wss')||'wss://voicechat.cruzlauroiii.workers.dev/ws';
function wssConnect(){
 if(ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING))return;
 try{
 ws=new WebSocket(WSS_URL);
 ws.onopen=()=>{connected=true;document.getElementById('status').textContent='Connected';document.getElementById('status').classList.add('on');addMsg('s','Connected via WSS')};
 ws.onclose=()=>{connected=false;document.getElementById('status').textContent='';document.getElementById('status').classList.remove('on');setTimeout(wssConnect,3000)};
 ws.onerror=()=>{ws.close()};
 ws.onmessage=(e)=>{
 try{
 const d=JSON.parse(e.data);
 if(d.type==='chat'){addMsg('a',d.content);speak(d.content)}
 else if(d.type==='error'){addMsg('s',d.content)}
 else if(d.type==='system'){addMsg('s',d.content)}
}catch{addMsg('a',e.data);speak(e.data)}
};
}catch(e){addMsg('s','WSS error: '+e.message);setTimeout(wssConnect,5000)}
}
const ttsWorker=new Worker('tts-worker.806b900fcd.js',{type:'module'});
let ttsResolve=null;
ttsWorker.onmessage=(e)=>{
 if(e.data.type==='ready'){ttsOk=true;document.getElementById('voiceLabel').textContent=voice;document.getElementById('ttsStatus').textContent='TTS Ready'}
 if(e.data.type==='error'){console.error('TTS worker:',e.data.message);if(ttsResolve){ttsResolve(null);ttsResolve=null}}
 if(e.data.type==='audio'&&ttsResolve){ttsResolve({audio:e.data.audio,sampling_rate:e.data.samplingRate});ttsResolve=null}
};
document.getElementById('voiceLabel').textContent='loading...';
document.getElementById('ttsStatus').textContent='TTS Loading...';
ttsWorker.postMessage({type:'init'});
let mdl=null,app=null,vx=0,vy=0,vs=1,origH=0,origW=0;
let visBounds=null;
let draggingLocked=false;
function fit(){
 if(!mdl||!app||!origH)return;
 const w=app.screen.width,h=app.screen.height;
 mdl.anchor.set(0.5,0.5);
 let s,cx=0,cy=0;
 if(visBounds&&visBounds.w>0&&visBounds.h>0){
 const pad=0.92;
 const sx=w*pad/visBounds.w;
 const sy=h*pad/visBounds.h;
 s=Math.min(sx,sy)*vs;
 cx=-visBounds.x*s;
 cy=-visBounds.y*s;
}else{
 s=(h*0.9)/origH*vs;
}
 mdl.scale.set(s);
 mdl.x=w/2+vx+cx;
 mdl.y=h/2+vy+cy;
 mdl.focus(w/2,h/3);
}
function computeVisibleBounds(){
 visBounds=null;
 if(!mdl)return;
 try{
 const cm=mdl.internalModel.coreModel;
 if(!cm.getDrawableCount||!cm.getDrawableVertexPositions)return;
 const n=cm.getDrawableCount();
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(let i=0;i<n;i++){
 if(cm.getDrawableOpacity(i)<0.01)continue;
 const v=cm.getDrawableVertexPositions(i);
 for(let j=0;j<v.length;j+=2){
 if(v[j]<minX)minX=v[j];if(v[j]>maxX)maxX=v[j];
 if(v[j+1]<minY)minY=v[j+1];if(v[j+1]>maxY)maxY=v[j+1];
}
}
 if(minX<Infinity){
 const cw=cm.getCanvasWidth();
 const ppu=origW/cw;
 visBounds={x:(minX+maxX)/2*ppu,y:(minY+maxY)/2*ppu,w:(maxX-minX)*ppu,h:(maxY-minY)*ppu};
}
}catch(e){console.warn('Visible bounds:',e)}
}
async function initL2D(){
 const c=document.getElementById('canvas');
 app=new PIXI.Application({view:c,resizeTo:window,backgroundAlpha:0,antialias:true});
 
 let gesture='none',startX=0,startY=0,lastX=0,lastY=0,lastDist=0,totalDelta=0;
 const DEAD_ZONE=8;
 function dist2(t){const dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY;return Math.sqrt(dx*dx+dy*dy)}
 function petAvatar(x,y){
 if(!mdl)return;
 try{mdl.motion('tap_body')}catch{}
 try{mdl.expression('f01')}catch{try{mdl.expression(0)}catch{}}
 addMsg('s','*pets avatar*');
}
 c.addEventListener('touchstart',e=>{
 if(draggingLocked||e.target!==c)return;
 e.preventDefault();
 if(e.touches.length===2){gesture='pinch';lastDist=dist2(e.touches)}
 else if(e.touches.length===1){gesture='pending';startX=lastX=e.touches[0].clientX;startY=lastY=e.touches[0].clientY;totalDelta=0}
},{passive:false});
 c.addEventListener('touchmove',e=>{
 if(draggingLocked)return;
 e.preventDefault();
 if(gesture==='pinch'&&e.touches.length===2){
 const d=dist2(e.touches);
 if(lastDist>0){vs*=1+(d/lastDist-1)*0.6;vs=Math.max(0.3,Math.min(5,vs));fit()}
 lastDist=d;
}else if(e.touches.length===1){
 const tx=e.touches[0].clientX,ty=e.touches[0].clientY;
 const dx=tx-lastX,dy=ty-lastY;
 totalDelta+=Math.abs(dx)+Math.abs(dy);
 if(gesture==='pending'){if(totalDelta>DEAD_ZONE){gesture='drag';lastX=tx;lastY=ty}}
 else if(gesture==='drag'){vx+=dx;vy+=dy;lastX=tx;lastY=ty;fit()}
}
},{passive:false});
 c.addEventListener('touchend',e=>{
 if(draggingLocked)return;
 if((gesture==='pending'||totalDelta<DEAD_ZONE)&&e.touches.length===0)petAvatar(startX,startY);
 if(e.touches.length===0){gesture='none';totalDelta=0}
 else if(e.touches.length===1){gesture='pending';lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;lastDist=0;totalDelta=0}
});
 let mGesture='none',mTotal=0,mStartX=0,mStartY=0;
 c.addEventListener('mousedown',e=>{if(draggingLocked)return;mGesture='pending';mStartX=lastX=e.clientX;mStartY=lastY=e.clientY;mTotal=0});
 c.addEventListener('mousemove',e=>{
 if(mdl&&!draggingLocked)mdl.focus(e.clientX,e.clientY);
 if(draggingLocked||mGesture==='none')return;
 const dx=e.clientX-lastX,dy=e.clientY-lastY;
 mTotal+=Math.abs(dx)+Math.abs(dy);
 if(mGesture==='pending'&&mTotal>DEAD_ZONE){mGesture='drag';lastX=e.clientX;lastY=e.clientY}
 else if(mGesture==='drag'){vx+=dx;vy+=dy;lastX=e.clientX;lastY=e.clientY;fit()}
});
 c.addEventListener('mouseup',()=>{if(!draggingLocked&&mGesture==='pending'&&mTotal<DEAD_ZONE)petAvatar(mStartX,mStartY);mGesture='none'});
 c.addEventListener('mouseleave',()=>{mGesture='none'});
 c.addEventListener('wheel',e=>{if(draggingLocked)return;e.preventDefault();vs*=e.deltaY>0?0.93:1.07;vs=Math.max(0.3,Math.min(5,vs));fit()},{passive:false});
 document.addEventListener('keydown',e=>{
 if(e.target.tagName==='INPUT'||draggingLocked)return;
 if(e.key==='+'||e.key==='='){vs*=1.1;fit()}
 if(e.key==='-'){vs*=0.9;fit()}
 if(e.key==='ArrowUp'){vy-=25;fit()}
 if(e.key==='ArrowDown'){vy+=25;fit()}
 if(e.key==='ArrowLeft'){vx-=25;fit()}
 if(e.key==='ArrowRight'){vx+=25;fit()}
});
 window.addEventListener('resize',()=>{app.renderer.resize(window.innerWidth,window.innerHeight);fit()});
 screen.orientation?.addEventListener('change',()=>{setTimeout(()=>{app.renderer.resize(window.innerWidth,window.innerHeight);fit()},200)});
 await loadModel(modelUrl);
}
async function loadModel(url){
 if(mdl){app.stage.removeChild(mdl);mdl.destroy();mdl=null}
 try{
 mdl=await PIXI.live2d.Live2DModel.from(url,{autoInteract:false,autoUpdate:true});
 app.stage.addChild(mdl);
 vx=0;vy=0;vs=1;vcx=0;vcy=0;
 origW=mdl.width;origH=mdl.height;
 visBounds=null;
 fit();
 setTimeout(()=>{computeVisibleBounds();fit()},500);
 mdl.on('hit',h=>{if(h.includes('body'))mdl.motion('tap_body');if(h.includes('head'))mdl.motion('flick_head')});
 modelUrl=url;localStorage.setItem('vc-m',url);
 addMsg('s','Model loaded');
}catch(e){addMsg('s','Model error: '+e.message);console.error(e)}
}
initL2D();
function generateTTS(text,v){
 return new Promise(resolve=>{
 ttsResolve=resolve;
 ttsWorker.postMessage({type:'generate',text,voice:v});
 setTimeout(()=>{if(ttsResolve===resolve){ttsResolve=null;resolve(null)}},30000);
});
}
async function speak(text){
 const clean=text.replace(/\*[^*]+\*/g,'').replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu,'').replace(/[#*_~`>]/g,'').replace(/\s{2,}/g,' ').trim();
 if(!clean)return;
 const bar=document.getElementById('bar');
 bar.classList.add('on');
 if(ttsOk){
 try{
 const r=await generateTTS(clean,voice);
 if(!r){bar.classList.remove('on');return}
 if(!audioCtx)audioCtx=new AudioContext();
 if(audioCtx.state==='suspended')await audioCtx.resume();
 const buf=audioCtx.createBuffer(1,r.audio.length,r.sampling_rate);
 buf.getChannelData(0).set(r.audio);
 const src=audioCtx.createBufferSource();
 const an=audioCtx.createAnalyser();an.fftSize=256;
 src.buffer=buf;src.connect(an);an.connect(audioCtx.destination);
 src.onended=()=>{bar.classList.remove('on');if(mdl)try{mdl.internalModel.coreModel.setParameterValueById('ParamMouthOpenY',0)}catch{}};
 src.start();
 if(mdl){
 const data=new Uint8Array(an.frequencyBinCount);
(function lp(){
 an.getByteFrequencyData(data);
 const avg=data.reduce((s,v)=>s+v,0)/data.length/255;
 try{mdl.internalModel.coreModel.setParameterValueById('ParamMouthOpenY',Math.min(avg*2.5,1))}catch{}
 if(bar.classList.contains('on'))requestAnimationFrame(lp);
})();
}
 return;
}catch(e){console.error('TTS:',e)}
}
 if(!audioCtx)audioCtx=new AudioContext();
 if(audioCtx.state==='suspended')await audioCtx.resume();
 const u=new SpeechSynthesisUtterance(clean);
 u.onend=()=>bar.classList.remove('on');
 u.onerror=()=>bar.classList.remove('on');
 speechSynthesis.speak(u);
}
function addMsg(t,x){
 const b=document.getElementById('msgs'),d=document.createElement('div');
 d.className='m '+(t==='u'?'u':t==='a'?'a':'s');
 const l=t==='u'?'You':t==='a'?'AIRI':'System';
 d.innerHTML='<div class="n '+(t==='u'?'user':t==='a'?'airi':'sys')+'">'+l+'</div><div class="b">'+x+'</div>';
 b.appendChild(d);b.scrollTop=b.scrollHeight;
}
let bridge=localStorage.getItem('vc-b')||'http://localhost:3456';
const params=new URLSearchParams(location.search);
if(params.get('bridge'))bridge=params.get('bridge');
window.send=async()=>{
 const i=document.getElementById('inp'),t=i.value.trim();
 if(!t)return;i.value='';addMsg('u',t);
 document.getElementById('btn').disabled=true;
 try{
 if(ws&&ws.readyState===WebSocket.OPEN){
 ws.send(JSON.stringify({type:'chat',content:t}));
}else{
 const r=await fetch(bridge+'/v1/chat/completions',{
 method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({model:'claude-code',messages:[{role:'user',content:t}],stream:false}),
 signal:AbortSignal.timeout(120000)
});
 const d=await r.json();
 if(d.error){addMsg('s',d.error.message)}
 else{const reply=d.choices?.[0]?.message?.content||'';addMsg('a',reply);speak(reply)}
}
}catch(e){addMsg('s',e.message)}
 finally{document.getElementById('btn').disabled=false}
};
const burgerBtn=document.getElementById('burgerBtn');
const nav=document.getElementById('nav');
const navOverlay=document.getElementById('navOverlay');
function toggleNav(){
 const open=nav.classList.toggle('open');
 navOverlay.classList.toggle('open',open);
 burgerBtn.classList.toggle('open',open);
}
function closeNav(){nav.classList.remove('open');navOverlay.classList.remove('open');burgerBtn.classList.remove('open')}
window.closeNav=closeNav;
burgerBtn.addEventListener('click',toggleNav);
navOverlay.addEventListener('click',closeNav);
const FRIENDLY={'ParamAngleX':'Head Turn','ParamAngleY':'Head Nod','ParamAngleZ':'Head Tilt','ParamEyeLOpen':'Left Eye Open','ParamEyeROpen':'Right Eye Open','ParamEyeBallX':'Eyes Left/Right','ParamEyeBallY':'Eyes Up/Down','ParamBrowLY':'Left Brow','ParamBrowRY':'Right Brow','ParamMouthOpenY':'Mouth Open','ParamMouthForm':'Smile','ParamBodyAngleX':'Body Turn','ParamBodyAngleY':'Body Lean','ParamBodyAngleZ':'Body Tilt','ParamBreath':'Breathing','ParamHairFront':'Hair Front','ParamHairBack':'Hair Back','ParamHairSide':'Hair Side','ParamArmLA':'Left Arm','ParamArmRA':'Right Arm','ParamHandL':'Left Hand','ParamHandR':'Right Hand','ParamCheek':'Blush'};
window.draw=(type)=>{
 closeNav();
 const d=document.getElementById('dw'),b=document.getElementById('dwb'),h=document.getElementById('dwt');
 const isCustomize=type==='customize';
 draggingLocked=isCustomize;
 if(type==='voice'){
 h.textContent='Voice';
 let html='';
 for(const[cat,vs2]of Object.entries(VOICES)){
 html+='<div class="f"><label>'+cat+'</label><div>';
 for(const v of vs2)html+='<span class="vc'+(v===voice?' on':'')+'" onclick="window.pick(\''+v+'\')">'+v+'</span>';
 html+='</div></div>';
}
 b.innerHTML=html;
}else if(type==='model'){
 h.textContent='Model';
 const cats={};for(const m of MODELS){if(!cats[m.cat])cats[m.cat]=[];cats[m.cat].push(m)}
 let html='';
 for(const[cat,ms]of Object.entries(cats)){
 html+='<div class="f"><label>'+cat+'</label><div>';
 for(const m of ms)html+='<span class="vc'+(m.url===modelUrl?' on':'')+'" onclick="window.lm(\''+m.url.replace(/'/g,"\\'")+'\')">'+m.name+'</span>';
 html+='</div></div>';
}
 html+='<div class="f" style="margin-top:8px"><label>Custom URL(.model3.json or .model.json)</label><input id="cu" placeholder="https://..."><button onclick="window.lm(document.getElementById(\'cu\').value)" style="margin-top:6px;padding:8px 16px;background:#c084fc;border:none;border-radius:7px;color:white;cursor:pointer;font-size:16px;">Load</button></div>';
 b.innerHTML=html;
}else if(isCustomize){
 h.textContent='Customize Avatar';
 let html='<div style="display:flex;gap:8px;margin-bottom:12px"><button onclick="window.resetParams()" style="padding:8px 16px;background:#c084fc;border:none;border-radius:7px;color:white;cursor:pointer;font-size:.85em">Reset All</button><label style="padding:8px;font-size:.75em;color:#666;cursor:pointer"><input type="file" accept="image/*" onchange="window.swapTexture(this.files[0])" style="display:none">Replace Texture</label></div>';
 if(!mdl){b.innerHTML='<p style="color:#888;">No model loaded</p>';d.classList.add('open');return}
 try{
 const cm=mdl.internalModel.coreModel;
 let count=0;
 try{count=cm.getParameterCount()}catch{try{count=cm._parameterIds?cm._parameterIds.length:cm._model?.parameters?.ids?.length||0}catch{}}
 const groups={'Face':[],'Body':[],'Hair':[],'Other':[]};
 for(let i=0;i<count;i++){
 try{
 let id;try{id=cm.getParameterId(i)}catch{id=cm._parameterIds?cm._parameterIds[i]:'param_'+i}
 let min=-30,max=30,val=0;
 try{min=cm.getParameterMinimumValue(i)}catch{}
 try{max=cm.getParameterMaximumValue(i)}catch{}
 try{val=cm.getParameterValue(i)}catch{}
 const friendly=FRIENDLY[id]||id.replace('Param','');
 const cat=id.match(/Eye|Brow|Mouth|Cheek|Angle[XYZ]$/)?'Face':id.match(/Body|Arm|Hand|Breath/)?'Body':id.match(/Hair/)?'Hair':'Other';
 groups[cat].push({id,friendly,min,max,val,i});
}catch{}
}
 for(const[cat,params]of Object.entries(groups)){
 if(!params.length)continue;
 html+='<div class="f"><label style="color:#c084fc;font-weight:600;">'+cat+'</label>';
 for(const p of params){
 html+='<div style="display:flex;align-items:center;gap:6px;margin:4px 0;"><span style="font-size:.75em;color:#aaa;width:100px;flex-shrink:0;">'+p.friendly+'</span><input type="range" min="'+p.min+'" max="'+p.max+'" step="0.01" value="'+p.val+'" oninput="window.setParam(\''+p.id+'\',this.value,this)" style="flex:1;accent-color:#c084fc;"><span class="pv" style="font-size:.7em;color:#666;width:32px;text-align:right;">'+p.val.toFixed(1)+'</span></div>';
}
 html+='</div>';
}
 const pcount=typeof cm.getPartCount==='function'?cm.getPartCount():0;
 if(pcount>0){
 html+='<div class="f"><label style="color:#c084fc;font-weight:600;">Parts(Show/Hide)</label>';
 for(let i=0;i<pcount;i++){
 try{
 const id=cm.getPartId(i),op=cm.getPartOpacityByIndex(i);
 const name=id.replace('Part','').replace(/([A-Z])/g,' $1').trim();
 html+='<div style="display:flex;align-items:center;gap:6px;margin:3px 0;"><span style="font-size:.72em;color:#aaa;flex:1;">'+name+'</span><input type="range" min="0" max="1" step="0.05" value="'+op+'" oninput="window.setPart('+i+',this.value,this)" style="width:80px;accent-color:#c084fc;"></div>';
}catch{}
}
 html+='</div>';
}
}catch(e){html='<p style="color:#f87171;">Error: '+e.message+'</p>'}
 b.innerHTML=html;
}else{
 h.textContent='Settings';
 const wssUrl=WSS_URL;
 b.innerHTML='<div class="f"><label>WSS Endpoint</label><input value="'+wssUrl+'" readonly style="opacity:.6"></div><div class="f"><label>Voice</label><p style="font-size:.85em;color:#c084fc;">'+voice+'</p></div><div class="f"><label>Controls</label><p style="font-size:.8em;color:#666;line-height:1.8;">Tap avatar = Pet<br>One finger drag = Pan<br>Two finger pinch = Zoom<br>Scroll wheel = Zoom<br>+/- keys = Zoom<br>Arrow keys = Pan</p></div>';
}
 d.classList.add('open');
};
window.closeDw=()=>{document.getElementById('dw').classList.remove('open');draggingLocked=false};
window.resetParams=()=>{if(mdl)loadModel(modelUrl)};
window.swapTexture=(file)=>{
 if(!mdl||!file)return;
 const img=new Image();
 img.onload=()=>{
 const gl=app.renderer.gl;
 const tex=gl.createTexture();
 gl.bindTexture(gl.TEXTURE_2D,tex);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
 mdl.internalModel.bindTexture(0,tex);
 addMsg('s','Texture replaced');
};
 img.src=URL.createObjectURL(file);
};
window.setParam=(id,val,el)=>{if(!mdl)return;try{mdl.internalModel.coreModel.setParameterValueById(id,parseFloat(val))}catch{};el.nextElementSibling.textContent=parseFloat(val).toFixed(1)};
window.setPart=(idx,val,el)=>{if(!mdl)return;try{mdl.internalModel.coreModel.setPartOpacityByIndex(idx,parseFloat(val))}catch{}};
window.pick=(v)=>{voice=v;localStorage.setItem('vc-v',v);document.getElementById('voiceLabel').textContent=v;document.querySelectorAll('.vc').forEach(e=>e.classList.toggle('on',e.textContent===v))};
window.lm=async(u)=>{if(u)await loadModel(u);window.closeDw()};
(async()=>{
 const tryUrls=[bridge,'http://localhost:3456','http://192.168.100.160:3456','http://192.168.100.164:3456'];
 for(const url of tryUrls){
 try{
 const r=await fetch(url+'/v1/models',{signal:AbortSignal.timeout(2000)});
 if(r.ok){bridge=url;localStorage.setItem('vc-b',url);connected=true;document.getElementById('status').textContent='Connected';document.getElementById('status').classList.add('on');addMsg('s','Connected to '+url);return}
}catch{}
}
 wssConnect();
})();