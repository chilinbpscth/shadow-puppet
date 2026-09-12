import {loadColoredPart,blobToImage} from './colorStorage.js';
export const PROFILE_ID='wukong-v2';
export const TEMPLATE_URL='./characters/wukong-v2/template.png';
export const TEMPLATE_WIDTH=640;
export const TEMPLATE_HEIGHT=960;
export async function loadTemplate(){
  const image=new Image();image.src=TEMPLATE_URL;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=TEMPLATE_WIDTH;canvas.height=TEMPLATE_HEIGHT;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  // The source contains a checkerboard. Remove only the edge-connected backdrop;
  // closed white clothing regions remain opaque and paintable.
  const {data}=pixels,w=canvas.width,h=canvas.height,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const add=i=>{if(i<0||i>=w*h||seen[i])return;const p=i*4;if(data[p]+data[p+1]+data[p+2]<270)return;seen[i]=1;queue[tail++]=i;};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(head<tail){const i=queue[head++];if(i%w)add(i-1);if(i%w<w-1)add(i+1);add(i-w);add(i+w);}
  for(let i=0;i<w*h;i++){const p=i*4;if(seen[i])data[p+3]=0;else if(data[p]>215&&data[p+1]>215&&data[p+2]>215)data[p]=data[p+1]=data[p+2]=255;}
  ctx.putImageData(pixels,0,0);return canvas;
}

