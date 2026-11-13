// Fotos diarias del cálculo del portal (Storage respaldos/plan/dias/AAAA-MM-DD.json.gz).
// Cada foto trae por clave: existencia, BO, parámetros del día y el estatus y meses de inventario del PORTAL
// (antecedente mA, pronóstico mP, portal mi). Índice en plan_publicacion id='dias' → resumen.fechas{f:{v,n,F,R,O,S}}.
// Se guardan en IndexedDB por fecha+versión para no descargarlas otra vez.
(function(){
  const F={};
  const DB='plan_fotos',ST='dias';
  let dbp=null;
  const abrir=()=>dbp||(dbp=new Promise(res=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(ST);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}catch(e){res(null);}}));
  const idbGet=async k=>{const db=await abrir();if(!db)return null;return new Promise(res=>{try{const q=db.transaction(ST).objectStore(ST).get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null);}catch(e){res(null);}});};
  const idbPut=async(k,v)=>{const db=await abrir();if(!db)return;try{db.transaction(ST,'readwrite').objectStore(ST).put(v,k);}catch(e){}};
  let IDX=null,IDXt=0;
  // Índice de días con foto: {fechas:{f:{v,n,F,R,O,S}}}
  F.indice=async(sb,forzar)=>{
    if(!forzar&&IDX&&Date.now()-IDXt<60000)return IDX;
    const{data,error}=await sb.from('plan_publicacion').select('resumen').eq('id','dias').maybeSingle();
    if(error)throw new Error(error.message);
    IDX=(data&&data.resumen&&data.resumen.fechas)||{};IDXt=Date.now();return IDX;
  };
  F.fechas=async sb=>Object.keys(await F.indice(sb)).sort();
  const MEM=new Map();
  // Foto de un día → arreglo de claves (null si no hay foto de ese día)
  F.dia=async(sb,f)=>{
    const ix=await F.indice(sb);const it=ix[f];if(!it)return null;
    const k=f+'|'+it.v;
    if(MEM.has(k))return MEM.get(k);
    let cl=await idbGet(k);
    if(!cl){
      const{data:blob,error}=await sb.storage.from('respaldos').download('plan/dias/'+f+'.json.gz');
      if(error)throw new Error('foto '+f+': '+error.message);
      const txt=await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      cl=JSON.parse(txt).claves||[];idbPut(k,cl);
    }
    MEM.set(k,cl);return cl;
  };
  // Varias fechas en paralelo (de 6 en 6) → Map(f → claves)
  F.dias=async(sb,fechas,prog)=>{
    const out=new Map();let i=0,hechas=0;
    const w=async()=>{while(i<fechas.length){const f=fechas[i++];const c=await F.dia(sb,f);if(c)out.set(f,c);hechas++;if(prog)prog(hechas,fechas.length);}};
    await Promise.all(Array.from({length:Math.min(6,fechas.length)},w));
    return out;
  };
  // Historial de una clave en las fechas dadas → [{f, ...fila}]
  F.clave=async(sb,clave,fechas)=>{
    const m=await F.dias(sb,fechas||await F.fechas(sb));const k=Number(clave);
    return [...m.keys()].sort().map(f=>{const r=m.get(f).find(x=>Number(x.c)===k);return r?{f,...r}:null;}).filter(Boolean);
  };
  window.FOTOS=F;
})();
