// Portal de Compras V2 · Mi Resumen con el cálculo del portal (Planeación e indicadores)
// Reemplaza en Mi Resumen las tarjetas de Riesgo, Sobre inventario, Pedidos propuestos y Target
// (que antes salían del Excel) y agrega OTIF de proveedor. Usa P de plan_logica.js.
(function(){
  const d10=v=>v==null||v===''?null:String(v).slice(0,10);
  async function todo(q){let out=[];for(let i=0;i<200;i++){const{data,error}=await q().range(i*1000,i*1000+999);if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)break;}return out;}
  const r1=x=>x==null?'':(Math.round(x*10)/10);
  const CUMPLE=['EN TIEMPO','ANTICIPADA'],NO_CUENTA=['EXCLUIDA','EN REVISION GERENCIA','SIN NECESIDAD'];

  async function cargar(sb){
    const{data:pub,error}=await sb.from('plan_publicacion').select('fecha,ruta').eq('id','estado').maybeSingle();
    if(error||!pub)throw new Error(error?error.message:'sin cálculo publicado');
    const{data:blob,error:e2}=await sb.storage.from('respaldos').download(pub.ruta);if(e2)throw e2;
    const txt=pub.ruta.endsWith('.gz')?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text():await blob.text();
    const est=JSON.parse(txt);const mes=est.fecha.slice(0,7);const ini=mes+'-01';
    // Claves restringidas vigentes (activas, menos de 30 días): no cuentan en la tarjeta de Riesgo
    let restr=new Set();try{const{data}=await sb.from('claves_restringidas').select('clave,comprador,activa,autorizado_en').eq('activa',true);
      (data||[]).forEach(x=>{const b=x.autorizado_en?new Date(String(x.autorizado_en).slice(0,10)+'T12:00:00'):null;if(b&&!isNaN(b)&&Math.floor((Date.now()-b.getTime())/864e5)>=30)return;restr.add(String(x.clave).trim()+'||'+String(x.comprador||'').trim().toUpperCase());});}catch(e){}
    let metaCfg={};try{const{data}=await sb.from('plan_config').select('valor').eq('id','bono_objetivos').maybeSingle();metaCfg=(data&&data.valor)||{};}catch(e){}
    const [al,cer,cmp]=await Promise.all([
      todo(()=>sb.from('plan_alarmas').select('clave,comprador,fecha_alarma,tipo,resultado_target,oc_folio,fecha_oc,dias_dif').gte('fecha_alarma',ini).order('fecha_alarma').order('clave')),
      todo(()=>sb.from('plan_oc_lineas').select('folio,clave,fecha_oc,proveedor,comprador,cantidad_ped,cantidad_pend,fecha_entrega,cancelada,cerrada_en,pend_inicial,entrega_directa').gte('cerrada_en',ini).order('folio').order('clave')),
      todo(()=>sb.from('plan_oc_compromiso').select('folio,fecha').order('folio'))]);
    const folios=[...new Set(cer.map(l=>Number(l.folio)))];const recs=new Map();
    let det=[];for(let i=0;i<folios.length;i+=200){det=det.concat(await todo(()=>sb.from('plan_recepciones').select('folio,clave,fecha,cantidad').in('folio',folios.slice(i,i+200)).order('folio').order('clave').order('fecha')));}
    P.recepMapa(det,P.cargarReales?await P.cargarReales(sb,folios):[]).forEach((v,k)=>recs.set(k,v));
    const comp=new Map(cmp.filter(c=>c.fecha).map(c=>[Number(c.folio),d10(c.fecha)]));
    const lt=new Map((est.claves||[]).map(r=>[Number(r.c),r.lt]));
    const otif=cer.map(l=>P.otifLinea({...l,fecha_oc:d10(l.fecha_oc),fecha_entrega:d10(l.fecha_entrega)},recs.get(Number(l.folio)+'|'+Number(l.clave)),comp,lt.get(Number(l.clave)))).filter(x=>x&&x.mes===mes);
    return{fecha:est.fecha,mes,claves:(est.claves||[]).filter(r=>!r.pr&&!P.esProd(r)),ocs:est.ocs||{},restr,alarmas:al.map(a=>({...a,fecha_alarma:d10(a.fecha_alarma),fecha_oc:d10(a.fecha_oc)})),otif,metaCfg};
  }

  // conBO: true = estatus, nivel, meses y propuestas sumando el BO del CEDI; por default sin BO (solo existencia, como las alarmas)
  function aplicar(alarmas,v,conBO){
    conBO=!!conBO;const claves=P.aplicarBO?P.aplicarBO(v.claves,conBO,v.fecha):v.claves;
    const TIPOS_V2=['RIESGO','SOBREINVENTARIO','PEDIDO_PROPUESTO','TARGET','OTIF'];
    const comps=[...new Set([...alarmas.map(a=>a.comprador),...claves.map(r=>r.comp).filter(Boolean)])];if(!comps.includes('GENERAL'))comps.unshift('GENERAL');
    const out=alarmas.filter(a=>!TIPOS_V2.includes(a.tipo));
    const nota='Cálculo del portal al '+v.fecha.split('-').reverse().join('/')+' (Planeación e indicadores) · <b>'+(conBO?'con BO del CEDI':'sin BO')+'</b>.';
    const notaBO=conBO?' Considera el BO actual del CEDI (lo que viene en camino): las claves que salen de riesgo con el BO dependen de que ese BO llegue a tiempo.'
      :' Riesgo calculado <b>sin BO</b> (solo existencia): dependemos del BO del CEDI para que este riesgo no se haga faltante.';
    const push=(comp,tipo,items,total,descripcion,extra)=>out.push({comprador:comp,dashboard:'planeacion',tipo,mes:v.mes,descripcion,severidad:null,datos:Object.assign({total,items:items.slice(0,300)},extra||{})});
    comps.forEach(comp=>{
      const mine=x=>comp==='GENERAL'||x===comp;
      const cl=claves.filter(r=>mine(r.comp));
      const NV={ALTO:0,MEDIO:1,BAJO:2},CL=x=>{x=String(x||'').toUpperCase();return x.includes('SAGRADO')?0:x.includes('ALTA')?1:x.includes('MEDIA')?2:x.includes('LENTA')?3:x.includes('NUEVO')?4:5;};
      const fm=f=>f?f.split('-').reverse().slice(0,2).join('/'):'';
      const esR=r=>{if(!v.restr||!v.restr.size)return false;const k=String(r.c).trim(),cp=String(r.comp||'').trim().toUpperCase();for(const x of v.restr){const i=x.indexOf('||');if(x.slice(0,i)!==k)continue;const c=x.slice(i+2);if(!c||c===cp||(P.mismoComp&&P.mismoComp(c,cp)))return true;}return false;};
      const nSe=cl.filter(r=>r.est==='RIESGO'&&r.se).length,nRs=cl.filter(r=>r.est==='RIESGO'&&!r.se&&esR(r)).length;
      const rsgR=cl.filter(r=>r.est==='RIESGO'&&!r.se&&!esR(r)).sort((a,b)=>(NV[a.nv]??3)-(NV[b.nv]??3)||CL(a.rot)-CL(b.rot)||(a.dA??9e9)-(b.dA??9e9));
      const rsg=rsgR.map(r=>({Nivel:r.nv?({ALTO:'🔴 ALTO',MEDIO:'🟠 MEDIO',BAJO:'🟡 BAJO'})[r.nv]:'',Clasificación:P.ROT_X[r.rot]||r.rot||'',Clave:r.c,Nombre:r.n,Marca:r.m||'','Se acaba':r.fAg?'~'+fm(r.fAg)+' ('+Math.floor(r.dA)+'d)':'','T.Entrega (d)':Math.round((+r.lt||0)*P.R.MES_DIAS),'Meses Inv':r1(r.mi),'Demanda':r1(r.D),'OCs abiertas':(v.ocs[r.c]||[]).filter(o=>!o[4]).length,'Propuesta':r.sE!=null?r.sE:r.s}));
      const cn=k=>rsgR.filter(r=>r.nv===k).length;
      push(comp,'RIESGO',rsg,rsg.length,nota+' Riesgo: entra con menos de T. entrega × 1.2 meses y sale al pasar T. entrega × 1.4. Nivel por días para agotarse (existencia ÷ venta diaria, con el ritmo real de los últimos días) contra el tiempo de entrega: 🔴 alto = se acaba en 7 días o menos o antes de la mitad del T. entrega · 🟠 medio = antes del T. entrega · 🟡 bajo = aún cubre el T. entrega.'+(nSe?' No incluye '+nSe+' claves que nunca han tenido entrada (sin compras desde 2024 ni OC en camino).':'')+(nRs?' No incluye '+nRs+' claves restringidas.':'')+notaBO,{conBO,alto:cn('ALTO'),medio:cn('MEDIO'),bajo:cn('BAJO'),porClmov:Object.fromEntries([['🔴 Riesgo alto',cn('ALTO')],['🟠 Riesgo medio',cn('MEDIO')],['🟡 Riesgo bajo',cn('BAJO')]].filter(x=>x[1]))});
      const sob=cl.filter(r=>r.est==='SOBRE INVENTARIO').sort((a,b)=>(b.mi??0)-(a.mi??0)).map(r=>({Clave:r.c,Nombre:r.n,Marca:r.m||'','Meses Inv':r1(r.mi),'Obj':r.pm,'Demanda':r1(r.D)}));
      push(comp,'SOBREINVENTARIO',sob,sob.length,nota+' Más meses de inventario'+(conBO?' (existencia + BO del CEDI)':'')+' que el objetivo × 1.4.');
      const ped=cl.filter(r=>(r.est==='RIESGO'||r.est==='FALTANTE')&&(r.s||0)>0).sort((a,b)=>(a.mi??-1)-(b.mi??-1)).map(r=>({Clave:r.c,Descripción:r.n,Estatus:r.boCub?'FALTANTE (cubierto con BO)':r.est,'Propuesta':r.s,'Con empaque':r.sE!=null?r.sE:'','Ant.':r.sA!=null?r.sA:'','Pron.':r.sP!=null?r.sP:'','OCs abiertas':(v.ocs[r.c]||[]).length}));
      push(comp,'PEDIDO_PROPUESTO',ped,ped.length,nota+' Faltante y riesgo con propuesta = demanda × (tiempo de entrega + objetivo) − '+(conBO?'(existencia + BO del CEDI, sin entregas directas)':'existencia (sin restar el BO)')+'.');
      // Target por nivel de riesgo: nivel de la clave el día que se colocó la OC (bajo/anticipada = cumple · medio = con riesgo · alto/faltante/sin OC = no cumple)
      const al=v.alarmas.filter(a=>mine(a.comprador));
      const TR=P.targetResumen(al,c=>P.metaTarget(v.metaCfg,c)).gen;const meta=P.metaTarget(v.metaCfg,comp==='GENERAL'?'GENERAL':comp);
      const ordT={'SIN OC':0,FALTANTE:1,ALTO:2,MEDIO:3};
      const itT=al.slice().sort((a,b)=>(ordT[a.resultado_target]??5)-(ordT[b.resultado_target]??5)).map(a=>({Clave:a.clave,'Fecha alarma':a.fecha_alarma.split('-').reverse().join('/'),'Nivel al colocar la OC':P.T_LBL[a.resultado_target]||a.resultado_target||'⏳ En plazo',OC:a.oc_folio||'','Fecha OC':a.fecha_oc?a.fecha_oc.split('-').reverse().join('/'):'',...(comp==='GENERAL'?{Comprador:a.comprador}:{})}));
      const pcT=x=>x==null?'—':Math.round(x*1000)/10+'%';
      push(comp,'TARGET',itT,TR.n,nota+' Target por nivel de riesgo: cada alarma se califica con el nivel que tenía la clave el día que se colocó la OC. ✅ cumple: OC en riesgo bajo o antes de entrar a riesgo · ⚠️ cumple con riesgo: en medio · ❌ no cumple: en alto, en faltante, o sin OC cuando ya está en alto. Meta: '+meta+'% (Admin → Objetivos del bono).',
        {ocsOk:TR.OK,pct:TR.target!=null?Math.round(TR.target*1000)/10:null,meta,
         porClmov:Object.fromEntries([['✅ Cumple',TR.OK],['⚠️ Con riesgo (medio)',TR.RIESGO],['❌ No cumple',TR.NO],['⏳ En plazo',TR.PEND]].filter(x=>x[1])),
         texto:'Target <b style="color:'+(TR.target==null?'inherit':TR.target*100>=meta?'#1f6f3a':'#b42318')+'">'+pcT(TR.target)+'</b> de OCs colocadas en riesgo bajo · meta '+meta+'% · '+TR.OK+' de '+TR.n+' evaluadas'+(TR.RIESGO?' · '+TR.RIESGO+' en medio (cumplen con riesgo: '+pcT(TR.cumpleTot)+' en total)':'')+(TR.PEND?' · '+TR.PEND+' aún en plazo':'')+'.'});
      const ol=v.otif.filter(l=>mine(l.comprador));
      const g=ol.length?P.otifResumen(ol.map(x=>({...x,g:'G'})),'g')[0]:null;
      const pc=x=>x==null?'—':(Math.round(x*1000)/10)+'%';
      const itO=P.otifResumen(ol,'proveedor').sort((a,b)=>(a.otif??2)-(b.otif??2)).map(o=>({Proveedor:o.nombre,'Líneas':o.lineas,'On Time':pc(o.on_time),'In Full':pc(o.in_full),OTIF:pc(o.otif)}));
      push(comp,'OTIF',itO,ol.length,nota+' Líneas de OC cerradas en el mes; On Time contra la fecha compromiso (capturada o fecha OC + tiempo de entrega).',{pct:g&&g.otif!=null?Math.round(g.otif*1000)/10:null,texto:ol.length?'OTIF <b>'+pc(g.otif)+'</b> · On Time '+pc(g.on_time)+' · In Full '+pc(g.in_full)+' · '+ol.length+' líneas cerradas.':'Aún no hay líneas de OC cerradas este mes.'});
    });
    return out;
  }
  window.RESUMEN_V2={cargar,aplicar};
})();
