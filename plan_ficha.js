// Portal de Compras V2 · Ficha de una clave (la comparten Histórico Faltantes y Planeación e indicadores)
// Muestra: días en faltante/riesgo (detalle diario), ventas mes a mes con antecedente y pronóstico,
// el cálculo de la propuesta, OCs abiertas y alarmas. Requiere P (plan_logica.js).
(function(){
  const MES=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const n=(v,d=0)=>v==null||v===''||isNaN(v)?'—':Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
  const fM=m=>m?MES[+m.slice(5,7)]+' '+m.slice(2,4):'—';
  const fF=f=>f?String(f).slice(8,10)+'/'+String(f).slice(5,7)+'/'+String(f).slice(2,4):'—';
  const d10=v=>v==null||v===''?null:String(v).slice(0,10);
  const COL={'FALTANTE':'#e11d48','RIESGO':'#d97706','OPTIMO':'#059669','SOBRE INVENTARIO':'#2563eb','NUEVA':'#0891b2','SIN MOVIMIENTO':'#a16207','SIN COMPRA':'#94a3b8'};
  const cache=new Map();

  async function cargar(sb,c,conHist){
    const k=c+'|'+(conHist?1:0);if(cache.has(k))return cache.get(k);
    const q=[sb.from('plan_ventas').select('empresa,meses').eq('clave',c),
      sb.from('plan_agotados_mes').select('empresa,mes,dias_agotado').eq('clave',c),
      sb.from('plan_compras_ed').select('mes,cantidad').eq('clave',c),
      sb.from('plan_alarmas').select('fecha_alarma,fecha_fin,tipo,resultado_target,oc_folio,dias_dif').eq('clave',c).order('fecha_alarma',{ascending:false})];
    // Historial día por día con el cálculo del portal (fotos diarias; últimos 30 días calculados)
    if(conHist)q.push(window.FOTOS?FOTOS.fechas(sb).then(fs=>FOTOS.clave(sb,c,fs.slice(-30))).then(h=>({data:h})).catch(e=>({error:e})):Promise.resolve({data:[]}));
    const r=await Promise.all(q);
    const o={ventas:{},agot:{SANVER:{},MF:{}},ed:{},alarmas:[],hist:[]};
    if(!r[0].error)(r[0].data||[]).forEach(x=>o.ventas[x.empresa]=x.meses||{});
    if(!r[1].error)(r[1].data||[]).forEach(x=>{(o.agot[x.empresa]||(o.agot[x.empresa]={}))[String(x.mes).slice(0,7)]=Number(x.dias_agotado);});
    if(!r[2].error)(r[2].data||[]).forEach(x=>o.ed[String(x.mes).slice(0,7)]=Number(x.cantidad));
    if(!r[3].error)o.alarmas=r[3].data||[];
    if(conHist&&r[4]&&!r[4].error)o.hist=(r[4].data||[]).map(h=>({fecha:h.f,estatus:String(h.est||'').toUpperCase(),existencias:h.ex,back_order:h.boT!=null?h.boT:h.bo,meses_inv:h.mi,mA:h.mA,mP:h.mP,eA:h.eA,eP:h.eP}));
    await P.edExtraClave(sb,c,o);await P.ventasConProduccion(sb,c,o);await P.ventasConSust(sb,c,o);
    cache.set(k,o);return o;
  }

  function grafica(arr,agot,parte,pprod){
    if(!arr.length)return '<div style="padding:16px;color:#64748b">Sin ventas cargadas.</div>';
    const W=820,H=200,pl=40,pb=40,pt=14;const mx=Math.max(1,...arr.map(x=>Math.max(x.venta||0,x.limpia||0)));const bw=(W-pl-6)/arr.length;
    let s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-height:220px"><defs><pattern id="pfz" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"/><rect width="2.4" height="5" fill="#fda4af"/></pattern><pattern id="pfact" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#ccfbf1"/><rect width="3" height="6" fill="#14b8a6"/></pattern></defs>';
    for(let k=0;k<=2;k++){const yy=pt+(H-pt-pb)*(1-k/2);s+='<line x1="'+pl+'" x2="'+W+'" y1="'+yy+'" y2="'+yy+'" stroke="#eef1f6"/><text x="'+(pl-5)+'" y="'+(yy+4)+'" font-size="10" text-anchor="end" fill="#94a3b8">'+n(mx*k/2)+'</text>';}
    arr.forEach((x,i)=>{
      const v=x.limpia!=null?x.limpia:(x.venta||0);const bh=(H-pt-pb)*Math.max(0,v)/mx;const x0=pl+i*bw+2,y0=H-pb-bh;
      const fill=x.actual?'url(#pfact)':x.excluido?'url(#pfz)':x.usa.includes('ANT')?'#3b82f6':x.usa.includes('PRON')?'#8b5cf6':'#cbd5e1';
      const ag=(agot||{})[x.m];
      const tit=fM(x.m)+': venta '+n(x.venta)+(x.ed?' · ED restada → '+n(x.limpia):'')+(x.excluido?' · NO SE USA: '+x.excluido:'')+(x.atipico==='temporada'?' · pico de temporada (se repite el año anterior o el siguiente, o dura varios meses): se usa completo':'')+(x.atipico==='topado'?' · atípico topado a 3× mediana':'')+(ag?' · '+ag+' días agotado':'')+(x.usa.length?' · usado en '+x.usa.map(u=>u==='ANT'?'antecedente':'pronóstico').join(' y '):'');
      s+='<rect x="'+x0+'" y="'+(bh?y0:H-pb-1)+'" width="'+(bw-4)+'" height="'+Math.max(bh,1)+'" rx="2" fill="'+fill+'" stroke="'+(x.actual?'#0f766e':x.excluido?'#fb7185':'none')+'"'+(x.actual?' stroke-dasharray="3 2"':'')+'><title>'+esc(x.actual?fM(x.m)+' (MES ACTUAL, venta parcial): '+n(x.venta)+' · solo seguimiento, no cuenta para el cálculo':tit)+'</title></rect>';
      if(x.actual)s+='<text x="'+(x0+(bw-4)/2)+'" y="'+(y0-3)+'" font-size="9" font-weight="700" text-anchor="middle" fill="#0f766e">actual</text>';
      const pp=pprod&&pprod[x.m];if(pp&&bh>0){const q=pp.reduce((a,y)=>a+y[1],0),hh=bh*Math.min(1,q/Math.max(x.venta||0,q));
        s+='<rect x="'+x0+'" y="'+(H-pb-hh)+'" width="'+(bw-4)+'" height="'+Math.max(hh,1)+'" rx="2" fill="#db2777" opacity="'+(x.excluido?.4:.75)+'"><title>'+esc(fM(x.m)+': '+n(q)+' de '+n(x.venta)+' es consumo por producción de '+pp.map(y=>y[0]+' ('+n(y[1])+')').join(', '))+'</title></rect>';}
      const ps=parte&&parte[x.m];if(ps&&bh>0){const q=ps.reduce((a,y)=>a+y[1],0),hh=bh*Math.min(1,q/Math.max(x.venta||0,q));
        s+='<rect x="'+x0+'" y="'+y0+'" width="'+(bw-4)+'" height="'+Math.max(hh,1)+'" rx="2" fill="#f97316" opacity="'+(x.excluido?.45:.9)+'"><title>'+esc(fM(x.m)+': '+n(q)+' de '+n(x.venta)+' vienen de la clave sustituida '+ps.map(y=>y[0]+' ('+n(y[1])+')').join(', '))+'</title></rect>';
        if(!x.excluido&&x.usa.length)s+='<rect x="'+x0+'" y="'+y0+'" width="'+(bw-4)+'" height="4" rx="1" fill="'+(x.usa.includes('ANT')?'#3b82f6':'#8b5cf6')+'"><title>'+(x.usa.includes('ANT')?'Usado en antecedente':'Usado en pronóstico')+'</title></rect>';}
      if(x.ed)s+='<text x="'+(x0+(bw-4)/2)+'" y="'+(y0-3)+'" font-size="9" text-anchor="middle" fill="#b45309">ED</text>';
      if(ag>=P.R.DIAS_AGOTADO)s+='<text x="'+(x0+(bw-4)/2)+'" y="'+(y0-(x.ed?12:3))+'" font-size="9" text-anchor="middle" fill="#e11d48">⛔</text>';
      s+='<text x="'+(x0+(bw-4)/2)+'" y="'+(H-pb+13)+'" font-size="9.5" text-anchor="middle" fill="#64748b">'+MES[+x.m.slice(5,7)].slice(0,3)+'</text>';
      if(x.m.slice(5,7)==='01'||i===0)s+='<text x="'+(x0+(bw-4)/2)+'" y="'+(H-pb+26)+'" font-size="9.5" text-anchor="middle" fill="#2563eb">'+x.m.slice(0,4)+'</text>';
    });
    return s+'</svg>';
  }

  // Tira de días: un cuadro por día con el estatus del portal de ese día
  function tira(hist,dias){
    if(!hist||!hist.length)return '<div style="color:#64748b;font-size:12px">Sin historial diario de la clave.</div>';
    const h=hist.slice(-(dias||60));
    const cnt={};h.forEach(x=>cnt[x.estatus]=(cnt[x.estatus]||0)+1);
    let racha=0;for(let i=h.length-1;i>=0&&h[i].estatus===h[h.length-1].estatus;i--)racha++;
    const ult=h[h.length-1];
    const cuadros=h.map(x=>'<span title="'+fF(x.fecha)+': '+esc(x.estatus)+' · exist. '+n(x.existencias)+' · BO '+n(x.back_order)+(x.meses_inv!=null?' · portal '+n(x.meses_inv,1)+' meses':'')+(x.mA!=null?' · antecedente '+n(x.mA,1)+(x.eA?' ('+esc(x.eA.toLowerCase())+')':''):'')+(x.mP!=null?' · pronóstico '+n(x.mP,1)+(x.eP?' ('+esc(x.eP.toLowerCase())+')':''):'')+'" style="display:inline-block;width:9px;height:18px;margin-right:2px;border-radius:2px;background:'+(COL[x.estatus]||'#cbd5e1')+'"></span>').join('');
    return '<div style="margin-bottom:4px">'+cuadros+'</div><div style="font-size:11.5px;color:#475569">Últimos '+h.length+' días ('+fF(h[0].fecha)+' a '+fF(ult.fecha)+'): '
      +['FALTANTE','RIESGO','OPTIMO','SOBRE INVENTARIO','NUEVA','SIN MOVIMIENTO'].filter(e=>cnt[e]).map(e=>'<b style="color:'+COL[e]+'">'+cnt[e]+'</b> en '+e.toLowerCase()).join(' · ')
      +' · hoy lleva <b>'+racha+'</b> día'+(racha===1?'':'s')+' seguidos en '+esc((ult.estatus||'').toLowerCase())+'.</div>';
  }

  // r: fila del cálculo del portal (estado.json). ocs: [[folio,pend,fecha_oc,proveedor,ed]]
  function html(r,d,ctx){
    ctx=ctx||{};const ref=(ctx.fecha||'').slice(0,7);
    let sv=[],mf=[];
    if(r&&ref){
      const ex=emp=>P.explicar(d.ventas[emp],emp==='SANVER'?d.ed:null,ref,r.N,m=>(d.agot[emp]||{})[m]>=P.R.DIAS_AGOTADO,(ctx.ventasHasta||{})[emp],(ctx.ventasDesde||{})[emp]);
      sv=ex('SANVER');mf=d.ventas.MF?ex('MF'):[];
    }
    const ocs=ctx.ocs||[];
    const usados=w=>sv.filter(x=>x.usa.includes(w)).map(x=>fM(x.m)).join(', ')||'sin meses válidos';
    const izq=(ctx.conHist?'<div style="margin-bottom:12px"><b style="font-size:12.5px">Estatus día por día</b> <span style="font-size:11px;color:#64748b">(estatus del portal de cada día; pasa el cursor para ver meses con antecedente, pronóstico y portal)</span>'+tira(d.hist,60)+'</div>':'')
      +'<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px"><b style="font-size:12.5px">Ventas SANVER mes a mes</b><span style="font-size:11px;color:#64748b"><span style="color:#3b82f6">■</span> antecedente · <span style="color:#8b5cf6">■</span> pronóstico · <span style="color:#cbd5e1">■</span> no usado · <span style="color:#fb7185">▨</span> descartado · ⛔ agotado · ED entrega directa restada · <span style="color:#14b8a6">▨</span> mes actual (no cuenta)'+(d.prod?' · <span style="color:#db2777">■</span> consumo por producción':'')+(d.sust?' · <span style="color:#f97316">■</span> venta de clave sustituida':'')+'</span></div>'
      +(r?grafica(sv,d.agot.SANVER,d.sust&&d.sust.parte.SANVER,d.prod&&d.prod.parte):'<div style="color:#64748b;font-size:12px;padding:10px">La clave no está en el último cálculo del portal.</div>')
      +(mf.length?'<details><summary style="font-size:12px;color:#1d4ed8;cursor:pointer">Ventas MF (antecedente '+n(r.mfA,1)+' · pronóstico '+n(r.mfP,1)+' · existencia '+n(r.mfI)+')</summary>'+grafica(mf,d.agot.MF,d.sust&&d.sust.parte.MF)+'</details>':'');
    const kv=(k,v)=>'<b style="color:#64748b;font-weight:600">'+k+'</b><span style="overflow-wrap:anywhere;min-width:0">'+v+'</span>';
    const der=r?'<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:12.5px">'
      +kv('Antecedente',n(r.A,1)+' / mes · '+usados('ANT'))+kv('Pronóstico',n(r.P,1)+' / mes · '+usados('PRON'))
      +(d.sust?kv('Claves sustituidas','<span style="color:#c2410c">suma la venta de '+d.sust.lst.map(x=>'<b>'+x.o+'</b>'+(x.f<1?' ('+Math.round(x.f*100)+'%)':'')+(x.d?' '+esc(x.d.slice(0,40)):'')).join(' · ')+'</span>'):'')
      +kv('Demanda portal',n(r.D,1)+' / mes · '+esc(r.bD)+(r.bDx?' ('+esc(r.bDx)+')':''))+kv('Meses objetivo (N)',r.N+' · objetivo '+n(r.pm,1)+' · entrega '+n(r.lt,1))
      +kv('Límites','riesgo entra con menos de '+n(r.lt*P.R.FACT_ENTRA_RIESGO,1)+' y sale con '+n(r.lt*P.R.FACT_ENTREGA,1)+' meses · sobre inventario con más de '+n(r.pm*P.R.FACT_MAX,1)+' · hoy '+n(r.mi,1)+' meses'+(r.miB!=null?' ('+n(r.miB,1)+' con BO)':''))
      +kv('Propuesta',n(r.D,1)+' × ('+n(r.lt,1)+' + '+n(r.pm,1)+') − ('+n(r.ex)+' + '+n(r.bo)+' BO CEDI) = <b>'+n(r.s)+'</b>'+(r.sE!=null?' → '+r.eT+' <b>'+n(r.sE)+'</b>':''))
      +(r.rs>0?kv('Resguardo','CEDI '+n(r.exC)+' + resguardo '+n(r.rs)+' = <b>'+n(r.ex)+'</b> · '+esc((r.rsD||[]).map(x=>x[0]+' '+n(x[1])+' (corte '+x[2]+(x[3]?', descontado del BO':'')+')').join(' · '))):'')
      +((r.boT||0)>(r.bo||0)?kv('BO','total '+n(r.boT)+((r.boT-r.bo-(r.rsBo||0))>0.0001?' · entrega directa '+n(r.boT-r.bo-(r.rsBo||0))+' (no cuenta)':'')+(r.rsBo?' · en resguardo '+n(r.rsBo)+' (ya contado en existencia)':'')):'')
      +kv('Estatus','portal <b>'+esc(r.est)+'</b>'+(r.eA?' · antecedente '+esc(r.eA.toLowerCase()):'')+(r.eP?' · pronóstico '+esc(r.eP.toLowerCase()):''))
      +(r.mfI!=null?kv('MF','existencia '+n(r.mfI)+' · '+n(r.mfM,1)+' meses'+(r.mfB!=null?' · número base '+n(r.mfB):'')+(r.mfF?' · <b style="color:#b45309">revisar con gerencia</b> (excedente '+n(r.mfX)+(r.mfB!=null?' sobre su base':'')+')':'')+(r.mfFalta?' · <b style="color:#2563eb">faltan '+n(r.mfFalta)+' por distribuir a tiendas</b>':'')):'')
      +(r.nt?kv('Notas',esc(r.nt)):'')
      +kv('OCs abiertas',ocs.length?ocs.slice(0,6).map(o=>'OC '+o[0]+' · '+n(o[1])+' pend. · '+fF(o[2])+' · '+esc(o[3])+(o[4]?' · entrega directa':'')).join('<br>')+(ocs.length>6?'<br>… y '+(ocs.length-6)+' más':''):'ninguna')
      +kv('Alarmas',d.alarmas.length?d.alarmas.slice(0,5).map(a=>fF(d10(a.fecha_alarma))+' '+(a.tipo==='FALTANTE_DIRECTO'?'faltante directo':'riesgo')+' → '+(a.resultado_target||'en plazo')+(a.oc_folio?' (OC '+a.oc_folio+', '+(a.dias_dif>0?'+':'')+a.dias_dif+' días)':'')+(a.fecha_fin?' · salió '+fF(d10(a.fecha_fin)):'')).join('<br>'):'ninguna')
      +'</div>':'';
    return '<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:16px">'+'<div>'+izq+'</div><div>'+der+'</div></div>';
  }
  window.FICHA={cargar,html,grafica,tira};
})();
