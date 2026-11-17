'use strict';

const splitCanvas = $('#splitCanvas');
const splitDialog = $('#splitDialog');
const regionColors = {product:'#16ae96',badge:'#f47e19',sub:'#487cff'};
const regionLabels = {product:'제품',badge:'배지',sub:'문구'};
let splitState = null;

function pixelStyle(layer) {
  return [layer.color,layer.size,layer.font,layer.weight,layer.align,layer.outline,layer.shape,layer.fill,(layer.colors||[]).join(',')].join('|');
}
function rasterCanvas(width,height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function rectangle(x1,y1,x2,y2) {
  return [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
}
function traceRegion(ctx,points,width,height) {
  ctx.beginPath();
  points.forEach(([x,y],i)=>i?ctx.lineTo(x*width,y*height):ctx.moveTo(x*width,y*height));
  ctx.closePath();
}
// auto=true opens the editor straight from the pre-computed text/product
// regions; the region dialog is only for re-selection or images with no
// detected regions.
// The regions found automatically for a record, ready for buildRasterDraft.
async function splitStart(record) {
  const image = await bitmap(record.original);
  const scale = Math.min(1,1600/image.naturalWidth,2400/image.naturalHeight);
  const width = Math.max(1,Math.round(image.naturalWidth*scale));
  const height = Math.max(1,Math.round(image.naturalHeight*scale));
  const original = rasterCanvas(width,height);
  original.getContext('2d').drawImage(image,0,0,width,height);
  const suggestions = window.STUDIO_LAYER_MAP?.[record.id];
  const regions = [];
  if(suggestions?.mask) {
    const mask = await bitmap('data:image/png;base64,'+suggestions.mask);
    regions.push({kind:'product',mask,enabled:true});
  }
  let lines = suggestions?.lines || [];
  if(!suggestions && window.TextDetector) {
    try {
      const found = await new TextDetector().detect(original);
      lines = found.map(({rawValue,boundingBox:b})=>[rawValue,b.x/width,b.y/height,b.width/width,b.height/height]);
    } catch { /* Manual text regions remain available. */ }
  }
  for(const [text,x,y,w,h] of lines.slice(0,100)) {
    const badgeCopy=(record.copy?.badge||'').replace(/\s/g,'');
    if(w<.49 && h<.19 && (badgeCopy===text.replace(/\s/g,'') || /^(무료배송|한정수량|특가|신규|NEW|BEST|쿠폰)$/i.test(text.trim()))){
      const px=Math.min(.04,h*.45),py=Math.min(.022,h*.3);
      regions.push({kind:'badge',enabled:true,points:rectangle(Math.max(0,x-px),Math.max(0,y-py),Math.min(1,x+w+px),Math.min(1,y+h+py))});
    }
    if(w<=0||h<=0)continue;
    const dx=Math.min(.005,h*.04),dy=Math.min(.006,h*.1);
    regions.push({kind:'sub',text,sourceText:text,points:rectangle(Math.max(0,x-dx),Math.max(0,y-dy),Math.min(1,x+w+dx),Math.min(1,y+h+dy)),enabled:true});
  }
  return {record,original,regions,points:[],start:null};
}
// The layered draft the editor would open with, without opening it. null when nothing
// was found automatically and the regions have to be marked by hand.
async function autoDraft(record) {
  const state = await splitStart(record);
  return state.regions.length ? buildRasterDraft(state) : null;
}
async function openRasterLayers(record,button,auto=false) {
  button.disabled = true;
  try {
    splitState = await splitStart(record);
    const {original,regions} = splitState, {width,height} = original;
    if(auto && regions.length){
      await new Promise(requestAnimationFrame);
      const draft = await buildRasterDraft(splitState);
      splitState = null;
      $('#detail').close();
      showEditor(draft,true);
      return;
    }
    if(auto) notify('자동으로 찾은 문구가 없습니다. 고칠 문구·제품 영역을 직접 지정하세요.');
    splitCanvas.width = width;
    splitCanvas.height = height;
    $('#regionTool').value='rect';
    $('#regionType').value='product';
    $('#detail').close();
    dialogOpen(splitDialog);
    listRegions();
  } catch(error) {notify(error.message)} finally {button.disabled=false}
}
function listRegions() {
  const {regions}=splitState;
  $('#regionList').replaceChildren(...regions.map((region,i)=>{
    const row=el('div',undefined,'region-row');
    const label=el('label'),toggle=el('input');
    toggle.type='checkbox';toggle.checked=region.enabled;
    toggle.onchange=()=>{region.enabled=toggle.checked;paintSelection()};
    label.append(toggle,regionLabels[region.kind]+' '+(i+1));row.append(label);
    if(region.kind==='sub'){
      const entry=el('input');entry.value=region.text||'';entry.maxLength=600;
      entry.placeholder='원문 입력';entry.setAttribute('aria-label','문구 '+(i+1));
      entry.oninput=()=>{region.text=entry.value;paintSelection()};row.append(entry);
    }
    return row;
  }));
  paintSelection();
}
function paintSelection() {
  const {original,regions,points}=splitState;
  const ctx=splitCanvas.getContext('2d'),w=original.width,h=original.height;
  ctx.drawImage(original,0,0);
  ctx.lineWidth=Math.max(2,w/320);
  for(const r of regions.filter(r=>r.enabled)){
    if(r.mask){
      if(!r.tint){
        const tint=rasterCanvas(180,180),t=tint.getContext('2d');
        t.drawImage(r.mask,0,0,180,180);
        const pixels=t.getImageData(0,0,180,180);
        for(let i=0;i<pixels.data.length;i+=4){const a=pixels.data[i];pixels.data.set([20,174,150,Math.round(a*.4)],i)}
        t.putImageData(pixels,0,0);r.tint=tint;
      }
      ctx.drawImage(r.tint,0,0,w,h);
    }else{
      traceRegion(ctx,r.points,w,h);
      ctx.strokeStyle=regionColors[r.kind];ctx.stroke();
    }
  }
  for(const region of regions){
    if(!region.enabled || region.kind!=='sub' || region.text===(region.sourceText||''))continue;
    const box=regionBox(region,w,h);
    ctx.save();
    ctx.fillStyle='#fff';ctx.fillRect(box.x,box.y,box.w,box.h);
    const fit=fitted(ctx,{font:'sans',size:box.h/w*82},region.text,box.w,box.h,w);
    ctx.fillStyle='#172c46';ctx.textAlign='center';ctx.textBaseline='middle';
    fit.lines.forEach((line,i)=>ctx.fillText(line,box.x+box.w/2,box.y+box.h/2+(i-(fit.lines.length-1)/2)*fit.size*1.22,box.w));
    ctx.restore();
  }
  if(points.length){
    traceRegion(ctx,points,w,h);ctx.fillStyle='#005eff33';ctx.fill();ctx.strokeStyle='#005eff';ctx.stroke();
    for(const [x,y] of points){ctx.beginPath();ctx.arc(x*w,y*h,ctx.lineWidth*2,0,7);ctx.fillStyle='#005eff';ctx.fill()}
  }
}
const splitCopy=$('#splitCopy');
let activeRegion=null;
function regionBox(region,width,height){
  const xs=region.points.map(pt=>pt[0]*width),ys=region.points.map(pt=>pt[1]*height);
  const x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
}
function positionSplitCopy(){
  if(!activeRegion)return;
  const box=regionBox(activeRegion,splitCanvas.clientWidth,splitCanvas.clientHeight);
  Object.assign(splitCopy.style,{left:splitCanvas.offsetLeft+box.x+'px',top:splitCanvas.offsetTop+box.y+'px',
    width:box.w+'px',height:box.h+'px',fontSize:Math.max(12,box.h*.72)+'px',textAlign:'center',fontWeight:'700'});
}
function editSplitCopy(region){
  activeRegion=region;splitCopy.value=region.text;splitCopy.hidden=false;
  positionSplitCopy();splitCopy.focus({preventScroll:true});splitCopy.select();
}
splitCopy.oninput=()=>{
  if(!activeRegion)return;
  activeRegion.text=splitCopy.value;
  const row=$('#regionList').children[splitState.regions.indexOf(activeRegion)];
  row.querySelector('input:not([type=checkbox])').value=activeRegion.text;
  paintSelection();
};
function closeSplitCopy(){activeRegion=null;splitCopy.hidden=true}
splitCopy.onblur=closeSplitCopy;
splitCopy.onkeydown=e=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();splitCopy.blur()}};
new ResizeObserver(positionSplitCopy).observe(splitCanvas);
function splitPoint(event){
  const bounds=splitCanvas.getBoundingClientRect();
  return [ranges((event.clientX-bounds.left)/bounds.width,0,1),ranges((event.clientY-bounds.top)/bounds.height,0,1)];
}
function addSelection(){
  const {points,regions}=splitState;
  if(points.length<3){notify('경계점을 세 개 이상 선택하세요.');return}
  const xs=points.map(v=>v[0]),ys=points.map(v=>v[1]);
  if(Math.max(...xs)-Math.min(...xs)<.003||Math.max(...ys)-Math.min(...ys)<.003){notify('조금 더 넓은 영역을 선택하세요.');return}
  if(regions.length>=145){notify('영역은 최대 145개입니다.');return}
  regions.push({kind:$('#regionType').value,points:points.slice(),text:'',enabled:true});
  splitState.points=[];listRegions();
}
splitCanvas.onpointerdown=e=>{
  const pt=splitPoint(e);
  if($('#regionTool').value==='polygon'){splitState.points.push(pt);paintSelection();return}
  splitState.start=pt;splitState.points=[];splitCanvas.setPointerCapture(e.pointerId);
};
splitCanvas.onpointermove=e=>{
  if(!splitState?.start)return;
  splitState.points=rectangle(...splitState.start,...splitPoint(e));paintSelection();
};
splitCanvas.onpointerup=e=>{
  if(!splitState?.start)return;
  const pt=splitPoint(e),start=splitState.start;
  splitState.start=null;
  if(Math.hypot((pt[0]-start[0])*splitCanvas.clientWidth,(pt[1]-start[1])*splitCanvas.clientHeight)<5){
    splitState.points=[];
    const hit=splitState.regions.slice().reverse().find(region=>{
      if(!region.enabled||region.kind!=='sub')return false;
      const box=regionBox(region,1,1);
      return pt[0]>=box.x&&pt[0]<=box.x+box.w&&pt[1]>=box.y&&pt[1]<=box.y+box.h;
    });
    paintSelection();if(hit)editSplitCopy(hit);return;
  }
  splitState.points=rectangle(...start,...pt);addSelection();
};
splitCanvas.onpointercancel=()=>{splitState.start=null;splitState.points=[];paintSelection()};
$('#undoPoint').onclick=()=>{splitState.points.pop();paintSelection()};
$('#finishRegion').onclick=addSelection;
$('#regionTool').onchange=()=>{splitState.points=[];paintSelection()};
$('#splitCancel').onclick=()=>splitDialog.close();
splitDialog.addEventListener('close',()=>{closeSplitCopy();splitState=null});

