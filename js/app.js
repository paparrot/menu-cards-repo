const KEY='menu-cards-known-v1';
let known=new Set();
try{known=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify([...known]))}catch(e){}mirror()}
const IKEY='menu-cards-ing-v1';
let ings=new Set();
try{ings=new Set(JSON.parse(localStorage.getItem(IKEY)||'[]'))}catch(e){}
function saveIng(){try{localStorage.setItem(IKEY,JSON.stringify([...ings]))}catch(e){}mirror()}
const idb=()=>new Promise((res,rej)=>{try{const r=indexedDB.open('menu-cards',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}});
function tick(t){try{window.onTick&&window.onTick(t)}catch(e){}}
const ask=m=>window.askConfirm?window.askConfirm(m):Promise.resolve(confirm(m));
function mirror(){try{document.dispatchEvent(new CustomEvent('progress:save'))}catch(e){}const v=JSON.stringify({known:[...known],ings:[...ings]});idb().then(d=>{d.transaction('kv','readwrite').objectStore('kv').put(v,'state')}).catch(()=>{})}
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
idb().then(d=>new Promise((res,rej)=>{const q=d.transaction('kv').objectStore('kv').get('state');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})).then(v=>{
  if(!v||known.size||ings.size)return;
  const o=JSON.parse(v);
  if(!((o.known&&o.known.length)||(o.ings&&o.ings.length)))return;
  (o.known||[]).forEach(x=>known.add(x));(o.ings||[]).forEach(x=>ings.add(x));
  save();saveIng();render();
}).catch(()=>{});
const $=id=>document.getElementById(id);
let mode='fwd',sels=new Set(),batch=0,onlyNew=false,deck=[],pos=0,flipped=false;
const inSel=c=>!sels.size||sels.has(c.s);
const CAN='speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
let rate=1;
const norm=t=>t.replace(/\//g,', ').replace(/\+/g,', ').replace(/\s+/g,' ');
function speak(t){
  if(!CAN)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(norm(t));
  u.lang='ru-RU';u.rate=rate;
  const v=speechSynthesis.getVoices().find(v=>v.lang&&v.lang.toLowerCase().startsWith('ru'));
  if(v)u.voice=v;
  speechSynthesis.speak(u);
}
const ingTxt=c=>c.i.map(it=>it.n+(it.p.length?': '+it.p.join(', '):'')).join('. ');
const textFor=(c,side)=>side==='f'?(mode==='fwd'?c.d:ingTxt(c)):(mode==='fwd'?c.d+'. Состав. '+ingTxt(c):c.d);
if(!CAN){$('auto').parentElement.style.display='none';$('rate').style.display='none'}
$('rate').onclick=()=>{rate=rate===1?0.75:1;$('rate').textContent='Скорость: '+(rate===1?'обычная':'медленная')};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const secs=[...new Set(DATA.map(c=>c.s))];
function renderCats(){
  const stat=s=>{const l=DATA.filter(c=>!s||c.s===s);return[l.filter(c=>known.has(c.d)).length,l.length]};
  const btn=(s,label)=>{const[k,n]=stat(s);const on=s?sels.has(s):!sels.size;
    return '<button class="cat'+(k===n?' done':'')+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"><b>'+esc(label)+'</b><small>'+(k===n?'выучено ':'')+k+' из '+n+'</small><i><s style="width:'+(n?k/n*100:0)+'%"></s></i></button>'};
  $('cats').innerHTML=btn('','Всё меню')+secs.map(s=>btn(s,s)).join('');
  $('cats').querySelectorAll('.cat').forEach(b=>b.onclick=()=>{const s=b.dataset.s;if(!s)sels.clear();else{sels.has(s)?sels.delete(s):sels.add(s)}build(true)});
}
$('batch').onchange=e=>{batch=+e.target.value;build(true)};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}
function build(rand){
  let ids=DATA.map((c,i)=>i).filter(i=>inSel(DATA[i])&&((!onlyNew&&!batch)||!known.has(DATA[i].d)));
  if(batch)ids=ids.slice(0,batch);
  deck=rand?shuffle(ids):ids;pos=0;flipped=false;render();
}
function ingHtml(c){return '<ul class="ing">'+c.i.map(it=>{const k=c.d+'||'+it.n,on=ings.has(k);return '<li class="'+(on?'got':'')+'"><label class="ck"><input type="checkbox" data-k="'+esc(k)+'"'+(on?' checked':'')+'><span>'+esc(it.n)+'</span></label>'+(it.p.length?'<div class="parts">'+it.p.map(p=>'<span>'+esc(p)+'</span>').join('')+'</div>':'')+'</li>'}).join('')+'</ul>'}
const STOP=new Set(['и','с','из','на','в','для','по']);
const toks=s=>s.toLowerCase().replace(/ё/g,'е').replace(/\d+|[^а-яa-z\s]/g,' ').split(/\s+/).filter(w=>w.length>1&&!STOP.has(w));
const teq=(a,b)=>{const n=Math.min(a.length,b.length);if(n<3)return a===b;let i=0;while(i<n&&a[i]===b[i])i++;return i>=Math.max(3,n-1)};
const sub=(A,B)=>A.length>0&&A.every(x=>B.some(y=>teq(x,y)));
const same=(T,I)=>sub(T,I)||sub(I,T);
let quizOpen=false;
function targets(c){return c.i.map(it=>({alts:it.n.split(/[\/+]/).map(p=>({n:p.trim(),tk:toks(p)})).filter(a=>a.tk.length),p:it.p,name:it.n}))}
function mkQuiz(c){
  const T=targets(c),credit=new Set(),usedAlt=new Set(),bonus=new Set(),chips=[];
  return{total:c.i.length,chips,count:()=>credit.size,
    test(w){
      const tk=toks(w);
      if(!tk.length)return{s:'bad',m:'Впишите название ингредиента.'};
      let best=null,bd=99,seen=false;
      T.forEach((t,i)=>t.alts.forEach((a,j)=>{
        if(!same(tk,a.tk))return;
        if(usedAlt.has(i+'.'+j)){seen=true;return}
        const d=Math.abs(tk.length-a.tk.length)+(credit.has(i)?5:0);
        if(d<bd){bd=d;best=[i,j,a]}}));
      if(best){const[i,j,a]=best,first=!credit.has(i);
        usedAlt.add(i+'.'+j);credit.add(i);chips.push({n:a.n,bonus:!first});
        return{s:'ok',i,first,m:first?'Верно: '+a.n:'Верно: '+a.n+' (часть «'+T[i].name+'», в счёт не идёт)'}}
      if(seen)return{s:'bad',m:'Этот ингредиент уже назван.'};
      for(const t of T)for(const p of t.p)if(same(tk,toks(p))){
        const k=tk.join(' ');
        if(bonus.has(k))return{s:'bad',m:'Этот ингредиент уже назван.'};
        bonus.add(k);chips.push({n:w.trim(),bonus:true});
        return{s:'ok',m:'Верно: входит в состав «'+t.name+'» (в счёт не идёт)'}}
      return{s:'bad',m:'«'+w.trim()+'» — нет в составе этого блюда.'}
    }};
}
function render(){
  if(CAN)speechSynthesis.cancel();
  const st=$('stage');
  renderCats();
  const total=DATA.filter(inSel);
  const k=total.filter(c=>known.has(c.d)).length;
  $('pb').style.width=(total.length?k/total.length*100:0)+'%';
  $('known').textContent='Выучено: '+k+' из '+total.length;
  if(!deck.length){
    $('pos').textContent='';
    const left=total.length-k;
    if(left&&batch){st.innerHTML='<div class="empty"><h2>Порция выучена</h2><p>Осталось новых блюд: '+left+'.</p><button class="big" id="again">Следующая порция</button></div>';$('again').onclick=()=>build(true);return}
    st.innerHTML='<div class="empty"><h2>Всё выучено</h2><p>В выбранных категориях не осталось невыученных блюд.</p><button class="big" id="again">Повторить все карточки</button></div>';
    $('again').onclick=()=>{onlyNew=false;batch=0;$('onlyNew').checked=false;$('batch').value='0';build(true)};return;
  }
  const c=DATA[deck[pos]];
  $('pos').textContent='Карточка '+(pos+1)+' из '+deck.length;
  const q=mode==='fwd'
    ?'<div class="dish">'+esc(c.d)+'</div><div class="cnt" id="fcnt">Ингредиентов: '+c.i.length+'</div><div class="qz"><div class="qrow"><input id="qin" type="text" placeholder="Впишите ингредиент" autocomplete="off" autocapitalize="off" enterkeyhint="done" aria-label="Ингредиент"><button class="qgo" id="qgo">Проверить</button></div><div class="qmsg" id="qmsg" role="status" aria-live="polite"></div><div class="qchips" id="qchips"></div><button class="link" id="qclr" style="align-self:flex-start">Начать заново</button></div>'
    :'<ul class="ing front-list">'+c.i.map(it=>'<li>'+esc(it.n)+'</li>').join('')+'</ul>';
  const extra='<div class="extra">'
    +(c.im!=null?'<img class="photo" alt="'+esc(c.d)+'" src="'+IMGS[c.im]+'">':'')
    +(c.y?'<div class="yield">Выход: '+esc(c.y)+'</div>':'')
    +(c.r?'<details class="rec"><summary>Рецепт</summary><p>'+esc(c.r)+'</p></details>':'')
    +((!c.r||!c.y)?'<div class="miss">'+[!c.r?'Рецепта':'',!c.y?'выхода':''].filter(Boolean).join(' и ')+' в таблице нет</div>':'')
    +'</div>';
  const a=mode==='fwd'
    ?'<p class="title-s">'+esc(c.d)+'</p>'+(c.im!=null?'<img class="photo" alt="'+esc(c.d)+'" src="'+IMGS[c.im]+'">':'')+'<div class="ingbar"><span id="ingcnt"></span><button class="link" id="ingreset">Снять отметки</button></div>'+ingHtml(c)+extra.replace(/<img[^>]*>/,'')
    :'<div class="dish">'+esc(c.d)+'</div>'+extra;
  const spk=s=>CAN?'<button class="spk" data-side="'+s+'" aria-label="Озвучить">🔊 Озвучить</button>':'';
  st.innerHTML='<div class="scene"><div class="card'+(flipped?' flip':'')+(mode==='fwd'?' qzc':'')+'" id="card">'
   +'<div class="face"><div class="sec"><span>'+esc(c.s)+'</span>'+spk('f')+'</div>'+q+(mode==='fwd'?'':'<div class="hint">Двойное нажатие или кнопка «Показать ответ»</div>')+'</div>'
   +'<div class="face back"><div class="sec"><span>'+esc(c.s)+'</span>'+spk('b')+'</div>'+a+'</div></div><div class="swl swl-no">Повторить</div><div class="swl swl-yes">Знаю</div></div>'
   +'<button class="flipbtn" id="flipbtn">Показать ответ</button>'
   +'<div class="btns"><button class="b-no" id="no">← Повторить</button><button class="b-yes" id="yes">Знаю →</button></div><div class="swh">Свайп вправо — знаю, влево — повторить · двойное нажатие по карточке — перевернуть</div>';
  const card=$('card');
  const faces=card.querySelectorAll('.face');
  const setFlip=()=>{card.classList.toggle('flip',flipped);faces[0].inert=flipped;faces[1].inert=!flipped;$('flipbtn').textContent=flipped?'Вернуться к вопросу':'Показать ответ'};
  const flip=()=>{flipped=!flipped;setFlip();if(CAN&&$('auto').checked)speak(textFor(c,flipped?'b':'f'))};
  setFlip();
  st.querySelectorAll('.spk').forEach(b=>{b.onclick=e=>{e.stopPropagation();speak(textFor(c,b.dataset.side))};b.onkeydown=e=>e.stopPropagation()});
  st.querySelectorAll('.extra').forEach(e=>{e.onclick=ev=>ev.stopPropagation();e.onkeydown=ev=>ev.stopPropagation()});
  let refreshIng=()=>{};
  if(mode==='fwd'){
    const bk=st.querySelector('.back');
    const upd=()=>{$('ingcnt').textContent='Выучено ингредиентов: '+c.i.filter(it=>ings.has(c.d+'||'+it.n)).length+' из '+c.i.length};
    upd();
    refreshIng=()=>{bk.querySelectorAll('ul.ing input').forEach(i=>{const on=ings.has(i.dataset.k);i.checked=on;i.closest('li').classList.toggle('got',on)});upd()};
    bk.querySelectorAll('.ingbar,ul.ing').forEach(e=>{e.onclick=ev=>ev.stopPropagation();e.onkeydown=ev=>ev.stopPropagation()});
    bk.querySelectorAll('ul.ing input').forEach(i=>i.onchange=()=>{const k=i.dataset.k;i.checked?ings.add(k):ings.delete(k);i.closest('li').classList.toggle('got',i.checked);saveIng();upd()});
    $('ingreset').onclick=()=>{c.i.forEach(it=>ings.delete(c.d+'||'+it.n));bk.querySelectorAll('ul.ing input').forEach(i=>{i.checked=false;i.closest('li').classList.remove('got')});saveIng();upd()};
  }
  if(mode==='fwd'){
    let Q=mkQuiz(c);
    const inp=$('qin');
    const say=(s,m)=>{const el=$('qmsg');el.className='qmsg '+s;el.textContent=m};
    const draw=()=>{
      $('qchips').innerHTML=Q.chips.map(x=>'<span class="rc '+(x.bonus?'r-part':'r-ok')+'">'+esc(x.n)+'</span>').join('');
      $('fcnt').textContent='Ингредиентов: '+Q.total+(Q.count()?' · угадано '+Q.count():'');
    };
    const go=()=>{
      const v=inp.value.trim();if(!v)return;
      const r=Q.test(v);
      inp.classList.toggle('bad',r.s==='bad');
      if(r.s==='bad'){tick('bad');say('bad','✗ '+r.m);inp.classList.remove('shake');void inp.offsetWidth;inp.classList.add('shake');inp.select();return}
      inp.value='';tick('ok');if(r.first){ings.add(c.d+'||'+c.i[r.i].n);saveIng();refreshIng()}draw();
      say('ok',Q.count()===Q.total?'✓ Все ингредиенты названы!':'✓ '+r.m);
      inp.focus();
    };
    $('qgo').onclick=go;
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}};
    inp.oninput=()=>inp.classList.remove('bad','shake');
    $('qclr').onclick=()=>{Q=mkQuiz(c);inp.value='';inp.classList.remove('bad');say('','');c.i.forEach(it=>ings.delete(c.d+'||'+it.n));saveIng();refreshIng();draw()};
    draw();
  }
  $('flipbtn').onclick=flip;
  const mark=ok=>{tick(ok?'yes':'no');ok?known.add(c.d):known.delete(c.d);save();advance()};
  $('yes').onclick=()=>mark(true);$('no').onclick=()=>mark(false);
  // swipe: right = know, left = repeat
  const sc=st.querySelector('.scene'),lyes=sc.querySelector('.swl-yes'),lno=sc.querySelector('.swl-no');
  let sx=0,sy=0,dx=0,drag=false,tracking=false,pid=null,lastTap=0,lx=0,ly=0;
  const TH=Math.max(60,Math.min(110,sc.offsetWidth*0.28));
  const paint=()=>{
    sc.style.transform='translateX('+dx+'px) rotate('+dx/25+'deg)';
    const r=Math.min(Math.abs(dx)/TH,1);
    lyes.style.opacity=dx>0?r:0;lno.style.opacity=dx<0?r:0;
    sc.classList.toggle('sw-yes',dx>0&&r>=1);sc.classList.toggle('sw-no',dx<0&&r>=1);
    try{getSelection().removeAllRanges()}catch(x){}
  };
  const onDown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(e.target.closest('input,button,textarea,select,summary,label,a'))return;
    tracking=true;drag=false;sx=e.clientX;sy=e.clientY;dx=0;pid=e.pointerId;
  };
  const onMove=e=>{
    if(!tracking||e.pointerId!==pid)return;
    const mx=e.clientX-sx,my=e.clientY-sy;
    if(!drag){
      if(Math.abs(mx)>12&&Math.abs(mx)>Math.abs(my)*1.3){drag=true;sc.classList.add('dragging');try{sc.setPointerCapture(pid)}catch(x){}}
      else if(Math.abs(my)>12){tracking=false;return}
    }
    if(drag){dx=mx;paint()}
  };
  const end=e=>{
    if(!tracking||e.pointerId!==pid)return;
    tracking=false;
    if(!drag){
      if(e.type==='pointerup'){
        const now=Date.now();
        if(now-lastTap<320&&Math.abs(e.clientX-lx)<30&&Math.abs(e.clientY-ly)<30){lastTap=0;try{getSelection().removeAllRanges()}catch(x){}flip()}
        else{lastTap=now;lx=e.clientX;ly=e.clientY}
      }
      return;
    }
    drag=false;sc.classList.remove('dragging');
    if(Math.abs(dx)>=TH&&e.type!=='pointercancel'){
      const ok=dx>0;
      sc.style.transition='transform .2s,opacity .2s';
      sc.style.transform='translateX('+(ok?1:-1)*(sc.offsetWidth+80)+'px) rotate('+(ok?12:-12)+'deg)';
      sc.style.opacity='0';
      setTimeout(()=>mark(ok),200);
    }else{
      sc.style.transition='transform .2s';dx=0;paint();setTimeout(()=>{sc.style.transition=''},220);
    }
  };
  [['pointerdown',onDown],['pointermove',onMove],['pointerup',end],['pointercancel',end]].forEach(([t,f])=>sc.addEventListener(t,f));
}
function advance(){
  flipped=false;
  if(onlyNew||batch){const c=DATA[deck[pos]];if(known.has(c.d)){deck.splice(pos,1);if(pos>=deck.length)pos=0;render();return}}
  pos=(pos+1)%deck.length;render();
}
$('m-fwd').onclick=()=>setMode('fwd');$('m-rev').onclick=()=>setMode('rev');
function setMode(m){mode=m;$('m-fwd').setAttribute('aria-pressed',m==='fwd');$('m-rev').setAttribute('aria-pressed',m==='rev');flipped=false;render()}
$('onlyNew').onchange=e=>{onlyNew=e.target.checked;build(false)};
$('shuf').onclick=()=>build(true);
$('reset').onclick=async()=>{if(await ask('Сбросить все отметки: «Знаю» у блюд и выученные ингредиенты?')){known.clear();save();ings.clear();saveIng();build(false)}};
(function(){
  const dr=$('drawer'),mq=window.matchMedia?matchMedia('(max-width:767px)'):{matches:false};
  const open=()=>document.body.classList.contains('menu-open');
  const sync=()=>{dr.inert=mq.matches&&!open()};
  const set=on=>{
    document.body.classList.toggle('menu-open',on);
    $('menuToggle').setAttribute('aria-expanded',String(on));
    sync();
    if(on)$('menuClose').focus();else if(mq.matches)$('menuToggle').focus();
  };
  $('menuToggle').onclick=()=>set(true);
  $('menuClose').onclick=()=>set(false);
  $('scrim').onclick=()=>set(false);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open())set(false)});
  const onMq=()=>{document.body.classList.remove('menu-open');$('menuToggle').setAttribute('aria-expanded','false');sync()};
  if(mq.addEventListener)mq.addEventListener('change',onMq);
  sync();
})();
(function(){
  const t=$('bkt'),say=x=>{$('bkmsg').textContent=x};
  const exp=()=>JSON.stringify({v:1,app:'menu-cards',exported:new Date().toISOString(),known:[...known],ings:[...ings]},null,1);
  // export to a file (needs the "downloads" capability; hidden when unavailable)
  let DL=null;
  $('bkexp').hidden=true;
  if(window.claude&&claude.use){
    try{claude.use('downloads').then(x=>{DL=x;$('bkexp').hidden=!x;if(!x)say('Экспорт в файл здесь недоступен: используйте копирование текстом.')}).catch(()=>{})}catch(e){}
  }else{
    // обычный браузер (вне Claude): скачивание через ссылку
    DL={save:async({filename,data})=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
      a.download=filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }};
    $('bkexp').hidden=false;
  }
  $('bkexp').onclick=async()=>{
    if(!DL)return;
    try{
      await DL.save({filename:'menu-progress-'+new Date().toISOString().slice(0,10)+'.json',data:exp()});
      say('Файл с прогрессом сохранён.');
    }catch(e){
      say(e&&e.code==='declined'?'Сохранение отменено.':'Не удалось сохранить файл. Скопируйте прогресс текстом.');
      if(!(e&&e.code==='declined'))$('bktxt').open=true;
    }
  };
  // import (from a file or from pasted text)
  const names=new Set(DATA.map(c=>c.d));
  async function applyImport(text){
    let o;try{o=JSON.parse(text)}catch(e){say('Не удалось прочитать данные: это не файл прогресса.');return}
    if(!o||!Array.isArray(o.known)||!Array.isArray(o.ings)){say('Это не файл прогресса.');return}
    const k=o.known.filter(x=>typeof x==='string'&&names.has(x));
    const g=o.ings.filter(x=>typeof x==='string'&&names.has(x.split('||')[0]));
    const skipped=(o.known.length-k.length)+(o.ings.length-g.length);
    const replace=$('bkmode').value==='replace';
    if(replace&&!(await ask('Заменить текущий прогресс данными из файла?')))return;
    if(replace){known=new Set(k);ings=new Set(g)}else{k.forEach(x=>known.add(x));g.forEach(x=>ings.add(x))}
    save();saveIng();build(false);
    say('Импортировано: блюд — '+k.length+', отмеченных ингредиентов — '+g.length+(skipped?'. Пропущено неизвестных записей: '+skipped:'')+'.');
  }
  $('bkimp').onclick=()=>$('bkfile').click();
  $('bkfile').onchange=e=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    if(f.size>2e6){say('Файл слишком большой для файла прогресса.');e.target.value='';return}
    const r=new FileReader();
    r.onload=()=>applyImport(String(r.result));
    r.onerror=()=>say('Не удалось прочитать файл.');
    r.readAsText(f);
    e.target.value='';
  };
  // text fallback
  $('bktxt').ontoggle=()=>{if($('bktxt').open)t.value=exp()};
  $('bkcopy').onclick=()=>{
    t.value=exp();t.select();
    let ok=false;try{ok=document.execCommand('copy')}catch(e){}
    const done=()=>say('Скопировано.'),fail=()=>say(ok?'Скопировано.':'Не удалось скопировать автоматически: выделите текст и скопируйте вручную.');
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(done,fail);else fail();
  };
  $('bkload').onclick=()=>applyImport(t.value);
})();
document.addEventListener('keydown',e=>{
  if(e.target.closest&&e.target.closest('input,textarea,select'))return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const b=e.key==='ArrowRight'?$('yes'):e.key==='ArrowLeft'?$('no'):null;
  if(b)b.click();
});
build(true);
