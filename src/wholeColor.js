import {loadTemplate,PROFILE_ID} from './profileRig.js';
import {readProject,updateProject} from './projectStorage.js';
import {loadColoredPart,saveColoredPart,blobToImage} from './colorStorage.js';
import {loadRig} from './loadRig.js';
import {buildBoundaryMask,parseHexColor,floodFill,strokePaint,canvasToPngBlob} from './colorFill.js';
import {remember} from './undoHistory.js';
import {downscalePhoto,loadImageFile,openAlignOverlay} from './photoImport.js';
const canvas=document.getElementById('wholeCanvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),status=document.getElementById('colorStatus');
const colors=[['朱紅','#BC3532'],['橙','#E69542'],['金黃','#E8BC54'],['青綠','#3F887C'],['藍','#417BA0'],['紫','#895B9A'],['粉','#D9879D'],['褐','#936B45'],['白','#FFFFFF'],['灰','#A4A4A4']];
let data,original,lock,color=colors[0][1],tool='brush',size=10,history=[],drawing=false,previous=null,before=null,touched=0,revision=0,savedRevision=0,pending=0,queue=Promise.resolve(),ready=false;
function message(text,error=false){status.textContent=text;status.classList.toggle('is-error',error);}
function copy(image){return new ImageData(image.data.slice(),image.width,image.height);}
function fit(){const wrap=document.getElementById('wholeWrap');const scale=Math.min((wrap.clientWidth-24)/canvas.width,(wrap.clientHeight-24)/canvas.height);canvas.style.width=Math.max(1,canvas.width*scale)+'px';canvas.style.height=Math.max(1,canvas.height*scale)+'px';}
function render(){ctx.putImageData(data,0,0);document.getElementById('undo').disabled=!history.length;}
function syncTools(){for(const id of ['brush','fill','eraser'])document.getElementById(id).setAttribute('aria-pressed',id===tool);for(const b of document.querySelectorAll('[data-size]'))b.setAttribute('aria-pressed',Number(b.dataset.size)===size);}
function save(doneMsg){const version=revision,snapshot=copy(data);pending++;message('儲存中…');queue=queue.then(async()=>{try{const off=document.createElement('canvas');off.width=canvas.width;off.height=canvas.height;off.getContext('2d').putImageData(snapshot,0,0);await saveColoredPart(PROFILE_ID,'whole',await canvasToPngBlob(off));savedRevision=Math.max(savedRevision,version);document.getElementById('retry').hidden=true;if(savedRevision===revision)message(doneMsg||'已自動儲存・喜歡就可以上幕');}catch(e){message('未能儲存，畫面保留。請重試儲存。',true);document.getElementById('retry').hidden=false;}finally{pending--;}});return queue;}
function point(ev){const r=canvas.getBoundingClientRect();return {x:(ev.clientX-r.left)*canvas.width/r.width,y:(ev.clientY-r.top)*canvas.height/r.height};}
function paint(p){touched+=strokePaint(data.data,canvas.width,canvas.height,previous,p,size,parseHexColor(color),lock,original.data,tool==='eraser'?'eraser':'brush');previous=p;render();}
function finish(){if(!drawing)return;drawing=false;if(touched){remember(history,before);revision++;save();}before=null;previous=null;render();}
canvas.addEventListener('pointerdown',ev=>{if(!ready||drawing||!ev.isPrimary||(ev.pointerType==='mouse'&&ev.button!==0))return;ev.preventDefault();const p=point(ev);before=copy(data);if(tool==='fill'){const n=floodFill(data.data,canvas.width,canvas.height,Math.floor(p.x),Math.floor(p.y),parseHexColor(color),lock);if(n){remember(history,before);revision++;render();save();}before=null;return;}canvas.setPointerCapture(ev.pointerId);drawing=true;touched=0;previous=null;paint(p);});
canvas.addEventListener('pointermove',ev=>{if(drawing&&ev.isPrimary){ev.preventDefault();paint(point(ev));}});
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
for(const id of ['brush','fill','eraser'])document.getElementById(id).onclick=()=>{finish();tool=id;syncTools();};
for(const b of document.querySelectorAll('[data-size]'))b.onclick=()=>{size=Number(b.dataset.size);syncTools();};
for(const [label,hex]of colors){const b=document.createElement('button');b.className='swatch';b.style.background=hex;b.setAttribute('aria-label',label);b.onclick=()=>{color=hex;if(tool==='eraser')tool='brush';for(const el of b.parentNode.children)el.classList.toggle('active',el===b);syncTools();};document.getElementById('wholePalette').append(b);}
document.getElementById('undo').onclick=()=>{finish();if(history.length){data=history.pop();revision++;render();save();}};
document.getElementById('retry').onclick=()=>save();
for(const id of ['backHome','enterStage'])document.getElementById(id).onclick=async ev=>{ev.preventDefault();if(!ready)return;finish();if(revision!==savedRevision)save();await queue;if(revision===savedRevision)location.href=document.getElementById(id).href;};
window.addEventListener('beforeunload',ev=>{if(pending||revision!==savedRevision){ev.preventDefault();ev.returnValue='';}});
new ResizeObserver(fit).observe(document.getElementById('wholeWrap'));

async function applyPhotoFile(file){if(!ready||!file)return;finish();try{message('載入相片…');const img=await loadImageFile(file);const photoCanvas=downscalePhoto(img);const result=await openAlignOverlay({template:original,photoCanvas,host:document.body});if(!result){message('已取消影相，作品未改動');return;}const beforeShot=copy(data);data=result;remember(history,beforeShot);revision++;render();save('影完紙稿會套入悟空輪廓；可再畫筆修改');}catch(e){message('未能套入相片：'+(e.message||e),true);}}
function wirePhoto(btnId,inputId){const btn=document.getElementById(btnId),input=document.getElementById(inputId);if(!btn||!input)return;btn.onclick=()=>{if(!ready)return;input.value='';input.click();};input.addEventListener('change',()=>{const f=input.files&&input.files[0];const chooser=document.getElementById('photoChooser');if(chooser)chooser.hidden=true;if(f)applyPhotoFile(f);});}
wirePhoto('photoCamera','photoCameraInput');
wirePhoto('photoAlbum','photoAlbumInput');
const photoChooser=document.getElementById('photoChooser');
document.getElementById('photoEntry').onclick=()=>{if(!ready)return;if(photoChooser)photoChooser.hidden=!photoChooser.hidden;};
async function init(){try{let project=await readProject();if(!project){const old=await loadRig('./characters/wukong/rig.json');project=await updateProject(old.hasColored?{assetVersion:'wukong-legacy-v1',characterId:'wukong',coloredPartIds:old.coloredPartIds}:{});}if(project.assetVersion==='wukong-legacy-v1'){location.replace('./legacy-color.html');return;}
const template=await loadTemplate();canvas.width=template.width;canvas.height=template.height;original=template.getContext('2d').getImageData(0,0,canvas.width,canvas.height);data=copy(original);lock=buildBoundaryMask(original.data,canvas.width,canvas.height);const blob=await loadColoredPart(PROFILE_ID,'whole');if(blob){const img=await blobToImage(blob);ctx.drawImage(img,0,0,canvas.width,canvas.height);data=ctx.getImageData(0,0,canvas.width,canvas.height);}fit();render();ready=true;syncTools();message('可填色，或「影相入偶」套紙稿。唔使填晒先可以演。');}catch(e){message('未能載入原有作品，請重新載入：'+e.message,true);}}
init();
