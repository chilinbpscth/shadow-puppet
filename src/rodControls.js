import {resolveManualJoints, applyDrag, distalTip, clonePose} from './dragPose.js';
import {moveBodyRod} from './rodMotion.js';

export function createRodControls({railEl, getPose, getRig, onPoseChange, canvas}) {
  let mode = 'rods', visible = true;
  const active = new Map(), grips = new Map(), lines = new Map();
  const column = canvas.closest('.stage-column');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('rod-lines'); svg.setAttribute('aria-hidden','true');
  column.append(svg);
  const rods = [
    {id:'left', label:'空手棍', kind:'wrist', chain:['upperArmL','lowerArmL'], tip:'lowerArmL', slot:.2},
    {id:'body', label:'身棍', kind:'torso', slot:.5},
    {id:'right', label:'持棒手棍', kind:'wrist', chain:['upperArmR','lowerArmR'], tip:'lowerArmR', slot:.8},
  ];
  railEl.replaceChildren();
  for (const rod of rods) {
    const grip = document.createElement('button');
    grip.type = 'button'; grip.className = 'rod-grip rod-grip--' + rod.kind;
    grip.setAttribute('aria-label',rod.label+'：拖動推提');
    grip.innerHTML = '<span class="rod-grip-knob" aria-hidden="true"></span><span class="rod-grip-label">'+rod.label+'</span>';
    railEl.append(grip); grips.set(rod.id,grip);
    const line = document.createElementNS(ns,'line');
    line.setAttribute('stroke',rod.kind === 'torso' ? '#ad8045' : '#488595');
    line.setAttribute('stroke-width','3'); line.setAttribute('stroke-linecap','round');
    line.setAttribute('opacity','.8'); svg.append(line); lines.set(rod.id,line);
    grip.addEventListener('pointerdown',ev=>down(ev,rod,grip));
    grip.addEventListener('pointermove',ev=>move(ev,rod));
    for (const type of ['pointerup','pointercancel','lostpointercapture']) grip.addEventListener(type,ev=>up(ev,rod));
    grip.addEventListener('contextmenu',ev=>ev.preventDefault());
    grip.addEventListener('keydown',ev=>{
      const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[ev.key];
      if (!delta || mode!=='rods' || !visible) return;
      ev.preventDefault(); const pose=getPose(),rig=getRig(); if(!pose||!rig)return;
      if(rod.kind==='torso') applyBody(pose,moveBodyRod(rig,pose,...delta));
      else {const p=target(rig,pose,rod);applyDrag(rig,pose,{kind:'wrist',chain:rod.chain},p.x+delta[0],p.y+delta[1]);}
      onPoseChange();syncGripPositions();
    });
  }
  function target(rig,pose,rod) {
    const joints=resolveManualJoints(rig,pose);
    if(rod.kind==='torso') {const p=joints.get('head')||joints.get('torso');return {x:p.x,y:p.y};}
    return distalTip(joints.get(rod.tip),pose.scale);
  }
  function down(ev,rod,grip) {
    if(mode!=='rods'||!visible||active.has(rod.id)||(ev.pointerType==='mouse'&&ev.button!==0))return;
    const pose=getPose(),rig=getRig();if(!pose||!rig)return;
    ev.preventDefault();const rect=canvas.getBoundingClientRect(),r=grip.getBoundingClientRect();
    active.set(rod.id,{pointer:ev.pointerId,base:clonePose(pose),start:target(rig,pose,rod),x:ev.clientX,y:ev.clientY,cx:r.left+r.width/2,cy:r.top+20,dx:0,dy:0,sx:canvas.width/rect.width,sy:canvas.height/rect.height});
    grip.setPointerCapture(ev.pointerId);grip.classList.add('dragging');syncGripPositions();
  }
  function applyBody(pose,next) {
    pose.rootX=next.rootX;pose.rootY=next.rootY;
    for(const id of ['thighL','thighR','shinL','shinR','tail']) pose.localRot.set(id,next.localRot.get(id));
  }
  function move(ev,rod) {
    const drag=active.get(rod.id);if(!drag||drag.pointer!==ev.pointerId)return;
    ev.preventDefault();const pose=getPose(),rig=getRig();
    drag.dx=ev.clientX-drag.x;drag.dy=ev.clientY-drag.y;
    const dx=drag.dx*drag.sx,dy=drag.dy*drag.sy;
    if(rod.kind==='torso') {
      applyBody(pose,moveBodyRod(rig,drag.base,dx,dy));
      // A second finger can hold a hand rod while the body moves underneath it.
      for(const hand of rods.filter(r=>r.kind==='wrist')) {
        const held=active.get(hand.id);if(held)applyDrag(rig,pose,{kind:'wrist',chain:hand.chain},held.start.x+held.dx*held.sx,held.start.y+held.dy*held.sy);
      }
    } else applyDrag(rig,pose,{kind:'wrist',chain:rod.chain},drag.start.x+dx,drag.start.y+dy);
    onPoseChange();syncGripPositions();
  }
  function up(ev,rod) {
    const drag=active.get(rod.id);if(!drag||drag.pointer!==ev.pointerId)return;
    active.delete(rod.id);const grip=grips.get(rod.id);grip.classList.remove('dragging');
    if(grip.hasPointerCapture(ev.pointerId))grip.releasePointerCapture(ev.pointerId);
    syncGripPositions();
  }
  function cancelDrags() {
    for(const [id,drag] of [...active]) up({pointerId:drag.pointer},rods.find(r=>r.id===id));
  }
  const turn=document.getElementById('rodTurn');
  turn.addEventListener('input',()=>{
    if(mode!=='rods'||!visible)return;
    cancelDrags();const pose=getPose();if(!pose)return;
    const facing=Number(turn.value)<0?-1:1;
    if(pose.facing!==facing){pose.facing=facing;onPoseChange();}
  });
  turn.addEventListener('change',()=>{turn.value=getPose()?.facing===-1?-100:100;});
  function syncGripPositions() {
    const hidden=mode!=='rods'||!visible;
    svg.style.display=hidden?'none':'';
    if(hidden)return;
    const rig=getRig(),pose=getPose();if(!rig||!pose)return;
    const c=canvas.getBoundingClientRect(),r=railEl.getBoundingClientRect(),box=column.getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    for(const rod of rods) {
      const grip=grips.get(rod.id),drag=active.get(rod.id);
      const slot=pose.facing===-1 ? 1-rod.slot : rod.slot;
      const gx=drag?drag.cx+drag.dx:r.left+r.width*slot,gy=drag?drag.cy+drag.dy:r.top+20;
      grip.style.left=(gx-r.left)+'px';grip.style.top=(gy-r.top-20)+'px';
      const joint=target(rig,pose,rod),line=lines.get(rod.id);
      line.setAttribute('x1',c.left+joint.x/canvas.width*c.width-box.left);
      line.setAttribute('y1',c.top+joint.y/canvas.height*c.height-box.top);
      line.setAttribute('x2',gx-box.left);line.setAttribute('y2',gy-box.top);
      line.setAttribute('stroke-width',drag?'5':'3');
    }
    if(document.activeElement!==turn)turn.value=pose.facing===-1?-100:100;
    turn.setAttribute('aria-valuetext',pose.facing===-1?'面向左邊':'面向右邊');
  }
  function setMode(next) {
    cancelDrags();mode=next==='joints'?'joints':'rods';
    railEl.hidden=mode!=='rods';turn.closest('label').hidden=mode!=='rods';syncGripPositions();
  }
  function setVisible(next) {visible=next;svg.style.display=!next||mode!=='rods'?'none':'';}
  window.addEventListener('blur',cancelDrags);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrags();});
  new ResizeObserver(()=>{cancelDrags();syncGripPositions();}).observe(column);
  return {setMode,getMode:()=>mode,setVisible,syncGripPositions,cancelDrags,isDragging:()=>active.size>0};
}
