'use strict';
const $=s=>document.querySelector(s), el=(tag,txt,cls)=>{let n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}, B=(s,fn,cls)=>{let b=el('button',s,cls);b.type='button';b.onclick=fn;return b};
const LIB=window.STUDIO_LIBRARY, records=LIB.records.slice(), assets=LIB.assets.slice(), dbName='eol-creatives-v1';
const states={operated:'운영 확인',approved:'승인본 · 운영 미확인',prepared:'제작본 · 운영 미확인',scene:'AI 원본 · 집행본 미연결'},kinds={product:'제품',background:'배경',badge:'배지',decoration:'장식'}, layouts={'photo-bottom':'사진 위 · 하단 카피','type-top':'상단 타이틀 · 제품 아래','split':'좌우 분할','poster':'포스터 · 중앙 카피','notice':'공지 · 정보 카드'}, layerNames={bg:'배경',product:'제품 에셋',deco:'장식 에셋',title:'메인 문구',sub:'보조 문구',badge:'배지',cta:'CTA'}, keys=Object.keys(layerNames), textKeys=['title','sub','badge','cta'], imgs=['bg','product','deco','badge'];
let view='library',filter='전체',delivery='',drafts=[],p=null,selected='title',changed=false,drawRev=0,db,toastTimer,exitAction;
const brandMeta={'얼김치':{key:'eol',mark:'얼',en:'EOL KIMCHI'},'진해진':{key:'jin',mark:'진',en:'JIN HAE JIN'},'한국고려삼':{key:'kgs',mark:'삼',en:'한국고려삼'}};
const brandOf = item => item?.brand || '얼김치'; // Pre-multibrand records and saved v1 projects were Eol Kimchi.
const draftBrand = item => item?.brand || brandOf(rBy(item?.sourceId));
const brandFromUrl = () => {
 const slug=new URL(location.href).searchParams.get('brand');
 return Object.keys(brandMeta).find(name=>brandMeta[name].key===slug)||'얼김치';
};
let brand = brandFromUrl();
function setBrand(name,writeUrl=true){
 if(!Object.hasOwn(brandMeta,name))return;
 brand=name;
 const meta=brandMeta[name];
 document.documentElement.dataset.brand=meta.key;
 $('#headerBrand').textContent=$('#footerBrand').textContent=$('#intakeBrand').textContent=name;
 const logo=$('#brandLogo'),fallback=$('#brandFallback'),hasLogo=['eol','jin'].includes(meta.key);logo.hidden=!hasLogo;fallback.hidden=hasLogo;fallback.textContent=meta.mark;if(hasLogo)logo.src='ui/'+meta.key+'-logo.png';else logo.removeAttribute('src');
 $('#libraryEyebrow').textContent='GFA · CRM';
 document.title=name+' · 뉴픽 소재 라이브러리';
 $('#brandIntro').textContent=name==='진해진'?'진해진과 구 진수성찬의 운영 소재와 성과를 한곳에서 확인하고, 필요하면 바로 편집하세요.':name+'의 운영 소재와 성과를 한곳에서 확인하고, 필요하면 바로 편집하세요.';
 document.querySelectorAll('[data-brand]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',b.dataset.brand===name)});
 if(writeUrl){const u=new URL(location.href);u.searchParams.set('brand',meta.key);history.replaceState(null,'',u)}
}
document.querySelectorAll('button[data-brand]').forEach(b=>b.onclick=()=>{setBrand(b.dataset.brand);switchView(view)});
const norm=s=>String(s??'').normalize('NFC').toLocaleLowerCase(), statusText=s=>states[s]||'상태 미확인', rBy=id=>records.find(r=>r.id===id)||LIB.scenes.find(r=>r.id===id), aBy=id=>assets.find(a=>a.id===id);
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2), notify=s=>{let n=$('#toast');n.hidden=false;n.textContent=s;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,3300)};
const safeImage=s=>typeof s==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
function imageUrl(r){return r.thumb||r.original||r.file}
const hostedStudioURL = 'https://kellynewpeak.github.io/newpeak-creative-studio/';
function publicLink(item) {
  const link = new URL(LIB.shared ? location.href : hostedStudioURL);
  link.search = '';
  link.hash = '';
  link.searchParams.set('brand', brandMeta[item ? brandOf(item) : brand].key);
  if (item) {
    link.searchParams.set('item', item.id);
  } else if (view === 'library' && filter === 'GFA') {
    if (delivery) {
      const [month, scope] = delivery.split(':');
      link.searchParams.set('run', month);
      link.searchParams.set('scope', scope);
    } else {
      link.searchParams.set('channel', 'GFA');
    }
  }
  return link.href;
}
async function copyPublicLink(item) {
  const url = publicLink(item);
  try {
    await navigator.clipboard.writeText(url);
    notify('공유 링크를 복사했습니다.');
  } catch {
    window.prompt('이 링크를 복사해 공유하세요.', url);
  }
}
function addShareAction(container, item) {
  if (!item.id.startsWith('local-')) {
    container.append(B('이 항목 링크 복사', () => copyPublicLink(item), 'link'));
  }
}
function openSharedItem() {
  const id = new URL(location.href).searchParams.get('item');
  if (!LIB.shared || !id || id.startsWith('local-')) return;
  const source = rBy(id);
  if (!source || brandOf(source) !== brand) return;
  detail(source);
  $('#detail').addEventListener('close', () => {
    const url = new URL(location.href);
    url.searchParams.delete('item');
    history.replaceState(null, '', url);
  }, {once: true});
}
function dialogOpen(d){if(!d.open)d.showModal()}
function ask(fn,msg){exitAction=fn;$('#questionText').textContent=msg;dialogOpen($('#question'))}
$('#cancelQuestion').onclick=()=>$('#question').close();$('#acceptQuestion').onclick=()=>{let f=exitAction;$('#question').close();f?.()};
function openDb(){return new Promise((res,rej)=>{let q=indexedDB.open(dbName,1);q.onupgradeneeded=()=>{for(const n of ['drafts','sources'])q.result.createObjectStore(n,{keyPath:'id'})};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
function dbOp(name,op,data){return new Promise((res,rej)=>{if(!db){rej(Error('이 브라우저에서 저장 공간에 접근할 수 없습니다. 편집 파일로 보관하세요.'));return}let t=db.transaction(name,op==='getAll'?'readonly':'readwrite'),q=t.objectStore(name)[op](...(data===undefined?[]:[data]));t.oncomplete=()=>res(q.result);t.onabort=t.onerror=()=>rej(t.error||Error('저장에 실패했습니다.'))})}
function syncRunUrl(){const u=new URL(location.href);if(filter==='GFA'&&delivery){const [month,kind]=delivery.split(':');u.searchParams.set('run',month);u.searchParams.set('scope',kind)}else{u.searchParams.delete('run');u.searchParams.delete('scope')}if(filter==='GFA'&&!delivery)u.searchParams.set('channel','GFA');else u.searchParams.delete('channel');if(u.href!==location.href)history.replaceState(null,'',u)}
function switchView(v){view=v;filter=v==='drafts'?'내 시안':'전체';delivery='';syncRunUrl();$('#query').value='';$('#status').value='';renderGallery()}
$('#delivery').onchange=e=>{delivery=e.target.value;syncRunUrl();renderGallery()};
$('#query').oninput=$('#status').onchange=()=>renderGallery();
function picture(src,alt=''){const i=el('img');i.loading='lazy';i.src=src;i.alt=alt;return i}
function card(src,title,chip,info,fn,asset=false,perf=null){let b=B('',fn,'card'),t=el('div',undefined,'thumb'+(asset?' assetthumb':'')),m=el('div',undefined,'meta');if(src)t.append(picture(src,title));if(perf&&GRADE_SHOWN.includes(perf.grade)){let g=el('span',perf.grade,'grade-badge g-'+GRADE_KEY[perf.grade]);g.title=perf.group?.label||'';t.append(g)}let c=el('span',chip,'chip '+chip.toLowerCase());let arrow=el('span','→','card-arrow');arrow.setAttribute('aria-hidden','true');m.append(c,el('h3',title),el('small',info));if(perf&&perf.metrics)m.append(el('small',metricLine(perf),'perfline'));m.append(arrow);b.append(t,m);return b}
// ---- Performance insights (dist/insights.js, local only; absent on the public site)
const INS=()=>window.STUDIO_INSIGHTS?.items||{}, insOf=id=>INS()[id]||null;
const GRADE_SHOWN=['우수','보통','미흡'], GRADE_KEY={'우수':'top','보통':'mid','미흡':'low'};
const nf=v=>v==null?'–':Math.round(v).toLocaleString('ko-KR'), pf=v=>v==null?'–':Number(v).toFixed(2)+'%';
function metricLine(i){const m=i.metrics;if(!m)return '';return m.roas!=null?`CTR ${pf(m.ctr)} · ROAS ${nf(m.roas)}%`:`CTR ${pf(m.ctr)} · 클릭 ${nf(m.clicks)}`}
// The archive is one list: archived creatives, AI artboards without a matching
// archived image. Drafts saved by older versions stay in IndexedDB but are no longer listed.
const stateOrder=['operated','approved','prepared','scene'];
const archiveItems=()=>records.concat(LIB.scenes.filter(sc=>sc.status==='scene'));
function renderGallery(){let terms=norm($('#query').value.trim()),st=$('#status').value;
 view=filter==='내 시안'?'drafts':'library';const isD=view==='drafts';$('#status').hidden=isD;
 $('#browseKicker').textContent=isD?'DRAFTS':'ARCHIVE';$('#browseTitle').textContent=isD?'내 시안':'소재 아카이브';
 const dd=drafts.filter(o=>draftBrand(o)===brand);
 $('#pills').replaceChildren(...['전체','GFA','CRM'].map(s=>{let b=B(s==='내 시안'?s+' '+dd.length:s,()=>{filter=s;delivery='';syncRunUrl();renderGallery()});b.setAttribute('aria-pressed',s===filter);return b}));
 const months=[...new Set(records.filter(r=>brandOf(r)===brand&&r.channel==='GFA'&&r.operationPeriod).map(r=>r.operationPeriod))].sort().reverse(),showDelivery=filter==='GFA'&&months.length>0;
 $('#deliveryField').hidden=!showDelivery;
 if(showDelivery){let opts={'':'모든 GFA 소재'};for(let m of months){let label=m.slice(0,4)+'년 '+Number(m.slice(5))+'월';opts[m+':all']=label+' · 전체 집행';opts[m+':new']=label+' · 신규 집행'}listOpts($('#delivery'),opts,delivery)}
 let list=(isD?dd:archiveItems().filter(o=>brandOf(o)===brand)).filter(o=>(isD||filter==='전체'||o.channel===filter)&&(!showDelivery||!delivery||(o.operationPeriod===delivery.split(':')[0]&&(delivery.endsWith(':all')||o.operationGroup==='new')))&&(isD||!st||st===o.status)&&norm([o.name,o.title,o.id,o.date,...(o.operationEvidence||[]).flatMap(x=>[x.adId,x.adName,x.campaign,...x.registeredCopy]),...Object.values(o.copy||{})].join(' ')).includes(terms));
 if(isD)list.sort((a,b)=>b.saved.localeCompare(a.saved));
 else{list.sort((a,b)=>stateOrder.indexOf(a.status)-stateOrder.indexOf(b.status)||String(b.date||'').localeCompare(a.date||'')||a.title.localeCompare(b.title));
  if(filter==='전체'){let mixed=[];for(let state of stateOrder){let g=list.filter(r=>r.status===state&&r.channel==='GFA'),c=list.filter(r=>r.status===state&&r.channel==='CRM');for(let i=0;i<Math.max(g.length,c.length);i++){if(c[i])mixed.push(c[i]);if(g[i])mixed.push(g[i])}}list=mixed}}
 // Creatives graded 우수 lead each list (best score first), under their own heading.
 const mk=o=>isD?card(o.preview,o.name,o.channel,'저장 '+o.saved.slice(0,10),()=>openDraft(o)):card(imageUrl(o),o.title,o.title.startsWith('스마트스토어 썸네일')?'GFA 연관':o.channel,[statusText(o.status),o.operationPeriod?(Number(o.operationPeriod.slice(5))+'월 '+(o.operationGroup==='new'?'신규':'계속 집행')):o.date].filter(Boolean).join('  ·  '),()=>detail(o),false,insOf(o.id)),top=isD?[]:list.filter(o=>insOf(o.id)?.grade==='우수').sort((a,b)=>insOf(b.id).score-insOf(a.id).score),rest=top.length?list.filter(o=>!top.includes(o)):list;
 $('#grid').replaceChildren(...(top.length?[el('h3','★ 잘 된 소재 '+top.length+'개','grid-head'),...top.map(mk),...(rest.length?[el('h3','나머지 소재 '+rest.length+'개','grid-head')]:[])]:[]),...rest.map(mk));
 $('#result').textContent=(isD?'저장된 시안':'소재')+' '+list.length+'개';$('#empty').hidden=list.length>0;$('#empty').textContent=isD&&!dd.length?'저장한 시안이 없습니다. 소재를 열고 ‘편집하기’를 누르세요.':'일치하는 항목이 없습니다.'}
function perfBlock(i){const box=el('section',undefined,'perfbox');const head=el('div',undefined,'perfhead');
 head.append(el('span',i.grade,'grade-badge inline g-'+(GRADE_KEY[i.grade]||'na')),el('b',i.group?.label||'성과'));if(i.score!=null)head.append(el('small','그룹 내 상위 '+Math.max(1,Math.round((1-i.score)*100))+'%'));box.append(head);
 if(i.why)box.append(el('p',i.why,'perfwhy'));
 const m=i.metrics;if(m){// only what the data carries: the public build keeps clicks, opens and CTR and drops money, conversions and impressions
  const rows=[['노출',m.impressions,nf],['열람',m.opens,nf],['클릭',m.clicks,nf],['CTR',m.ctr,pf],['전환',m.conversions,nf],['비용',m.cost,v=>nf(v)+'원'],['전환매출',m.revenue,v=>nf(v)+'원'],['ROAS',m.roas,v=>nf(v)+'%']].filter(r=>r[1]!=null).map(([k,v,f])=>[k,f(v)]);
  const g=el('div',undefined,'perfgrid');for(const [k,v] of rows){const c=el('div');c.append(el('small',k),el('strong',v));g.append(c)}box.append(g)}
 const t=i.tags,chips=el('div',undefined,'tagchips');for(const v of [t.product,t.target,...t.appeal,...t.benefit].filter(Boolean))chips.append(el('span',v));box.append(chips);
 const notes=[i.period?('기간 '+(i.period[0]===i.period[1]?i.period[0]:i.period.join(' ~ '))):null,m&&m.opens!=null?'CTR = 클릭 ÷ 열람 · CTR로만 비교':i.basis==='ctr_only'?'매출 자료가 부족해 CTR로만 비교':null,i.unitSize>1?`같은 발송·소재의 이미지 ${i.unitSize}장이 같은 등급`:null,i.sourceNote].filter(Boolean);
 if(notes.length)box.append(el('p',notes.join(' · '),'perfnote'));return box}
function info(dl,label,v){if(v!==null&&v!==undefined&&v!==''){dl.append(el('dt',label),el('dd',typeof v==='string'?v:JSON.stringify(v)))}}
function detail(r){let root=$('#detailBody'),cols=el('div',undefined,'detailcols'),left=el('div'),right=el('div'),dl=el('dl');let img=picture(r.original,r.title);img.className='original';left.append(img);
 let down=el('a',safeImage(r.original)?'등록 원본 다운로드 ↓':'원본 이미지 다운로드 ↓','small');down.href=r.original;down.download=safeImage(r.original)?'archive-image':r.original.split('/').pop();left.append(down);
 right.append(el('p',brandOf(r)+'  /  '+r.channel+'  /  '+statusText(r.status),'eyebrow'),el('h2',r.title));info(dl,r.operationPeriod&&r.id.includes('-gfa-nov-')?'소재 심사 승인일':'기록 시점',r.date);info(dl,'실제 지면',r.placement);right.append(dl);
 const pi=insOf(r.id);if(pi)right.append(perfBlock(pi));
 if(!p||$('#editor').hidden){let go=B('편집하기',e=>editRecord(r,e.currentTarget),'accent'),psd=B('PSD 파일 받기 ↓',e=>recordPsd(r,e.currentTarget)),row=el('div',undefined,'edit-row');go.classList.add('edit-main');psd.classList.add('edit-psd');psd.title='포토샵에서 레이어와 글자를 고칠 수 있는 파일';row.append(go,psd);right.append(row)}
 addShareAction(right,r);
 if(LIB.shared && r.publicNote)right.append(el('p',r.publicNote,'small'));
 if(r.operationEvidence?.length){let history=el('details'),body=el('dl');history.append(el('summary','네이버 GFA 집행 이력 · '+r.operationEvidence.length+'개 소재 ID'));for(let o of r.operationEvidence){let row=el('dd');let link=el('a',o.adName+' · '+o.adId+' ↗');link.href=o.reportUrl;link.target='_blank';link.rel='noopener';row.append(link,el('div',o.group+' · 노출 '+o.impressions.toLocaleString('ko-KR')+'회'),el('div','심사 승인 '+o.approvedAt.join(', ')));if(o.registeredCopy.length)row.append(el('div','등록 문구: '+o.registeredCopy.join(' / ')));body.append(el('dt',o.campaign),row)}history.append(body);right.append(history)}
 let de=el('details'),dd=el('dl');de.append(el('summary','근거 · 원본 문구 · 파일 출처'));info(dd,'근거',r.evidence);Object.entries(r.copy||{}).forEach(([k,v])=>info(dd,layerNames[k]||k,v));info(dd,'원본 위치',r.source);info(dd,'SHA-256',r.sha256);if(r.parts)info(dd,'원본 텍스트 프레임',r.text.map(t=>t.text||'[판독 불가]').join(' / '));de.append(dd);right.append(de);
 cols.append(left,right);root.replaceChildren(cols);dialogOpen($('#detail'))}
// One entry point: archived images open as pixel layers so the template looks
// exactly like the original; AI artboards without an archived image open as
// their Illustrator layers.
async function editRecord(r,button){if(r.parts){$('#detail').close();startNew(r);return}await openRasterLayers(r,button,true)}
function listOpts(select,obj,val){select.replaceChildren(...Object.entries(obj).map(([v,n])=>{let opt=el('option',n);opt.value=v;return opt}));select.value=val}
let addForm=$('#addForm');$('#addSource').onclick=()=>dialogOpen($('#addDialog'));$('#addForm .close').onclick=()=>$('#addDialog').close();
async function readRaster(f){if(!f||!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>24*1024*1024)throw Error('PNG/JPG/WebP 이미지(24MB 이하)를 선택하세요.');let url=await new Promise((res,rej)=>{let q=new FileReader;q.onload=()=>res(q.result);q.onerror=rej;q.readAsDataURL(f)});let im=await bitmap(url);if(im.naturalWidth*im.naturalHeight>65e6)throw Error('이미지 해상도가 너무 큽니다.');return {url,im}}
addForm.onsubmit=async e=>{e.preventDefault();let f=addForm.elements,submit=addForm.querySelector('.accent');submit.disabled=true;try{let file=f.file.files[0],{url,im}=await readRaster(file);let r={id:'local-'+uid(),brand,channel:f.channel.value,title:f.title.value.trim(),status:f.state.value,evidence:f.evidence.value.trim(),date:f.date.value,original:url,source:file.name,sha256:await digest(file),width:im.naturalWidth,height:im.naturalHeight,copy:{title:'',sub:'',badge:'',cta:''},assets:[],layout:'type-top'};if(!r.title||(!r.evidence&&r.status!=='prepared'))throw Error('소재명과 운영·승인 근거를 입력하세요.');if(!r.evidence)r.evidence='직접 등록한 제작 이미지';await dbOp('sources','put',r);records.push(r);addForm.reset();$('#addDialog').close();switchView('library');await openRasterLayers(r,submit,true)}catch(x){notify(x.message)}finally{submit.disabled=false}};
addForm.elements.file.onchange=()=>{if(!addForm.elements.title.value)addForm.elements.title.value=(addForm.elements.file.files[0]?.name||'').replace(/\.[^.]+$/,'').slice(0,100)};
async function digest(file){if(!crypto.subtle)return '';return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')}
const presets={
 'photo-bottom':{product:[0,0,1,.72],title:[.06,.70,.88,.16],sub:[.08,.865,.84,.077],badge:[.64,.05,.30,.09],cta:[.32,.92,.36,.065]},
 'type-top':{product:[.06,.39,.88,.60],title:[.07,.09,.86,.21],sub:[.09,.30,.82,.085],badge:[.05,.025,.28,.064],cta:[.32,.90,.36,.068]},
 split:{product:[.46,.07,.54,.86],title:[.06,.26,.51,.29],sub:[.06,.56,.47,.13],badge:[.05,.09,.27,.105],cta:[.06,.77,.32,.12]},
 poster:{product:[.09,.46,.82,.53],title:[.08,.13,.84,.22],sub:[.1,.35,.8,.09],badge:[.35,.04,.30,.075],cta:[.32,.89,.36,.08]},
 notice:{product:[.14,.38,.72,.35],title:[.09,.13,.82,.19],sub:[.09,.72,.82,.14],badge:[.35,.04,.30,.07],cta:[.31,.89,.38,.07]}};
const ranges=(a,l,h)=>Math.min(h,Math.max(l,a)),num=(v,d,l,h)=>Number.isFinite(Number(v))?ranges(Number(v),l,h):d;
function create(r){let size=r.channel==='GFA'?1200:1000,asp=r.ratio||((r.width&&r.height)?r.width/r.height:1);let chosen=presets[r.layout]||presets['type-top'];let pal=r.palette||{},obj={version:1,id:'draft-'+uid(),brand:brandOf(r),sourceId:r.id,channel:r.channel,name:r.title+' · 새 시안',w:size,h:r.channel==='GFA'?size:Math.round(size/ranges(asp,.45,3)),layers:{}};
 let ids=r.assets||[], defAsset=(kind)=>ids.map(aBy).find(a=>brandOf(a)===brandOf(r)&&a?.kind===kind&&a.reusable!==false)?.id||'';
 for(let k of keys){let rect=k==='bg'?[0,0,1,1]:k==='deco'?[.73,.67,.22,.22]:chosen[k];let native=r.slots?.[k];if(Array.isArray(native)&&native.length===4&&native.every(Number.isFinite))rect=native;
 let [x,y,w,h]=rect,l={x,y,w,h,base:k,visible:true,text:'',asset:'',upload:'',color:k==='bg'?(pal.bg||'#f4ecd9'):k==='badge'?'#ffffff':k==='cta'?'#ffffff':pal.ink||'#26372b',fill:k==='badge'?'#a53221':k==='cta'?'#274237':'#ffffff',align:r.layout==='split'?'left':'center',font:'pretendard',weight:800,size:k==='title'?9:k==='sub'?4.7:4,fit:k==='bg'?'cover':'contain',pattern:'paper',shape:'pill',outline:false};
 if(k==='product')l.asset=defAsset('product');if(k==='bg')l.asset=defAsset('background');if(k==='deco')l.visible=false;if(k==='cta')l.visible=false;obj.layers[k]=l}
 if(r.parts){let ll={bg:obj.layers.bg};ll.bg.asset='';ll.bg.pattern='plain';ll.bg.color=r.palette?.bg||'#f6f3ec'; let ordered=r.parts.slice().filter(it=>brandOf(aBy(it.assetId))===brandOf(r)&&aBy(it.assetId)?.reusable!==false).sort((a,b)=>({background:0,product:1,decoration:2,badge:3}[aBy(a.assetId)?.kind]||0)-({background:0,product:1,decoration:2,badge:3}[aBy(b.assetId)?.kind]||0));
 for(let [i,it] of ordered.entries()){let a=aBy(it.assetId);if(!a||!it.bounds)continue;let t=a.kind==='product'?'product':a.kind==='badge'?'badge':'deco',[x,y,w,h]=it.bounds;if(w<=0||h<=0)continue;ll['part_'+i]={...obj.layers[t],x,y,w,h,asset:a.id,label:a.name,visible:true,fit:'contain'};}
 for(let [i,t] of r.text.entries()){if(!Array.isArray(t.bbox))continue;let [x,y,w,h]=t.bbox;if(w<=0||h<=0||x+w<0||y+h<0||x>1||y>1)continue;let scale=t.sizeRelativeToHeight||h;let kind=scale>.065?'title':'sub';ll['word_'+i]={...obj.layers[kind],x,y,w:Math.max(.03,w),h:Math.max(.025,h),color:/^#[0-9a-f]{6}$/i.test(t.fill)?t.fill:'#29362c',size:ranges(scale*100*obj.h/obj.w,.8,35),align:'left',label:'문구 '+(i+1),originalText:t.text||'[판독 불가]',visible:true};}obj.layers=ll;}
 return obj}
function startNew(r,parent=null){let d=create(r);if(parent){d.nativeSceneId=r.id;d.sourceId=parent.id;d.name=parent.title+' · 새 시안';if(!Object.values(d.layers).some(l=>l.base==='product')){let alt=create(parent).layers.product;if(alt.asset){alt.label='제품 · 교체용 사진';let [first,...rest]=Object.entries(d.layers);d.layers=Object.fromEntries([first,['replacement_product',alt],...rest])}}}showEditor(d,true)}
function showEditor(obj,isNew=false){closeCanvasCopy();obj.brand=draftBrand(obj);if(obj.brand!==brand)setBrand(obj.brand);p=obj;changed=isNew;selected=obj.layers.title?'title':Object.keys(obj.layers).find(k=>obj.layers[k].base==='title')||Object.keys(obj.layers)[0];$('#editor').hidden=false;$('#archive').hidden=true;$('#draftName').value=p.name;$('#duplicate').hidden=!drafts.some(x=>x.id===p.id);let r=rBy(p.sourceId);$('#editCode').textContent=p.brand+' / '+p.channel+' / '+(r?(p.rasterLayers?'이미지 분리 레이어':r.parts||p.nativeSceneId?'원본 레이어':layouts[r.layout]):'시안');$('#screenSize').textContent=p.w+' × '+p.h+' px';$('#refImage').src=r?.thumb||r?.original||'';$('#refImage').hidden=!r;$('#refTitle').textContent=r?.title||'원본 정보 없음';$('#showSource').disabled=!r;$('#resplit').hidden=!(p.rasterLayers&&r&&!r.parts);$('#art').width=p.w;$('#art').height=p.h;charSel=null;zoom='fit';histReset();refreshProps();draw();applyZoom();scrollTo(0,0);if(obj.rasterLayers)matchAllFonts(obj)}
// ---- Artboard zoom (fit to the pasteboard, or a fixed percentage).
let zoom='fit';
function applyZoom(){if(!p||$('#editor').hidden)return;const board=$('#board');let z=zoom==='fit'?Math.max(.05,Math.min((board.clientWidth-56)/p.w,(board.clientHeight-56)/p.h,2)):zoom;art.style.width=Math.round(p.w*z)+'px';art.style.height=Math.round(p.h*z)+'px';$('#zoomLabel').textContent=Math.round(z*100)+'%';alignCanvasCopy()}
function stepZoom(dir){const cur=parseFloat($('#zoomLabel').textContent)/100||1,steps=[.1,.25,.33,.5,.66,.75,1,1.5,2,3];zoom=dir>0?(steps.find(v=>v>cur+.001)||3):([...steps].reverse().find(v=>v<cur-.001)||.1);applyZoom()}
$('#zoomIn').onclick=()=>stepZoom(1);$('#zoomOut').onclick=()=>stepZoom(-1);$('#zoomFit').onclick=()=>{zoom='fit';applyZoom()};
new ResizeObserver(()=>{if(zoom==='fit')applyZoom()}).observe($('#board'));
// ---- Undo/redo. Every draw() schedules a snapshot; typing bursts within 400 ms
// become one step. Layer objects are copied shallowly (image data URLs are
// immutable strings, so they are shared, not duplicated).
let hist=[],histAt=0,histTimer=0;
const cloneLayers=ls=>Object.fromEntries(Object.entries(ls).map(([k,l])=>[k,{...l,colors:l.colors?.slice(),pixelBox:l.pixelBox&&{...l.pixelBox}}]));
const histSig=ls=>JSON.stringify(ls,(k,v)=>k==='upload'&&typeof v==='string'?v.length+':'+v.slice(-24):v);
function histReset(){clearTimeout(histTimer);hist=p?[{layers:cloneLayers(p.layers),sig:histSig(p.layers),selected}]:[];histAt=0}
function histRecord(){clearTimeout(histTimer);histTimer=0;if(!p||!hist.length||histPaused)return;const sig=histSig(p.layers);if(sig===hist[histAt].sig)return;hist=hist.slice(0,histAt+1);hist.push({layers:cloneLayers(p.layers),sig,selected});if(hist.length>120)hist.shift();histAt=hist.length-1}
let histPaused=false;
function histSchedule(){if(!p||!hist.length||histPaused)return;clearTimeout(histTimer);histTimer=setTimeout(histRecord,400)}
function histStep(dir){if(histTimer)histRecord();const to=histAt+dir;if(to<0||to>=hist.length){notify(dir<0?'더 되돌릴 수 없습니다.':'다시 실행할 내용이 없습니다.');return}
 const typingKey=typingLayer?Object.keys(p.layers).find(k=>p.layers[k]===typingLayer):null;
 closeCanvasCopy();histAt=to;const h=hist[to];p.layers=cloneLayers(h.layers);
 selected=p.layers[selected]?selected:(p.layers[h.selected]?h.selected:Object.keys(p.layers)[0]);
 changed=histAt>0;charSel=null;refreshProps();draw();
 if(typingKey&&p.layers[typingKey]&&textKeys.includes(p.layers[typingKey].base||typingKey))editCanvasCopy(p.layers[typingKey])}
// Font matching finishes after the editor opens; fold its result into the
// snapshots so undo never brings the default font back.
function histPatchLayer(l){const key=p&&Object.keys(p.layers).find(k=>p.layers[k]===l);if(!key)return;const f=['font','weight','size','align','x','y','w','h','color','colors','pixelBox','pixelStyle','fontMatched'];
 for(const h of hist){const t=h.layers[key];if(!t||t.fontMatched)continue;for(const n of f){if(l[n]===undefined)delete t[n];else t[n]=n==='colors'?l.colors.slice():n==='pixelBox'?{...l.pixelBox}:l[n]}h.sig=histSig(h.layers)}}
// ---- Keyboard: arrows nudge (Shift = 10px), Delete removes, T adds text, Cmd/Ctrl+Z undoes.
addEventListener('keydown',e=>{if(!p||$('#editor').hidden||document.querySelector('dialog[open]'))return;const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();return}
 if((e.metaKey||e.ctrlKey)&&!e.altKey&&(e.key.toLowerCase()==='z'||e.key.toLowerCase()==='y')){
  // Inspector fields keep their own text undo; the canvas and on-image typing use the editor history.
  if(typing&&document.activeElement!==canvasCopy)return;
  e.preventDefault();histStep(e.key.toLowerCase()==='y'||e.shiftKey?1:-1);return}
 if(typing)return;const l=p.layers[selected];
 const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
 if(mv&&selected!=='bg'){e.preventDefault();const d=e.shiftKey?10:1;l.x+=mv[0]*d/p.w;l.y+=mv[1]*d/p.h;changed=true;draw();refreshProps();return}
 if((e.key==='Delete'||e.key==='Backspace')&&selected!=='bg'){e.preventDefault();deleteSelected();return}
 if(e.key==='t'||e.key==='T'){e.preventDefault();addLayerOf('title')}});
$('#showSource').onclick=()=>{let r=rBy(p?.sourceId);if(r)detail(r)};
$('#resplit').onclick=e=>{let r=rBy(p?.sourceId),btn=e.currentTarget;if(!r)return;let go=()=>openRasterLayers(r,btn,false);if(changed)ask(go,'영역을 다시 지정하면 지금 고친 내용이 사라집니다. 계속할까요?');else go()};
function leave(){closeCanvasCopy();p=null;changed=false;drawRev++;$('#editor').hidden=true;$('#archive').hidden=false;renderGallery();scrollTo(0,0)}
function maybeLeave(){if(!p)return;if(changed)ask(leave,'내보내지 않은 수정이 있습니다. 아카이브로 이동하면 사라집니다. 이동할까요?');else leave()}
$('#leave').onclick=maybeLeave;$('.brand').onclick=e=>{e.preventDefault();maybeLeave()};addEventListener('beforeunload',e=>{if(changed){e.preventDefault();e.returnValue=''}});
$('#draftName').oninput=e=>{p.name=e.target.value;changed=true};function pick(k){selected=k;refreshProps();draw()}
$('#duplicate').onclick=()=>{let d=structuredClone(p);d.id='draft-'+uid();d.name=(d.name+' · 복사').slice(0,100);showEditor(d,true);notify('복제본을 열었습니다. 저장하면 새 시안으로 보관됩니다.')};
// ---- Fonts: web fonts load on every machine, so drafts render the same for
// every teammate. Legacy keys (sans/serif/plain) keep older drafts readable.
const FONTS={
 pretendard:{label:'Pretendard',css:'"Pretendard Variable","Pretendard",sans-serif',weights:[300,400,500,600,700,800,900]},
 notoSans:{label:'Noto Sans KR',css:'"Noto Sans KR",sans-serif',weights:[300,400,500,700,900]},
 gothicA1:{label:'Gothic A1',css:'"Gothic A1",sans-serif',weights:[400,500,700,800,900]},
 blackHan:{label:'Black Han Sans',css:'"Black Han Sans",sans-serif',weights:[400]},
 doHyeon:{label:'도현 (Do Hyeon)',css:'"Do Hyeon",sans-serif',weights:[400]},
 jua:{label:'주아 (Jua)',css:'"Jua",sans-serif',weights:[400]},
 gasoek:{label:'가석 (Gasoek One)',css:'"Gasoek One",sans-serif',weights:[400]},
 notoSerif:{label:'Noto Serif KR',css:'"Noto Serif KR",serif',weights:[400,600,700,900]},
 nanumMyeongjo:{label:'나눔명조',css:'"Nanum Myeongjo",serif',weights:[400,700,800]},
 songMyung:{label:'송명 (Song Myung)',css:'"Song Myung",serif',weights:[400]},
 nanumPen:{label:'나눔손글씨 펜',css:'"Nanum Pen Script",cursive',weights:[400]},
 gaegu:{label:'개구 (Gaegu)',css:'"Gaegu",cursive',weights:[400,700]},
 sans:{label:'시스템 고딕',css:'"Apple SD Gothic Neo","Malgun Gothic",sans-serif',weights:[400,500,700,800,900]},
 serif:{label:'시스템 명조',css:'"AppleMyungjo","Batang",serif',weights:[400,700]},
 // Fonts the design team uses in Photoshop/Illustrator (from the original .ai files),
 // activated on the computer through RixFontCloud or installed locally. They are
 // used by family name only; no font file is shipped with the studio, so they
 // appear only on computers where the font is active.
 l_gmarket:{local:1,label:'G마켓 산스',css:'"Gmarket Sans"',weights:[300,500,700]},
 l_aggro:{local:1,label:'어그로체',css:'"SB Aggro","SB AggroOTF"',weights:[300,500,700]},
 l_suite:{local:1,label:'SUITE',css:'"SUITE","SUITE Variable"',weights:[300,400,500,600,700,800,900]},
 l_paperlogy:{local:1,label:'페이퍼로지',css:'"Paperlogy"',weights:[500,600,800,900]},
 l_esamanru:{local:1,label:'이사만루',css:'"esamanru"',weights:[300,500,700]},
 l_nexon:{local:1,label:'넥슨 Lv1 고딕',css:'"NEXON Lv1 Gothic"',weights:[300,400,700]},
 l_ssurround:{local:1,label:'카페24 써라운드',css:'"Cafe24 Ssurround"',weights:[700]},
 l_hannapro:{local:1,label:'배민 한나 Pro',css:'"BM Hanna Pro"',weights:[400]},
 l_onepop:{local:1,label:'원스토어 모바일 POP',css:'"ONE Mobile POP"',weights:[400]},
 l_tmon:{local:1,label:'티몬 몬소리',css:'"TmonMonsori"',weights:[400]},
 l_kbizH:{local:1,label:'KBIZ 한마음고딕 H',css:'"KBIZgo H"',weights:[400]},
 l_spoqa:{local:1,label:'스포카 한 산스',css:'"SpoqaHanSans"',weights:[300,400,700]},
 l_choi:{local:1,label:'AG 최정호 스크린',css:'"AGChoiJeongHo Screen"',weights:[400]},
 l_rixYeol:{local:1,label:'Rix 열정도',css:'"RixYeoljeongdo"',weights:[400]},
 l_rixYeolG:{local:1,label:'Rix 열정고딕',css:'"RixYeoljeongGothic"',weights:[400]},
 l_rixDotum:{local:1,label:'Rix 동님돋움 SE',css:'"RixDongnimDotumSE","RixDongnimDotum"',weights:[400,500,600,700,800]},
 l_rixGothic:{local:1,label:'Rix 동님고딕 SE',css:'"RixDongnimGothicSE","RixDongnimGothic"',weights:[400,500,600,700,800]},
 l_rixMMjM:{local:1,label:'Rix 모던명조 M',css:'"RixMMj M"',weights:[400]},
 l_rixMMjB:{local:1,label:'Rix 모던명조 B',css:'"RixMMj B"',weights:[400]},
 l_rixMMjEB:{local:1,label:'Rix 모던명조 EB',css:'"RixMMj EB"',weights:[400]},
 l_rixMjEB:{local:1,label:'Rix 명조 EB',css:'"RixMj EB"',weights:[400]},
 l_rixSMjB:{local:1,label:'Rix 신명조 B',css:'"RixSMj B"',weights:[400]}};
// A local font is usable only if the browser actually finds it on this computer.
const localOk=new Map();
function fontAvailable(key){const f=FONTS[key];if(!f?.local)return true;if(!localOk.has(key)){const c=document.createElement('canvas').getContext('2d'),t='가나다라 고등어 1도 Agy';const w=g=>{c.font='72px '+g;return c.measureText(t).width};localOk.set(key,['monospace','serif'].some(g=>Math.abs(w(f.css+','+g)-w(g))>0.5))}return localOk.get(key)}
const weightNames={300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Black'};
function fontOf(l){const key=l.font==='plain'?'sans':(FONTS[l.font]?l.font:'sans'),f=FONTS[key];let w=Number(l.weight);if(!Number.isFinite(w))w=l.font==='plain'?500:l.font==='serif'?700:key==='sans'?850:f.weights.at(-1);return {key,css:f.css,weight:w}}
const fontString=(l,size)=>{const f=fontOf(l);return f.weight+' '+size+'px '+f.css};
function loadFont(l,text){try{return document.fonts.load(fontString(l,48),text||'가A').catch(()=>{})}catch{return Promise.resolve()}}

// ---- Per-character colour. layer.colors is parallel to Array.from(text);
// null means the layer's base colour.
const chars=t=>Array.from(t||'');
function cleanColors(l){if(!Array.isArray(l.colors)||l.colors.length!==chars(l.text).length||!l.colors.some(Boolean))delete l.colors}
function setLayerText(l,next){const a=chars(l.text),b=chars(next);if(Array.isArray(l.colors)&&l.colors.length===a.length){let pre=0;while(pre<a.length&&pre<b.length&&a[pre]===b[pre])pre++;let suf=0;while(suf<a.length-pre&&suf<b.length-pre&&a[a.length-1-suf]===b[b.length-1-suf])suf++;const old=l.colors,inherit=pre>0?old[pre-1]:(old[a.length-suf]??null);l.colors=[...old.slice(0,pre),...Array(b.length-pre-suf).fill(inherit),...old.slice(a.length-suf)]}l.text=next;cleanColors(l);growBox(l)}
// Longer copy keeps its font size: widen the box (around its alignment anchor) up to the
// canvas, and only then add lines by growing the box height. Never shrinks the box.
function growBox(l){if(!p||!Object.values(p.layers).includes(l)||!l.text)return;const W=p.w,H=p.h,c=art.getContext('2d'),size=W*l.size/100;c.font=fontString(l,size);
  const padK=['badge','cta'].includes(l.base)?.15:0,widest=Math.max(...l.text.split('\n').map(t=>c.measureText(t).width)),need=(widest+size*.12)/(1-padK)/W,ox=l.x,oy=l.y;
  if(need>l.w){const nw=Math.min(need,1),cx=l.align==='center'?l.x+l.w/2:null;l.x=l.align==='right'?l.x+l.w-nw:cx!==null?cx-nw/2:l.x;l.w=nw;l.x=Math.min(Math.max(l.x,0),1-nw)}
  const {lines}=fitted(c,{...l,size:l.size},l.text,l.w*W*(1-padK),Infinity,W),needH=(lines.length*size*1.22+2)/H;
  if(needH>l.h){const nh=Math.min(needH,1),cy=l.y+l.h/2;l.h=nh;l.y=Math.min(Math.max(cy-nh/2,0),1-nh)}
  const b=pixelBoxOf(l);if(b){b.dx+=ox-l.x;b.dy+=oy-l.y}}
function colorRange(l,start,end,color){const n=chars(l.text).length;if(start>=end||end>n)return;const c=Array.isArray(l.colors)&&l.colors.length===n?l.colors.slice():Array(n).fill(null);for(let i=start;i<end;i++)c[i]=color;l.colors=c;cleanColors(l)}
let charSel=null;// {layer,start,end} in character indices
function trackSelection(area,layer){if(!layer)return;const t=area.value,s=chars(t.slice(0,area.selectionStart)).length,e=chars(t.slice(0,area.selectionEnd)).length;charSel=e>s?{layer,start:s,end:e}:(charSel?.layer===layer?charSel:null);updateSelHint()}
function updateSelHint(){const hint=$('#selHint');if(!hint)return;const l=p?.layers[selected];if(charSel&&charSel.layer===l){hint.textContent='선택: “'+chars(l.text).slice(charSel.start,charSel.end).join('')+'” ('+(charSel.end-charSel.start)+'자)';hint.classList.add('on')}else{hint.textContent='이미지 위 문구를 클릭하고 바꿀 글자를 드래그하세요';hint.classList.remove('on')}}

// ---- Illustrator-style dock: collapsible property sections + layers panel.
const propRoot=$('#inspector'),openSections=new Set(['transform','char','fill','image','shape','bg']);
const kindIcon={bg:'▭',product:'▣',deco:'✦',title:'T',sub:'T',badge:'◉',cta:'▢'};
// Font picker: a list instead of a native select, so pointing at (or arrowing to) a
// font shows it on the canvas right away. Leaving without choosing restores the font;
// previews never enter the undo history.
let closeFontList=null;
function fontPicker(l,cur,commit,opts){
  const row=el('div',undefined,'ai-row');row.append(el('span','글꼴'));
  const btn=el('button',opts[cur]||cur,'font-btn');btn.type='button';btn.id='prop-font';btn.style.fontFamily=FONTS[cur].css;btn.setAttribute('aria-haspopup','listbox');row.append(btn);
  btn.onclick=()=>{if(closeFontList){closeFontList();return}
    const orig={font:l.font,weight:l.weight},keys=Object.keys(opts),list=el('div',undefined,'font-list');list.setAttribute('role','listbox');let active=cur,done=false;
    const show=k=>{active=k;for(const it of list.children)it.classList.toggle('on',it.dataset.key===k);l.font=k;const ws=FONTS[k].weights;l.weight=ws.includes(Number(orig.weight))?orig.weight:ws.includes(800)?800:ws.at(-1);draw();loadFont(l,l.text).then(()=>{if(!done&&active===k)draw()})};
    const close=pick=>{if(done)return;done=true;closeFontList=null;histPaused=false;list.remove();document.removeEventListener('pointerdown',away,true);document.removeEventListener('keydown',keys_,true);l.font=orig.font;l.weight=orig.weight;if(pick&&pick!==cur)commit(pick);else draw()};
    const away=e=>{if(!list.contains(e.target)&&e.target!==btn)close()};
    const keys_=e=>{const i=keys.indexOf(active);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();close(active)}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();const k=keys[Math.max(0,Math.min(keys.length-1,i+(e.key==='ArrowDown'?1:-1)))];show(k);list.querySelector('.on')?.scrollIntoView({block:'nearest'})}};
    for(const k of keys){const it=el('div',opts[k],'font-item');it.dataset.key=k;it.setAttribute('role','option');it.style.fontFamily=FONTS[k].css;if(k===cur)it.classList.add('on','current');it.onpointerenter=()=>show(k);it.onclick=()=>close(k);list.append(it)}
    const r=btn.getBoundingClientRect(),below=innerHeight-r.bottom-8,up=below<220&&r.top>below;
    const lw=Math.max(r.width,240);Object.assign(list.style,{left:Math.max(8,Math.min(r.left,innerWidth-lw-8))+'px',width:lw+'px',maxHeight:Math.max(160,Math.min(420,up?r.top-8:below))+'px'});if(up)list.style.bottom=(innerHeight-r.top+2)+'px';else list.style.top=(r.bottom+2)+'px';
    document.body.append(list);list.querySelector('.current')?.scrollIntoView({block:'center'});histRecord();histPaused=true;closeFontList=close;
    document.addEventListener('pointerdown',away,true);document.addEventListener('keydown',keys_,true)};
  return row}
function field(k,lbl,type,val,set,options,attrs={}){let lab=el('label',undefined,'ai-row'+(type==='checkbox'?' toggle':''));lab.append(el('span',lbl));let n=el(type==='select'?'select':type==='textarea'?'textarea':'input');if(n.tagName==='INPUT')n.type=type;if(type==='select')listOpts(n,options,val);else if(type==='checkbox')n.checked=val;else n.value=val;Object.assign(n,attrs);n.id='prop-'+k;n.oninput=()=>{let v=type==='checkbox'?n.checked:n.value;if(type==='number'&&v==='')return;set(v);changed=true;draw()};lab.append(n);return lab}
function section(id,title,...children){let d=el('details',undefined,'ai-sec');d.open=openSections.has(id);d.ontoggle=()=>d.open?openSections.add(id):openSections.delete(id);d.append(el('summary',title),...children);return d}
function segmented(k,options,val,set){let g=el('div',undefined,'ai-seg');g.setAttribute('role','group');for(const [v,label,tip] of options){let b=B(label,()=>{set(v);changed=true;refreshProps();draw()});b.title=tip||label;b.setAttribute('aria-pressed',v===val);g.append(b)}return g}
const layerName=key=>p.layers[key].label||layerNames[p.layers[key].base||key];
function renderLayers(){let order=Object.keys(p.layers);$('#layerList').replaceChildren(...order.slice().reverse().map(key=>{let l=p.layers[key],row=el('div',undefined,'ai-layer'+(key===selected?' on':'')+(l.visible?'':' off'));let eye=B(l.visible?'👁':'',()=>{l.visible=!l.visible;changed=true;renderLayers();refreshProps();draw()},'ai-eye');eye.title=l.visible?'숨기기':'보이기';eye.setAttribute('aria-label',layerName(key)+(l.visible?' 숨기기':' 보이기'));let nm=B('',()=>pick(key),'ai-lname');nm.append(el('i',kindIcon[l.base||key]||'▫'),el('span',layerName(key)));nm.setAttribute('aria-pressed',key===selected);row.append(eye,nm);return row}));
 let foot=$('#layerActions'),isBg=selected==='bg';foot.replaceChildren(B('▲',()=>moveLayer(1),'ai-icon'),B('▼',()=>moveLayer(-1),'ai-icon'),B('⧉',()=>{if(isBg)return;let id='extra_'+uid().replace(/-/g,'');p.layers[id]={...structuredClone(p.layers[selected]),label:layerName(selected)+' 복사',x:p.layers[selected].x+.02,y:p.layers[selected].y+.02};changed=true;pick(id)},'ai-icon'),B('🗑',deleteSelected,'ai-icon'));[...foot.children].forEach((b,i)=>{b.title=['앞으로','뒤로','복제','삭제'][i];b.setAttribute('aria-label',b.title);b.disabled=isBg})}
function deleteSelected(){if(selected==='bg')return;delete p.layers[selected];changed=true;pick(Object.keys(p.layers).at(-1))}
function refreshProps(){closeFontList?.();let l=p.layers[selected],k=l.base||selected;renderLayers();
 let head=el('div',undefined,'ai-head');head.append(el('i',kindIcon[k]||'▫'),el('b',layerName(selected)),el('small',{bg:'배경',product:'이미지',deco:'이미지',title:'문자',sub:'문자',badge:'배지',cta:'버튼'}[k]||''));let items=[head];
 if(k!=='bg'){let row1=el('div',undefined,'ai-grid'),row2=el('div',undefined,'ai-grid');const px=(n,dim)=>field(n,n.toUpperCase(),'number',Math.round(l[n]*dim),v=>{l[n]=num(v,0,-4*dim,4*dim)/dim;if(['w','h'].includes(n))l[n]=Math.max(.01,l[n]);alignCanvasCopy()},null,{step:1});row1.append(px('x',p.w),px('y',p.h));row2.append(px('w',p.w),px('h',p.h));items.push(section('transform','변형',row1,row2))}
 if(textKeys.includes(k)){const f=fontOf(l);let area=field('text','내용','textarea',l.text,v=>{setLayerText(l,v);charSel=null;updateSelHint()},null,{rows:3,placeholder:'이번 소재의 문구를 입력하세요.',maxLength:600});let ta=area.querySelector('textarea');for(const ev of ['select','keyup','mouseup'])ta.addEventListener(ev,()=>trackSelection(ta,l));
  let fontSel=fontPicker(l,f.key,v=>{l.font=v;const ws=FONTS[v].weights;if(!ws.includes(Number(l.weight)))l.weight=ws.includes(800)?800:ws.at(-1);loadFont(l,l.text).then(draw);refreshProps();changed=true;draw()},Object.fromEntries(Object.entries(FONTS).filter(([key])=>key===f.key||fontAvailable(key)).map(([key,v])=>[key,v.local?v.label+' · 설치 글꼴':v.label])));
  let ws=FONTS[f.key].weights.slice();if(!ws.includes(f.weight))ws.push(f.weight);let weightSel=field('weight','굵기','select',String(f.weight),v=>{l.weight=Number(v);loadFont(l,l.text).then(draw)},Object.fromEntries(ws.map(w=>[w,(weightNames[w]||w)+' '+w])));
  let size=field('size','크기 (px)','number',+(l.size*p.w/100).toFixed(1),v=>{l.size=num(Number(v)*100/p.w,5,.8,35);alignCanvasCopy()},null,{min:4,step:1});
  let align=el('div',undefined,'ai-row');align.append(el('span','정렬'),segmented('align',[['left','⇤','왼쪽 정렬'],['center','≡','가운데 정렬'],['right','⇥','오른쪽 정렬']],l.align,v=>l.align=v));
  if(l.originalText)items.push(el('p','원문 · '+l.originalText,'ai-note'));
  items.push(section('char','문자',area,fontSel,weightSel,size,align));
  let selRow=el('div',undefined,'ai-row'),selColor=el('input');selColor.type='color';selColor.id='prop-selcolor';selColor.value=(charSel?.layer===l&&l.colors?.[charSel.start])||l.color;selColor.oninput=()=>{if(!charSel||charSel.layer!==l){notify('먼저 바꿀 글자를 드래그해 선택하세요.');return}colorRange(l,charSel.start,charSel.end,selColor.value);changed=true;draw()};selRow.append(el('span','선택 글자 색'),selColor);
  let clear=B('글자별 색 지우기',()=>{delete l.colors;changed=true;refreshProps();draw()},'ai-mini');clear.disabled=!l.colors;
  items.push(section('fill','칠 · 획',field('color','기본 글자 색','color',l.color,v=>l.color=v),selRow,el('p','','ai-selhint'),clear,field('outline','글자 외곽선','checkbox',l.outline,v=>l.outline=v)));items.at(-1).querySelector('.ai-selhint').id='selHint';}
 if(k==='badge'||k==='cta')items.push(section('shape','모양',field('shape','모양','select',l.shape,v=>l.shape=v,{pill:'캡슐',box:'사각',circle:'원형',none:'없음'}),field('fill','바탕색','color',l.fill,v=>l.fill=v)));
 if(imgs.includes(k)){let parts=[];if(k==='bg'&&!(p.rasterLayers&&l.upload))parts.push(field('color','배경색','color',l.color,v=>l.color=v),field('pattern','표현','select',l.pattern,v=>l.pattern=v,{paper:'종이 결',light:'은은한 광원',plain:'단색'}));
  if(k==='product'){let opts={'':l.upload?'업로드한 이미지 사용':'선택 안 함'};assets.filter(a=>brandOf(a)===p.brand&&a.kind==='product'&&a.reusable!==false).forEach(a=>opts[a.id]=a.name);parts.push(field('asset','제품 사진','select',l.asset,async v=>{l.asset=v;l.upload='';l.uploadName='';if(v)await autoFit(l,await assetBitmap(v));changed=true;refreshProps();draw()},opts))}
  let up=el('label',undefined,'ai-file'),f=el('input');up.append(el('span',l.upload?'↻ '+(l.uploadName||'업로드 이미지'):'↑ 이미지 업로드'));f.type='file';f.accept='image/png,image/jpeg,image/webp';f.onchange=async()=>{let target=l,doc=p;try{let file=f.files[0],{url,im}=await readRaster(file);if(doc!==p)return;target.upload=url;target.asset='';target.uploadName=file.name;if(k!=='bg')await autoFit(target,im);changed=true;refreshProps();draw()}catch(e){notify(e.message)}};up.append(f);parts.push(up);
  if(l.upload)parts.push(B(k==='bg'&&p.rasterLayers?'사진 제거 · 배경색 사용':'업로드 이미지 제거',()=>{l.upload='';l.uploadName='';changed=true;refreshProps();draw()},'ai-mini'));
  parts.push(field('fit','맞춤','select',l.fit,v=>l.fit=v,{contain:'전체 보이기',cover:'영역 채우기'}));items.push(section(k==='bg'?'bg':'image',k==='bg'?'배경':'이미지',...parts))}
 items.push(field('visible','표시','checkbox',l.visible,v=>{l.visible=v;renderLayers()}));
 propRoot.replaceChildren(...items);updateSelHint()}
// Opaque photos fill the original product area; cut-outs with transparency keep
// their whole shape visible.
async function autoFit(l,im){try{const c=el('canvas');c.width=c.height=24;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,24,24);const d=x.getImageData(0,0,24,24).data;let clear=0;for(let i=3;i<d.length;i+=4)if(d[i]<240)clear++;l.fit=clear>12?'contain':'cover'}catch{}}
function moveLayer(step){let o=Object.keys(p.layers),i=o.indexOf(selected),j=i+step;if(i<1||j<1||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];p.layers=Object.fromEntries(o.map(k=>[k,p.layers[k]]));changed=true;pick(selected)}
function addLayerOf(k){if(!p)return;let l=create({id:'new',brand:p.brand,channel:p.channel,title:'시안',layout:'type-top',assets:[]}).layers[k],id='extra_'+uid().replace(/-/g,'');l.label=layerNames[k]+' '+(1+Object.values(p.layers).filter(v=>v.base===k).length);l.visible=true;if(k==='title'){l.text='새 문구';l.size=7}p.layers[id]=l;changed=true;pick(id);if(k==='title')requestAnimationFrame(()=>editCanvasCopy(l))}
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addLayerOf(b.dataset.add));

const imageCache=new Map,assetCache=new Map;window.STUDIO_ASSET_BYTES=window.STUDIO_ASSET_BYTES||{};
function bitmap(src){if(!imageCache.has(src)){let promise=new Promise((res,rej)=>{let i=new Image;i.onload=()=>res(i);i.onerror=()=>rej(Error('이미지를 열 수 없습니다.'));i.src=src});imageCache.set(src,promise);promise.catch(()=>imageCache.delete(src))}return imageCache.get(src)}
async function assetBitmap(id){let a=aBy(id);if(!a)throw Error('분리 에셋이 없습니다: '+id);if(!assetCache.has(id)){let prom=(async()=>{if(!window.STUDIO_ASSET_BYTES[id]){await new Promise((res,rej)=>{let t=el('script');t.onload=()=>{t.remove();res()};t.onerror=()=>{t.remove();rej(Error('에셋 팩을 열 수 없습니다: '+a.name))};t.src=a.pack;document.head.append(t)})}return bitmap(window.STUDIO_ASSET_BYTES[id])})();assetCache.set(id,prom);prom.catch(()=>assetCache.delete(id))}return assetCache.get(id)}
function paintImage(c,i,x,y,w,h,mode){let a=i.naturalWidth,b=i.naturalHeight,s=mode==='cover'?Math.max(w/a,h/b):Math.min(w/a,h/b);c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.drawImage(i,x+(w-a*s)/2,y+(h-b*s)/2,a*s,b*s);c.restore()}
function rect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,Math.max(0,Math.min(r,w/2,h/2)));c.fill()}
function fitted(c,l,txt,w,h,S){let size=S*l.size/100,lines=[],starts=[];
 function set(){c.font=fontString(l,size);lines=[];starts=[];let at=0;for(let par of txt.split('\n')){const cs=Array.from(par);if(!cs.length){lines.push('');starts.push(at);at+=1;continue}let row='',rowStart=at;for(let ch of cs){if(row&&c.measureText(row+ch).width>w){lines.push(row);starts.push(rowStart);rowStart=at;row=ch}else row+=ch;at++}lines.push(row);starts.push(rowStart);at+=1}}
 set();while(size>5&&lines.length*size*1.22>h){size=Math.max(5,size*.95);set()}return {lines,size,starts}}
function drawLine(c,l,line,start,xx,yy,size,has){const outline=l.outline&&has,stroke=l.color.toLowerCase()==='#ffffff'?'#25251d':'#ffffff';if(outline){c.lineWidth=size*.075;c.lineJoin='round';c.strokeStyle=stroke}
 if(!has||!l.colors){c.textAlign=l.align;if(outline)c.strokeText(line,xx,yy);c.fillText(line,xx,yy);return}
 const cs=Array.from(line),total=c.measureText(line).width;let x=l.align==='center'?xx-total/2:l.align==='right'?xx-total:xx;c.textAlign='left';
 for(let i=0;i<cs.length;){const col=l.colors[start+i]||l.color;let j=i+1;while(j<cs.length&&(l.colors[start+j]||l.color)===col)j++;const run=cs.slice(i,j).join('');if(outline)c.strokeText(run,x,yy);c.fillStyle=col;c.fillText(run,x,yy);x+=c.measureText(run).width;i=j}}
async function render(canvas,doc,hints=false){let W=doc.w,H=doc.h;canvas.width=W;canvas.height=H;let c=canvas.getContext('2d');let lm=doc.layers;let buffers={};await Promise.all(Object.values(lm).filter(l=>l.visible&&(l.text||'').trim()).map(l=>loadFont(l,l.text)));await Promise.all(Object.keys(lm).map(async key=>{let l=lm[key],k=l.base||key;if((imgs.includes(k)||l.pixelText!==undefined)&&l.visible&&(l.upload||l.asset))buffers[key]=l.upload?await bitmap(l.upload):await assetBitmap(l.asset)}));
 for(let [key,l] of Object.entries(lm)){let k=l.base||key;if(!l.visible)continue;let x=l.x*W,y=l.y*H,w=l.w*W,h=l.h*H;c.save();
 if(l.pixelText!==undefined&&buffers[key]&&l.text===l.pixelText&&l.pixelStyle===pixelStyle(l)){const pb=pixelBoxOf(l);if(pb)paintImage(c,buffers[key],(l.x+pb.dx)*W,(l.y+pb.dy)*H,pb.w*W,pb.h*H,'contain');else paintImage(c,buffers[key],x,y,w,h,'contain');c.restore();continue}if(l.pixelText!==undefined)delete buffers[key];
 if(k==='bg'){if(!doc.rasterLayers||!buffers[key]){c.fillStyle=l.color;c.fillRect(0,0,W,H)}if(l.pattern!=='plain'){let g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#ffffff66');g.addColorStop(.56,'#ffffff00');g.addColorStop(1,'#3d240e20');c.fillStyle=g;c.fillRect(0,0,W,H);if(l.pattern==='paper'){c.strokeStyle='#6d57320c';c.lineWidth=Math.max(1,W/1400);for(let z=0;z<H;z+=6){c.beginPath();c.moveTo(0,z);c.lineTo(W,z+.5);c.stroke()}}}if(buffers[key])paintImage(c,buffers[key],0,0,W,H,l.fit)}
 else if(k==='product'||k==='deco'){if(buffers[key])paintImage(c,buffers[key],x,y,w,h,l.fit);else if(hints){c.fillStyle='#77775b12';rect(c,x,y,w,h,8);c.fillStyle='#636851';c.font='600 '+W*.026+'px sans-serif';c.textAlign='center';c.fillText(k==='product'?'제품 이미지 선택':'장식 이미지 선택',x+w/2,y+h/2,w*.94)}}
 else{let has=!!l.text.trim(),shape=k==='badge'||k==='cta';if(has||hints||buffers[key]){let px=shape?w*.075:0;if(buffers[key])paintImage(c,buffers[key],x,y,w,h,l.fit);else if(shape&&l.shape!=='none'&&(has||hints)){c.fillStyle=has?l.fill:'#7f816730';if(l.shape==='circle'){c.beginPath();c.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,2*Math.PI);c.fill()}else rect(c,x,y,w,h,l.shape==='pill'?h/2:3)}
 let txt=has?l.text:hints&&!(buffers[key])&&l.pixelText===undefined?(l.label||layerNames[k]):'';if(txt){c.textBaseline='middle';let {size,lines,starts}=fitted(c,l,txt,w-2*px,h,W),dy=size*1.22,xx=l.align==='center'?x+w/2:l.align==='right'?x+w-px:x+px;c.fillStyle=has?l.color:'#737462';c.beginPath();c.rect(x,y,w,h);c.clip();for(let [idx,line] of lines.entries()){let yy=y+h/2+(idx-(lines.length-1)/2)*dy;drawLine(c,l,line,starts[idx],xx,yy,size,has)}}}}
 c.restore()}return canvas}
async function draw(){if(!p)return;histSchedule();let n=++drawRev,doc=p;let l=p.layers[selected],o=$('#outline');o.hidden=!l.visible||selected==='bg';Object.assign(o.style,{left:l.x*100+'%',top:l.y*100+'%',width:l.w*100+'%',height:l.h*100+'%'});try{let cn=await render(el('canvas'),doc,true);if(n===drawRev&&p===doc){let art=$('#art');art.getContext('2d').clearRect(0,0,art.width,art.height);art.getContext('2d').drawImage(cn,0,0)}}catch(e){if(n===drawRev)notify(e.message)}}
let drag;const art=$('#art');function point(e){let b=art.getBoundingClientRect();return [(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height]}
const canvasCopy = $('#canvasCopy');
let typingLayer = null;
function closeCanvasCopy() {
  typingLayer = null;
  canvasCopy.hidden = true;
}
function alignCanvasCopy() {
  if(!typingLayer || !p)return;
  const layer = typingLayer;
  const scale = art.getBoundingClientRect().width / p.w;
  const boxWidth = layer.w*p.w;
  const boxHeight = layer.h*p.h;
  const inset = ['badge','cta'].includes(layer.base) ? boxWidth*.075 : 0;
  const {size,lines} = fitted(art.getContext('2d'),layer,layer.text,boxWidth-2*inset,boxHeight,p.w);
  Object.assign(canvasCopy.style,{
    left:layer.x*100+'%',top:layer.y*100+'%',width:layer.w*100+'%',height:layer.h*100+'%',
    paddingInline:inset*scale+'px',paddingTop:Math.max(0,(boxHeight-lines.length*size*1.22)*scale/2)+'px',
    textAlign:layer.align,fontSize:size*scale+'px',fontWeight:fontOf(layer).weight,fontFamily:fontOf(layer).css
  });
}
// Pixel text keeps the original glyphs until the copy actually changes. Before
// the first keystroke, guess the closest web font from the original pixels so
// the retyped copy looks like the original instead of the default font.
function pixelBoxOf(l){const b=l.pixelBox;return b&&['dx','dy','w','h'].every(k=>Number.isFinite(b[k]))&&b.w>0&&b.h>0?b:null}
const fontJobs=new WeakMap();
function inkMask(ctx,w,h,test){const d=ctx.getImageData(0,0,w,h).data,m=new Uint8Array(w*h);let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(test(d,i*4)){m[i]=1;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}return x1<0?null:{m,w,x0,y0,x1,y1}}
function maskGrid(k,GW,GH){const c=el('canvas');c.width=k.x1-k.x0+1;c.height=k.y1-k.y0+1;const g=c.getContext('2d'),im=g.createImageData(c.width,c.height);for(let y=k.y0;y<=k.y1;y++)for(let x=k.x0;x<=k.x1;x++)if(k.m[y*k.w+x])im.data[((y-k.y0)*c.width+x-k.x0)*4+3]=255;g.putImageData(im,0,0);const s=el('canvas');s.width=GW;s.height=GH;const t=s.getContext('2d');t.imageSmoothingQuality='high';t.drawImage(c,0,0,GW,GH);const a=t.getImageData(0,0,GW,GH).data,out=new Float32Array(GW*GH);for(let i=0;i<out.length;i++)out[i]=a[i*4+3]/255;return out}
async function matchFont(l){
  if(l.fontMatched||l.pixelText===undefined||!l.upload||!(l.pixelText||'').trim())return;
  const img=await bitmap(l.upload),W=img.naturalWidth,H=img.naturalHeight,src=el('canvas');src.width=W;src.height=H;const sc=src.getContext('2d',{willReadFrequently:true});sc.drawImage(img,0,0);
  // Background = most common colour along the crop's opaque border; text = anything far from it,
  // so multi-colour copy (white + red) is matched as one line.
  const px=sc.getImageData(0,0,W,H).data,tally=new Map();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(x>1&&x<W-2&&y>1&&y<H-2)continue;const o=(y*W+x)*4;if(px[o+3]<128)continue;const q=(px[o]>>4)<<8|(px[o+1]>>4)<<4|px[o+2]>>4;tally.set(q,(tally.get(q)||0)+1)}
  if(!tally.size)return;const bq=[...tally].sort((a,b)=>b[1]-a[1])[0][0],bg=[(bq>>8)*16+8,((bq>>4)&15)*16+8,(bq&15)*16+8];
  const far=(d,o)=>d[o+3]>128&&Math.hypot(d[o]-bg[0],d[o+1]-bg[1],d[o+2]-bg[2])>90;
  const target=inkMask(sc,W,H,far);
  if(!target)return;
  {const rows=[];for(let y=0;y<H;y++){let n=0;for(let x=0;x<W;x++)n+=target.m[y*W+x];rows.push(n)}
   const on=rows.map(n=>n>Math.max(1,W*.004));let best=[0,-1],a=-1,gap=0;const minGap=Math.max(2,Math.round(H*.06));
   for(let y=0;y<=H;y++){if(y<H&&on[y]){if(a<0)a=y;gap=0}else if(a>=0){gap++;if(gap>=minGap||y===H){const b=y-gap;const mass=rows.slice(a,b+1).reduce((s,n)=>s+n,0);if(mass>best[2]||best[1]<0)best=[a,b,mass];a=-1;gap=0}}}
   if(best[1]>=0){target.y0=best[0];target.y1=best[1];for(let y=0;y<H;y++)if(y<best[0]||y>best[1])for(let x=0;x<W;x++)target.m[y*W+x]=0;let x0=W,x1=-1;for(let y=best[0];y<=best[1];y++)for(let x=0;x<W;x++)if(target.m[y*W+x]){if(x<x0)x0=x;if(x>x1)x1=x}if(x1>=0){target.x0=x0;target.x1=x1}}}
  const tw=target.x1-target.x0+1,th=target.y1-target.y0+1,GH=28,GW=Math.max(8,Math.min(480,Math.round(GH*tw/th))),want=maskGrid(target,GW,GH);
  const lines=l.pixelText.split('\n'),P=64,cand=[];
  for(const [key,f] of Object.entries(FONTS))if(fontAvailable(key))for(const weight of f.weights)cand.push({key,weight});
  await Promise.all(cand.map(c=>loadFont({font:c.key,weight:c.weight},l.pixelText)));
  let best=null;
  for(const c of cand){const probe={font:c.key,weight:c.weight},cv=el('canvas'),g=cv.getContext('2d',{willReadFrequently:true});g.font=fontString(probe,P);const lw=Math.max(...lines.map(t=>g.measureText(t).width));cv.width=Math.ceil(lw+P);cv.height=Math.ceil(lines.length*P*1.22+P);g.font=fontString(probe,P);g.textBaseline='middle';g.fillStyle='#000';lines.forEach((t,i)=>g.fillText(t,P/2,P/2+P*.61+i*P*1.22));
    const got=inkMask(g,cv.width,cv.height,(d,o)=>d[o+3]>128);if(!got)continue;const gw=got.x1-got.x0+1,gh=got.y1-got.y0+1,grid=maskGrid(got,GW,GH);
    let lo=0,hi=0;for(let i=0;i<grid.length;i++){lo+=Math.min(grid[i],want[i]);hi+=Math.max(grid[i],want[i])}
    const score=(hi?lo/hi:0)*Math.exp(-3*Math.abs(Math.log((gw/gh)/(tw/th))));
    if(!best||score>best.score){const offs=[],g2=el('canvas').getContext('2d');g2.font=fontString(probe,P);lines.forEach((t,i)=>{const cs=Array.from(t);let acc=0;cs.forEach(ch=>{const cw=g2.measureText(ch).width;offs.push({line:i,a:P/2+acc,b:P/2+acc+cw});acc+=cw});if(i<lines.length-1)offs.push(null)});best={...c,score,px:P*th/gh,width:lw*th/gh,offs,box:got,gw,gh}}}
  if(!best||l.fontMatched)return;
  // Per-character colour: map each glyph's x-span from the probe onto the original crop
  // and take the average of the text pixels inside it.
  const kx=tw/best.gw,colors=[],cnt=new Map(),hex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  const lineH=th/lines.length;
  for(const o of best.offs){if(!o){colors.push(null);continue}const a=Math.floor(target.x0+(o.a-best.box.x0)*kx),b=Math.ceil(target.x0+(o.b-best.box.x0)*kx),y0=Math.floor(target.y0+o.line*lineH),y1=Math.ceil(y0+lineH);let r=0,g=0,bl=0,n=0;
    const pick=[];for(let y=Math.max(target.y0,y0);y<Math.min(target.y1+1,y1);y++)for(let x=Math.max(0,a);x<Math.min(W,b);x++){const q=(y*W+x)*4;if(!far(px,q))continue;pick.push([Math.hypot(px[q]-bg[0],px[q+1]-bg[1],px[q+2]-bg[2]),q])}
    pick.sort((u,v)=>v[0]-u[0]);for(const [,q] of pick.slice(0,Math.max(4,Math.ceil(pick.length*.3)))){r+=px[q];g+=px[q+1];bl+=px[q+2];n++}
    const c=n>3?hex([r/n,g/n,bl/n]):null;colors.push(c);if(c){const k=hex([r/n,g/n,bl/n].map(v=>Math.round(v/24)*24>255?255:Math.round(v/24)*24));cnt.set(k,(cnt.get(k)||0)+1)}}
  if(cnt.size){const base=[...cnt].sort((a,b)=>b[1]-a[1])[0][0],near=(c1,c2)=>{const f=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));const [x,y]=[f(c1),f(c2)];return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])<70};
    const per=colors.map(c=>c&&!near(c,base)?c:null);l.color=base;if(per.some(Boolean)&&per.length===Array.from(l.text).length)l.colors=per;else delete l.colors}
  const D=p&&Object.values(p.layers).includes(l)?p:null;if(!D)return;
  const old={x:l.x,y:l.y,w:l.w,h:l.h},cx=l.x+(target.x0+target.x1+1)/2/D.w,cy=l.y+(target.y0+target.y1+1)/2/D.h;
  {const limit=Math.min(D.w*.96,old.w*D.w*1.04,tw*1.02);if(best.width>limit){const k=limit/best.width;best.px*=k;best.width*=k}}
  const nw=Math.max(best.width*1.06/D.w,tw*1.04/D.w),nh=(lines.length*best.px*1.22+2)/D.h;
  Object.assign(l,{font:best.key,weight:best.weight,size:best.px/D.w*100,align:'center',x:cx-nw/2,y:cy-nh/2,w:nw,h:nh,pixelBox:{dx:old.x-(cx-nw/2),dy:old.y-(cy-nh/2),w:old.w,h:old.h},fontMatched:true});
  if(nw<=1){const nx=Math.min(Math.max(l.x,0),1-nw);l.pixelBox.dx+=l.x-nx;l.x=nx}
  l.pixelStyle=pixelStyle(l);
  histPatchLayer(l);
}
function matchFontOnce(l){if(!fontJobs.has(l))fontJobs.set(l,matchFont(l).catch(()=>{}));return fontJobs.get(l)}
function matchAllFonts(doc){for(const l of Object.values(doc.layers))if(l.pixelText!==undefined&&!l.fontMatched)matchFontOnce(l).then(()=>{if(p===doc&&typingLayer!==l){refreshProps();draw()}})}
// Character index nearest to a click, using the same line layout as render().
function caretAt(layer,clientX,clientY){
  const b=art.getBoundingClientRect(),X=(clientX-b.left)/b.width*p.w,Y=(clientY-b.top)/b.height*p.h;
  const x=layer.x*p.w,y=layer.y*p.h,w=layer.w*p.w,h=layer.h*p.h,inset=['badge','cta'].includes(layer.base)?w*.075:0;
  const c=art.getContext('2d'),{lines,size,starts}=fitted(c,layer,layer.text,w-2*inset,h,p.w),dy=size*1.22;if(!lines.length)return 0;
  let idx=Math.round((Y-(y+h/2))/dy+(lines.length-1)/2);idx=Math.max(0,Math.min(lines.length-1,idx));
  const line=lines[idx],cs=Array.from(line);c.font=fontString(layer,size);const total=c.measureText(line).width;
  const x0=layer.align==='center'?x+w/2-total/2:layer.align==='right'?x+w-inset-total:x+inset;
  let at=cs.length,prev=0;for(let i=0;i<cs.length;i++){const nx=c.measureText(cs.slice(0,i+1).join('')).width;if(X<x0+(prev+nx)/2){at=i;break}prev=nx}
  return Array.from(layer.text).slice(0,starts[idx]+at).join('').length;
}
async function editCanvasCopy(layer,clientX,clientY) {
  typingLayer = layer;
  canvasCopy.value = layer.text;
  canvasCopy.hidden = false;
  canvasCopy.focus({preventScroll:true});
  await matchFontOnce(layer);
  if(typingLayer!==layer)return;
  refreshProps();draw();
  alignCanvasCopy();
  const at=clientX===undefined?layer.text.length:caretAt(layer,clientX,clientY);
  canvasCopy.setSelectionRange(at,at);
}
canvasCopy.oninput = () => {
  if(!typingLayer)return;
  setLayerText(typingLayer, canvasCopy.value);
  trackSelection(canvasCopy, typingLayer);
  const field = $('#prop-text');
  if(field)field.value = typingLayer.text;
  changed = true;
  alignCanvasCopy();
  draw();
};
canvasCopy.onblur = closeCanvasCopy;
for (const ev of ['select','keyup','mouseup']) canvasCopy.addEventListener(ev, () => trackSelection(canvasCopy, typingLayer));
canvasCopy.onkeydown = e => {
  if(e.isComposing || e.keyCode===229)return;
  if(e.key==='Escape' || (e.key==='Enter' && (e.ctrlKey||e.metaKey))){
    e.preventDefault();canvasCopy.blur();
  }
};
new ResizeObserver(alignCanvasCopy).observe(art);
art.onpointerdown = e => {
  const [x,y]=point(e),current=p.layers[selected];
  const inside=l=>l.visible && x>=l.x && x<=l.x+l.w && y>=l.y && y<=l.y+l.h;
  const entries=Object.keys(p.layers).reverse();
  const hit=entries.find(key=>inside(p.layers[key]));
  const corner=selected!=='bg' && current.visible &&
    Math.hypot((x-current.x-current.w)*art.clientWidth,(y-current.y-current.h)*art.clientHeight)<8;
  const key=corner?selected:hit;
  if(!key)return;
  pick(key);
  if(key==='bg')return;
  const l=p.layers[key];
  drag={x,y,px:l.x,py:l.y,w:l.w,h:l.h,key,resize:corner,moved:false,
        screenX:e.clientX,screenY:e.clientY,pointerId:e.pointerId};
  art.setPointerCapture(e.pointerId);
};
art.onpointermove = e => {
  if(!drag||!p||drag.pointerId!==e.pointerId)return;
  if(!drag.moved && Math.hypot(e.clientX-drag.screenX,e.clientY-drag.screenY)<5)return;
  drag.moved=true;
  const [x,y]=point(e),l=p.layers[drag.key];
  if(drag.resize){l.w=ranges(drag.w+x-drag.x,.02,2);l.h=ranges(drag.h+y-drag.y,.02,2)}
  else{l.x=ranges(drag.px+x-drag.x,-.5,1.25);l.y=ranges(drag.py+y-drag.y,-.5,1.25)}
  changed=true;draw();
};
art.onpointerup = e => {
  if(!drag||drag.pointerId!==e.pointerId)return;
  const gesture=drag;drag=null;
  refreshProps();
  const layer=p.layers[gesture.key];
  if(!gesture.moved && textKeys.includes(layer.base||gesture.key))editCanvasCopy(layer,e.clientX,e.clientY);
};
art.onpointercancel = () => {drag=null};
function meaningful(doc){return Object.entries(doc.layers).some(([k,l])=>l.visible&&((l.text||'').trim()||l.upload||l.asset))}
function getName(){if(!p.name.trim())throw Error('시안 이름을 입력하세요.');return p.name.trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,100)}
function download(blob,name){let url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function output(c,mime,q){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('이미지를 만들지 못했습니다.')),mime,q))}
async function busy(selector,fn){let b=$(selector);b.disabled=true;try{await fn()}catch(e){notify(e.message||'처리에 실패했습니다.')}finally{b.disabled=false}}
$('#save').onclick=()=>busy('#save',async()=>{getName();let d=structuredClone(p),full=await render(el('canvas'),d,false),sm=el('canvas');sm.width=340;sm.height=Math.round(sm.width*d.h/d.w);sm.getContext('2d').drawImage(full,0,0,sm.width,sm.height);d.preview=sm.toDataURL('image/jpeg',.78);d.saved=new Date().toISOString();await dbOp('drafts','put',d);drafts=drafts.filter(s=>s.id!==d.id);drafts.push(d);$('#duplicate').hidden=false;if(JSON.stringify(p)===JSON.stringify(stripExtras(d)))changed=false;notify('내 시안에 저장했습니다.')});
function stripExtras(d){let v=structuredClone(d);delete v.preview;delete v.saved;return v}
function openDraft(d){showEditor(stripExtras(d))}
// ---- PSD export (vendor/ag-psd.js, loaded on first use). Every studio layer becomes a
// Photoshop layer at its place. Copy is written as a live type layer; copy that still
// shows its original pixels keeps those pixels visible and gets a hidden type layer
// beside it, because the matched font is only the closest one, not the designer's file.
async function loadPsdLib(){if(!window.agPsd)await new Promise((res,rej)=>{const sc=el('script');sc.src='vendor/ag-psd.js?v=34.2.0';sc.onload=res;sc.onerror=()=>rej(Error('PSD 도구를 불러오지 못했습니다.'));document.head.append(sc)});return window.agPsd}
function trimCanvas(cv){const W=cv.width,H=cv.height,d=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;let x0=W,y0=H,x1=-1,y1=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(d[(y*W+x)*4+3]>3){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1<0)return null;const out=el('canvas');out.width=x1-x0+1;out.height=y1-y0+1;out.getContext('2d').drawImage(cv,x0,y0,out.width,out.height,0,0,out.width,out.height);return {canvas:out,left:x0,top:y0}}
async function soloCanvas(doc,key,change){const layers=Object.fromEntries(Object.entries(doc.layers).map(([k,l])=>[k,{...l,visible:k===key}]));if(change)change(layers[key]);return trimCanvas(await render(el('canvas'),{...doc,layers},false))}
// PostScript names as Photoshop lists them (read from Photoshop 2025 on the design Mac,
// 2026-11-16). Web-only fonts use their published names; Photoshop substitutes when a
// font is not installed.
const W9=(base,map)=>Object.fromEntries(Object.entries(map).map(([w,sfx])=>[w,base+sfx]));
const PSNAMES={pretendard:W9('PretendardVariable-',{300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Black'}),
 notoSans:W9('NotoSansKR-',{300:'Light',400:'Regular',500:'Medium',700:'Bold',900:'Black'}),gothicA1:W9('GothicA1-',{400:'Regular',500:'Medium',700:'Bold',800:'ExtraBold',900:'Black'}),
 blackHan:{400:'BlackHanSans-Regular'},doHyeon:{400:'DoHyeon-Regular'},jua:{400:'Jua-Regular'},gasoek:{400:'GasoekOne-Regular'},notoSerif:W9('NotoSerifKR-',{400:'Regular',600:'SemiBold',700:'Bold',900:'Black'}),
 nanumMyeongjo:{400:'NanumMyeongjo',700:'NanumMyeongjoBold',800:'NanumMyeongjoExtraBold'},songMyung:{400:'SongMyung-Regular'},nanumPen:{400:'NanumPen'},gaegu:W9('Gaegu-',{400:'Regular',700:'Bold'}),
 sans:W9('AppleSDGothicNeo-',{400:'Regular',500:'Medium',700:'Bold',800:'ExtraBold',900:'Heavy'}),serif:{400:'AppleMyungjo'},
 l_gmarket:W9('GmarketSans',{300:'Light',500:'Medium',700:'Bold'}),l_aggro:W9('SBAggro',{300:'L',500:'M',700:'B'}),l_suite:W9('SUITE-',{300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Heavy'}),
 l_paperlogy:W9('Paperlogy-',{500:'5Medium',600:'6SemiBold',800:'8ExtraBold',900:'9Black'}),l_esamanru:W9('esamanru',{300:'Light',500:'Medium',700:'Bold'}),l_nexon:W9('NEXONLv1Gothic',{300:'Light',400:'Regular',700:'Bold'}),
 l_ssurround:{700:'Cafe24Ssurround'},l_hannapro:{400:'BMHANNAProOTF'},l_onepop:{400:'ONEMobilePOPRegular'},l_tmon:{400:'TmonMonsoriBlack'},l_kbizH:{400:'KBIZgoH'},l_spoqa:W9('SpoqaHanSans-',{300:'Light',400:'Regular',700:'Bold'}),l_choi:{400:'AGChoiJeongHoScreen'},
 l_rixYeol:{400:'RixYeoljeongdoR'},l_rixYeolG:{400:'RixYeoljeongGothicB'},l_rixDotum:{600:'RixDongnimDotumSESB',800:'RixDongnimDotumSEBK'},l_rixGothic:{600:'RixDongnimGothicSESB',800:'RixDongnimGothicSEBK'},
 l_rixMMjM:{400:'RixMMjM'},l_rixMMjB:{400:'RixMMjB'},l_rixMMjEB:{400:'RixMMjEB'},l_rixMjEB:{400:'RixMjEB'},l_rixSMjB:{400:'RixSMjB'}};
function psName(l){const f=fontOf(l),t=PSNAMES[f.key];if(!t)return f.css.split(',')[0].replace(/["'\s]/g,'');const ws=Object.keys(t).map(Number).sort((a,b)=>Math.abs(a-f.weight)-Math.abs(b-f.weight)||b-a);return t[ws[0]]}
const rgbOf=hex=>{const h=/^#?([0-9a-f]{6})/i.exec(hex||'')?.[1]||'000000';return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}};
function psdType(doc,l){const W=doc.w,H=doc.h,x=l.x*W,y=l.y*H,w=l.w*W,h=l.h*H,shape=['badge','cta'].includes(l.base),inset=shape?w*.075:0,c=el('canvas').getContext('2d');
  const {size,lines,starts}=fitted(c,l,l.text,w-2*inset,h,W),dy=size*1.22;c.font=fontString(l,size);const m=c.measureText('가Ag'),up=m.emHeightAscent??m.fontBoundingBoxAscent??size*.88,down=m.emHeightDescent??m.fontBoundingBoxDescent??size*.12;
  const baseline=y+h/2-(lines.length-1)/2*dy+(up-down)/2,ax=l.align==='center'?x+w/2:l.align==='right'?x+w-inset:x+inset,name=psName(l),base=rgbOf(l.color);
  const runs=[];let text='';lines.forEach((line,i)=>{const cs=Array.from(line);cs.forEach((ch,j)=>{const col=l.colors?.[starts[i]+j]||l.color,last=runs.at(-1);if(last&&last.col===col)last.length+=ch.length;else runs.push({col,length:ch.length});text+=ch});if(i<lines.length-1){text+='\r';runs.at(-1).length+=1}});
  const style={font:{name},fontSize:+size.toFixed(2),fillColor:base,autoLeading:false,leading:+dy.toFixed(2)};
  return {name,data:{text,transform:[1,0,0,1,+ax.toFixed(2),+baseline.toFixed(2)],antiAlias:'smooth',style,styleRuns:runs.length>1?runs.map(r=>({length:r.length,style:{...style,fillColor:rgbOf(r.col)}})):undefined,paragraphStyle:{justification:l.align==='center'?'center':l.align==='right'?'right':'left'}},
    stroke:l.outline?{enabled:true,position:'outside',fillType:'color',blendMode:'normal',opacity:1,size:{units:'Pixels',value:Math.max(1,+(size*.0375).toFixed(1))},color:rgbOf(l.color.toLowerCase()==='#ffffff'?'#25251d':'#ffffff')}:null}}
async function buildPsd(doc){const lib=await loadPsdLib(),children=[],used=new Set();
  await Promise.all(Object.values(doc.layers).filter(l=>(l.text||'').trim()).map(l=>loadFont(l,l.text)));
  for(const [key,l] of Object.entries(doc.layers)){const k=l.base||key,label=l.label||layerNames[k]||key,hasText=textKeys.includes(k)&&(l.text||'').trim();
    if(!hasText){const img=await soloCanvas(doc,key,x=>{x.visible=true});if(img)children.push({name:label,hidden:!l.visible,...img});continue}
    const snippet=l.text.replace(/\s+/g,' ').slice(0,24),pixels=l.pixelText!==undefined&&l.text===l.pixelText&&l.pixelStyle===pixelStyle(l)&&l.upload,shape=['badge','cta'].includes(k)&&l.shape!=='none';
    const t=psdType(doc,l);used.add(t.name);
    // the glyphs alone, as Photoshop's preview of the type layer
    const glyphs=await soloCanvas(doc,key,x=>{x.visible=true;delete x.pixelText;x.shape='none';delete x.upload;delete x.asset});
    const typeLayer=glyphs&&{name:snippet,text:t.data,...glyphs,...(t.stroke?{effects:{stroke:[t.stroke]}}:{})};
    if(pixels||shape){const img=await soloCanvas(doc,key,x=>{x.visible=true});if(img)children.push({name:label+(pixels?' · 원본 이미지':' · 도형+글자'),hidden:!l.visible,...img});if(typeLayer)children.push({...typeLayer,name:snippet+' · 글자(편집용)',hidden:true})}
    else if(typeLayer)children.push({...typeLayer,hidden:!l.visible})}
  const flat=await render(el('canvas'),doc,false);
  return {buffer:lib.writePsd({width:doc.w,height:doc.h,children,canvas:flat},{invalidateTextLayers:true}),fonts:[...used],layers:children.length}}
// PSD of a library record, from the detail view: the same layered draft the editor opens with.
async function recordPsd(r,button){const label=button.textContent;button.disabled=true;button.textContent='PSD 만드는 중…';try{const doc=r.parts?create(r):await autoDraft(r);if(!doc)throw Error('자동으로 나눌 영역을 찾지 못해 PSD를 만들 수 없습니다. 편집하기에서 영역을 지정해 주세요.');
  const out=await buildPsd(doc);download(new Blob([out.buffer],{type:'image/vnd.adobe.photoshop'}),(r.title||'소재').trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,100)+'.psd');notify('PSD로 내보냈습니다. 레이어 '+out.layers+'개')}catch(e){notify(e.message||'PSD를 만들지 못했습니다.')}finally{button.disabled=false;button.textContent=label}}
$('#exportImage').onclick=()=>busy('#exportImage',async()=>{let nm=getName(),d=structuredClone(p);if(!meaningful(d))throw Error('새 문구나 에셋을 먼저 입력하세요.');let cn=await render(el('canvas'),d,false),blob;if(d.channel==='GFA'){for(let q of [.93,.87,.80,.72,.62,.48,.36,.24,.14]){blob=await output(cn,'image/jpeg',q);if(blob.size<=800000)break}if(blob.size>800000)throw Error('800KB 이하로 만들 수 없습니다. 이미지 복잡도를 줄여 주세요.')}else blob=await output(cn,'image/png');download(blob,nm+'_시안.'+(d.channel==='GFA'?'jpg':'png'));notify('시안 이미지를 내보냈습니다.')});
$('#exportProject').onclick=()=>busy('#exportProject',async()=>{let nm=getName(),d=structuredClone(p),ref=rBy(d.sourceId);let ex={format:'eol-studio-project',version:1,project:d};if(ref?.id.startsWith('local-'))ex.localSource=ref;download(new Blob([JSON.stringify(ex)],{type:'application/json'}),nm+'.studio.json');notify('편집 파일을 내보냈습니다.')});
function validateImport(payload){if(payload.format!=='eol-studio-project'||payload.version!==1)throw Error('지원하지 않는 편집 파일입니다.');let v=payload.project;if(!v||v.version!==1||!['GFA','CRM'].includes(v.channel)||typeof v.name!=='string'||v.name.length>100||!Number.isInteger(v.w)||!Number.isInteger(v.h)||v.w<100||v.h<100||v.w>3000||v.h>4000||!v.layers||!v.layers.bg||Object.keys(v.layers).length>160)throw Error('편집 문서 형식을 확인하세요.');
 const source=rBy(v.sourceId)||payload.localSource, importedBrand=v.brand??brandOf(source);
 if(!Object.hasOwn(brandMeta,importedBrand)||(source&&brandOf(source)!==importedBrand)||(v.nativeSceneId&&brandOf(rBy(v.nativeSceneId))!==importedBrand))throw Error('원본과 시안의 브랜드가 다릅니다.');
 v.brand=importedBrand;
 for(let [k,l] of Object.entries(v.layers)){if(!/^[a-z][a-z0-9_-]{0,63}$/.test(k)||!l||typeof l!=='object'||!keys.includes(l.base||k)||!['x','y','w','h','size'].every(n=>Number.isFinite(l[n]))||l.w<=0||l.h<=0||l.w>4||l.h>4||Math.abs(l.x)>4||Math.abs(l.y)>4||l.size<=0||l.size>100||typeof l.text!=='string'||l.text.length>600||l.upload&&!safeImage(l.upload)||l.asset&&(!aBy(l.asset)||brandOf(aBy(l.asset))!==v.brand||aBy(l.asset).reusable===false)||!['color','fill'].every(f=>/^#[0-9a-f]{6}$/i.test(l[f]))||l.font!==undefined&&l.font!=='plain'&&!Object.hasOwn(FONTS,l.font)||l.weight!==undefined&&!(Number.isFinite(l.weight)&&l.weight>=100&&l.weight<=950)||l.colors!==undefined&&!(Array.isArray(l.colors)&&l.colors.length===Array.from(l.text).length&&l.colors.every(c=>c===null||/^#[0-9a-f]{6}$/i.test(c))))throw Error('레이어 값 또는 연결 에셋이 유효하지 않습니다.')}
 if(payload.localSource){let s=payload.localSource;if(!s.id?.startsWith('local-')||s.id!==v.sourceId||!safeImage(s.original)||typeof s.title!=='string'||!presets[s.layout]||!states[s.status]||s.channel!==v.channel)throw Error('등록 원본 형식이 올바르지 않습니다.');if(brandOf(s)!==v.brand)throw Error('등록 원본의 브랜드를 확인하세요.');return [v,{id:s.id,brand:v.brand,title:s.title.slice(0,100),channel:s.channel,status:s.status,source:String(s.source||''),sha256:String(s.sha256||''),date:String(s.date||''),evidence:String(s.evidence||''),layout:s.layout,assets:(Array.isArray(s.assets)?s.assets:[]).filter(id=>aBy(id)?.reusable!==false&&aBy(id)&&brandOf(aBy(id))===v.brand),copy:Object.fromEntries(['title','sub','badge','cta'].map(k=>[k,String(s.copy?.[k]||'').slice(0,600)])),original:s.original,width:s.width,height:s.height}]}return [v,null]}
$('#restore').onclick=()=>$('#jsonFile').click();$('#jsonFile').onchange=async e=>{let f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>130*1024*1024)throw Error('편집 파일은 최대 130MB입니다.');let [d,r]=validateImport(JSON.parse(await f.text()));if(r&&!rBy(r.id)){if(db)await dbOp('sources','put',r);records.push(r)}d.id='draft-'+uid();showEditor(stripExtras(d),true);notify('편집 파일을 열었습니다. 별도 시안으로 저장할 수 있습니다.')}catch(x){notify(x.message)}};
async function init(){setBrand(brand,false);
 await new Promise(res=>{const sc=document.createElement('script');sc.src='insights.js?v='+Date.now();sc.onload=sc.onerror=()=>{sc.remove();res()};document.head.append(sc)});
 const linked=new Set(records.flatMap(r=>[r.matchScene,r.relatedScene].filter(Boolean)));for(const sc of LIB.scenes)if(!linked.has(sc.id))sc.status='scene';
 $('#shareStudio').hidden=false;
 $('#shareStudio').onclick=()=>copyPublicLink(null);
 $('#sharedDraftNote').hidden=!LIB.shared;
 const q=new URL(location.href).searchParams,run=q.get('run');if(run&&records.some(r=>brandOf(r)===brand&&r.operationPeriod===run)){filter='GFA';delivery=run+':'+(q.get('scope')==='new'?'new':'all')}else if(q.get('channel')==='GFA')filter='GFA';try{db=await openDb();let [s,d]=await Promise.all([dbOp('sources','getAll'),dbOp('drafts','getAll')]);records.push(...s);drafts=d}catch{notify('브라우저 저장소를 사용할 수 없습니다. 편집 파일로 저장하세요.')}renderGallery();openSharedItem()}
init();