// These regions and joints are internal. The student always paints the intact figure.
// Source coordinates refer to the 1024 x 1536 design; they are scaled at runtime.
const regions=[
 {id:'head',labelZh:'頭',pivot:[567,332],angle:0,parent:'torso',polygon:[[409,20],[719,20],[719,332],[604,350],[540,315],[421,304]]},
 {id:'lowerArmL',labelZh:'左手',pivot:[324,565],tip:[213,824],parent:'upperArmL',polygon:[[288,532],[355,545],[368,663],[260,751],[274,886],[244,933],[157,930],[134,832],[192,725],[236,631]]},
 {id:'upperArmL',labelZh:'左上臂',pivot:[468,390],tip:[324,565],parent:'torso',polygon:[[450,351],[506,365],[517,409],[447,584],[293,539],[278,511],[374,428]]},
 {id:'lowerArmR',labelZh:'右手',pivot:[724,587],tip:[919,568],parent:'upperArmR',polygon:[[707,557],[851,555],[878,516],[906,506],[980,511],[982,613],[889,626],[772,677],[697,638],[682,611]]},
 {id:'shinL',labelZh:'左小腿',pivot:[450,1055],tip:[331,1364],parent:'thighL',polygon:[[429,1025],[494,1040],[515,1274],[406,1278],[388,1385],[497,1414],[503,1507],[248,1507],[285,1407],[303,1326],[339,1229],[299,1188]]},
 {id:'shinR',labelZh:'右小腿',pivot:[699,1055],tip:[750,1365],parent:'thighR',polygon:[[662,1028],[733,1029],[820,1286],[781,1291],[802,1394],[938,1414],[946,1509],[676,1514],[656,1452],[707,1367],[652,1257],[583,1244]]},
 {id:'thighL',labelZh:'左腿',pivot:[569,886],tip:[450,1055],parent:'torso',polygon:[[437,928],[591,865],[596,951],[540,1033],[481,1075],[421,1061],[401,1006],[402,957]]},
 {id:'thighR',labelZh:'右腿',pivot:[638,888],tip:[699,1055],parent:'torso',polygon:[[587,900],[706,924],[741,978],[749,1030],[725,1078],[672,1072],[627,1040],[591,961]]},
 {id:'tail',labelZh:'尾巴',pivot:[414,956],angle:0,parent:'torso',polygon:[[409,941],[425,961],[359,1055],[291,1120],[189,1159],[80,1128],[51,1080],[48,996],[93,945],[145,935],[170,972],[120,1017],[110,1045],[157,1090],[226,1097],[307,1056]]},
 {id:'upperArmR',labelZh:'右上臂',pivot:[644,480],tip:[724,587],parent:'torso',polygon:[[656,489],[691,505],[751,564],[725,615],[690,625],[670,577]]},
 {id:'staff',labelZh:'金箍棒',pivot:[919,568],angle:0,parent:'lowerArmR',polygon:[[892,95],[977,95],[977,1400],[879,1400]]},
 {id:'torso',labelZh:'身體',pivot:[644,640],angle:0,parent:null,polygon:[[0,0],[1024,0],[1024,1536],[0,1536]]},
];
function inside(x,y,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;}
function localPoint(point,pivot,angle){const dx=point[0]-pivot[0],dy=point[1]-pivot[1];return [dx*Math.cos(angle)+dy*Math.sin(angle),-dx*Math.sin(angle)+dy*Math.cos(angle)];}
export function buildProfileRig(source){
  const ratio=source.width/1024,w=source.width,h=source.height;
  const pixels=source.getContext('2d').getImageData(0,0,w,h);
  const layers=regions.map(()=>new ImageData(w,h));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;if(!pixels.data[i+3])continue;
    const owner=regions.findIndex(r=>inside(x/ratio,y/ratio,r.polygon));
    layers[owner].data.set(pixels.data.subarray(i,i+4),i);
  }
  // Ignore isolated anti-alias fragments from the raster outline at cut boundaries.
  // Staff legitimately has two sections separated by the gripping hand.
  layers.forEach((layer,layerIndex)=>{
    if(regions[layerIndex].id==='staff')return;
    const data=layer.data,seen=new Uint8Array(w*h),components=[];
    for(let start=0;start<w*h;start++){
      if(seen[start]||!data[start*4+3])continue;
      const component=[start];seen[start]=1;
      for(let q=0;q<component.length;q++){
        const at=component[q],x=at%w,y=Math.floor(at/w);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy,n=ny*w+nx;
          if(nx<0||nx>=w||ny<0||ny>=h||seen[n]||!data[n*4+3])continue;
          seen[n]=1;component.push(n);
        }
      }
      components.push(component);
    }
    components.sort((a,b)=>b.length-a.length);
    for(const component of components.slice(1)){
      for(const i of component)data.fill(0,i*4,i*4+4);
    }
  });
  // Small shared joint discs cover the seam as the two pieces rotate.
  regions.forEach((r,i)=>{
    if(!r.parent||r.id==='staff'||r.id==='tail'||r.id==='head')return;
    const parentIndex=regions.findIndex(p=>p.id===r.parent),radius=19*ratio;
    const px=r.pivot[0]*ratio,py=r.pivot[1]*ratio;
    for(let y=Math.max(0,Math.floor(py-radius));y<Math.min(h,py+radius);y++)for(let x=Math.max(0,Math.floor(px-radius));x<Math.min(w,px+radius);x++){
      if((x-px)**2+(y-py)**2>radius**2)continue;
      const at=(y*w+x)*4;
      for(const target of [i,parentIndex])layers[target].data.set(pixels.data.subarray(at,at+4),at);
    }
  });
  const angles=new Map(regions.map(r=>[r.id,r.tip?Math.atan2(r.tip[1]-r.pivot[1],r.tip[0]-r.pivot[0])-Math.PI/2:r.angle]));
  const rig={id:PROFILE_ID,labelZh:'孫悟空',assetVersion:'wukong-profile-v2',profile:true,parts:[]};const images=new Map();
  regions.forEach((r,i)=>{
    const angle=angles.get(r.id),pivot=r.pivot.map(v=>v*ratio);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(layers[i].data[(y*w+x)*4+3]){const [a,b]=localPoint([x,y],pivot,angle);minX=Math.min(minX,a);minY=Math.min(minY,b);maxX=Math.max(maxX,a);maxY=Math.max(maxY,b);}
    minX=Math.floor(Math.min(minX,-8));minY=Math.floor(Math.min(minY,-8));maxX=Math.ceil(Math.max(maxX,8));maxY=Math.ceil(Math.max(maxY,8));
    const atlas=document.createElement('canvas');atlas.width=w;atlas.height=h;atlas.getContext('2d').putImageData(layers[i],0,0);
    const partCanvas=document.createElement('canvas');partCanvas.width=maxX-minX+2;partCanvas.height=maxY-minY+2;const ctx=partCanvas.getContext('2d');
    ctx.translate(-minX,-minY);ctx.rotate(-angle);ctx.translate(-pivot[0],-pivot[1]);ctx.drawImage(atlas,0,0);
    const parent=regions.find(p=>p.id===r.parent);const parentAngle=parent?angles.get(parent.id):0;
    const offset=parent?localPoint(pivot,parent.pivot.map(v=>v*ratio),parentAngle):[0,0];
    const tip=r.tip?localPoint(r.tip.map(v=>v*ratio),pivot,angle):null;
    const part={id:r.id,labelZh:r.labelZh,width:partCanvas.width,height:partCanvas.height,pivot:{x:-minX/partCanvas.width,y:-minY/partCanvas.height},defaultPose:{parent:r.parent,x:offset[0],y:offset[1],rotation:angle-parentAngle},drawOrder:r.id==='staff'?0:r.id==='torso'?20:r.id==='head'?50:30};
    if(tip)part.tip={x:(tip[0]-minX)/part.width,y:(tip[1]-minY)/part.height};
    rig.parts.push(part);images.set(r.id,partCanvas);
  });
  return {rig,images};
}
export async function loadProfileRig(applyColored=true){const template=await loadTemplate();let hasColored=false;if(applyColored){const blob=await loadColoredPart(PROFILE_ID,'whole');if(blob){const img=await blobToImage(blob);const c=template.getContext('2d');c.clearRect(0,0,template.width,template.height);c.drawImage(img,0,0,template.width,template.height);hasColored=true;}}return {...buildProfileRig(template),hasColored,coloredPartIds:hasColored?['whole']:[]};}