// Push-pull fill: average the surrounding pixels over an image pyramid and
// interpolate back down, so the exposed area becomes a smooth continuation of
// its surroundings instead of edge pixels smeared into stripes.
// Grow the hole from the copy box into the halo band, but only into shadow and
// glow pixels: low-saturation tones between the box background and the text
// colour. Saturated neighbours (another line of copy, a red frame) and other
// copy boxes are never taken.
// Glyph pixels of a copy box that sits on one flat colour: everything far from that
// colour, minus what is clearly not a glyph — rows or columns filled edge to edge
// (frames, the next panel, the page beside a panel) and long continuous strips lying
// on the box edge. Glyphs are never judged by thickness, so heavy display type is safe.
// Returns null when the box has no dominant fill (copy over a photo or gradient).
function inkOnly(data,W,selected,left,top,width,inner){
  const [ix,iy,iw,ih]=inner,px=(x,y)=>4*((top+y)*W+left+x),tally=new Map();
  // The fill is read from the rim of the box, where glyphs rarely reach, one profile per
  // side, so a gradient or vignette is followed across the box. (The most common colour
  // of the whole box can be the lettering itself when heavy display type fills it.)
  const rim=Math.max(2,Math.round(Math.min(iw,ih)*.08)),med=a=>{a.sort((p,q)=>p-q);return a[a.length>>1]};
  const profile=(len,at)=>{const raw=new Float32Array(len*3);for(let a=0;a<len;a++)for(let c=0;c<3;c++){const v=[];for(let d=0;d<rim;d++)v.push(data[at(a,d)+c]);raw[a*3+c]=med(v)}
    const half=Math.max(4,Math.round(ih*.5)),step=Math.max(1,Math.floor(half/12)),out=new Float32Array(len*3);
    for(let a=0;a<len;a++)for(let c=0;c<3;c++){const v=[];for(let b=Math.max(0,a-half);b<=Math.min(len-1,a+half);b+=step)v.push(raw[b*3+c]);out[a*3+c]=med(v)}return out};
  const sides=[profile(iw,(a,d)=>px(ix+a,iy+d)),profile(iw,(a,d)=>px(ix+a,iy+ih-1-d)),profile(ih,(a,d)=>px(ix+d,iy+a)),profile(ih,(a,d)=>px(ix+iw-1-d,iy+a))];
  const mid=sides.map(pr=>[0,1,2].map(c=>{const v=[];for(let a=c;a<pr.length;a+=3)v.push(pr[a]);return med(v)})),near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<=60;
  // Sides that disagree with the majority (a frame, the next panel, the page) are not fill.
  let best=[];for(let a=0;a<4;a++){const g=[0,1,2,3].filter(b=>near(mid[a],mid[b]));if(g.length>best.length)best=g}
  const use=[0,1,2,3].map(a=>best.includes(a)),bg=[0,1,2].map(c=>best.reduce((t,a)=>t+mid[a][c],0)/best.length);
  const ref=new Float32Array(iw*ih*3);
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){const w=[use[0]?1/(y+1):0,use[1]?1/(ih-y):0,use[2]?1/(x+1):0,use[3]?1/(iw-x):0],sum=w[0]+w[1]+w[2]+w[3],o=(y*iw+x)*3;
    for(let c=0;c<3;c++)ref[o+c]=(w[0]*sides[0][x*3+c]+w[1]*sides[1][x*3+c]+w[2]*sides[2][y*3+c]+w[3]*sides[3][y*3+c])/sum}
  const off=(o,x,y)=>{const r=(Math.min(ih-1,Math.max(0,y))*iw+Math.min(iw-1,Math.max(0,x)))*3;return Math.hypot(data[o]-ref[r],data[o+1]-ref[r+1],data[o+2]-ref[r+2])};
  const ink=new Uint8Array(selected.length),keep=new Uint8Array(selected.length),I=(x,y)=>(iy+y)*width+ix+x;let flat=0;
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){if(off(px(ix+x,iy+y),x,y)>34){if(selected[I(x,y)])ink[I(x,y)]=1}else flat++}
  if(flat<iw*ih*.25)return null;
  // A surface carries on past the box in the same colour; a glyph that merely reaches the
  // edge does not. `beyond(x,y,ex,ey)` compares the pixel two steps outside the box with
  // the box-edge pixel (ex,ey) it would continue from. Past the image border nothing continues.
  const height=selected.length/width,beyond=(x,y,ex,ey)=>{const X=ix+x,Y=iy+y;if(X<0||Y<0||X>=width||Y>=height)return false;const o=px(X,Y),e=px(ix+ex,iy+ey);
    return off(o,x,y)>34&&Math.hypot(data[o]-data[e],data[o+1]-data[e+1],data[o+2]-data[e+2])<=50};
  const drop=i=>{if(ink[i]){ink[i]=0;keep[i]=1}};
  // 1) rows and columns filled edge to edge
  for(let y=0;y<ih;y++){let c=0;for(let x=0;x<iw;x++)c+=ink[I(x,y)];if(c>=iw*.92&&(beyond(-2,y,0,y)||beyond(iw+1,y,iw-1,y)))for(let x=0;x<iw;x++)drop(I(x,y))}
  for(let x=0;x<iw;x++){let c=0;for(let y=0;y<ih;y++)c+=ink[I(x,y)]||keep[I(x,y)];if(c>=ih*.95&&(beyond(x,-2,x,0)||beyond(x,ih+1,x,ih-1)))for(let y=0;y<ih;y++)drop(I(x,y))}
  // 2) long continuous strips on an edge: follow each strip inward by its own thickness
  const strip=(len,minRun,at,out)=>{const run=new Int32Array(len);for(let a=0;a<len;a++){let d=0;while(at(a,d)!==-1&&ink[at(a,d)])d++;run[a]=d}
    for(let a=0;a<len;){if(!run[a]){a++;continue}let b=a;while(b<len&&run[b])b++;
      let past=0;for(let c=a;c<b;c++)past+=out(c)?1:0;
      if(b-a>minRun&&past>=(b-a)*.6){const sorted=Array.from(run.subarray(a,b)).sort((p,q)=>p-q),cap=Math.ceil(sorted[sorted.length>>1]*1.3)+1;for(let c=a;c<b;c++)for(let d=0;d<Math.min(run[c],cap);d++)drop(at(c,d))}
      a=b}};
  strip(iw,ih*1.2,(a,d)=>d<ih?I(a,d):-1,a=>beyond(a,-2,a,0));strip(iw,ih*1.2,(a,d)=>d<ih?I(a,ih-1-d):-1,a=>beyond(a,ih+1,a,ih-1));
  strip(ih,ih*.85,(a,d)=>d<iw?I(d,a):-1,a=>beyond(-2,a,0,a));strip(ih,ih*.85,(a,d)=>d<iw?I(iw-1-d,a):-1,a=>beyond(iw+1,a,iw-1,a));
  // anti-aliased rim of whatever was kept stays with it
  for(let pass=0;pass<2;pass++){const k=[];for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=I(x,y);if(ink[i]&&(keep[i-1]||keep[i+1]||keep[i-width]||keep[i+width]))k.push(i)}for(const i of k)drop(i)}
  // widen glyphs by their anti-aliased rim
  for(let pass=0;pass<2;pass++){const g=[];for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=I(x,y);if(!ink[i]&&!keep[i]&&selected[i]&&(ink[i-1]||ink[i+1]||ink[i-width]||ink[i+width]))g.push(i)}for(const i of g)ink[i]=1}
  // On a truly solid fill, the faint tail of a glow can be followed exactly.
  let rest=0,pure=0;for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){if(ink[I(x,y)])continue;const o=px(ix+x,iy+y);rest++;if(Math.hypot(data[o]-bg[0],data[o+1]-bg[1],data[o+2]-bg[2])<=5)pure++}
  // (solid is judged against one colour on purpose: a gradient is never 'solid')
  return {ink,keep,bg,solid:pure>rest*.6?bg:null};
}
function growFaint(data,W,hole,keep,left,top,width,height,bg,exclude){
  const blocked=(x,y)=>exclude.some(([a,b,c,d])=>x>=a&&x<c&&y>=b&&y<d);
  let queue=[];for(let i=0;i<hole.length;i++)if(hole[i])queue.push(i);
  while(queue.length){const next=[];for(const i of queue){const x=i%width,y=(i-x)/width;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<1||ny<1||nx>=width-1||ny>=height-1)continue;const j=ny*width+nx;if(hole[j]||keep[j]||blocked(nx,ny))continue;
      const o=4*((top+ny)*W+left+nx),d=Math.hypot(data[o]-bg[0],data[o+1]-bg[1],data[o+2]-bg[2]);if(d<=5||d>48)continue;hole[j]=1;next.push(j)}}queue=next}
}
function growHalo(data,W,hole,left,top,width,height,band,inner,exclude,keep=null,known=null){
  const [ix,iy,iw,ih]=inner,px=(x,y)=>4*((top+y)*W+left+x),lum=(r,g,b)=>r*.2126+g*.7152+b*.0722,sat=(r,g,b)=>Math.max(r,g,b)-Math.min(r,g,b);
  const tally=new Map();for(let y=iy;y<iy+ih;y++)for(let x=ix;x<ix+iw;x++){const o=px(x,y),q=(data[o]>>4)<<8|(data[o+1]>>4)<<4|data[o+2]>>4;tally.set(q,(tally.get(q)||0)+1)}
  if(!tally.size)return;const bq=[...tally].sort((a,b)=>b[1]-a[1])[0][0],bg=known||[(bq>>8)*16+8,((bq>>4)&15)*16+8,(bq&15)*16+8];
  const dist=o=>Math.hypot(data[o]-bg[0],data[o+1]-bg[1],data[o+2]-bg[2]);
  const far=[];for(let y=iy;y<iy+ih;y++)for(let x=ix;x<ix+iw;x++){const o=px(x,y);far.push([dist(o),o])}
  far.sort((a,b)=>b[0]-a[0]);const top10=far.slice(0,Math.max(1,Math.ceil(far.length*.1)));
  const ink=[0,1,2].map(c=>top10.reduce((s,[,o])=>s+data[o+c],0)/top10.length),contrast=Math.hypot(ink[0]-bg[0],ink[1]-bg[1],ink[2]-bg[2]);
  if(contrast<40)return;
  const lb=lum(...bg),lt=lum(...ink),lo=Math.min(lb,lt)-12,hi=Math.max(lb,lt)+12,sb=sat(...bg),limit=Math.max(12,contrast*.05);
  const blocked=(x,y)=>exclude.some(([a,b,c,d])=>x>=a&&x<c&&y>=b&&y<d);
  let queue=[];for(let i=0;i<hole.length;i++)if(hole[i])queue.push(i);
  for(let step=0;step<band&&queue.length;step++){const next=[];
    for(const i of queue){const x=i%width,y=(i-x)/width;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<1||ny<1||nx>=width-1||ny>=height-1)continue;const j=ny*width+nx;if(hole[j]||(keep&&keep[j])||blocked(nx,ny))continue;
        const o=px(nx,ny),r=data[o],g=data[o+1],b=data[o+2],L=lum(r,g,b);
        if(dist(o)<=limit||L<lo||L>hi||sat(r,g,b)-sb>45)continue;hole[j]=1;next.push(j)}}
    queue=next}
  const grown=hole.slice();for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;if(!hole[i]&&!(keep&&keep[i])&&!blocked(x,y)&&(hole[i-1]||hole[i+1]||hole[i-width]||hole[i+width]))grown[i]=1}hole.set(grown);
}
function fillHole(data,W,H,hole,left,top,width,height){
  const m=Math.round(Math.max(24,Math.max(width,height)*.35));
  const x0=Math.max(0,left-m),y0=Math.max(0,top-m),x1=Math.min(W,left+width+m),y1=Math.min(H,top+height+m);
  const levels=[];let w=x1-x0,h=y1-y0,R=new Float32Array(w*h),G=new Float32Array(w*h),Bl=new Float32Array(w*h),A=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gx=x0+x,gy=y0+y,lx=gx-left,ly=gy-top,inHole=lx>=0&&ly>=0&&lx<width&&ly<height&&hole[ly*width+lx];
    const i=y*w+x,o=4*(gy*W+gx);
    if(!inHole){R[i]=data[o];G[i]=data[o+1];Bl[i]=data[o+2];A[i]=1}
  }
  levels.push({w,h,R,G,B:Bl,A});
  while(w>1||h>1){
    const pw=w,ph=h,P=levels.at(-1);w=Math.max(1,Math.ceil(w/2));h=Math.max(1,Math.ceil(h/2));
    const L={w,h,R:new Float32Array(w*h),G:new Float32Array(w*h),B:new Float32Array(w*h),A:new Float32Array(w*h)};
    let missing=false;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let r=0,g=0,b=0,a=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const sx=2*x+dx,sy=2*y+dy;if(sx>=pw||sy>=ph)continue;const j=sy*pw+sx,wa=P.A[j];r+=P.R[j]*wa;g+=P.G[j]*wa;b+=P.B[j]*wa;a+=wa}
      const i=y*w+x;if(a>0){L.R[i]=r/a;L.G[i]=g/a;L.B[i]=b/a}else missing=true;L.A[i]=Math.min(1,a);
    }
    levels.push(L);if(!missing&&w<=4&&h<=4)break;
  }
  for(let n=levels.length-2;n>=0;n--){
    const F=levels[n],C=levels[n+1];
    for(let y=0;y<F.h;y++)for(let x=0;x<F.w;x++){
      const i=y*F.w+x,a=F.A[i];if(a>=1)continue;
      const cx=Math.min(C.w-1,Math.max(0,(x+.5)/2-.5)),cy=Math.min(C.h-1,Math.max(0,(y+.5)/2-.5));
      const xa=Math.floor(cx),ya=Math.floor(cy),xb=Math.min(C.w-1,xa+1),yb=Math.min(C.h-1,ya+1),fx=cx-xa,fy=cy-ya;
      const at=(Ch,xx,yy)=>Ch[yy*C.w+xx],bil=Ch=>(at(Ch,xa,ya)*(1-fx)+at(Ch,xb,ya)*fx)*(1-fy)+(at(Ch,xa,yb)*(1-fx)+at(Ch,xb,yb)*fx)*fy;
      F.R[i]=F.R[i]*a+bil(C.R)*(1-a);F.G[i]=F.G[i]*a+bil(C.G)*(1-a);F.B[i]=F.B[i]*a+bil(C.B)*(1-a);F.A[i]=1;
    }
  }
  const F=levels[0],inHole=new Uint8Array(F.w*F.h),idx=[];
  for(let ly=0;ly<height;ly++)for(let lx=0;lx<width;lx++)if(hole[ly*width+lx]){const i=(top+ly-y0)*F.w+(left+lx-x0);inHole[i]=1;idx.push(i)}
  // Neighbour lists are built once; 90 Gauss-Seidel rounds settle thin copy strips,
  // and the push-pull start already covers wide product holes.
  const n4=new Int32Array(idx.length*4),FR=F.R,FG=F.G,FB=F.B,N=inHole.length;
  idx.forEach((i,k)=>{const x=i%F.w;n4[k*4]=x>0?i-1:-1;n4[k*4+1]=x<F.w-1?i+1:-1;n4[k*4+2]=i-F.w>=0?i-F.w:-1;n4[k*4+3]=i+F.w<N?i+F.w:-1});
  for(let n=0;n<90;n++)for(let k=0;k<idx.length;k++){const i=idx[k];let r=0,g=0,b=0,c=0;
    for(let q=k*4;q<k*4+4;q++){const j=n4[q];if(j<0)continue;r+=FR[j];g+=FG[j];b+=FB[j];c++}
    if(c){FR[i]=r/c;FG[i]=g/c;FB[i]=b/c}}
  for(let ly=0;ly<height;ly++)for(let lx=0;lx<width;lx++){
    if(!hole[ly*width+lx])continue;
    const gx=left+lx,gy=top+ly,i=(gy-y0)*F.w+(gx-x0),o=4*(gy*W+gx);
    data[o]=F.R[i];data[o+1]=F.G[i];data[o+2]=F.B[i];data[o+3]=255;
  }
}
// Copy selected visible pixels. Fill the exposed area from its horizontal and
// vertical boundaries, then allow the user to replace that reconstructed area.
// shared: {data, hole} lets several copy lines mark one combined hole on the
// untouched original; the caller fills it once so no line bleeds into another.
function extractRegion(source,region,shared=null) {
  const W=source.width,H=source.height;
  const points=region.points||rectangle(0,0,1,1);
  const L0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))*W));
  const T0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))*H));
  const W0=Math.min(W-L0,Math.ceil(Math.max(...points.map(p=>p[0]))*W)-L0);
  const H0=Math.min(H-T0,Math.ceil(Math.max(...points.map(p=>p[1]))*H)-T0);
  if(!W0||!H0)return null;
  // Copy has drop shadows and glows that reach past the detected box. Copy
  // regions get a halo band; product cut-outs keep their exact outline.
  const band=region.kind==='sub'?Math.round(Math.min(H0*.45,W*.04)+2):0;
  const left=Math.max(0,L0-band),top=Math.max(0,T0-band);
  const width=Math.min(W,L0+W0+band)-left,height=Math.min(H,T0+H0+band)-top;
  const mask=rasterCanvas(width,height),ctx=mask.getContext('2d');
  if(region.mask)ctx.drawImage(region.mask,L0-left,T0-top,W0,H0);
  else{ctx.translate(-left,-top);traceRegion(ctx,points,W,H);ctx.fillStyle='white';ctx.fill()}
  const values=ctx.getImageData(0,0,width,height).data;
  const src=source.getContext('2d',{willReadFrequently:true});
  const image=shared?null:src.getImageData(0,0,W,H),data=shared?shared.data:image.data;
  const selected=new Uint8Array(width*height);
  const part=rasterCanvas(width,height),partContext=part.getContext('2d');
  const cut=partContext.createImageData(width,height);
  let xMin=width,yMin=height,xMax=-1,yMax=-1;
  for(let i=0;i<width*height;i++)if(values[4*i]*values[4*i+3]/255>=110)selected[i]=1;
  // The crop keeps the whole box, but only the glyphs (plus their shadow) are erased
  // when the box sits on a flat fill, so a badge panel or frame behind the copy survives.
  let hole=selected,solid=null;
  if(band){const inner=[L0-left,T0-top,W0,H0],exclude=(region.exclude||[]).map(([a,b,c,d])=>[Math.floor(a*W)-left,Math.floor(b*H)-top,Math.ceil(c*W)-left,Math.ceil(d*H)-top]);
    const fine=inkOnly(data,W,selected,left,top,width,inner);
    growHalo(data,W,selected,left,top,width,height,band,inner,exclude);
    if(fine){growHalo(data,W,fine.ink,left,top,width,height,band,inner,exclude,fine.keep,fine.bg);solid=fine.solid;if(fine.solid)growFaint(data,W,fine.ink,fine.keep,left,top,width,height,fine.solid,exclude);for(let i=0;i<fine.keep.length;i++)if(fine.keep[i])fine.ink[i]=0;hole=fine.ink}}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(!selected[i])continue;
    const pixel=4*((top+y)*W+left+x);
    cut.data.set(data.subarray(pixel,pixel+4),i*4);
    xMin=Math.min(x,xMin);xMax=Math.max(x,xMax);yMin=Math.min(y,yMin);yMax=Math.max(y,yMax);
  }
  if(xMax<xMin)return null;
  partContext.putImageData(cut,0,0);
  const w=xMax-xMin+1,h=yMax-yMin+1,tight=rasterCanvas(w,h);
  tight.getContext('2d').drawImage(part,xMin,yMin,w,h,0,0,w,h);
  const crop={upload:tight.toDataURL('image/png'),x:(left+xMin)/W,y:(top+yMin)/H,w:w/W,h:h/H};
  const inkOf=filled=>{
  // Use whichever luminance extreme contrasts with the estimated local fill.
  const data=filled;let darkest=255,lightest=0,dr=0,lr=0,background=0,count=0;
  for(let y=yMin;y<=yMax;y+=2)for(let x=xMin;x<=xMax;x+=2){
    const i=y*width+x;if(!selected[i])continue;
    const rgb=cut.data.subarray(i*4,i*4+3),value=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);
    const color=(rgb[0]<<16)|(rgb[1]<<8)|rgb[2];
    if(value<darkest){darkest=value;dr=color}if(value>lightest){lightest=value;lr=color}
    const b=4*((top+y)*W+left+x);background+=(data[b]*.2126+data[b+1]*.7152+data[b+2]*.0722);count++;
  }
  const mean=background/Math.max(1,count);return '#'+(lightest-mean>mean-darkest?lr:dr).toString(16).padStart(6,'0')};
  if(shared){const at=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(hole[y*width+x]){shared.hole[(top+y)*W+left+x]=1;at.push((top+y)*W+left+x)}if(solid)(shared.snaps||(shared.snaps=[])).push({at,color:solid});crop.inkOf=inkOf;return crop}
  fillHole(data,W,H,hole,left,top,width,height);
  src.putImageData(image,0,0);
  return {...crop,ink:inkOf(data)};
}
// Put a clean background plate into the places layers were lifted from. Those places
// are found by comparing the canvas with the untouched original; the plate is tone-matched
// on the unchanged area and blended in with a soft edge.
async function applyPlate(canvas,before,src){
  const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true}),now=ctx.getImageData(0,0,W,H);
  const pc=rasterCanvas(W,H),pctx=pc.getContext('2d',{willReadFrequently:true});pctx.drawImage(await bitmap(src),0,0,W,H);const plate=pctx.getImageData(0,0,W,H).data;
  const a=before.data,d=now.data,n=W*H;let m=new Float32Array(n);const sum=[0,0,0];let cnt=0;
  for(let i=0;i<n;i++){const o=i*4;if(Math.abs(a[o]-d[o])+Math.abs(a[o+1]-d[o+1])+Math.abs(a[o+2]-d[o+2])>12)m[i]=1;else{sum[0]+=a[o]-plate[o];sum[1]+=a[o+1]-plate[o+1];sum[2]+=a[o+2]-plate[o+2];cnt++}}
  const off=cnt?sum.map(v=>v/cnt):[0,0,0];
  // grow by 4px, then soften over 6px
  const pass=(src,r,max)=>{const t=new Float32Array(n),out=new Float32Array(n);
    for(let y=0;y<H;y++){let acc=0,mx;for(let x=-r;x<W+r;x++){if(x+r<W)acc+=src[y*W+x+r];if(x-r-1>=0)acc-=src[y*W+x-r-1];if(x>=0&&x<W)t[y*W+x]=max?(acc>0?1:0):acc/(2*r+1)}}
    for(let x=0;x<W;x++){let acc=0;for(let y=-r;y<H+r;y++){if(y+r<H)acc+=t[(y+r)*W+x];if(y-r-1>=0)acc-=t[(y-r-1)*W+x];if(y>=0&&y<H)out[y*W+x]=max?(acc>0?1:0):acc/(2*r+1)}}
    return out};
  m=pass(pass(m,4,true),3,false);
  for(let i=0;i<n;i++){const k=m[i];if(k<=0)continue;const o=i*4;for(let c=0;c<3;c++)d[o+c]=Math.round(d[o+c]*(1-k)+Math.min(255,Math.max(0,plate[o+c]+off[c]))*k)}
  ctx.putImageData(now,0,0);
}
async function buildRasterDraft(state){
  const {record,original,regions}=state,canvas=rasterCanvas(original.width,original.height);
  // Transparent originals (smart-channel banners) are shown on white everywhere; flatten
  // them so see-through pixels are not read as black when copy is separated.
  {const c0=canvas.getContext('2d',{willReadFrequently:true});c0.fillStyle='#fff';c0.fillRect(0,0,canvas.width,canvas.height);c0.drawImage(original,0,0)}
  const plateSrc=window.STUDIO_PLATES?.[record.id],untouched=plateSrc&&canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
  const draft=create(record),templates=draft.layers,result=[];
  draft.w=canvas.width;draft.h=canvas.height;draft.rasterLayers=true;
  const ordered=regions.filter(r=>r.enabled).sort((a,b)=>['product','badge','sub'].indexOf(a.kind)-['product','badge','sub'].indexOf(b.kind));
  const boxOf=r=>{const xs=r.points.map(q=>q[0]),ys=r.points.map(q=>q[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
  // Copy lines and badges: select all of them on the untouched original, then
  // rebuild the background under all of them at once. Products follow, cut from
  // the cleaned image so they carry no copy.
  const ctx2=canvas.getContext('2d',{willReadFrequently:true}),image=ctx2.getImageData(0,0,canvas.width,canvas.height);
  const crops=new Map();
  // Copy first, then badges: a badge that carries copy (star + "평점 4.9") is cut
  // after its copy is erased, so the copy lives only in its own text layer.
  for(const kind of ['sub','badge']){const shared={data:image.data,hole:new Uint8Array(canvas.width*canvas.height)},made=[];
    for(const region of ordered){if(region.kind!==kind)continue;
      region.exclude=kind==='sub'?ordered.filter(o=>o!==region&&o.kind==='sub'&&o.points).map(boxOf):[];
      const crop=extractRegion(canvas,region,shared);if(crop){crops.set(region,crop);made.push(crop)}}
    if(made.length){fillHole(shared.data,canvas.width,canvas.height,shared.hole,0,0,canvas.width,canvas.height);
      // On a solid fill the rebuilt pixels should be exactly that colour, not a near miss.
      for(const {at,color} of shared.snaps||[])for(const i of at){const o=i*4,d=shared.data;if(Math.hypot(d[o]-color[0],d[o+1]-color[1],d[o+2]-color[2])<=14){d[o]=Math.round(color[0]);d[o+1]=Math.round(color[1]);d[o+2]=Math.round(color[2])}}
      ctx2.putImageData(image,0,0);for(const c of made){c.ink=c.inkOf(shared.data);delete c.inkOf}}}
  for(const [i,region] of Array.from(ordered.entries()).reverse()){
    const crop=region.kind==='product'?extractRegion(canvas,region):crops.get(region);
    if(!crop)continue;
    const layer={...templates[region.kind],...crop,asset:'',visible:true,fit:'contain',label:regionLabels[region.kind]+' '+(i+1)};
    if(region.kind==='sub'){
      layer.color=crop.ink;delete layer.ink;
      layer.text=region.text||'';layer.pixelText=region.sourceText||'';
      layer.size=ranges(crop.h*draft.h/draft.w*82,.8,35);
      layer.pixelStyle=pixelStyle(layer);
    }
    if(region.kind==='badge'){layer.shape='none';layer.text=''}
    result.unshift(['region_'+i,layer]);
  }
  if(plateSrc){try{await applyPlate(canvas,untouched,plateSrc)}catch{/* the rebuilt fill stays */}}
  const background={...templates.bg,asset:'',upload:canvas.toDataURL('image/png'),fit:'contain',pattern:'plain'};
  draft.layers=Object.fromEntries([['bg',background],...result]);
  return draft;
}
$('#splitApply').onclick=()=>busy('#splitApply',async()=>{
  const state=splitState;
  if(state.points.length){notify('선택 중인 윤곽을 먼저 영역으로 추가하세요.');return}
  if(!state.regions.some(r=>r.enabled)){notify('제품, 배지 또는 문구 영역을 하나 이상 선택하세요.');return}
  await new Promise(requestAnimationFrame);
  const draft=await buildRasterDraft(state);
  splitDialog.close();showEditor(draft,true);
});
