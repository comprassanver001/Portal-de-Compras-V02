// Portal de Compras V2 · filtro de selección múltiple con casillas y en cascada.
// Uso: MS.mount('id',{t:'Marca',on:()=>pintar()}); MS.cascada(filas,[[id,fn]...],etiquetas,orden); filas.filter(r=>MS.pasa(r,F));
(function(){
  if(window.MS)return;
  const css=`.ms{position:relative;display:inline-block}
.msb{padding:7px 10px;border:1px solid #e3e8f0;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:#5b6b85;cursor:pointer;white-space:nowrap;max-width:250px;overflow:hidden;text-overflow:ellipsis}
.msb b{color:#162033;font-weight:600}
.msb.on{border-color:#2563eb;background:#eef3fe}.msb.on b{color:#1d4ed8;font-weight:800}
.msp{position:absolute;top:calc(100% + 4px);left:0;z-index:90;background:#fff;border:1px solid #c9d4f0;border-radius:9px;box-shadow:0 10px 30px rgba(15,23,42,.18);width:280px;padding:8px;display:none;text-align:left}
.ms.open .msp{display:block}
.msq{width:100%;margin-bottom:6px;box-sizing:border-box;padding:6px 8px;border:1px solid #e3e8f0;border-radius:7px;font-size:12.5px;font-family:inherit}
.msa{display:flex;justify-content:space-between;font-size:11.5px;padding:0 4px 6px;border-bottom:1px solid #eef1f6;margin-bottom:4px}
.msa a{color:#1d4ed8;cursor:pointer;font-weight:600}
.msl{max-height:280px;overflow:auto}
.msl label{display:flex;gap:7px;align-items:center;padding:4px 6px;border-radius:5px;font-size:12.5px;cursor:pointer;color:#162033;font-weight:400}
.msl label:hover{background:#f1f5f9}.msl label.z{color:#a0a9be}
.msl .n{margin-left:auto;color:#5b6b85;font-size:11px}
.msl .vac{padding:6px;color:#94a3b8;font-size:12px}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=n=>Number(n||0).toLocaleString('es-MX');
  const X={};
  const vis=id=>{const m=X[id],q=m.q.trim().toUpperCase();return m.opts.filter(o=>!q||o.t.toUpperCase().includes(q)||o.v.toUpperCase().includes(q));};
  function list(id){const el=document.getElementById(id),m=X[id];el.querySelector('.msq').style.display=m.opts.length>8?'':'none';
    el.querySelector('.msl').innerHTML=vis(id).map(o=>'<label class="'+(o.n?'':'z')+'"><input type="checkbox" value="'+esc(o.v)+'"'+(m.sel.has(o.v)?' checked':'')+'><span>'+esc(o.t)+'</span><span class="n">'+nf(o.n)+'</span></label>').join('')||'<div class="vac">Sin opciones con los filtros actuales</div>';}
  function btn(id){const el=document.getElementById(id),m=X[id],s=[...m.sel],b=el.querySelector('.msb');const lab=v=>m.lbl[v]||v||'(sin dato)';
    b.classList.toggle('on',s.length>0);b.innerHTML=esc(m.t)+': <b>'+(s.length===0?esc(m.todos):s.length===1?esc(lab(s[0])):s.length+' selecc.')+'</b> ▾';b.title=s.length?m.t+': '+s.map(lab).join(', '):'Clic para elegir uno o varios';}
  function mount(id,o){
    const el=document.getElementById(id);if(!el)return;if(X[id]){X[id].on=o.on||X[id].on;return;}
    el.classList.add('ms');X[id]={sel:new Set(),opts:[],lbl:{},t:o.t||el.dataset.t||'',todos:o.todos||'Todos',on:o.on||(()=>{}),q:''};
    el.innerHTML='<button type="button" class="msb"></button><div class="msp"><input type="search" class="msq" placeholder="Buscar…"><div class="msa"><a data-a="all">✓ Marcar visibles</a><a data-a="none">✕ Quitar selección</a></div><div class="msl"></div></div>';
    el.querySelector('.msb').onclick=e=>{e.stopPropagation();const ab=el.classList.contains('open');document.querySelectorAll('.ms.open').forEach(x=>x.classList.remove('open'));
      if(!ab){const pp=el.querySelector('.msp'),rc=el.getBoundingClientRect(),der=rc.left+280>window.innerWidth-8;pp.style.left=der?'auto':'0';pp.style.right=der?'0':'auto';
        el.classList.add('open');const q=el.querySelector('.msq');q.value=X[id].q='';list(id);if(X[id].opts.length>8)q.focus();}};
    el.querySelector('.msp').onclick=e=>e.stopPropagation();
    el.querySelector('.msq').oninput=e=>{X[id].q=e.target.value;list(id);};
    el.querySelector('.msa').onclick=e=>{const a=e.target.dataset.a;if(!a)return;const m=X[id];if(a==='none')m.sel.clear();else vis(id).forEach(o=>m.sel.add(o.v));btn(id);if(el.classList.contains('open'))list(id);m.on();};
    el.querySelector('.msl').onchange=e=>{const cb=e.target,m=X[id];cb.checked?m.sel.add(cb.value):m.sel.delete(cb.value);btn(id);m.on();};
    btn(id);
  }
  document.addEventListener('click',()=>document.querySelectorAll('.ms.open').forEach(x=>x.classList.remove('open')));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.ms.open').forEach(x=>x.classList.remove('open'));});
  // cnt: Map(valor→n). Las seleccionadas que ya no aparecen se conservan con 0 para poder quitarlas
  function opts(id,cnt,lblFn,ordFn){const m=X[id];if(!m)return;const o=[...cnt].map(([v,n])=>({v,n,t:lblFn?lblFn(v):(v||'(sin dato)')}));
    m.sel.forEach(v=>{if(!cnt.has(v))o.push({v,n:0,t:m.lbl[v]||(lblFn?lblFn(v):v)});});
    o.sort(ordFn||((a,b)=>a.t.localeCompare(b.t,'es')));m.opts=o;o.forEach(x=>m.lbl[x.v]=x.t);btn(id);if(document.getElementById(id).classList.contains('open'))list(id);}
  const sel=id=>X[id]?X[id].sel:new Set();
  const pasa=(r,F,excl)=>F.every(([id,fn])=>id===excl||!sel(id).size||sel(id).has(String(fn(r)??'')));
  function cascada(base,F,lbls,ords){F.forEach(([id,fn])=>{const cnt=new Map();base.forEach(r=>{if(pasa(r,F,id)){const v=String(fn(r)??'');cnt.set(v,(cnt.get(v)||0)+1);}});opts(id,cnt,lbls&&lbls[id],ords&&ords[id]);});}
  function set(id,vals){const m=X[id];if(!m)return;m.sel=new Set((vals||[]).map(String));btn(id);}
  window.MS={mount,opts,sel,pasa,cascada,set,clear:id=>set(id,[]),btn,X};
})();
