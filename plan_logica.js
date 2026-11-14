// Portal de Compras V2 · lógica de planeación compartida (Carga/cálculo y Tablero de planeación)
// No cambiar reglas aquí sin revisarlas con Compras: el cálculo diario y el tablero usan este mismo archivo.
/*PARSE-START*/
const P={};
P.norm=s=>String(s==null?'':s).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');
P.num=v=>{if(v==null||v==='')return null;if(typeof v==='number')return isFinite(v)?v:null;const n=parseFloat(String(v).replace(/[$,\s]/g,''));return isNaN(n)?null:n;};
P.clave=v=>{const n=P.num(v);return n!=null&&Number.isInteger(n)&&n>0?n:null;};
P.pad=n=>String(n).padStart(2,'0');
// Fecha de Excel (serial, texto DD/MM/AAAA o AAAA-MM-DD) → 'AAAA-MM-DD'
P.fecha=v=>{
  if(v==null||v==='')return null;
  if(typeof v==='number'){if(v<20000||v>80000)return null;const d=new Date(Math.round((v-25569)*864e5));return d.getUTCFullYear()+'-'+P.pad(d.getUTCMonth()+1)+'-'+P.pad(d.getUTCDate());}
  if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+P.pad(v.getMonth()+1)+'-'+P.pad(v.getDate());
  const s=String(v).trim();let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return m[1]+'-'+P.pad(m[2])+'-'+P.pad(m[3]);
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)))return m[3]+'-'+P.pad(m[2])+'-'+P.pad(m[1]);
  return null;
};
// Encabezado de mes → 'AAAA-MM-01'
P.mes=v=>{
  if(v==null||v==='')return null;
  if(typeof v==='number'){const f=P.fecha(v);return f?f.slice(0,7)+'-01':null;}
  const s=String(v).trim();let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})$/)))return m[1]+'-'+P.pad(m[2])+'-01';
  const f=P.fecha(s);return f?f.slice(0,7)+'-01':null;
};
P.aoa=ws=>XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
// Busca la fila de encabezado (primeras 10) que contenga todas las columnas pedidas
P.header=(aoa,requeridas)=>{
  const req=requeridas.map(P.norm);
  for(let i=0;i<Math.min(10,aoa.length);i++){
    const fila=aoa[i].map(P.norm);
    if(req.every(r=>fila.includes(r))){const idx={};req.forEach((r,j)=>idx[requeridas[j]]=fila.indexOf(r));return{fila:i,idx,cols:fila};}
  }
  return null;
};
P.hoja=(wb,nombres)=>{for(const n of nombres){const k=wb.SheetNames.find(s=>P.norm(s)===P.norm(n));if(k)return wb.Sheets[k];}return null;};

// 1. Ventas: {empresas:{SANVER:{meses,rows},MF:{…}}, avisos}
P.ventas=wb=>{
  const out={empresas:{},avisos:[]};
  for(const [emp,hoja] of [['SANVER','VENTAS_SANVER'],['MF','VENTAS_MF']]){
    const ws=P.hoja(wb,[hoja]);
    if(!ws){out.avisos.push('No se encontró la hoja '+hoja+'.');continue;}
    const aoa=P.aoa(ws);
    const h=aoa[0]||[];
    if(P.norm(h[0])!=='CLAVE')out.avisos.push(hoja+': la columna A debería llamarse Clave.');
    const meses=[];h.forEach((c,j)=>{if(j===0)return;const m=P.mes(c);if(m)meses.push({j,m});});
    const acc=new Map();let neg=0,dup=0,malas=0;const vistas=new Set();
    for(let i=1;i<aoa.length;i++){
      const r=aoa[i];const k=P.clave(r[0]);
      if(k==null){if(String(r[0]).trim()!=='')malas++;continue;}
      if(vistas.has(k))dup++;vistas.add(k);
      for(const {j,m} of meses){
        const v=P.num(r[j]);if(v==null||v===0)continue;
        if(v<0)neg++;
        const key=k+'|'+m;acc.set(key,(acc.get(key)||0)+v);
      }
    }
    const porClave=new Map();let celdas=0;
    acc.forEach((u,key)=>{const [c,m]=key.split('|');if(u===0)return;const k=+c;
      if(!porClave.has(k))porClave.set(k,{});porClave.get(k)[m.slice(0,7)]=Math.round(u*10000)/10000;celdas++;});
    vistas.forEach(k=>{if(!porClave.has(k))porClave.set(k,{});});
    out.empresas[emp]={meses:meses.map(x=>x.m.slice(0,7)),claves:vistas.size,celdas,porClave};
    if(dup)out.avisos.push(hoja+': '+dup+' claves repetidas (se sumaron).');
    if(neg)out.avisos.push(hoja+': '+neg+' celdas negativas (devoluciones; se guardan tal cual).');
    if(malas)out.avisos.push(hoja+': '+malas+' filas con clave no numérica (se ignoraron).');
  }
  return out;
};

// Combina lo que ya está en la base con el archivo: los meses del archivo se REEMPLAZAN
// (en todas las claves); los demás meses se conservan. Devuelve solo las filas que cambian.
P.mergeVentas=(empresa,existentes,arch)=>{
  const meses=new Set(arch.meses);const out=[];
  const base=new Map(existentes.map(r=>[Number(r.clave),r.meses||{}]));
  const claves=new Set([...base.keys(),...arch.porClave.keys()]);
  claves.forEach(k=>{
    const antes=base.get(k)||{};const nuevo={};
    Object.keys(antes).forEach(m=>{if(!meses.has(m))nuevo[m]=antes[m];});
    Object.assign(nuevo,arch.porClave.get(k)||{});
    const ord={};Object.keys(nuevo).sort().forEach(m=>ord[m]=nuevo[m]);
    if(JSON.stringify(ord)!==JSON.stringify(antes)||!base.has(k))out.push({empresa,clave:k,meses:ord});
  });
  return out;
};

// 2. Existencias MF: {fecha, rows:[{clave,existencia}], sucursales, negativas}
P.existMF=wb=>{
  let ws=P.hoja(wb,['Existencias'])||wb.Sheets[wb.SheetNames[0]];
  const aoa=P.aoa(ws);const h=P.header(aoa,['CLAVE','EXISTENCIA']);
  if(!h)throw new Error('No encontré las columnas CLAVE y EXISTENCIA en la hoja '+(wb.SheetNames[0]));
  const iF=h.cols.indexOf('FECHA'),iS=h.cols.indexOf('SUCURSAL');
  const sum=new Map(),suc=new Set();let fmax=null;
  for(let i=h.fila+1;i<aoa.length;i++){
    const r=aoa[i];const k=P.clave(r[h.idx.CLAVE]);if(k==null)continue;
    sum.set(k,(sum.get(k)||0)+(P.num(r[h.idx.EXISTENCIA])||0));
    if(iS>=0&&r[iS]!=='')suc.add(String(r[iS]).trim());
    if(iF>=0){const f=P.fecha(r[iF]);if(f&&(!fmax||f>fmax))fmax=f;}
  }
  let neg=0;const rows=[];
  sum.forEach((e,k)=>{if(e<0)neg++;rows.push({clave:k,existencia:Math.max(0,Math.round(e*10000)/10000)});});
  return{fecha:fmax,rows,sucursales:suc.size,negativas:neg};
};

// 3. Empaques: rows [{clave,uni_compra,inner_cant,master_cant,factor_conv,validacion}]
P.empaques=wb=>{
  const ws=P.hoja(wb,['BD']);if(!ws)throw new Error('No se encontró la hoja BD.');
  const aoa=P.aoa(ws);const h=P.header(aoa,['CLAVE SANVER','UNI COMPRA','CTD. EN UM','CTD. EN UM2','VALIDACION']);
  if(!h)throw new Error('No encontré los encabezados de la hoja BD (CLAVE SANVER, UNI COMPRA, Ctd. En UM, Ctd. En UM2, VALIDACION).');
  const iC=h.cols.indexOf('CAMBIO DE UNIDADES');
  const m=new Map();
  for(let i=h.fila+1;i<aoa.length;i++){
    const r=aoa[i];const k=P.clave(r[h.idx['CLAVE SANVER']]);if(k==null)continue;
    const fila={clave:k,uni_compra:String(r[h.idx['UNI COMPRA']]||'').trim()||null,
      inner_cant:P.num(r[h.idx['CTD. EN UM']]),master_cant:P.num(r[h.idx['CTD. EN UM2']]),
      factor_conv:iC>=0?P.num(r[iC]):null,validacion:P.norm(r[h.idx.VALIDACION])||null};
    const prev=m.get(k);
    if(!prev||(prev.validacion!=='VALIDO'&&fila.validacion==='VALIDO'))m.set(k,fila);
  }
  const rows=[...m.values()];
  return{rows,validos:rows.filter(r=>r.validacion==='VALIDO').length};
};

// 4. Histórico de agotados SANVER: rows [{empresa,clave,fecha,dias}]
P.historico=wb=>{
  const set=new Map();let leidas=0,dias=new Set();
  const leer=(ws,colsFecha)=>{
    if(!ws)return false;
    const aoa=P.aoa(ws);
    let h=null;for(const cf of colsFecha){h=P.header(aoa,[cf,'CLAVE','EXISTENCIAS']);if(h){h.cf=cf;break;}}
    if(!h)return false;
    for(let i=h.fila+1;i<aoa.length;i++){
      const r=aoa[i];const k=P.clave(r[h.idx.CLAVE]);if(k==null)continue;leidas++;
      const f=P.fecha(r[h.idx[h.cf]]);if(!f)continue;dias.add(f);
      const e=P.num(r[h.idx.EXISTENCIAS]);
      if(e!=null&&e<=0)set.set(k+'|'+f,{empresa:'SANVER',clave:k,fecha:f,dias:1});
    }
    return true;
  };
  const a=leer(P.hoja(wb,['Historico de faltantes']),['DIA/ MES.1','DIA/MES','FECHA']);
  const b=leer(P.hoja(wb,['Detalle']),['FECHA']);
  if(!a&&!b)throw new Error('No encontré las hojas Historico de faltantes ni Detalle con columnas Fecha, Clave y Existencias.');
  const ds=[...dias].sort();
  return{rows:[...set.values()],leidas,desde:ds[0],hasta:ds[ds.length-1],dias:ds.length};
};

// 5. Compras por entregas directas: rows [{clave,mes,cantidad}]
P.comprasED=wb=>{
  let ws=null,h=null;
  for(const n of wb.SheetNames){const aoa=P.aoa(wb.Sheets[n]);const hh=P.header(aoa,['MES/AÑO','CLAVE','TIPO DE SOLICITUD','CANT REC']);if(hh){ws=aoa;h=hh;break;}}
  if(!h)throw new Error('No encontré una hoja con las columnas Mes/año, CLAVE, TIPO DE SOLICITUD y CANT REC.');
  const acc=new Map(),meses=new Set();
  for(let i=h.fila+1;i<ws.length;i++){
    const r=ws[i];const m=P.mes(r[h.idx['MES/AÑO']]);if(!m)continue;meses.add(m);
    if(P.norm(r[h.idx['TIPO DE SOLICITUD']])!=='ENTREGAS DIRECTAS')continue;
    const k=P.clave(r[h.idx.CLAVE]);const q=P.num(r[h.idx['CANT REC']]);if(k==null||!q)continue;
    acc.set(k+'|'+m,(acc.get(k+'|'+m)||0)+q);
  }
  const rows=[];acc.forEach((q,key)=>{const [c,m]=key.split('|');rows.push({clave:+c,mes:m,cantidad:Math.round(q*10000)/10000});});
  return{rows,meses:[...meses].sort()};
};
// 5a. Entradas reales del reporte RP01-07 Compras por ID (nov-2026): una fila por recibo, OC y clave
//     → {rows:[{folio_rec,folio_oc,clave,fecha,cantidad,pzas,unidad}], desde, hasta}
P.recepReales=wb=>{
  let aoa=null,hi=-1,H=null;
  for(const n of wb.SheetNames){const a=P.aoa(wb.Sheets[n]);for(let i=0;i<Math.min(40,a.length);i++){const f=(a[i]||[]).map(P.norm);
    if(f.includes('FOLIO OC')&&f.includes('FECHA REC')&&f.includes('CLAVE')&&f.includes('CANT REC')){aoa=a;hi=i;H=f;break;}}if(aoa)break;}
  if(!aoa)throw new Error('No encontré los encabezados FOLIO, FECHA REC, FOLIO OC, CLAVE y CANT REC. Usa el reporte RP01-07 Compras por ID.');
  const c=n=>H.indexOf(n),iF=c('FOLIO'),iD=c('FECHA REC'),iO=c('FOLIO OC'),iK=c('CLAVE'),iQ=c('CANT REC'),iP=c('PZAS X UNIDAD'),iU=c('UNIDAD');
  const m=new Map();let malas=0,desde=null,hasta=null;
  for(let i=hi+1;i<aoa.length;i++){const r=aoa[i]||[];const oc=P.clave(r[iO]),k=P.clave(r[iK]),f=P.fecha(r[iD]),q=P.num(r[iQ]);
    if(oc==null||k==null||!f||q==null){if(r.some(x=>String(x).trim()!==''))malas++;continue;}
    const fr=iF>=0?(P.clave(r[iF])||0):0,key=fr+'|'+oc+'|'+k;const x=m.get(key)||{folio_rec:fr,folio_oc:oc,clave:k,fecha:f,cantidad:0,pzas:iP>=0?P.num(r[iP]):null,unidad:iU>=0?P.norm(r[iU])||null:null};
    x.cantidad=Math.round((x.cantidad+q)*10000)/10000;if(f<x.fecha)x.fecha=f;m.set(key,x);
    if(!desde||f<desde)desde=f;if(!hasta||f>hasta)hasta=f;}
  return{rows:[...m.values()],desde,hasta,malas};
};
// Recepciones por línea de OC para el OTIF: Map 'folio|clave' → [{fecha,cantidad,pzas,real}]. Si la línea tiene entradas reales
// (RP01-07) se usan esas (fecha y cantidad del recibo); si no, las que el portal detecta al comparar archivos de OCs.
P.recepMapa=(detectadas,reales)=>{
  const m=new Map(),R=new Map();
  (reales||[]).forEach(r=>{const k=Number(r.folio_oc)+'|'+Number(r.clave);(R.get(k)||R.set(k,[]).get(k)).push({fecha:P.d10(r.fecha),cantidad:Number(r.cantidad),pzas:r.pzas!=null?Number(r.pzas):null,real:true});});
  (detectadas||[]).forEach(r=>{const k=Number(r.folio)+'|'+Number(r.clave);if(R.has(k))return;(m.get(k)||m.set(k,[]).get(k)).push({...r,fecha:P.d10(r.fecha)});});
  R.forEach((v,k)=>m.set(k,v));return m;
};
// Entradas reales de una lista de OCs (tabla plan_recepciones_real · plan_tablas_25.sql). Sin la tabla regresa [] (se usan las detectadas).
P.cargarReales=async(sb,folios)=>{let out=[];const fs=[...new Set((folios||[]).map(Number))];
  try{for(let i=0;i<fs.length;i+=200){for(let p=0;p<200;p++){const{data,error}=await sb.from('plan_recepciones_real').select('folio_oc,clave,fecha,cantidad,pzas').in('folio_oc',fs.slice(i,i+200)).order('folio_oc').order('clave').order('folio_rec').range(p*1000,p*1000+999);
    if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)break;}}}catch(e){return[];}
  return out;};
// 5b. Costo unitario de compra por clave (para medir la afectación en dinero): TOTAL ÷ CANT REC
// de los últimos 3 meses con compra de cada clave (CEDI y entregas directas). Unidad = la de venta (CANT REC viene en unidad básica).
P.costosCompra=wb=>{
  let ws=null,h=null;
  for(const n of wb.SheetNames){const aoa=P.aoa(wb.Sheets[n]);const hh=P.header(aoa,['MES/AÑO','CLAVE','TOTAL','CANT REC']);if(hh){ws=aoa;h=hh;break;}}
  if(!h)return null;
  const acc=new Map();
  for(let i=h.fila+1;i<ws.length;i++){
    const r=ws[i];const m=P.mes(r[h.idx['MES/AÑO']]);const k=P.clave(r[h.idx.CLAVE]);const t=P.num(r[h.idx.TOTAL]),q=P.num(r[h.idx['CANT REC']]);
    if(!m||k==null||!(t>0)||!(q>0))continue;
    if(!acc.has(k))acc.set(k,new Map());const mm=acc.get(k);const x=mm.get(m)||{t:0,q:0};x.t+=t;x.q+=q;mm.set(m,x);
  }
  const rows=[];acc.forEach((mm,k)=>{const ms=[...mm.keys()].sort().slice(-3);let t=0,q=0;ms.forEach(m=>{t+=mm.get(m).t;q+=mm.get(m).q;});
    if(q>0)rows.push({clave:k,costo:Math.round(t/q*10000)/10000,mes:ms[ms.length-1],meses:ms.length});});
  return rows;
};
// 6. Detalle del maestro diario: rows por fecha
P.detalle=wb=>{
  const ws=P.hoja(wb,['Detalle']);if(!ws)throw new Error('No se encontró la hoja Detalle.');
  const aoa=P.aoa(ws);
  const req=['FECHA','CLAVE','EXISTENCIAS','COMPRADOR','CLASIFICACION POR MOVIMIENTO','TIEMPO DE ENTREGA','OBJETIVO_MESES DE INVENTARIO','BACK ORDER'];
  const h=P.header(aoa,req);if(!h)throw new Error('La hoja Detalle no trae las columnas esperadas: '+req.join(', '));
  const c=n=>h.cols.indexOf(n);
  const iN=c('NOMBRE'),iU=c('UNIDAD'),iG=c('GRUPO'),iE=c('CLASIFICACION_ESTATUS DE INVENTARIO'),iM=c('MARCA'),iC=c('CLASIFICACION');
  const porFecha=new Map();
  for(let i=h.fila+1;i<aoa.length;i++){
    const r=aoa[i];const k=P.clave(r[h.idx.CLAVE]);const f=P.fecha(r[h.idx.FECHA]);if(k==null||!f)continue;
    if(!porFecha.has(f))porFecha.set(f,new Map());
    porFecha.get(f).set(k,{clave:k,nombre:iN>=0?String(r[iN]).trim():'',unidad:iU>=0?P.norm(r[iU]):'',grupo:iG>=0?String(r[iG]).trim():'',marca:iM>=0&&r[iM]!=null?String(r[iM]).trim():'',
      comprador:P.norm(r[h.idx.COMPRADOR]),rot:P.norm(r[h.idx['CLASIFICACION POR MOVIMIENTO']]),
      lt:P.num(r[h.idx['TIEMPO DE ENTREGA']]),pm:P.num(r[h.idx['OBJETIVO_MESES DE INVENTARIO']]),
      ex:P.num(r[h.idx.EXISTENCIAS])||0,bo:P.num(r[h.idx['BACK ORDER']])||0,estX:iE>=0?P.norm(r[iE]):'',abc:iC>=0&&r[iC]!=null?String(r[iC]).trim():''});
  }
  return porFecha;
};

// ── Reglas de cálculo (acordadas con Compras, oct-2026) ──
P.R={ED_DESDE:'2024-01',ED_HASTA:'2099-12',ANIO_LIMPIO:'2026-01',DIAS_AGOTADO:16,ATIPICO:3,MIN_MESES_MEDIANA:3,VENTANA_ATRAS:12,
     FACT_ENTREGA:1.4,FACT_MAX:1.4,EXCLUIR_ROT:['SIN COMPRA','NUEVOS'],
     // Rotaciones sin propuesta de compra (oct-2026: NUEVOS sí lleva propuesta si tiene consumo, igual que en Propuestas de compra)
     SIN_SUG_ROT:['SIN COMPRA']};
// Riesgo con margen (oct-2026): una clave ENTRA a riesgo con menos de T. entrega × 1.2 y solo SALE cuando pasa de T. entrega × 1.4.
// Entre 1.2 y 1.4 conserva el estatus del día anterior (evita que brinque de riesgo a óptimo y regrese por unas piezas).
// Sobre inventario: más de Objetivo × 1.4 (sin cambio). Los meses de inventario NO cuentan el BO.
P.R.FACT_ENTRA_RIESGO=1.2;
P.ym=(ym,k)=>{let[y,m]=ym.split('-').map(Number);m+=k;while(m>12){m-=12;y++;}while(m<1){m+=12;y--;}return y+'-'+P.pad(m);};
// Serie de ventas de una clave ya limpia de entregas directas (solo 2025, nunca negativa)
P.serie=(meses,ed)=>{
  const s=Object.assign({},meses||{});const notas=[];
  // Entregas directas (Compras por ID) desde ED_DESDE: se restan de la venta del mes; si la venta es menor, el mes queda en 0 (no negativo)
  if(ed)Object.keys(ed).forEach(m=>{if(m>=P.R.ED_DESDE&&m<=P.R.ED_HASTA&&s[m]!=null&&ed[m]>0){s[m]=Math.max(0,Math.round((s[m]-ed[m])*10000)/10000);notas.push(m);}});
  return{s,ed:notas};
};
// Valor de un mes después de la regla de atípicos: null = descartado
P.valor=(s,m)=>{
  const x=Math.max(0,s[m]||0);
  const w=[];for(let i=1;i<=12;i++){const v=s[P.ym(m,-i)];if(v>0)w.push(v);}
  if(w.length<P.R.MIN_MESES_MEDIANA)return{v:x};
  w.sort((a,b)=>a-b);const med=w.length%2?w[(w.length-1)/2]:(w[w.length/2-1]+w[w.length/2])/2;
  if(x<=P.R.ATIPICO*med)return{v:x};
  // Pico de temporada: si el mismo mes del año anterior (o el de antes o el de después) también vendió
  // más de TEMP_REPITE × la mediana, el pico se repite cada año y se usa completo (no se descarta ni se topa).
  if(P.R.TEMP_REPITE>0){const L=P.R.TEMP_REPITE*med;
    for(let k=-1;k<=1;k++){const v=s[P.ym(m,-12+k)]||0;if(v>L)return{v:x,at:'temporada'};}
    // …o el mismo mes (±1) del año siguiente, cuando ya hay venta cargada de ese año: el pico se volvió a dar
    for(let k=-1;k<=1;k++){const v=s[P.ym(m,12+k)]||0;if(v>L)return{v:x,at:'temporada'};}
    // …o el mes anterior o el siguiente también vendieron fuerte: es una temporada de varios meses, no un pico aislado
    if((s[P.ym(m,-1)]||0)>L||(s[P.ym(m,1)]||0)>L)return{v:x,at:'temporada'};}
  return m<P.R.ANIO_LIMPIO?{v:null,at:'descartado'}:{v:P.R.ATIPICO*med,at:'topado'};
};
P.R.TEMP_REPITE=2;
// ¿Mes de 2025 sospechoso de agotado? (sin datos de existencia antes de abr-2026)
// Clave regular (vendió ≥10 de los 12 meses previos) con una racha de ≥2 meses en cero.
P.R.AGOT_DESDE='2026-04';P.R.REGULAR=10;P.R.RACHA=2;P.R.INTERMITENTE=6;
P.sospechoso=(s,m,lo,hi)=>{
  if(m>=P.R.AGOT_DESDE||(s[m]||0)>0)return false;
  let n=0;for(let i=1;i<=12;i++){const x=P.ym(m,-i);if(lo&&x<lo)break;if((s[x]||0)>0)n++;}
  if(n<P.R.REGULAR)return false;
  let r=1;
  for(let x=P.ym(m,-1);(!lo||x>=lo)&&!((s[x]||0)>0);x=P.ym(x,-1))r++;
  for(let x=P.ym(m,1);(!hi||x<=hi)&&!((s[x]||0)>0);x=P.ym(x,1)){r++;if(r>40)break;}
  return r>=P.R.RACHA;
};
// Antecedente y pronóstico de una serie para el mes de referencia.
// Un mes NO cuenta si: estuvo agotado más de 15 días (DIAS_AGOTADO = 16; antes 10, cambiado oct-2026), es anterior a la primera venta de la clave,
// o es un mes de 2025 sospechoso de agotado. Si una ventana queda sin meses válidos → null
// (la demanda usa solo la otra; nunca se promedia contra un cero falso).
P.antPron=(s,ref,N,agot,ultimo,primero)=>{
  const notas=[];const fin=ultimo&&ultimo<P.ym(ref,-1)?ultimo:P.ym(ref,-1);
  if(fin!==P.ym(ref,-1))notas.push('ventas cargadas solo hasta '+fin);
  const conVenta=Object.keys(s).filter(m=>s[m]>0).sort();const ini=conVenta[0]||null;
  const hi=ultimo||fin;const ok=m=>ini!=null&&m>=ini&&!agot(m)&&!P.sospechoso(s,m,primero,hi);
  const a=[];for(let i=0;i<P.R.VENTANA_ATRAS&&a.length<N;i++){const m=P.ym(fin,-i);if(!ok(m))continue;const r=P.valor(s,m);if(r.at)notas.push(m+' '+r.at);if(r.v==null)continue;a.push(r.v);}
  const p=[];for(let i=0;i<N;i++){const m=P.ym(ref,i-12);if(ultimo&&m>ultimo)continue;if(!ok(m))continue;const r=P.valor(s,m);if(r.at)notas.push(m+' '+r.at);if(r.v==null)continue;p.push(r.v);}
  const avg=x=>x.length?x.reduce((t,v)=>t+v,0)/x.length:null;
  // Intermitente: en los 12 meses previos válidos vendió en ≤6 → la demanda usa el promedio de esos 12 meses
  const w=[];let nv=0;for(let i=1;i<=12;i++){const m=P.ym(ref,-i);if(ultimo&&m>ultimo)continue;if(!ok(m))continue;const r=P.valor(s,m);if(r.v==null)continue;w.push(r.v);if(r.v>0)nv++;}
  const inter=w.length>=6&&nv<=P.R.INTERMITENTE;
  if(ini==null)notas.push('sin ventas en el historial');
  else if(ini>P.ym(ref,-12))notas.push('primera venta '+ini);
  return{A:avg(a),P:avg(p),nA:a.length,nP:p.length,I:inter?avg(w):null,W:avg(w),nW:w.length,notas};
};
// Estatus por meses de inventario. prev = estatus del día anterior (para el margen entre 1.2 y 1.4)
P.clasificar=(mi,lt,pm,prev)=>{
  if(mi<lt*P.R.FACT_ENTRA_RIESGO)return'RIESGO';
  if(mi<lt*P.R.FACT_ENTREGA&&(prev==='RIESGO'||prev==='FALTANTE'))return'RIESGO';
  if(mi<=pm*P.R.FACT_MAX)return'OPTIMO';
  return'SOBRE INVENTARIO';
};
// hv = la clave (con sus claves sustituidas) tiene venta en su historial: false → NUEVA, true → SIN MOVIMIENTO (sin consumo en la ventana)
P.estatus=(rot,ex,D,lt,pm,prev,hv)=>{
  if(rot==='SIN COMPRA')return'SIN COMPRA';
  if(ex<=0)return'FALTANTE';
  if(!D)return hv===false?'NUEVA':hv===true?'SIN MOVIMIENTO':'RIESGO';
  return P.clasificar(ex/D,lt,pm,prev);
};
// Estatus del Excel recalculado con la misma regla, a partir de los meses de inventario del Detalle.
// orig = estatus que trae el Excel (SIN COMPRA se respeta). Meses vacíos o 0 con existencia = sin venta → RIESGO.
P.estatusExcel=(orig,ex,mi,lt,pm,prev)=>{
  if(orig==='SIN COMPRA')return'SIN COMPRA';
  if(!(ex>0))return'FALTANTE';
  if(mi==null||mi===''||!(Number(mi)>0))return'RIESGO';
  return P.clasificar(Number(mi),Number(lt)||0,Number(pm)||0,prev);
};
// Recalcula una serie de días: filas [{fecha,clave,estatus,existencias,meses_inv,t_entrega,obj_meses}] → Map 'fecha|clave' → estatus nuevo
P.cadenaExcel=filas=>{
  const porClave=new Map();filas.forEach(r=>{const k=String(r.clave);(porClave.get(k)||porClave.set(k,[]).get(k)).push(r);});
  const out=new Map();
  porClave.forEach((a,k)=>{a.sort((x,y)=>x.fecha<y.fecha?-1:x.fecha>y.fecha?1:0);let prev=null;
    a.forEach(r=>{const e=P.estatusExcel(String(r.estatus||'').toUpperCase(),Number(r.existencias)||0,r.meses_inv,r.t_entrega,r.obj_meses,prev);out.set(r.fecha+'|'+k,e);prev=e;});});
  return out;
};
// Redondeo a empaque: ≥1 MASTER → múltiplo de MASTER más cercano; menor → hacia arriba al INNER
P.empaque=(q,e,unidad)=>{
  if(!q||!e||e.validacion!=='VALIDO')return{q,ok:false};
  let f=1;if(P.norm(e.uni_compra)!==P.norm(unidad)){if(!e.factor_conv)return{q,ok:false,nota:'empaque en otra unidad sin factor'};f=e.factor_conv;}
  const inn=(e.inner_cant||0)*f,mas=(e.master_cant||0)*f;
  if(mas>0&&q>=mas)return{q:Math.max(mas,Math.round(q/mas)*mas),ok:true,tipo:'MASTER'};
  if(inn>0)return{q:Math.ceil(q/inn)*inn,ok:true,tipo:'INNER'};
  if(mas>0)return{q:mas,ok:true,tipo:'MASTER'};
  return{q,ok:false};
};
// ── Inventario en resguardo con proveedores (oct-2026) ──
// Cuenta como existencia propia para meses de inventario, estatus (incluido faltante) y propuesta.
// Vigente en el día f si la fecha de corte es de los últimos RESG_DIAS días (o hasta 7 días posterior al día del Excel).
P.R.RESG_DIAS=30;
// Clave nunca vendida: es NUEVA si su primera existencia tiene hasta DIAS_NUEVA días; con más, SIN MOVIMIENTO
P.R.DIAS_NUEVA=90;
// Demanda mínima para considerar que hay consumo (1 pieza al año); abajo de esto la clave queda SIN MOVIMIENTO
P.R.D_MIN=1/12;
// Venta irregular: base elegida fuera de [promedio 12 meses ÷ 3, × 3] → se usa el promedio de 12 meses
P.R.IRREG=3;
// Cómo se detecta temporada: INDICE = pronóstico vs antecedente del año pasado (quita la tendencia general); DIRECTO = pronóstico vs antecedente de hoy
P.R.TEMP_MODO='INDICE';
P.resgMapa=(rows,fecha)=>{
  const m=new Map();if(!rows||!rows.length)return m;const t=new Date(fecha+'T12:00:00');
  rows.forEach(r=>{const q=+r.cantidad||0;if(q<=0)return;const fc=String(r.fecha_corte||'').slice(0,10);if(!fc)return;
    const dd=Math.round((t-new Date(fc+'T12:00:00'))/864e5);if(dd>P.R.RESG_DIAS||dd<-7)return;
    const k=Number(r.clave);const o=m.get(k)||{q:0,qBo:0,det:[]};o.q+=q;if(r.desc_bo)o.qBo+=q;o.det.push([r.proveedor,q,fc,r.desc_bo?1:0]);m.set(k,o);});
  return m;
};
// ── Claves sustituidas (oct-2026) ──
// La clave vigente toma el historial de venta de la(s) clave(s) que sustituyó; si una original tiene n sustitutas, a cada una le toca 1/n.
// Estatus del archivo (nov-2026): SUSTITUTO = se suma su venta (antecedente, pronóstico y propuesta); EQUIVALENTE y REVISAR = solo se
// muestran, no se suma su venta; BAJA = no se guarda. Sin estatus (cargas anteriores) = SUSTITUTO.
P.SUST_EST=['SUSTITUTO','EQUIVALENTE','REVISAR','BAJA'];
P.sustSuma=r=>{const e=P.norm(r&&r.estatus);return!e||e==='SUSTITUTO';};
P.sustMapa=rows=>{const m=new Map();(rows||[]).filter(P.sustSuma).forEach(r=>{const v=Number(r.clave_vigente);if(!v)return;(m.get(v)||m.set(v,[]).get(v)).push({o:Number(r.clave_original),f:Number(r.factor)||1,cv:r.conv!=null&&+r.conv>0?+r.conv:null,d:r.desc_original||''});});return m;};
// Unidad distinta: si la venta mensual promedio de la vigente y la de la original difieren más de SUST_RATIO veces (p. ej. mililitros vs piezas),
// sin factor de conversión capturado NO se suma la original. Regresa el multiplicador a usar (conv) o null si no se suma.
P.R.SUST_RATIO=10;
P.sustConv=(own,orig,cv)=>{
  if(cv)return cv;
  const av=m=>{const x=Object.values(m||{}).filter(q=>q>0);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null;};
  const a=av(own),b=av(orig);if(a==null||b==null)return 1;
  const r=a/b;return r>P.R.SUST_RATIO||r<1/P.R.SUST_RATIO?null:1;
};
// own + Σ factor × original, por mes. parte[m] = [[clave original, cantidad]] para pintarlo distinto en la gráfica.
P.mezclarSust=(own,origs)=>{
  const s=Object.assign({},own||{});const parte={};
  (origs||[]).forEach(({o,f,meses})=>{Object.keys(meses||{}).forEach(m=>{const q=Math.round((+meses[m]||0)*(f||1)*10000)/10000;if(!q)return;
    s[m]=Math.round(((s[m]||0)+q)*10000)/10000;(parte[m]=parte[m]||[]).push([o,q]);});});
  return{meses:s,parte};
};
// Para las fichas (gráfica de ventas de una clave): o = {ventas:{SANVER,MF}, ed} ya leídos de la clave vigente.
// Suma la venta de sus claves originales y deja o.sust = {lst:[{o,f,d}], parte:{SANVER:{mes:[[clave,cant]]}, MF:{…}}}
// Las equivalentes (y las de estatus REVISAR) solo se listan en o.equiv = [{o,d,e}]; su venta no se suma.
P.ventasConSust=async(sb,c,o)=>{
  try{
    let{data:su0,error}=await sb.from('plan_sustituciones').select('clave_original,factor,conv,desc_original,estatus').eq('clave_vigente',Number(c));
    if(error){const r=await sb.from('plan_sustituciones').select('clave_original,factor,desc_original').eq('clave_vigente',Number(c));su0=r.data;error=r.error;}
    if(error||!su0||!su0.length)return o;
    const eq=su0.filter(x=>!P.sustSuma(x));if(eq.length)o.equiv=eq.map(x=>({o:Number(x.clave_original),d:x.desc_original||'',e:P.norm(x.estatus)}));
    const su=su0.filter(P.sustSuma);if(!su.length)return o;
    const ks=su.map(x=>Number(x.clave_original));
    const[v,e]=await Promise.all([sb.from('plan_ventas').select('empresa,clave,meses').in('clave',ks),sb.from('plan_compras_ed').select('clave,mes,cantidad').in('clave',ks)]);
    const lst0=su.map(x=>({o:Number(x.clave_original),f:Number(x.factor)||1,cv:x.conv!=null&&+x.conv>0?+x.conv:null,d:x.desc_original||''}));const parte={};
    // misma revisión de unidad que el Cálculo diario (con la venta SANVER)
    const vS=k=>((v.data||[]).find(r=>r.empresa==='SANVER'&&Number(r.clave)===k)||{}).meses;
    const lst=[],omit=[];lst0.forEach(x=>{const cv=P.sustConv(o.ventas.SANVER,vS(x.o),x.cv);if(cv==null)omit.push(x);else lst.push({...x,f:x.f*cv,cv});});
    if(!lst.length){o.sust={lst:[],omit,parte:{}};return o;}
    ['SANVER','MF'].forEach(emp=>{const og=lst.map(x=>({o:x.o,f:x.f,meses:((v.data||[]).find(r=>r.empresa===emp&&Number(r.clave)===x.o)||{}).meses})).filter(x=>x.meses);
      if(og.length){const mz=P.mezclarSust(o.ventas[emp],og);o.ventas[emp]=mz.meses;parte[emp]=mz.parte;}});
    const edO={};(e.data||[]).forEach(r=>{const k=Number(r.clave);(edO[k]=edO[k]||{})[String(r.mes).slice(0,7)]=Number(r.cantidad);});
    const og=lst.map(x=>({o:x.o,f:x.f,meses:edO[x.o]})).filter(x=>x.meses);if(og.length)o.ed=P.mezclarSust(o.ed,og).meses;
    o.sust={lst,omit,parte};
  }catch(err){}
  return o;
};
// Aplica las sustituciones a las ventas y compras ED del contexto del cálculo (ctx.ventas.SANVER/MF, ctx.ed)
P.aplicarSust=(ctx,rows)=>{
  const M0=P.sustMapa(rows);const M=new Map();ctx.sustOmit=[];
  // revisión de unidad con la venta SANVER original (antes de sumar nada)
  M0.forEach((l,v)=>{const ok=[];l.forEach(x=>{const cv=P.sustConv(ctx.ventas.SANVER.get(v),ctx.ventas.SANVER.get(x.o),x.cv);if(cv==null)ctx.sustOmit.push([v,x.o]);else ok.push({...x,f:x.f*cv,cv});});if(ok.length)M.set(v,ok);});
  ctx.sust=M;let n=0;
  M.forEach((lst,v)=>{n++;
    ['SANVER','MF'].forEach(emp=>{const V=ctx.ventas[emp];if(!V)return;const og=lst.map(x=>({o:x.o,f:x.f,meses:V.get(x.o)})).filter(x=>x.meses);
      if(og.length)V.set(v,P.mezclarSust(V.get(v),og).meses);});
    if(ctx.ed){const og=lst.map(x=>({o:x.o,f:x.f,meses:ctx.ed.get(x.o)})).filter(x=>x.meses);if(og.length)ctx.ed.set(v,P.mezclarSust(ctx.ed.get(v),og).meses);}
  });
  return n;
};
// Redondeo hacia arriba sin que un residuo de decimales sume una pieza (175.0001 → 175)
P.ceil3=v=>Math.ceil(Math.round(v*1000)/1000);
// Cálculo de un día completo. ctx: {ventas:{SANVER:Map,MF:Map}, ed:Map, agot:Set('EMP|clave|AAAA-MM'), invMF:Map, emp:Map, ultimo:{SANVER,MF}}
// Regla Mas Ferre: revisar con gerencia (devolución estratégica) si MF tiene más de MF_MESES_REV meses
// y su existencia está arriba del número base. Excedente = existencia − número base (sin base: existencia − demanda × objetivo).
P.mfRegla=(inv,Dm,pm,mb)=>{
  mb=mb==null||mb===''?null:Number(mb);const mm=inv!=null&&Dm>0?inv/Dm:null;
  const flag=mm!=null&&mm>P.R.MF_MESES_REV&&(mb==null||inv>mb);
  return{mfF:flag?1:0,mfX:flag?(mb!=null?Math.floor(inv-mb):Math.floor(inv-Dm*(pm||0))):null,mfB:mb,mfFalta:mb!=null&&inv!=null&&inv<mb?Math.ceil(mb-inv):null};
};
// Aplica el número base a filas ya calculadas (estado publicado) sin recalcular todo → cuántas cambiaron
P.aplicarMFBase=(filas,mapa)=>{let n=0;(filas||[]).forEach(r=>{if(r.mfI==null)return;const mb=mapa.has(Number(r.c))?mapa.get(Number(r.c)):null;
  const x=P.mfRegla(r.mfI,r.mfD,r.pm,mb);if(x.mfF!==r.mfF||x.mfX!==r.mfX||x.mfB!==(r.mfB??null))n++;Object.assign(r,x);});return n;};
P.calcularDia=(fecha,filas,ctx)=>{
  const ref=fecha.slice(0,7);const out=[];
  const RG=ctx.resgRows?P.resgMapa(ctx.resgRows,fecha):null;
  filas.forEach(d0=>{
    // Resguardo: se suma a la existencia (ex = CEDI + resguardo; exC = solo CEDI)
    const rg=RG&&RG.get(d0.clave)||null;const d=rg?{...d0,ex:(d0.ex||0)+rg.q}:d0;
    const k=d.clave;const lt=d.lt||0,pm=d.pm||0;const N=Math.max(1,Math.ceil(pm||1));
    // El mes en curso (y posteriores) se ve en la gráfica pero NO cuenta para el cálculo: se quita de la serie
    const cut=x=>{const o={};Object.keys(x||{}).forEach(m=>{if(m<ref)o[m]=x[m];});return o;};
    const uS=ctx.ultimo.SANVER&&ctx.ultimo.SANVER>=ref?P.ym(ref,-1):ctx.ultimo.SANVER,uM=ctx.ultimo.MF&&ctx.ultimo.MF>=ref?P.ym(ref,-1):ctx.ultimo.MF;
    const sv=P.serie(cut(ctx.ventas.SANVER.get(k)),ctx.ed.get(k));
    const ap=P.antPron(sv.s,ref,N,m=>ctx.agot.has('SANVER|'+k+'|'+m),uS,ctx.primero&&ctx.primero.SANVER);
    // Demanda del portal = base recomendada (oct-2026): pronóstico si es temporada, si no antecedente; intermitente = promedio 12 meses
    const Dprom=ap.I!=null?ap.I:(ap.A!=null&&ap.P!=null?(ap.A+ap.P)/2:(ap.A??ap.P??0));
    // Temporada (oct-2026): el pronóstico se compara contra el antecedente DEL AÑO PASADO (mismo N, meses previos), no contra el de hoy,
    // para no confundir una baja general de ventas con temporada. Aly = antecedente de hace 12 meses.
    const ly=P.R.TEMP_MODO==='INDICE'?P.antPron(sv.s,P.ym(ref,-12),N,m=>ctx.agot.has('SANVER|'+k+'|'+m),P.ym(ref,-13),ctx.primero&&ctx.primero.SANVER):null;
    const br=P.baseRec({A:ap.A,P:ap.P,N,pm,nA:ap.nA,nP:ap.nP,bD:ap.I!=null?'INTERMITENTE 12 MESES':'',D:Dprom,Aly:ly?ly.A:undefined,nAly:ly?ly.nA:undefined});
    // Venta irregular: si la base elegida se aleja más de IRREG veces del promedio de los 12 meses válidos, se usa ese promedio
    // (ventas por lotes, meses recientes casi en cero, o claves sustituidas vendidas en otra unidad)
    let c0=br.c,irr=null;
    if(br.b!=='INTER'&&ap.W>0&&ap.nW>=6&&(!(c0>0)||c0<ap.W/P.R.IRREG||c0>ap.W*P.R.IRREG)){irr={b:br.b,c:c0};c0=ap.W;}
    // 1 pieza al año o menos (p. ej. fracciones por ajustes) no es consumo real: cuenta como sin consumo
    const D=c0>P.R.D_MIN*1.0001?c0:0;
    // ¿Tiene venta en su historial (incluidas sus claves sustituidas)? Sin venta nunca = NUEVA
    const hv0=Object.values(sv.s).some(v=>v>0);
    // Nunca vendida: NUEVA solo si tiene existencia desde hace poco (≤ DIAS_NUEVA); si ya tiene rato en inventario = SIN MOVIMIENTO
    const pex=!hv0&&ctx.primeraEx?ctx.primeraEx.get(k):null;const pexOk=pex&&pex<=fecha?pex:null;
    const dsx=pexOk?Math.round((new Date(fecha+'T12:00:00')-new Date(pexOk+'T12:00:00'))/864e5):null;
    const hv=hv0||(dsx!=null&&dsx>P.R.DIAS_NUEVA);
    const pv=ctx.prevEst&&ctx.prevEst.get(k)||{};
    const est=P.estatus(d.rot,d.ex,D,lt,pm,pv.est,hv);
    const su=ctx.sust&&ctx.sust.get(k)||null;
    const ra=P.racha(pv,est,fecha,ctx.prevFecha);
    // Sin ninguna entrada en su historial (ni de sus claves sustituidas) y sin BO (no hay OC en camino): no lleva nivel de riesgo ni alarma
    const se=ctx.conEntrada&&!(d.bo>0)&&!ctx.conEntrada.has(Number(k))&&!(su&&su.some(x=>ctx.conEntrada.has(Number(x.o))))?1:0;
    const nr=P.nivelRiesgo(d.ex,D,lt,se?'':est,fecha,pv.xh);
    // BO del CEDI: se quita la parte que es de OCs de entrega directa a sucursal (no llega al CEDI)
    const fr=ctx.boFrac&&ctx.boFrac.has(k)?ctx.boFrac.get(k):1;const bo=Math.max(0,Math.round((d.bo*fr-(rg?rg.qBo:0))*10000)/10000);
    const sug=X=>X==null||P.R.SIN_SUG_ROT.includes(d.rot)?null:Math.max(0,P.ceil3(X*(lt+pm)-(d.ex+bo)));
    const s=sug(D);const e=P.empaque(s,ctx.emp.get(k),d.unidad);
    // Propuesta SIN restar el BO (vista «Sin BO», la de default en el portal)
    const s0=D==null||P.R.SIN_SUG_ROT.includes(d.rot)?null:Math.max(0,P.ceil3(D*(lt+pm)-d.ex));const e0=bo>0?P.empaque(s0,ctx.emp.get(k),d.unidad):e;
    // MF
    const smf=P.serie(cut(ctx.ventas.MF.get(k)),null);
    const apm=P.antPron(smf.s,ref,N,m=>ctx.agot.has('MF|'+k+'|'+m),uM,ctx.primero&&ctx.primero.MF);
    const Dm=apm.I!=null?apm.I:(apm.A!=null&&apm.P!=null?(apm.A+apm.P)/2:(apm.A??apm.P??0));
    const inv=ctx.invMF.has(k)?ctx.invMF.get(k):null;
    const mm=inv!=null&&Dm>0?inv/Dm:null;
    // Número base de Mas Ferre (inventario que deben mantener entre todas las tiendas): excedente = existencia MF − base.
    // Se marca revisar con gerencia (devolución estratégica) si MF tiene más de MF_MESES_REV meses y existencia arriba de su base.
    const mb=ctx.mfBase&&ctx.mfBase.has(k)?ctx.mfBase.get(k):null;
    const r1=x=>x==null?null:Math.round(x*10)/10;
    const notas=[...(sv.ed.length?['ED restada '+sv.ed.join(',')]:[]),...ap.notas,...(ap.I!=null?['venta intermitente: demanda = promedio 12 meses']:ap.P==null&&ap.A!=null?['sin pronóstico válido: demanda = antecedente']:ap.A==null&&ap.P!=null?['sin antecedente válido: demanda = pronóstico']:[]),...(e.nota?[e.nota]:[]),...(!hv0&&!(D>0)&&d.ex>0?['nunca se ha vendido'+(pexOk?'; con existencia desde '+pexOk+' ('+dsx+' días)':'; primera vez con existencia')]:[]),...(ctx.prodCons&&ctx.prodCons.has(k)?['incluye consumo de producción de '+ctx.prodCons.get(k).map(x=>x[0]).join(', ')]:[]),...(su?['incluye historial de '+su.map(x=>x.o+(x.cv&&x.cv!==1?' ×'+x.cv:'')+(x.f/(x.cv||1)<1?' ('+Math.round(x.f/(x.cv||1)*100)+'%)':'')).join(', ')]:[]),...(ctx.sustOmit&&ctx.sustOmit.some(z=>z[0]===k)?['NO suma la venta de '+ctx.sustOmit.filter(z=>z[0]===k).map(z=>z[1]).join(', ')+': su venta es de otra escala (unidad distinta); captura el factor de conversión en el archivo de sustituciones']:[]),...(rg?['incluye '+rg.q+' en resguardo con '+rg.det.map(x=>x[0]).join(', ')+(rg.qBo?' ('+rg.qBo+' descontado del BO)':'')]:[])];
    const eX=(X,pr)=>X==null?null:P.estatus(d.rot,d.ex,X,lt,pm,pr,hv);
    out.push({c:k,n:d.nombre,m:d.marca||'',abc:d.abc||'',comp:d.comprador,rot:d.rot,g:d.grupo,u:d.unidad,lt,pm,N,ex:d.ex,exC:d0.ex,rs:rg?rg.q:0,rsBo:rg?rg.qBo:0,rsD:rg?rg.det:null,bo,boT:d.bo,eA:eX(ap.A,pv.eA),eP:eX(ap.P,pv.eP),
      A:r1(ap.A),P:r1(ap.P),D:Math.round(D*10000)/10000,Dp:r1(Dprom),bD:irr?'IRREGULAR 12 MESES':br.b==='INTER'?'INTERMITENTE 12 MESES':br.b==='ANT'?'ANTECEDENTE':br.b==='PRON'?'PRONÓSTICO':'SIN VENTAS',pr:P.esProd(d)?1:0,bp:ctx.bom&&ctx.bom.get(k)||null,bDx:irr?'venta irregular: '+(irr.b==='ANT'?'el antecedente':irr.b==='PRON'?'el pronóstico':'la base')+' ('+(Math.round((irr.c||0)*10)/10)+') se aleja más de '+P.R.IRREG+' veces del promedio de 12 meses ('+(Math.round(ap.W*10)/10)+'), se usa el promedio':br.por,hv:hv?1:0,pex:pexOk,su:su?su.map(x=>[x.o,x.f]):null,mi:D>0?Math.round(d.ex/D*100)/100:null,miB:D>0?Math.round((d.ex+bo)/D*100)/100:null,est,estX:d.estX,
      sA:sug(ap.A),sP:sug(ap.P),s,sE:e.ok?e.q:null,eT:e.ok?e.tipo:null,s0,sE0:e0.ok?e0.q:null,
      mfA:r1(apm.A),mfP:r1(apm.P),mfD:r1(Dm),mfI:inv,mfM:mm==null?null:Math.round(mm*100)/100,
      ...P.mfRegla(inv,Dm,pm,mb),nA:ap.nA,nP:ap.nP,pE:pv.est??null,pD:pv.eD??null,pDx:pv.eDx?1:0,eD:ra.eD,eDx:ra.eDx?1:0,nv:nr.nv,...(se?{se:1}:{}),...(pv.nv!==undefined?{pNv:pv.nv}:{}),dA:nr.dA,fAg:nr.fAg,rd:nr.rd,vr:nr.vr,...(nr.xh&&!P.esProd(d)?{xh:nr.xh}:{}),nt:notas.join(' · ')});
  });
  return out;
};
const EN_RIESGO=['RIESGO','FALTANTE'];
// Foto diaria del cálculo del portal (se guarda un archivo por día): lo necesario para el histórico por clave.
// Meses de inventario con antecedente (mA), pronóstico (mP) y demanda del portal (mi); estatus con cada base.
P.FOTO_CAMPOS=['c','n','m','g','u','abc','comp','rot','ex','exC','rs','hv','bD','bo','boT','lt','pm','A','P','D','mi','miB','est','eA','eP','s','sE','sA','sP','eD','eDx','pE','nv','dA','fAg','rd','se'];
P.foto=res=>res.map(r=>{const o={};P.FOTO_CAMPOS.forEach(k=>{if(r[k]!=null&&r[k]!=='')o[k]=r[k];});if(!r.rs){delete o.rs;delete o.exC;}const q=x=>x>0?Math.round(r.ex/x*100)/100:null;o.mA=q(r.A);o.mP=q(r.P);return o;});
// Rotación con acentos (como la escribe el Excel) para las vistas que agrupan por rotación
P.ROT_X={'SAGRADOS':'SAGRADOS','ALTA ROTACION':'ALTA ROTACIÓN','MEDIA ROTACION':'MEDIA ROTACIÓN','LENTA ROTACION':'LENTA ROTACIÓN','NUEVOS':'NUEVOS','SIN COMPRA':'SIN COMPRA'};
// Fila de la foto en el formato de la hoja Detalle (para reutilizar los tableros que leían el Excel):
// estatus y meses de inventario = los del portal; existencia, BO y parámetros = los del Excel de ese día.
P.fotoADetalle=(r,f)=>({'Fecha':f,'Clave':String(r.c),'Nombre':r.n||'','Marca':r.m||'','Unidad':r.u||'','Clasificación':r.abc||'','Existencias':r.ex||0,'GRUPO':r.g||'','COMPRADOR':r.comp||'',
  'Clasificación por movimiento':P.ROT_X[r.rot]||r.rot||'','Tiempo de entrega':r.lt,'Objetivo_Meses de inventario':r.pm,'Meses de inventario':r.mi==null?'':r.mi,
  'Clasificacion_estatus de inventario':r.est||'','Clasificacion_Punto de reorden':'','Back Order':r.boT!=null?r.boT:(r.bo||0)});
// Racha del estatus del portal: desde qué fecha la clave está en su estatus actual.
// pv = estatus del día anterior {est,eD,eDx}. eDx = la racha empezó antes de lo que el portal tiene registrado ("o más").
P.racha=(pv,est,fecha,prevFecha)=>{
  if(!pv||pv.est==null)return{eD:fecha,eDx:true};
  if(pv.est!==est)return{eD:fecha,eDx:false};
  return pv.eD?{eD:pv.eD,eDx:!!pv.eDx}:{eD:prevFecha||fecha,eDx:true};
};
// Días de la racha contados al día de corte (calendario, incluye ambos días)
P.diasRacha=(eD,fecha)=>eD&&fecha?Math.round((new Date(fecha+'T12:00:00')-new Date(eD+'T12:00:00'))/864e5)+1:null;
// ── Nivel de riesgo (nov-2026): qué tan cerca está la clave del faltante, contra su tiempo de entrega ──
// Venta diaria = demanda del portal ÷ 30.4; si en los últimos RITMO_DIAS días la existencia bajó más rápido (ventas reales día con día),
// se usa ese ritmo (topado a RITMO_MAX × la demanda para no reaccionar a una venta atípica).
// Días para agotarse = existencia ÷ venta diaria. Con T. entrega en días (meses × 30.4):
//   ALTO  = se agota en NIV_DIAS_ALTO días o menos, o antes de la mitad del tiempo de entrega
//   MEDIO = se agota antes de que llegue un pedido colocado hoy (menos que el tiempo de entrega)
//   BAJO  = todavía alcanza a cubrir el tiempo de entrega si se pide ya
P.R.MES_DIAS=30.4;P.R.RITMO_DIAS=14;P.R.RITMO_MIN_DIAS=5;P.R.RITMO_MAX=2;P.R.NIV_ALTO=0.5;P.R.NIV_MEDIO=1;P.R.NIV_DIAS_ALTO=7;
P.NIVELES=['ALTO','MEDIO','BAJO'];
P.nivRank=r=>r&&r.est==='FALTANTE'?0:r&&r.nv==='ALTO'?1:r&&r.nv==='MEDIO'?2:r&&r.nv==='BAJO'?3:4;
// Etiqueta del nivel de riesgo para las tablas (Propuestas, Calendario): «🔴 ALTO · 5d» con fecha estimada en el título
P.nivChip=r=>{if(!r)return'';
  if(r.boCub){const d=r.dA!=null?Math.floor(r.dA):null,f=r.fAg?r.fAg.split('-').reverse().join('/'):'';
    return' <span style="display:inline-block;border-radius:10px;padding:1px 7px;font-size:10.5px;font-weight:700;background:#dbeafe;color:#1e40af;white-space:nowrap" title="Hoy no hay existencia; el BO del CEDI ('+(Math.round((r.boU||r.bo||0)*10)/10)+' pzs) alcanza ~'+(d??'?')+' días'+(f?' (hasta ~'+f+')':'')+(r.nv?' · nivel '+r.nv.toLowerCase()+' contra su tiempo de entrega':'')+'">🚚 cubierto con BO'+(d!=null?' · '+d+'d':'')+'</span>';}
  if(r.se&&r.est==='RIESGO')return' <span style="display:inline-block;border-radius:10px;padding:1px 7px;font-size:10.5px;font-weight:700;background:#eef1f6;color:#64748b;white-space:nowrap" title="Nunca ha tenido entrada (sin compras desde 2024) y no tiene OC en camino: no lleva nivel de riesgo">sin entradas</span>';
  const c={ALTO:['#fde2e0','#b42318','🔴'],MEDIO:['#ffedd5','#9a3412','🟠'],BAJO:['#fef9c3','#854d0e','🟡']}[r.nv];if(!c)return'';
  const d=Math.floor(r.dA||0),f=r.fAg?r.fAg.split('-').reverse().join('/'):'';
  return' <span style="display:inline-block;border-radius:10px;padding:1px 7px;font-size:10.5px;font-weight:700;background:'+c[0]+';color:'+c[1]+';white-space:nowrap" title="Riesgo '+r.nv.toLowerCase()+': se acaba ~'+f+' ('+d+' días) · T. entrega '+Math.round((+r.lt||0)*P.R.MES_DIAS)+' días">'+c[2]+' '+r.nv+' · '+(d<=0?'hoy':d+'d')+'</span>';};
// ── Riesgo con o sin BO (nov-2026) ──
// Por defecto el portal muestra todo SIN BO (solo existencia): es la medición oficial de alarmas, Target, bono e Histórico.
// «Con BO» es una vista para decidir cuánto pedir: suma el BO del CEDI (OCs en camino, sin entregas directas) a la existencia
// para el estatus, el nivel de riesgo, los meses de inventario y la propuesta. Una clave en FALTANTE (existencia 0) sigue en
// FALTANTE pero «cubierta con BO»: su nivel y fecha se calculan con lo que alcanza el BO.
P.R.BO_DEF=false;
P.boEtq=c=>c?'con BO':'sin BO';
P.sugX=(r,X,conBO)=>X==null||P.R.SIN_SUG_ROT.includes(r.rot)?null:Math.max(0,P.ceil3(Number(X)*((Number(r.lt)||0)+(Number(r.pm)||0))-((Number(r.ex)||0)+(conBO?Math.max(0,Number(r.bo)||0):0))));
P.vistaBO=(r,conBO,fecha)=>{
  if(!r)return r;
  const bo=Math.max(0,Number(r.bo)||0),ex=Number(r.ex)||0,D=Number(r.D)||0,lt=Number(r.lt)||0,pm=Number(r.pm)||0;
  const o=Object.assign({},r,{conBO:!!conBO,boU:0});
  if(!conBO){
    if(bo>0){
      // el cálculo publicado guarda la propuesta con BO (s) y sin BO (s0); si es de antes de este cambio, se calcula aquí sin empaque
      if(r.s0!==undefined){o.s=r.s0;o.sE=r.sE0??null;}else{o.s=P.sugX(r,r.D,false);o.sE=null;}
      o.sA=P.sugX(r,r.A,false);o.sP=P.sugX(r,r.P,false);
    }
    return o;
  }
  if(!(bo>0))return o;
  o.boU=bo;o.est0=r.est;o.nv0=r.nv||null;
  o.mi=r.miB!=null?r.miB:(D>0?Math.round((ex+bo)/D*100)/100:null);
  const rd=Number(r.rd)||(D>0?D/P.R.MES_DIAS:0),LTd=lt*P.R.MES_DIAS;
  const niv=q=>{if(!(rd>0))return{nv:null,dA:null,fAg:null};const dA=Math.max(0,q)/rd;
    return{dA:Math.round(dA*10)/10,fAg:fecha?P.addDias(fecha,Math.floor(dA)):null,nv:dA<=P.R.NIV_DIAS_ALTO||(LTd>0&&dA<=LTd*P.R.NIV_ALTO)?'ALTO':LTd>0&&dA<LTd*P.R.NIV_MEDIO?'MEDIO':'BAJO'};};
  if(r.est==='FALTANTE'){o.boCub=1;Object.assign(o,niv(bo));}
  else if(D>0&&['RIESGO','OPTIMO','SOBRE INVENTARIO'].includes(r.est)){
    o.est=P.clasificar((ex+bo)/D,lt,pm,r.est);
    Object.assign(o,o.est==='RIESGO'&&!r.se?niv(ex+bo):{nv:null,dA:null,fAg:null});
  }
  const eX=(X,e)=>Number(X)>0&&['RIESGO','OPTIMO','SOBRE INVENTARIO'].includes(e)?P.clasificar((ex+bo)/Number(X),lt,pm,e):e;
  if(r.eA!=null)o.eA=eX(r.A,r.eA);if(r.eP!=null)o.eP=eX(r.P,r.eP);
  return o;
};
P.aplicarBO=(rows,conBO,fecha)=>(rows||[]).map(r=>P.vistaBO(r,conBO,fecha));
P.addDias=(f,n)=>{const d=new Date(f+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+P.pad(d.getMonth()+1)+'-'+P.pad(d.getDate());};
P.difDias=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
// Ritmo real de salida (piezas/día) con la existencia de los días anteriores: solo cuentan los tramos en que la existencia bajó o se quedó igual
// (si subió hubo una recepción y ese tramo no se puede medir; si estaba en 0 no había qué vender).
P.ritmo=(xh,fecha,ex)=>{
  const pts=(xh||[]).filter(x=>x&&x[0]<fecha&&P.difDias(x[0],fecha)<=P.R.RITMO_DIAS).concat([[fecha,ex]]).sort((a,b)=>a[0]<b[0]?-1:1);
  let dias=0,cons=0;for(let i=1;i<pts.length;i++){const dd=P.difDias(pts[i-1][0],pts[i][0]);if(dd<=0)continue;const a=pts[i-1][1],b=pts[i][1];if(!(a>0)||b>a)continue;cons+=a-b;dias+=dd;}
  return{vr:dias>=P.R.RITMO_MIN_DIAS?cons/dias:null,dias,xh:pts.slice(-(P.R.RITMO_DIAS+1))};
};
P.nivelRiesgo=(ex,D,lt,est,fecha,xh)=>{
  const rt=D>0?P.ritmo(xh,fecha,ex):{vr:null,xh:null};
  const Dd=D>0?D/P.R.MES_DIAS:0;let rd=Dd;if(rt.vr!=null&&rt.vr>Dd)rd=Math.min(rt.vr,Dd*P.R.RITMO_MAX);
  const o={nv:null,dA:null,fAg:null,rd:rd>0?Math.round(rd*1000)/1000:null,vr:rt.vr!=null?Math.round(rt.vr*1000)/1000:null,xh:rt.xh};
  if(est!=='RIESGO'||!(rd>0))return o;
  const dA=Math.max(0,ex)/rd,LTd=(Number(lt)||0)*P.R.MES_DIAS;
  o.dA=Math.round(dA*10)/10;o.fAg=P.addDias(fecha,Math.floor(dA));
  o.nv=dA<=P.R.NIV_DIAS_ALTO||(LTd>0&&dA<=LTd*P.R.NIV_ALTO)?'ALTO':LTd>0&&dA<LTd*P.R.NIV_MEDIO?'MEDIO':'BAJO';
  return o;
};
// ── Explicación mes a mes de una clave (tablero): qué meses entraron al antecedente y al pronóstico y por qué se descartaron otros.
// Usa exactamente las mismas reglas que P.antPron (hay prueba que lo verifica).
P.explicar=(meses,ed,ref,N,agot,ultimo,primero)=>{
  if(ultimo&&ultimo>=ref)ultimo=P.ym(ref,-1);
  const sv=P.serie(meses,ed);const sAll=sv.s;const s={};Object.keys(sAll).forEach(m=>{if(m<ref)s[m]=sAll[m];});   // igual que el cálculo: sin el mes en curso
  const fin=ultimo&&ultimo<P.ym(ref,-1)?ultimo:P.ym(ref,-1);
  const conVenta=Object.keys(s).filter(m=>s[m]>0).sort();const ini=conVenta[0]||null;const hi=ultimo||fin;
  const por=m=>ini==null||m<ini?'antes de la primera venta':agot(m)?'agotado (más de '+(P.R.DIAS_AGOTADO-1)+' días sin existencia)':P.sospechoso(s,m,primero,hi)?'cero sospechoso de agotado':null;
  const out=new Map();
  const reg=(m,win)=>{
    const o=out.get(m)||{m,venta:meses&&meses[m]!=null?meses[m]:null,limpia:s[m]!=null?s[m]:null,ed:sv.ed.includes(m),usa:[]};
    const x=por(m);if(x){o.excluido=x;out.set(m,o);return false;}
    const r=P.valor(s,m);if(r.at)o.atipico=r.at;if(r.v==null){o.excluido='atípico descartado (>'+P.R.ATIPICO+'× mediana)';out.set(m,o);return false;}
    o.valor=r.v;if(win)o.usa.push(win);out.set(m,o);return true;};
  let n=0;for(let i=0;i<P.R.VENTANA_ATRAS&&n<N;i++){const m=P.ym(fin,-i);if(reg(m,'ANT'))n++;}
  for(let i=0;i<N;i++){const m=P.ym(ref,i-12);if(ultimo&&m>ultimo)continue;reg(m,'PRON');}
  for(let i=1;i<=24;i++){const m=P.ym(ref,-i);if(!out.has(m)&&(!ultimo||m<=ultimo))reg(m,null);}
  // Mes en curso: solo para seguimiento (venta parcial), no cuenta para el cálculo
  if(meses&&meses[ref]!=null)out.set(ref,{m:ref,venta:meses[ref],limpia:sAll[ref]!=null?sAll[ref]:meses[ref],ed:sv.ed.includes(ref),usa:[],actual:true});
  return[...out.values()].sort((a,b)=>a.m<b.m?-1:1);
};
// ── Unidades de medida (reporte RP03-08 «Existencias con todas las unidades», plan_tablas_27.sql) ──
// Las OCs se capturan en unidad de compra; el portal trabaja en unidad mínima.
// Factor exacto = PZASXUNI_COMPRA ÷ PZASXUNIDAD_MINIMA (unidades mínimas por 1 unidad de compra). Solo se guardan las claves con factor ≠ 1.
// CSV → matriz de textos (comillas dobles, comas dentro de comillas y saltos de línea dentro de un campo)
P.csv=t=>{
  const out=[];let f=[],c='',q=false;t=String(t||'').replace(/^\uFEFF/,'');
  for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}
    else if(ch==='"')q=true;
    else if(ch===','){f.push(c);c='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;f.push(c);c='';out.push(f);f=[];}
    else c+=ch;}
  if(c!==''||f.length){f.push(c);out.push(f);}
  return out;
};
P.unidadesRP=aoa=>{
  const h=P.header(aoa,['IDARTICULO','UNIDAD_COMPRA','PZASXUNI_COMPRA','UNIDAD_MINIMA','PZASXUNIDAD_MINIMA']);
  if(!h)throw new Error('No encontré los encabezados del RP03-08 (IDARTICULO, UNIDAD_COMPRA, PZASXUNI_COMPRA, UNIDAD_MINIMA, PZASXUNIDAD_MINIMA).');
  const m=new Map();let total=0,sinDato=0;
  for(let i=h.fila+1;i<aoa.length;i++){
    const r=aoa[i];const k=P.clave(r[h.idx.IDARTICULO]);if(k==null)continue;total++;
    const pc=P.num(r[h.idx.PZASXUNI_COMPRA]),pm=P.num(r[h.idx.PZASXUNIDAD_MINIMA]);
    if(!(pc>0)||!(pm>0)){sinDato++;continue;}
    const f=Math.round(pc/pm*1e6)/1e6;if(!(f>0)||Math.abs(f-1)<1e-6)continue;
    m.set(k,{clave:k,uni_compra:String(r[h.idx.UNIDAD_COMPRA]||'').trim()||null,uni_min:String(r[h.idx.UNIDAD_MINIMA]||'').trim()||null,factor:f});
  }
  return{rows:[...m.values()],total,sinDato};
};
P.UNI=null;let _uniP=null;   // Map clave → {uc,um,f}; se lee una vez por página
P.uniCargar=sb=>_uniP||(_uniP=(async()=>{
  const m=new Map();
  try{for(let i=0;i<20000;i+=1000){
    const{data,error}=await sb.from('plan_unidades').select('clave,uni_compra,uni_min,f_compra').order('clave').range(i,i+999);
    if(error)throw error;(data||[]).forEach(x=>{const f=Number(x.f_compra);if(f>0)m.set(Number(x.clave),{uc:x.uni_compra||'',um:x.uni_min||'',f});});
    if(!data||data.length<1000)break;}
  }catch(e){console.warn('Unidades RP03-08:',e.message||e);}
  P.UNI=m;return m;})());
// Conversión de las cantidades de OC de una clave a su unidad.
//  · con RP03-08 cargado: factor exacto (src 'rp'); las claves que no vienen ahí se compran en su misma unidad (f=1)
//  · sin RP03-08: aproximación BO total ÷ suma de pendientes de las OCs (src 'bo'), solo si difieren más de 3 %
// r: fila del cálculo (c,u,boT,bo) · ocs: [[folio,pend,…]] o null
P.ocUni=(r,ocs)=>{
  const U=P.UNI,u=U&&r?U.get(Number(r.c)):null;
  if(u)return{f:u.f,uc:u.uc,um:(r&&r.u)||u.um,src:'rp',conv:true};
  if(U&&U.size)return{f:1,conv:false};
  let s=0;(ocs||[]).forEach(o=>s+=Number(o[1])||0);const bo=r?Number(r.boT!=null?r.boT:r.bo)||0:0;
  if(s>0&&bo>0&&Math.abs(bo/s-1)>0.03)return{f:bo/s,uc:'',um:(r&&r.u)||'',src:'bo',conv:true};
  return{f:1,conv:false};
};
P.ocCant=(q,U)=>{const v=(Number(q)||0)*(U&&U.conv?U.f:1);return Math.round(v*100)/100;};
// Aviso y renglones de «OCs abiertas» ya en la unidad de la clave (HTML). fN: formato de número, fF: de fecha, esc: escape
P.ocAviso=(U,r,fN)=>!U||!U.conv?'':'<span style="color:#b45309">'+(U.src==='rp'
  ?'Las OCs de esta clave se capturan en '+(U.uc||'otra unidad')+'; aquí se muestran en '+(U.um||'la unidad de la clave')+' (1 '+(U.uc||'unidad de compra')+' = '+fN(U.f,3)+' '+(U.um||'')+', RP03-08).'
  :'Las OCs de esta clave se capturan en otra unidad: 1 unidad de compra ≈ '+fN(U.f,3)+' '+(U.um||'')+' (aproximado con el BO; carga el RP03-08 en Admin para el factor exacto).')+'</span><br>';
P.ocRenglon=(o,U,fN,fF,esc,extra)=>'OC '+o[0]+' · '+(U&&U.conv?(U.src==='bo'?'≈ ':'')+'<b>'+fN(P.ocCant(o[1],U))+' '+esc(U.um||'')+'</b> pend. <span style="opacity:.7">('+fN(o[1])+' '+esc(U.uc||'en unidad de compra')+')</span>':fN(o[1])+' pend.')+' · '+fF(o[2])+' · '+esc(o[3])+(extra!=null?extra:(o[4]?' · entrega directa':''));

// Fracción del BO que llega al CEDI por clave = pendiente de OCs al CEDI ÷ pendiente total (CEDI + entrega directa).
// Se usa proporción porque la cantidad de la OC puede venir en unidad de compra y el BO en unidad de inventario.
P.fracBoCEDI=(cur,enc,sinED)=>{
  const g=new Map();
  (cur?[...cur.values()]:[]).forEach(l=>{const p=Number(l.cantidad_pend)||0;if(p<=0)return;const e=enc&&enc.get(Number(l.folio));const ed=P.edOC(l.folio,e&&e.destino,l.comprador||(e&&e.comprador),sinED);
    const o=g.get(l.clave)||{t:0,ed:0};o.t+=p;if(ed)o.ed+=p;g.set(l.clave,o);});
  const m=new Map();g.forEach((o,k)=>{if(o.ed>0)m.set(k,(o.t-o.ed)/o.t);});return m;
};
// Conteo de claves por estatus para la tendencia del tablero (una fila por comprador, base y estatus)
P.histEstatus=(res,fecha)=>{
  const g={};const add=(c,b,e)=>{if(!e)return;const k=c+'|'+b+'|'+e;g[k]=(g[k]||0)+1;};
  res.forEach(r=>{if(r.pr)return;const c=r.comp||'(SIN COMPRADOR)';add(c,'PORTAL',r.est);add(c,'ANT',r.eA||'SIN CONSUMO');add(c,'PRON',r.eP||'SIN CONSUMO');add(c,'EXCEL',r.estX||'(VACÍO)');});
  return Object.entries(g).map(([k,n])=>{const[c,b,e]=k.split('|');return{fecha,comprador:c,base:b,estatus:e,claves:n};});
};
// Lo que sugería el portal (último cálculo publicado) cuando aparece una OC nueva
// (siempre trae todas las columnas: en un upsert por lotes una columna faltante se guardaría como vacía)
P.sugOC=(r,fecha)=>({sug_fecha:r?fecha:null,sug_portal:r?r.s:null,sug_empaque:r?r.sE:null,sug_ant:r?r.sA:null,sug_pron:r?r.sP:null,sug_estatus:r?r.est:null,sug_demanda:r?r.D:null});
// Pedido vs sugerencia del portal. ped y sug en la unidad de inventario. Tolerancia ±40% (la misma del tablero actual de Pedidos propuestos)
P.R.TOL_PEDIDO=40;
P.precisionOC=(ped,sug)=>{
  if(sug==null||ped==null)return{res:'NO EVALUABLE',desv:null};
  if(sug<=0)return{res:ped>0?'PEDIDO SIN SUGERENCIA':'ACERTADA',desv:null};
  const d=Math.round((ped-sug)/sug*100);
  return{res:Math.abs(d)<=P.R.TOL_PEDIDO?'ACERTADA':'DESVIADA',desv:d};
};
// Compara contra el día anterior: claves que ENTRAN a riesgo (alarma) y las que salen (cierre)
P.alarmas=(prev,prevEst,res,fecha,restr)=>{
  const nuevas=[],cierres=[],set=[];
  res.forEach(r=>{
    if(r.pr)return;   // producción no genera alarmas
    const enR=EN_RIESGO.includes(r.est);if(enR)set.push(r.c);
    if(enR&&!prev.has(r.c)){
      if(P.R.EXCLUIR_ROT.includes(r.rot)||!r.D||r.se)return;   // se = nunca ha tenido entrada
      const directo=r.est==='FALTANTE';
      nuevas.push({clave:r.c,comprador:r.comp,rotacion:r.rot,fecha_alarma:fecha,tipo:directo?'FALTANTE_DIRECTO':'RIESGO',
        n_meses:r.N,t_entrega:r.lt,objetivo_meses:r.pm,antecedente:r.A,pronostico:r.P,demanda:r.D,existencias:r.ex,bo:r.bo,meses_inv:r.mi,
        sugerida:r.s,sugerida_empaque:r.sE,resultado_target:restr.has(r.c+'|'+r.comp)?'EXCLUIDA':(r.mfF&&r.s>0&&r.mfX>=r.s?'EN REVISION GERENCIA':null),
        nota:[directo?'Posible venta atípica (pasó directo a FALTANTE)':'',restr.has(r.c+'|'+r.comp)?'Clave restringida':'',r.mfF&&r.s>0&&r.mfX>=r.s?'Excedente MF ('+r.mfX+') cubre la sugerencia: revisar redistribución con gerencia':r.mfF?'MF con más de '+P.R.MF_MESES_REV+' meses, pero su excedente no cubre la sugerencia':''].filter(Boolean).join(' · ')||null});
    }
  });
  const cur=new Set(set);prev.forEach(k=>{if(!cur.has(k))cierres.push(k);});
  return{nuevas,cierres,set};
};
// ══ OCs ══
// Líneas pendientes de "Productos Incluidos en" → Map 'folio|clave' → línea
P.ocLineas=wb=>{
  const ws=P.hoja(wb,['Productos Incluidos en']);if(!ws)return null;
  const aoa=P.aoa(ws);const h=P.header(aoa,['FOLIO OC','FECHA OC','CLAVE','CANTIDAD PED','CANTIDAD PEND','FECHA ENTREGA']);
  if(!h)throw new Error('La hoja Productos Incluidos en no trae FOLIO OC, FECHA OC, CLAVE, CANTIDAD PED, CANTIDAD PEND y FECHA ENTREGA.');
  const iP=h.cols.indexOf('PROVEEDOR'),iC=h.cols.indexOf('COMPRADOR'),iE=h.cols.indexOf('ESTADO OC');
  const m=new Map();
  for(let i=h.fila+1;i<aoa.length;i++){
    const r=aoa[i];const f=P.clave(r[h.idx['FOLIO OC']]),k=P.clave(r[h.idx.CLAVE]);if(f==null||k==null)continue;
    const key=f+'|'+k;const ped=P.num(r[h.idx['CANTIDAD PED']])||0,pend=P.num(r[h.idx['CANTIDAD PEND']])||0;
    const prev=m.get(key);
    if(prev){prev.cantidad_ped+=ped;prev.cantidad_pend+=pend;continue;}   // misma clave repetida en la OC: se suma
    m.set(key,{folio:f,clave:k,fecha_oc:P.fecha(r[h.idx['FECHA OC']]),proveedor:iP>=0?String(r[iP]).trim():null,comprador:iC>=0?P.norm(r[iC]):null,
      cantidad_ped:ped,cantidad_pend:pend,fecha_entrega:P.fecha(r[h.idx['FECHA ENTREGA']]),estado_oc:iE>=0?P.norm(r[iE]):null});
  }
  return m;
};
// ── Entrega directa: la sucursal de destino aparece en Observaciones de RP01-23 ──
// Cuenta si la sucursal está al inicio (opcionalmente tras "MAS FERRE", "SANVER", "CIUDAD/CD"),
// o después de "ENTREGAR EN", "SUC./SUCURSAL" o "PARA". Así se evitan falsos como
// "CEMENTO BLANCO MORA" (marca) o "RECOLECCION TAMPICO".
P.R.SANVER_SUC_ES_ED=false;  // "SANVER ALAMO", "SANVER LA FUENTE": entran al CEDI (confirmado por Compras, 14-oct-2026)
P.SUCURSALES=['AHUATENO','ALAMO','ARISTA','ATLAPEXCO','BODEGA','CENTRO','CHICONTEPEC','COATZINTLA','DEL CARMEN','EL CARMEN','EBANO','LA FUENTE','LA RIVERA','MANTE','MARTINEZ','MERCADO','MORA','NARANJOS','PINTURAS','PUEBLO VIEJO','TAMIAHUA','TAMPICO','TEMPOAL','TIHUATLAN','TUXPAN','VALLES','VALLEZ','ZACATIPAN'];
// Lugares y frases extra de entrega directa (se configuran en Cálculo diario → Entregas directas; plan_config id 'ed_destinos')
P.R.ED_LUGARES=[];P.R.ED_FRASES=[];
P.aplicarCfgED=v=>{const L=x=>(Array.isArray(x)?x:[]).map(P.norm).filter(Boolean);P.R.ED_LUGARES=L(v&&v.lugares);P.R.ED_FRASES=L(v&&v.frases);P.R.ED_REVISAR=v&&Array.isArray(v.revisar)?L(v.revisar):P.R.ED_REVISAR_DEF.slice();};
// Palabras que vuelven dudosa una OC de entrega directa (la sucursal puede ser solo la razón del descuento, no el destino)
P.R.ED_REVISAR_DEF=['APERTURA','APOYO','PAGO EN ESPECIE','BONIFICA','BONIFICADO','PROMO','PROMOCION','DESCUENTO','SIN CARGO'];P.R.ED_REVISAR=P.R.ED_REVISAR_DEF.slice();
P.edRevisar=obs=>{const o=P.norm(obs||'');return P.R.ED_REVISAR.find(w=>new RegExp('(?:^|[^A-Z])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Z])').test(o))||null;};
const escRx=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
P.destinoED=obs=>{
  const o=P.norm(obs).replace(/^[^A-Z0-9]+/,'');if(!o)return null;
  const LUG=[...P.SUCURSALES,...P.R.ED_LUGARES.map(escRx)].sort((a,b)=>b.length-a.length);
  const ALT='(?:CIUDAD |CD\\.? )?('+LUG.join('|')+')(?![A-Z])',SUC='(?:SUC(?:URSAL)?\\.? )?';
  const pre='(?:MAS FERRE(?:TERIAS)?\\.? (?:SANVER )?|MF )?'+(P.R.SANVER_SUC_ES_ED?'(?:SANVER (?!FORTE))?':'');
  const rx=[new RegExp('^'+pre+SUC+ALT),new RegExp('ENTREGA(?:R)? (?:EN )?'+SUC+ALT),new RegExp('(?:^|[^A-Z])SUC(?:URSAL)?\\.? '+ALT),new RegExp('(?:^|[^A-Z])PARA (?:LA )?'+SUC+ALT)];
  for(const r of rx){const m=o.match(r);if(m)return m[1]==='VALLEZ'?'VALLES':m[1]==='EL CARMEN'?'DEL CARMEN':m[1];}
  // Lugares extra (obras, ciudades sin sucursal) en cualquier parte del texto, y frases que indican entrega directa
  for(const l of P.R.ED_LUGARES)if(new RegExp('(?:^|[^A-Z])'+escRx(l)+'(?![A-Z])').test(o))return l;
  for(const f of P.R.ED_FRASES)if(new RegExp('(?:^|[^A-Z])'+escRx(f)+'(?![A-Z])').test(o))return f;
  return null;
};
// ── Entregas directas extra para limpiar la venta (además del archivo Compras por ID) ──
// 1) Recepciones (plan_recepciones) de OCs marcadas como entrega directa a un lugar SIN sucursal (Lugares/Frases configurados):
//    Compras por ID las registra como "ENTREGA EN CEDI". 2) Ajustes manuales capturados en Admin (plan_config id 'ed_manual').
// Por clave-mes: max(Compras por ID, recepciones) + manual.
P.esLugarExtra=d=>!!d&&!P.SUCURSALES.includes(d)&&d!=='VALLES'&&d!=='DEL CARMEN';
P.edAuto=(recep,lineas)=>{const m=new Map();(recep||[]).forEach(r=>{const l=lineas.get(Number(r.folio)+'|'+Number(r.clave));if(!l||!l.entrega_directa||!P.esLugarExtra(l.destino))return;
  const k=Number(r.clave),mes=String(r.fecha).slice(0,7),q=+r.cantidad||0;if(q<=0)return;const o=m.get(k)||{};o[mes]=(o[mes]||0)+q;m.set(k,o);});return m;};
P.edManualMapa=list=>{const m=new Map();(Array.isArray(list)?list:[]).forEach(x=>{const k=Number(x.clave),mes=String(x.mes||'').slice(0,7),q=+x.cantidad||0;if(!k||!/^\d{4}-\d{2}$/.test(mes)||q<=0)return;const o=m.get(k)||{};o[mes]=(o[mes]||0)+q;m.set(k,o);});return m;};
P.mezclarED=(ed,auto,man)=>{const out=Object.assign({},ed||{});
  Object.entries(auto||{}).forEach(([m,q])=>{out[m]=Math.max(out[m]||0,q);});Object.entries(man||{}).forEach(([m,q])=>{out[m]=(out[m]||0)+q;});return out;};
// Para las fichas: agrega a o.ed (compras ED de la clave) las recepciones a lugares sin sucursal y los ajustes manuales
P.edExtraClave=async(sb,c,o)=>{
  try{const k=Number(c);const[rc,ln,cf]=await Promise.all([sb.from('plan_recepciones').select('folio,clave,fecha,cantidad').eq('clave',k),
      sb.from('plan_oc_lineas').select('folio,clave,destino,entrega_directa').eq('clave',k).eq('entrega_directa',true),
      sb.from('plan_config').select('valor').eq('id','ed_manual').maybeSingle()]);
    const L=new Map((ln.data||[]).map(l=>[Number(l.folio)+'|'+Number(l.clave),l]));const a=P.edAuto(rc.data||[],L).get(k);const mn=P.edManualMapa(cf.data&&cf.data.valor).get(k);
    if(a||mn){o.ed=P.mezclarED(o.ed,a,mn);o.edExtra={auto:a||null,manual:mn||null};}
  }catch(e){}
  return o;
};
// ── Producción (oct-2026) ──
// Claves de comprador PRODUCCION: se calculan igual pero NO cuentan en faltantes, bono, alarmas, seguimiento ni conteos.
P.esProd=r=>P.norm(r&&(r.comp!=null?r.comp:r.comprador))==='PRODUCCION';
// Hoja "Base produccion": producto (ID) ← insumo (CLAVE). Cantidad Requerida es por unidad de compra del producto (p. ej. paquete de 10);
// la venta del producto viene en su unidad básica, así que el factor por unidad vendida = Cantidad Requerida ÷ PZASXUNIDAD BV del producto
// (comprobado con la venta: cuadra en 247 de 267 insumos cuyos productos vienen por paquete).
P.pzEnNombre=(d,z)=>{const t=P.norm(d).replace(/,/g,'.');const n=String(Math.round(z*1000)/1000);
  return new RegExp('(^|[^0-9.])(C/\\s*)?'+n.replace('.','\\.')+'\\s*(PZ|PZS|PZA|PZAS|PIEZAS|PIEZA)(\\b|\\.|$)').test(t);};
P.baseProduccion=wb=>{
  const ws=P.hoja(wb,['Base produccion','Base producción']);if(!ws)return null;
  const aoa=P.aoa(ws);const h=P.header(aoa,['ID','CLAVE','CANTIDAD REQUERIDA']);if(!h)return null;
  const iD=h.cols.indexOf('DESCRIPCION'),iZ=h.cols.indexOf('PZASXUNIDAD BV'),iUB=h.cols.findIndex(c=>/^UNIDAD BASICA/.test(c)),iUM=h.cols.findIndex(c=>/^UNIDAD MINIMA/.test(c)),out=[],vis=new Set();
  for(let i=h.fila+1;i<aoa.length;i++){const r=aoa[i];const pr=P.clave(r[h.idx.ID]),ins=P.clave(r[h.idx.CLAVE]),q=P.num(r[h.idx['CANTIDAD REQUERIDA']]);
    if(pr==null||ins==null||!(q>0))continue;const k=pr+'|'+ins;if(vis.has(k))continue;vis.add(k);
    // [producto, insumo, factor por unidad del portal, cantidad requerida, piezas por unidad del producto, unidad mínima, unidad básica]
    let z=iZ>=0?P.num(r[iZ]):null;z=z>0?z:1;
    // Si la descripción del producto dice que su unidad YA es el paquete (p. ej. "GKA 50PZ" con 50 piezas por bolsa), la pieza del
    // Excel es la bolsa completa: la cantidad requerida se usa tal cual (no se divide entre las piezas por unidad)
    const pzNom=z>1&&P.pzEnNombre(iD>=0?r[iD]:'',z);
    out.push([pr,ins,Math.round(q/(pzNom?1:z)*1e6)/1e6,q,pzNom?1:z,iUM>=0?P.norm(r[iUM]):'',iUB>=0?P.norm(r[iUB]):'',pzNom?z:0]);}
  return out;
};
// Venta mensual de los productos de un insumo (para la ficha)
P.ventasProductos=async(sb,bp)=>{const m=new Map();if(!bp||!bp.length)return m;
  try{const{data}=await sb.from('plan_ventas').select('clave,meses').eq('empresa','SANVER').in('clave',bp.map(x=>Number(x[0])));(data||[]).forEach(r=>m.set(Number(r.clave),r.meses||{}));}catch(e){}return m;};
// Bloque "Producción" de la ficha de un insumo. r = fila del insumo; get(clave) = fila del cálculo del producto; vp = Map(clave→meses); ref = AAAA-MM del cálculo
P.produccionHTML=(r,get,vp,ref)=>{
  if(!r||!r.bp||!r.bp.length)return'';
  const e=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const n=(v,d)=>v==null||isNaN(v)?'—':Number(v).toLocaleString('es-MX',{maximumFractionDigits:d==null?(Math.abs(v)<10?1:0):d});
  const COL={FALTANTE:'#e11d48',RIESGO:'#d97706',OPTIMO:'#059669','SOBRE INVENTARIO':'#2563eb',NUEVA:'#0891b2','SIN MOVIMIENTO':'#a16207','SIN COMPRA':'#94a3b8'};
  const tag=t=>t?'<span style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;color:'+(COL[t]||'#64748b')+';background:'+(COL[t]||'#64748b')+'1a">'+e(t.charAt(0)+t.slice(1).toLowerCase())+'</span>':'—';
  const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  let tot=0;const av=[];
  const filas=r.bp.map(x=>{const[pc,q]=x;const p=get(pc);const v=vp&&vp.get(Number(pc))||{};
    const ult=[];for(let i=6;i>=1;i--){const m=P.ym(ref,-i);ult.push(MES[+m.slice(5,7)]+' '+n(v[m]||0,0));}
    const eq=p&&p.D>0?p.D*q:null;if(eq)tot+=eq;
    if(p&&(p.est==='FALTANTE'||p.est==='RIESGO'))av.push(pc+' en '+p.est.toLowerCase()+': con la existencia del insumo ('+n(r.exC!=null?r.exC:r.ex)+') se pueden producir '+n(Math.floor((r.exC!=null?r.exC:r.ex)/q),0)+' piezas');
    return '<tr><td><b>'+pc+'</b> <span style="color:#64748b">'+e(p?(p.n||'').slice(0,46):'(no viene en el cálculo del día)')+'</span></td><td style="text-align:right" title="'+e(P.recetaTxt(x))+'">'+n(q,3)+(x[2]!=null?'<div style="font-size:10.5px;color:#64748b;white-space:normal;max-width:220px;text-align:right">'+e(P.recetaTxt(x))+'</div>':'')+'</td><td style="text-align:right">'+(p?n(p.ex,0):'—')+'</td><td style="text-align:right">'+(p?n(p.D):'—')+'</td><td style="text-align:right">'+(p&&p.mi!=null?n(p.mi):'—')+'</td><td>'+(p?tag(p.est):'—')+'</td><td style="text-align:right">'+(eq!=null?n(eq):'—')+'</td><td style="color:#64748b;font-size:11px">'+ult.join(' · ')+'</td></tr>';}).join('');
  const exI=r.exC!=null?r.exC:r.ex;
  return '<div style="margin-top:12px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;padding:10px 12px"><b style="font-size:12.5px;color:#9a3412">🏭 Producción</b> <span style="font-size:11.5px;color:#64748b">este insumo se usa en '+r.bp.length+' producto'+(r.bp.length>1?'s':'')+' (su consumo ya está sumado en la venta del insumo; las claves de producción no cuentan en faltantes ni seguimiento)</span>'
    +'<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="color:#9a3412;text-align:left"><th>Producto</th><th style="text-align:right" title="Cantidad de insumo por unidad vendida del producto (Cantidad Requerida ÷ piezas por unidad)">Insumo por unidad</th><th style="text-align:right">Exist.</th><th style="text-align:right">Demanda/mes</th><th style="text-align:right">Meses</th><th>Estatus</th><th style="text-align:right">Consumo equiv. insumo/mes</th><th>Venta últimos 6 meses</th></tr></thead><tbody>'+filas+'</tbody></table></div>'
    +'<div style="font-size:12px;margin-top:6px">Consumo equivalente total: <b>'+n(tot)+'</b> / mes'+(r.D>0?' (demanda del insumo '+n(r.D)+', que ya lo incluye)':'')+(tot>0?' · la existencia del insumo ('+n(exI,0)+') alcanza para <b>'+n(exI/tot)+'</b> meses de producción':'')+'</div>'
    +(av.length?'<div style="font-size:12px;color:#b45309;margin-top:4px">⚠️ '+av.map(e).join('<br>⚠️ ')+'</div>':'')+'</div>';
};
// Consumo por producción (oct-2026): la Plantilla de ventas trae la venta NETA (directa). A cada insumo se le suma, por mes,
// la venta SANVER de sus productos × insumo por unidad vendida. No cuentan las ventas MF (no salen de producción del CEDI)
// ni las autoreferencias producto = insumo (reempaque de la misma clave).
P.aplicarProduccion=(ctx)=>{
  if(!ctx.bom||!ctx.bom.size)return 0;const V=ctx.ventas.SANVER;const add=new Map();ctx.prodCons=new Map();
  ctx.bom.forEach((lst,ins)=>{const og=lst.filter(([p])=>Number(p)!==Number(ins)).map(([p,f])=>({o:Number(p),f,meses:V.get(Number(p))})).filter(x=>x.meses);
    if(!og.length)return;add.set(ins,P.mezclarSust(V.get(ins),og).meses);ctx.prodCons.set(ins,og.map(x=>[x.o,x.f]));});
  add.forEach((m,k)=>V.set(k,m));return add.size;
};
// Para la ficha: suma a o.ventas.SANVER del insumo el consumo de sus productos y deja o.prod = {lst:[[producto,factor]], parte:{mes:[[producto,cant]]}}
let _bomCache=null;
P.ventasConProduccion=async(sb,c,o)=>{
  try{
    if(!_bomCache){const{data}=await sb.from('plan_config').select('valor').eq('id','base_produccion').maybeSingle();_bomCache=P.bomInsumos(data&&Array.isArray(data.valor)?data.valor:[]);}
    const lst=(_bomCache.get(Number(c))||[]).filter(([p])=>Number(p)!==Number(c));if(!lst.length)return o;
    const{data}=await sb.from('plan_ventas').select('clave,meses').eq('empresa','SANVER').in('clave',lst.map(x=>Number(x[0])));
    const og=lst.map(([p,f])=>({o:Number(p),f,meses:((data||[]).find(r=>Number(r.clave)===Number(p))||{}).meses})).filter(x=>x.meses);
    if(!og.length)return o;const mz=P.mezclarSust(o.ventas.SANVER,og);o.ventas.SANVER=mz.meses;o.prod={lst,parte:mz.parte};
  }catch(e){}
  return o;
};
// Mapa insumo → [[producto, cantidad por unidad de producto]]
P.bomInsumos=lst=>{const m=new Map();(lst||[]).forEach(([pr,ins,q,...rec])=>{(m.get(ins)||m.set(ins,[]).get(ins)).push([pr,q,...rec]);});return m;};
// Receta en palabras: x = [producto, factor, cantidad requerida, piezas por unidad, unidad mínima, unidad básica]
// p. ej. "0.5 bolsa por bolsa de 50 pzas → 0.01 por pieza vendida (el portal cuenta este producto en piezas)"
P.recetaTxt=x=>{const f=Number(x[1]),q=x[2],z=Number(x[3])||1,um=String(x[4]||'').toLowerCase(),ub=String(x[5]||'').toLowerCase();
  const n=(v,d)=>Number(v).toLocaleString('es-MX',{maximumFractionDigits:d});
  if(q==null)return'×'+n(f,3);
  const pl=(u,c)=>!u||c===1?u:/[aeiou]$/.test(u)?u+'s':u+'es';
  if(z>1)return n(q,3)+' '+pl(um,q)+' por cada '+(ub||'unidad')+' de '+n(z,2)+' → '+n(f,4)+' por unidad suelta (el Excel cuenta este producto por pieza o kilo, no por '+(ub||'unidad')+')';
  if(Number(x[6])>1)return n(q,3)+' '+pl(um,q)+' por cada '+(ub||'unidad')+' (en el Excel la pieza es la '+(ub||'unidad')+' de '+n(x[6],0)+' pzas, según su descripción)';
  return n(q,3)+' '+pl(um,q)+' por cada '+(ub||'unidad');};
// Compradores que reciben en sucursal y después mueven la mercancía al CEDI: sus OCs NO son entrega directa
// aunque Observaciones traiga una sucursal. La lista se edita en Cálculo diario (tabla plan_config); esta es la de arranque.
P.R.SIN_ED_DEF=['IVAN','MYRIAM VIDA CHRISTELL','KARLA ANAID','JISHELL MARINTHYA'];
P.esED=(destino,comprador,sinED)=>!!destino&&!(sinED||new Set(P.R.SIN_ED_DEF)).has(P.norm(comprador||''));
// Tipo de entrega definido a mano por OC (plan_oc_tipo): manda sobre la regla de observaciones. folio → 'ED' | 'CEDI'
P.R.OC_TIPO=new Map();
P.edOC=(folio,destino,comprador,sinED)=>{const t=P.R.OC_TIPO.get(Number(folio));return t?t==='ED':P.esED(destino,comprador,sinED);};
// ¿La observación deja dudas? (no nombra sucursal: solo una frase como «ENTREGA DIRECTA» o un lugar sin sucursal)
P.edDudosa=obs=>{const d=P.destinoED(obs||'');return!d||P.esLugarExtra(d);};
// Encabezados de OC (RP01-23): Map folio → {estatus, estado, obs}
P.ocEncabezados=wb=>{
  const ws=P.hoja(wb,['RP01-23 Ordenes de Compra']);if(!ws)return new Map();
  const aoa=P.aoa(ws);const h=P.header(aoa,['FOLIO','ESTATUS']);if(!h)return new Map();
  const iE=h.cols.indexOf('ESTADO OC'),iO=h.cols.indexOf('OBSERVACIONES'),iC=h.cols.indexOf('COMPRADOR');const m=new Map();
  for(let i=h.fila+1;i<aoa.length;i++){const r=aoa[i];const f=P.clave(r[h.idx.FOLIO]);if(f==null)continue;const obs=iO>=0?String(r[iO]||'').trim():'';const d=P.destinoED(obs);m.set(f,{estatus:P.norm(r[h.idx.ESTATUS]),estado:iE>=0?P.norm(r[iE]):'',obs,destino:d,comprador:iC>=0?P.norm(r[iC]):''});}
  return m;
};
// Compara la foto anterior (líneas abiertas en la base) con la de hoy
P.diffOC=(prev,cur,enc,fecha)=>{
  const upserts=[],recep=[],r4=x=>Math.round(x*10000)/10000;
  cur.forEach((l,key)=>{
    const p=prev.get(key);
    if(!p){upserts.push({...l,primera_foto:fecha,pend_inicial:l.cantidad_pend,cancelada:false,cerrada_en:null});return;}
    const baja=Number(p.cantidad_pend)-l.cantidad_pend;
    if(baja>1e-9)recep.push({folio:l.folio,clave:l.clave,fecha,cantidad:r4(baja),fecha_entrega:l.fecha_entrega});
    upserts.push({...l,primera_foto:p.primera_foto,pend_inicial:p.pend_inicial,cancelada:false,cerrada_en:null});
  });
  let canc=0,comp=0;
  prev.forEach((p,key)=>{
    if(cur.has(key))return;
    const e=enc.get(Number(p.folio));const cancel=!!(e&&e.estatus==='CANCELADO');
    if(cancel)canc++;else{comp++;if(Number(p.cantidad_pend)>0)recep.push({folio:Number(p.folio),clave:Number(p.clave),fecha,cantidad:r4(Number(p.cantidad_pend)),fecha_entrega:p.fecha_entrega});}
    upserts.push({folio:Number(p.folio),clave:Number(p.clave),fecha_oc:p.fecha_oc,proveedor:p.proveedor,comprador:p.comprador,cantidad_ped:Number(p.cantidad_ped),
      cantidad_pend:cancel?Number(p.cantidad_pend):0,fecha_entrega:p.fecha_entrega,estado_oc:cancel?'CANCELADO':'RECIBIDO TOTALMENTE',entrega_directa:!!p.entrega_directa,destino:p.destino||null,observaciones:p.observaciones||null,
      primera_foto:p.primera_foto,pend_inicial:p.pend_inicial,cancelada:cancel,cerrada_en:fecha});
  });
  return{upserts,recep,cerradas:comp,canceladas:canc};
};
P.d10=v=>v==null||v===''?null:String(v).slice(0,10);   // timestamptz de Supabase → 'AAAA-MM-DD'
P.dias=(a,b)=>Math.round((new Date(P.d10(b)+'T12:00:00')-new Date(P.d10(a)+'T12:00:00'))/864e5);
// Target de una alarma. ocs: líneas de esa clave {folio,fecha_oc,cantidad_pend,cerrada_en,cancelada}
P.R.T_ANTES=15;P.R.T_ANTES_PCT=0.10;P.R.T_DESPUES=5;P.R.T_VIEJA=60;P.R.DIAS_MES=30;P.R.MF_MESES_REV=4;
// Margen para considerar una OC anticipada: 15 días o el 10% del tiempo de entrega, lo que sea mayor
P.margen=lt=>Math.max(P.R.T_ANTES,Math.round((Number(lt)||0)*P.R.DIAS_MES*P.R.T_ANTES_PCT));
P.target=(al,ocs,hoy)=>{
  const fa=P.d10(al.fecha_alarma);const vs=ocs.filter(o=>o.fecha_oc&&!o.cancelada&&!o.entrega_directa).map(o=>({...o,fecha_oc:P.d10(o.fecha_oc),d:P.dias(fa,o.fecha_oc)})).sort((a,b)=>a.d-b.d);
  const mg=P.margen(al.t_entrega),vieja0=Math.max(P.R.T_VIEJA,Math.round((Number(al.t_entrega)||0)*P.R.DIAS_MES));
  const enRango=vs.find(o=>o.d>=-mg&&o.d<=P.R.T_DESPUES);
  const res=(r,o)=>({resultado_target:r,oc_folio:o?Number(o.folio):null,fecha_oc:o?o.fecha_oc:null,dias_dif:o?o.d:null});
  if(enRango)return res(enRango.d<0?'ANTICIPADA':'EN TIEMPO',enRango);
  const vieja=vs.filter(o=>o.d<-mg&&o.d>=-vieja0&&(!o.cerrada_en||o.cerrada_en>=fa)).pop();
  if(vieja)return res('ANTICIPACION EXCESIVA',vieja);
  const tarde=vs.find(o=>o.d>P.R.T_DESPUES);
  if(tarde)return res('TARDE',tarde);
  if(al.fecha_fin&&P.dias(fa,al.fecha_fin)<=P.R.T_DESPUES)return res('SIN NECESIDAD',null);
  if(P.dias(fa,hoy)>P.R.T_DESPUES)return res('SIN OC',null);   // provisional: cambia a TARDE si llega la OC
  return null;   // todavía dentro del plazo
};
// ══ Target por nivel de riesgo (nov-2026, reemplaza al Target por días) ══
// Cada alarma se liga a la OC que se colocó para atenderla y se califica con el nivel de riesgo que tenía la clave
// el día que se colocó la OC (foto diaria del portal de ese día o del último día anterior):
//   ANTICIPADA o BAJO → ✅ cumple · MEDIO → ⚠️ cumple con riesgo · ALTO o FALTANTE → ❌ no cumple.
// Sin OC: queda en plazo mientras la clave esté en bajo o medio; si sube a alto o cae a faltante queda «SIN OC» (no cumple, provisional:
// cambia al nivel de la OC cuando se coloque). Si sale de riesgo sin OC: «SIN NECESIDAD» (no cuenta).
P.R.T_NIVEL_DESDE='2026-11-01';P.R.META_TARGET=80;
P.T_GRUPO={ANTICIPADA:'OK',BAJO:'OK',MEDIO:'RIESGO',ALTO:'NO',FALTANTE:'NO','SIN OC':'NO',
  // esquema anterior (alarmas antes de nov-2026)
  'EN TIEMPO':'OK','TARDE':'NO','ANTICIPACION EXCESIVA':'NO'};
P.T_FINAL=['ANTICIPADA','BAJO','MEDIO','ALTO','FALTANTE','SIN NIVEL','SIN NECESIDAD'];
// Grupo del resultado: OK · RIESGO · NO · PEND (aún en plazo) · NC (no cuenta)
P.tGrupo=res=>!res?'PEND':P.T_GRUPO[res]||'NC';
P.T_LBL={ANTICIPADA:'✅ Anticipada',BAJO:'🟡 Bajo',MEDIO:'🟠 Medio',ALTO:'🔴 Alto',FALTANTE:'⚫ Faltante','SIN OC':'❗ Sin OC','SIN NECESIDAD':'Sin necesidad','SIN NIVEL':'Sin nivel',EXCLUIDA:'Excluida','EN REVISION GERENCIA':'En revisión gerencia'};
// Nivel de una fila del cálculo / foto diaria: FALTANTE · ALTO · MEDIO · BAJO · ANTICIPADA (aún no estaba en riesgo)
P.nivelEn=(r,fecha)=>{if(!r)return null;if(r.est==='FALTANTE')return{nv:'FALTANTE',dA:0};
  if(r.est==='RIESGO'){if(r.nv)return{nv:r.nv,dA:r.dA??null};const x=P.nivelRiesgo(Number(r.ex)||0,Number(r.D)||0,r.lt,'RIESGO',fecha,null);return{nv:x.nv||'BAJO',dA:x.dA};}
  return{nv:'ANTICIPADA',dA:null};};
// OC que atiende la alarma: una OC al CEDI que ya estaba abierta desde antes (anticipada), o la primera colocada desde (alarma − margen)
P.targetOC=(al,ocs)=>{
  const fa=P.d10(al.fecha_alarma),mg=P.margen(al.t_entrega);
  const vs=ocs.filter(o=>o.fecha_oc&&!o.cancelada&&!o.entrega_directa).map(o=>({...o,fecha_oc:P.d10(o.fecha_oc),d:P.dias(fa,o.fecha_oc)})).sort((a,b)=>a.d-b.d);
  const vieja=vs.filter(o=>o.d<-mg&&(!o.cerrada_en||P.d10(o.cerrada_en)>=fa)).pop();
  if(vieja)return{o:vieja,ant:true};
  const o=vs.find(o=>o.d>=-mg);return o?{o,ant:false}:null;
};
// nivOC(fecha,clave) → {nv,dA} con la foto de ese día · nivHoy = nivel actual de la clave
P.targetNivel=(al,link,nivOC,nivHoy)=>{
  const res=(r,o,dA)=>({resultado_target:r,oc_folio:o?Number(o.folio):null,fecha_oc:o?o.fecha_oc:null,dias_dif:o?o.d:null,dias_agotar:dA==null?null:Math.round(dA)});
  if(link){if(link.ant)return res('ANTICIPADA',link.o,null);const n=nivOC(link.o.fecha_oc,Number(al.clave));return res(n&&n.nv?n.nv:'SIN NIVEL',link.o,n?n.dA:null);}
  if(al.fecha_fin)return res('SIN NECESIDAD',null,null);
  const h=nivHoy;return h&&(h.nv==='ALTO'||h.nv==='FALTANTE')?res('SIN OC',null,h.dA):res(null,null,null);
};
// Resumen por comprador: evaluadas = cumple + con riesgo + no cumple. Target = % cumple (OC en bajo o anticipada).
P.targetResumen=(al,meta)=>{
  const g={};al.forEach(a=>{const c=a.comprador||'(sin comprador)';const o=g[c]||(g[c]={nombre:c,total:0,OK:0,RIESGO:0,NO:0,PEND:0,NC:0,res:{}});o.total++;o[P.tGrupo(a.resultado_target)]++;const r=a.resultado_target||'EN PLAZO';o.res[r]=(o.res[r]||0)+1;});
  const fin=o=>{const n=o.OK+o.RIESGO+o.NO;const m=meta?meta(o.nombre):P.R.META_TARGET;return{...o,n,target:n?o.OK/n:null,cumpleTot:n?(o.OK+o.RIESGO)/n:null,meta:m};};
  const filas=Object.values(g).map(fin).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
  const t={nombre:'GENERAL',total:0,OK:0,RIESGO:0,NO:0,PEND:0,NC:0,res:{}};filas.forEach(o=>{['total','OK','RIESGO','NO','PEND','NC'].forEach(k=>t[k]+=o[k]);Object.entries(o.res).forEach(([k,v])=>t.res[k]=(t.res[k]||0)+v);});
  return{filas,gen:fin(t)};
};
// Meta del Target (% de OCs colocadas en riesgo bajo o anticipadas) por comprador: Admin → Objetivos del bono (plan_config 'bono_objetivos', campo TARGET)
P.metaTarget=(cfg,comp)=>{const k=cfg&&Object.keys(cfg).find(x=>x!=='GENERAL'&&P.mismoComp(x,comp));const v=k&&cfg[k].TARGET;const g=cfg&&cfg.GENERAL&&cfg.GENERAL.TARGET;return v!=null?Number(v):g!=null?Number(g):P.R.META_TARGET;};
P.R.OTIF_HOL_DIAS=3;P.R.OTIF_HOL_PCT=0.10;
P.otifHolgura=lt=>Math.max(P.R.OTIF_HOL_DIAS,Math.round((Number(lt)||0)*P.R.DIAS_MES*P.R.OTIF_HOL_PCT));
// OTIF por línea cerrada. compromisos: Map folio → fecha
P.otifLinea=(l,recs,compromisos,lt)=>{
  if(l.entrega_directa)return null;                                 // entrega directa a sucursal: no es OTIF del CEDI
  if(l.cancelada&&!(recs&&recs.length))return null;              // cancelada sin recibir: no cuenta
  const real=!!(recs&&recs.length&&recs.every(r=>r.real));
  // ya traía recepciones antes de la primera foto: sin las entradas reales no se sabe cuándo llegó lo anterior
  if(!real&&Number(l.pend_inicial)<Number(l.cantidad_ped)-1e-9)return null;
  const rec=(recs||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:1);if(!rec.length)return null;
  // Fecha compromiso: la capturada por el comprador; si no hay, la de POR DEFECTO = fecha de la OC + meses de entrega
  // de la clave × 30 días. Solo si la clave no tiene tiempo de entrega se usa la fecha de entrega de la OC (si es válida).
  let ref=null,base='SIN FECHA';
  if(compromisos.has(Number(l.folio))){ref=compromisos.get(Number(l.folio));base='COMPROMISO CAPTURADO';}
  else if(l.fecha_oc&&Number(lt)>0){const d=new Date(l.fecha_oc+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Math.round(Number(lt)*P.R.DIAS_MES));ref=d.toISOString().slice(0,10);base='COMPROMISO POR DEFECTO';}
  else if(l.fecha_entrega&&(!l.fecha_oc||l.fecha_entrega>l.fecha_oc)){ref=l.fecha_entrega;base='ENTREGA EN OC (sin tiempo de entrega)';}
  const tot=rec.reduce((t,r)=>t+Number(r.cantidad),0);const ult=rec[rec.length-1].fecha;
  // Completa: lo recibido cubre lo pedido (si el recibo viene en otra unidad, también se compara × piezas por unidad)
  const ped=Number(l.cantidad_ped),pz=Math.max(1,...rec.map(r=>Number(r.pzas)||1)),full=tot>=ped-1e-9||(pz>1&&tot*pz>=ped-1e-9);
  // Holgura (nov-2026): la fecha compromiso es estimada; una llegada tarde cuenta a tiempo si el retraso es de hasta
  // OTIF_HOL_DIAS días o el OTIF_HOL_PCT del tiempo de entrega de la clave (lo que sea mayor). tarde = días de retraso.
  const tarde=ref?P.difDias(ref,ult):null,hol=P.otifHolgura(lt);
  return{folio:Number(l.folio),clave:Number(l.clave),proveedor:l.proveedor,comprador:l.comprador,mes:ult.slice(0,7),ref,base,
    on_time:ref?tarde<=hol:null,tarde:tarde!=null&&tarde>0?tarde:0,hol,conHol:ref!=null&&tarde>0&&tarde<=hol,fRec:ult,real,in_full:!l.cancelada&&full,recibido:tot,pedido:ped};
};
P.otifResumen=(lineas,clave)=>{
  // On Time solo sobre líneas con fecha de referencia válida; In Full sobre todas. OTIF = promedio de los dos.
  const g={};lineas.forEach(x=>{const k=x[clave]||'(sin dato)';const o=g[k]||(g[k]={n:0,nOT:0,ot:0,inf:0,comp:0});o.n++;if(x.on_time!=null){o.nOT++;if(x.on_time)o.ot++;}if(x.in_full)o.inf++;if(x.base==='COMPROMISO CAPTURADO')o.comp++;});
  return Object.entries(g).map(([k,o])=>{const ot=o.nOT?o.ot/o.nOT:null,inf=o.inf/o.n;return{nombre:k,lineas:o.n,con_fecha:o.nOT,on_time:ot,in_full:inf,otif:ot==null?null:(ot+inf)/2,con_compromiso:o.comp/o.n};}).sort((a,b)=>b.lineas-a.lineas);
};
// Temporada: variación fuerte entre antecedente y pronóstico (pronóstico = mismos meses del año pasado que vienen).
// SUBE: el pronóstico es 50% (ajustable en pantalla) o más arriba del antecedente (y al menos 1 unidad/mes más) · BAJA: el mismo % o más abajo · ESTABLE: el resto.
P.R.TEMP_VAR=0.50;P.R.TEMP_MIN=1;
// Umbral de temporada para elegir la base del cálculo (pronóstico vs antecedente del año pasado): ±75%
P.R.TEMP_CALC=0.75;
P.temporada=(A,Pr,umb)=>{const U=umb!=null?umb:P.R.TEMP_VAR;
  if(A==null||Pr==null)return{t:'SIN DATO',v:null};
  if(!(A>0))return Pr>=P.R.TEMP_MIN?{t:'SUBE',v:null}:{t:'ESTABLE',v:null};
  const v=(Pr-A)/A;
  if(v>=U&&Pr-A>=P.R.TEMP_MIN)return{t:'SUBE',v};
  if(v<=-U&&A-Pr>=P.R.TEMP_MIN)return{t:'BAJA',v};
  return{t:'ESTABLE',v};
};
P.TEMP_L={SUBE:'↑ Sube fuerte (temporada)',BAJA:'↓ Baja fuerte',ESTABLE:'Sin cambio fuerte','SIN DATO':'Sin antecedente o pronóstico'};
// ── Propuestas de compra (folio): lectura de lo pegado de surtimiento y semáforo por clave ──
P.R.PROP_TOL=0.20;P.R.PROP_DIF_MESES=0.5;P.R.PROP_ROJO_MESES=1;
// aoa = filas de la hoja donde el comprador pegó surtimiento (con encabezados). Toma cada dato por el nombre de su columna.
P.leerSurtimiento=aoa=>{
  const C={id:h=>h==='ID',pedido:h=>h==='PEDIDO',pron:h=>h==='PRON'||h.startsWith('PRON '),anteo:h=>h.startsWith('ANTE'),redond:h=>h.startsWith('REDOND'),
    te:h=>h.startsWith('TIEMPO'),pmax:h=>h.startsWith('PEDIDO MAX'),exist:h=>(h.startsWith('EXIST')&&!h.startsWith('EXIST MF')&&!h.startsWith('EXISTENCIA MF')),bo:h=>h==='BO'||h==='BACK ORDER',existMF:h=>h==='EXIST MF',inversion:h=>h.startsWith('INVERSION')};
  let best=null;
  for(let i=0;i<Math.min(25,aoa.length);i++){const r=(aoa[i]||[]).map(P.norm);const idx={};Object.keys(C).forEach(k=>{const j=r.findIndex(h=>h&&C[k](h));if(j>=0)idx[k]=j;});
    const n=Object.keys(idx).length;if(idx.id!=null&&idx.pedido!=null&&(!best||n>best.n))best={fila:i,idx,n};}
  if(!best)return{filas:[],faltan:['ID','Pedido'],error:'No encontré los encabezados ID y Pedido. Pega las filas de surtimiento con todo y encabezados.'};
  const faltan=[['pron','Pron'],['anteo','Anteo']].filter(([k])=>best.idx[k]==null).map(([,t])=>t);
  const m=new Map();const v=(r,k)=>best.idx[k]==null?null:P.num(r[best.idx[k]]);
  for(let i=best.fila+1;i<aoa.length;i++){const r=aoa[i]||[];const c=P.clave(r[best.idx.id]);if(c==null)continue;
    m.set(c,{clave:c,pedido:v(r,'pedido'),pron:v(r,'pron'),anteo:v(r,'anteo'),redond:v(r,'redond'),te:v(r,'te'),pmax:v(r,'pmax'),exist:v(r,'exist'),bo:v(r,'bo'),existMF:v(r,'existMF'),inversion:v(r,'inversion')});}
  return{filas:[...m.values()],faltan,repetidas:0};
};
// Base recomendada para comprar, según el historial de la clave.
// · Intermitente → promedio de 12 meses · Solo una base válida → esa.
// · Temporada (pronóstico ±TEMP_VAR contra antecedente) → PRONÓSTICO: los mismos meses del año pasado ya traen la temporada.
//   Salvo que el pronóstico tenga menos de la mitad de meses válidos (agotados o clave nueva) → antecedente.
// · Sin temporada → ANTECEDENTE (lo más reciente); si el antecedente tiene menos meses válidos que el pronóstico → pronóstico.
P.BASE_L={ANT:'Antecedente',PRON:'Pronóstico',INTER:'Promedio 12 meses'};
P.baseRec=p=>{
  const A=p.A>0?p.A:null,Pr=p.P>0?p.P:null,N=Number(p.N)||Math.max(1,Math.ceil(Number(p.pm)||1)),nA=p.nA,nP=p.nP;
  if(p.bD==='INTERMITENTE 12 MESES'&&p.D>0)return{b:'INTER',c:p.D,por:'venta intermitente: se usa el promedio de 12 meses'};
  if(p.bD==='IRREGULAR 12 MESES'&&p.D>0)return{b:'INTER',c:p.D,por:p.bDx||'venta irregular: se usa el promedio de 12 meses'};
  // Si ya viene del Cálculo diario (oct-2026: la demanda del portal ES la base recomendada), se respeta tal cual
  if((p.bD==='ANTECEDENTE'||p.bD==='PRONÓSTICO')&&p.D>0)return{b:p.bD==='ANTECEDENTE'?'ANT':'PRON',c:p.D,por:p.bDx||''};
  if(A==null&&Pr==null)return{b:null,c:null,por:'sin consumo'};
  if(Pr==null)return{b:'ANT',c:A,por:'no hay pronóstico válido'};
  if(A==null)return{b:'PRON',c:Pr,por:'no hay antecedente válido'};
  // Con Aly (antecedente del año pasado) la temporada se mide dentro del mismo año: pronóstico vs los meses previos del año pasado
  const conLY=p.Aly!==undefined;const Aly=p.Aly>0?p.Aly:null;
  if(conLY&&(Aly==null||(p.nAly!=null&&p.nAly<N/2))){
    if(nA!=null&&nP!=null&&nA<nP&&nA<N/2)return{b:'PRON',c:Pr,por:'el antecedente solo tiene '+nA+' de '+N+' meses válidos'};
    return{b:'ANT',c:A,por:'sin historial suficiente del año pasado para medir temporada: se usa lo más reciente'};}
  const t=conLY?P.temporada(Aly,Pr,P.R.TEMP_CALC):P.temporada(A,Pr),pc=Math.round((t.v||0)*100);
  if(t.t==='SUBE'||t.t==='BAJA'){
    if(conLY){
      if(nP!=null&&nP<N/2)return{b:'ANT',c:A,por:'temporada ('+(pc>0?'+':'')+pc+'% el año pasado), pero el pronóstico solo tiene '+nP+' de '+N+' meses válidos'};
      return{b:'PRON',c:Pr,por:'temporada: el año pasado estos meses '+(t.t==='SUBE'?'subieron':'bajaron')+' '+Math.abs(pc)+'% contra los meses previos'};}
    if(nP!=null&&nP<N/2)return{b:'ANT',c:A,por:'temporada ('+(pc>0?'+':'')+pc+'%), pero el pronóstico solo tiene '+nP+' de '+N+' meses válidos'};
    return{b:'PRON',c:Pr,por:'temporada: los mismos meses del año pasado '+(t.t==='SUBE'?'suben':'bajan')+' '+Math.abs(pc)+'% contra lo reciente'};}
  if(nA!=null&&nP!=null&&nA<nP)return{b:'PRON',c:Pr,por:'sin temporada, pero el antecedente solo tiene '+nA+' de '+N+' meses válidos'};
  return{b:'ANT',c:A,por:conLY?'sin temporada (el año pasado estos meses variaron '+(pc>0?'+':'')+pc+'% contra los previos; umbral ±'+Math.round(P.R.TEMP_CALC*100)+'%): se usa lo más reciente':'sin temporada (±'+Math.round(P.R.TEMP_VAR*100)+'%): se usa lo más reciente'};
};
// Propuesta del portal con o sin BO del CEDI: consumo × (T. entrega + Objetivo) − (existencia + BO)
// Compra nacional / importación (nov-2026): xd = piezas que cubren aparte (stock del proveedor nacional en la de importación),
// mc = múltiplo por contenedor (redondeo hacia arriba), tope = máximo que se puede pedir (stock del proveedor nacional).
P.propSug=(p,c,conBO)=>{
  if(!(c>0)||P.R.SIN_SUG_ROT.includes(p.rot))return null;
  let q=Math.max(0,P.ceil3(c*((Number(p.lt)||0)+(Number(p.pm)||0))-((Number(p.ex)||0)+(conBO===false?0:(Number(p.bo)||0))+(Number(p.xd)||0))));
  const mc=Number(p.mc)||0;if(mc>0&&q>0)q=P.ceil3(q/mc)*mc;
  if(p.tope!=null&&q>Number(p.tope))q=Math.max(0,Math.floor(Number(p.tope)));
  return q;
};
// p = cálculo del portal congelado en el folio; s = fila de surtimiento o null; o = {conBO:true|false}
P.propLinea=(p,s,o)=>{
  const conBO=!(o&&o.conBO===false);
  const br=P.baseRec(p),sA=P.propSug(p,p.A,conBO),sP=P.propSug(p,p.P,conBO),sR=P.propSug(p,br.c,conBO);
  const out={br,sA,sP,sR,conBO};
  if(!s||s.pedido==null)return{...out,sem:'SIN DATO',mA:null,mP:null,mR:null,lA:null,lP:null,lR:null,varA:null,varP:null,varR:null,difR:null,avisos:['No viene en lo pegado de surtimiento',...(p.tipo?P.dualAvisos(p,br.c,conBO,null).av:[])]};
  const ped=Math.max(0,Number(s.pedido)||0),bo=Number(p.bo)||0,xd=Number(p.xd)||0,base=(Number(p.ex)||0)+(conBO?bo:0)+xd,lt=Number(p.lt)||0,pm=Number(p.pm)||0;
  const r2=x=>Math.round(x*100)/100;   // a 2 decimales para que 4.2 contra 3 × 1.4 no falle por redondeo
  const mes=c=>c>0?r2((base+ped)/c):null;
  const mA=mes(p.A),mP=mes(p.P),mR=mes(br.c);
  // El rango se mide AL LLEGAR la mercancía: meses − T. entrega (como "Inventario menos T.E." de surtimiento).
  const lg=m=>m==null?null:r2(m-lt),lA=lg(mA),lP=lg(mP),lR=lg(mR);
  const lo=r2(Math.min(lt*P.R.FACT_ENTREGA,pm)),hi=r2(pm*P.R.FACT_MAX),bajo=r2(Math.min(lt*P.R.FACT_ENTRA_RIESGO,pm));
  const inR=m=>m!=null&&m>=lo&&m<=hi,fuera=m=>m!=null&&(m>hi||m<bajo);
  const near=sug=>sug==null?false:sug>0?Math.abs(ped-sug)/sug<=P.R.PROP_TOL:ped<=0;
  const r1=x=>Math.round(x*10)/10,av=[],fN=x=>Math.round(x).toLocaleString('es-MX'),fM=x=>r1(x).toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1});
  // Semáforo (oct-2026): se mide en MESES de inventario con la base recomendada, no en %.
  // Verde: pide lo recomendado (±20% o ±0.5 meses) o al llegar queda dentro del objetivo.
  // Rojo: lo pedido CAUSA el problema: pide de más y al llegar queda más de 1 mes arriba del máximo, o pide de menos y al llegar sigue en riesgo.
  // Amarillo: lo demás (se aleja de lo recomendado sin llegar a rojo): pide motivo.
  const c=br.c>0?br.c:null,dif=sR==null?null:ped-sR,dm=c&&dif!=null?r2(dif/c):null;
  const dmX=(x,sx)=>x>0&&sx!=null?r2((ped-sx)/x):null;
  const rangoTxt='objetivo ('+fM(lo)+' a '+fM(hi)+' meses)';
  const difTxt=dif==null?'':(dif>0?'pide '+fN(dif)+' pzs más que lo recomendado (+'+fM(dm)+' meses)':'pide '+fN(-dif)+' pzs menos que lo recomendado (−'+fM(-dm)+' meses)');
  let sem,por;
  if(!c){sem=ped>0?'AMARILLO':'VERDE';por=ped>0?'Sin consumo en el portal: se compra sin historial de venta':'Sin consumo y no se pide';}
  else if(ped<=0&&(sR||0)<=0){sem='VERDE';por='No requiere compra y no se pide (al llegar '+fM(lR)+' meses)';}
  else if(near(sR)||Math.abs(dm)<=P.R.PROP_DIF_MESES){sem='VERDE';por='Pide lo recomendado'+(dif?' ('+(dif>0?'+':'−')+fN(Math.abs(dif))+' pzs'+(Math.abs(dm)>=0.05?', '+(dm>0?'+':'−')+fM(Math.abs(dm))+' meses':'')+')':'')+'; al llegar '+fM(lR)+' meses';}
  else if(inR(lR)){sem='VERDE';por='Al llegar queda con '+fM(lR)+' meses, dentro del '+rangoTxt+'; '+difTxt;}
  // Lo que el pedido mismo agrega al exceso (o al faltante): si la clave ya venía en sobre inventario, solo cuenta lo que se pide de más
  else if(dif>0&&lR>hi&&Math.min(dm,lR-hi)>P.R.PROP_ROJO_MESES){sem='ROJO';por='Sobre inventario: al llegar quedaría con '+fM(lR)+' meses, '+fM(lR-hi)+' arriba del máximo ('+fM(hi)+'); '+difTxt;}
  else if(dif<0&&lR<bajo&&(Math.min(-dm,bajo-lR)>P.R.PROP_ROJO_MESES||lR<=0.5)){sem='ROJO';por='Sigue en riesgo: al llegar quedaría con '+fM(lR)+' meses, abajo del mínimo ('+fM(bajo)+'); '+difTxt;}
  else{sem='AMARILLO';const ya=lR-dm;por=(lR>hi?(ya>hi?'Ya está en sobre inventario sin comprar ('+fM(ya)+' meses al llegar, máximo '+fM(hi)+')':'Al llegar quedaría con '+fM(lR)+' meses, '+fM(lR-hi)+' arriba del máximo ('+fM(hi)+')'):lR<bajo?'Al llegar quedaría con '+fM(lR)+' meses, '+fM(bajo-lR)+' abajo del mínimo ('+fM(bajo)+')':lR<lo?'Al llegar quedaría con '+fM(lR)+' meses, abajo del objetivo ('+fM(lo)+') sin llegar a riesgo':'Al llegar '+fM(lR)+' meses')+'; '+difTxt;}
  av.push(por);
  const otra=br.b==='ANT'?'PRON':br.b==='PRON'?'ANT':null,lO=otra==='ANT'?lA:otra==='PRON'?lP:null,sO=otra==='ANT'?sA:otra==='PRON'?sP:null;
  if(sem!=='VERDE'&&otra&&inR(lO)&&near(sO))av.push('Cuadra con '+P.BASE_L[otra].toLowerCase()+' (al llegar '+fM(lO)+' meses), pero el portal recomienda '+P.BASE_L[br.b].toLowerCase()+': '+br.por);
  // Meses de surtimiento vs portal. Si no cuadran pero sí cuadran con el BO al revés, se avisa del "¿Considerar BO?"
  const tol=P.R.PROP_DIF_MESES,alt=c=>c>0?r2(((Number(p.ex)||0)+(conBO?0:bo)+xd+ped)/c):null;let avBO=false;
  const dd=[];
  const difM=(sm,m,c,t)=>{if(sm==null||m==null||Math.abs(sm-m)<=tol)return;if(xd>0&&c>0&&Math.abs(sm-(m-xd/c))<=tol)return;const x=alt(c);
    if(bo>0&&x!=null&&Math.abs(sm-x)<=tol){avBO=true;return;}dd.push('meses con '+t+' '+r1(sm)+' (portal '+r1(m)+')');};
  difM(s.anteo,mA,p.A,'antecedente');difM(s.pron,mP,p.P,'pronóstico');
  if(avBO)av.push(conBO?'Surtimiento calculó los meses sin BO (¿Considerar BO? = No); el folio está con BO':'Surtimiento calculó los meses con BO; el folio está sin BO');
  if(s.te!=null&&Math.abs(s.te-lt)>0.01)dd.push('T. entrega '+s.te+' (portal '+lt+')');
  if(s.pmax!=null&&Math.abs(s.pmax-pm)>0.01)dd.push('pedido máximo '+s.pmax+' (objetivo portal '+pm+')');
  const exP=Number(p.ex)||0;if(s.exist!=null&&Math.abs(s.exist-exP)>Math.max(1,exP*0.02))dd.push('existencia '+fN(s.exist)+' (portal '+fN(exP)+')');
  if(s.bo!=null&&p.boT!=null&&Math.abs(s.bo-(Number(p.boT)||0))>Math.max(1,(Number(p.boT)||0)*0.02))dd.push('BO '+fN(s.bo)+' (portal '+fN(p.boT)+')');
  if(dd.length)av.push('Surtimiento trae datos distintos al portal: '+dd.join('; ')+'. Revisa que el Excel del día sea el mismo.');
  if(p.mfF&&p.mfX>0)av.push('MF con más de '+P.R.MF_MESES_REV+' meses: excedente de '+p.mfX+(p.mfB!=null?' sobre su número base ('+p.mfB+')':'')+' para devolución estratégica');
  if(p.ocs>0)av.push(p.ocs+(p.ocs===1?' OC abierta':' OCs abiertas')+' al CEDI');
  if(conBO&&bo>0){const vb=P.vistaBO(p,true,null);av.push('Considera el BO actual del CEDI: '+fN(bo)+' pzs'+(p.tipo?(p.tipo==='NACIONAL'?' (solo OCs nacionales)':''):(vb.est!==p.est||vb.boCub)?' · estatus con BO: '+(vb.boCub?'FALTANTE cubierto con BO':vb.est)+' (sin BO: '+p.est+')':''));}
  if(p.tipo){const dv=P.dualAvisos(p,br.c,conBO,ped);dv.av.forEach(x=>av.push(x));if(dv.amarillo){if(sem==='VERDE'){sem='AMARILLO';por=dv.amarillo;av.unshift(por);}else av.push(dv.amarillo);}}
  const v=x=>x>0?(ped-x)/x:null;
  return{...out,sem,por,mA,mP,mR,lA,lP,lR,lo,hi,bajo,varA:v(sA),varP:v(sP),varR:v(sR),difR:dif,dmR:dm,dmA:dmX(p.A,sA),dmP:dmX(p.P,sP),avisos:av};
};
// ══ Compra nacional e importación (nov-2026) ══
// Claves con dos formas de compra (p. ej. BYP nacional con stock en el proveedor e importación de China).
// Cada folio de Propuestas es de un solo tipo (NACIONAL o IMPORTACION) y usa el tiempo de entrega y los meses objetivo de ese tipo
// (vacíos = los de la hoja Detalle). El estatus oficial, las alarmas, el Target y el bono NO cambian: siguen con la hoja Detalle.
//  · NACIONAL: Propuesta = consumo × (T. entrega nac + Objetivo nac) − existencia − BO de OCs nacionales (con BO); tope = stock vigente del proveedor nacional.
//  · IMPORTACION: Propuesta = consumo × (T. entrega imp + Objetivo imp) − existencia − stock del proveedor nacional − BO total (con BO);
//    opción de redondear hacia arriba al mínimo por contenedor.
// El stock del proveedor nacional es del proveedor (no es nuestro): no se suma a la existencia ni al estatus.
P.TIPO_L={NACIONAL:'Nacional',IMPORTACION:'Importación'};
P.TIPO_I={NACIONAL:'🇲🇽',IMPORTACION:'🚢'};
P.R.STK_DIAS=30;
P.tipoChip=t=>t&&P.TIPO_L[t]?'<span class="chip" style="background:'+(t==='IMPORTACION'?'#e0f2fe;color:#075985':'#dcfce7;color:#166534')+'">'+P.TIPO_I[t]+' '+P.TIPO_L[t]+'</span>':'';
P.mismoProv=(a,b)=>{const x=P.provKey(a),y=P.provKey(b);return!!x&&!!y&&(x===y||x.startsWith(y+' ')||y.startsWith(x+' '));};
// duales = filas de plan_abasto_dual; stock = plan_stock_proveedor; ocs = líneas abiertas de plan_oc_lineas (clave, proveedor, cantidad_pend, entrega_directa, cancelada)
// → Map clave → {provN, ltN, pmN, provI, ltI, pmI, mc, stk (vigente o null), stkF, stkP, stkV (vencido), stkVF, fI (fracción del BO que es de importación)}
P.dualMapa=(duales,stock,ocs,fecha)=>{
  const m=new Map(),n=x=>x==null||x===''||!isFinite(+x)?null:+x,t=new Date((fecha||new Date().toISOString().slice(0,10))+'T12:00:00');
  (duales||[]).forEach(r=>{const k=Number(r.clave);if(!k)return;
    m.set(k,{provN:r.prov_nac||null,ltN:n(r.lt_nac),pmN:n(r.obj_nac),provI:r.prov_imp||null,ltI:n(r.lt_imp),pmI:n(r.obj_imp),mc:n(r.min_cont),stk:null,stkF:null,stkP:null,stkV:null,stkVF:null,fI:0});});
  (stock||[]).forEach(r=>{const d=m.get(Number(r.clave));if(!d)return;const fc=String(r.fecha_corte||'').slice(0,10),q=+r.cantidad||0;if(!fc)return;
    const dd=Math.round((t-new Date(fc+'T12:00:00'))/864e5);
    if(dd>P.R.STK_DIAS){d.stkV=(d.stkV||0)+q;if(!d.stkVF||fc>d.stkVF)d.stkVF=fc;return;}
    d.stk=(d.stk||0)+q;if(!d.stkF||fc<d.stkF)d.stkF=fc;d.stkP=d.stkP&&d.stkP!==r.proveedor?d.stkP+', '+r.proveedor:r.proveedor;});
  // BO por tipo: OC del proveedor de importación = importación; si no hay proveedor de importación capturado,
  // toda OC que no sea del proveedor nacional se toma como importación; sin ninguno de los dos, todo es nacional.
  const g=new Map();(ocs||[]).forEach(l=>{const k=Number(l.clave),d=m.get(k);if(!d||l.entrega_directa||l.cancelada||l.cerrada_en)return;const q=+l.cantidad_pend||0;if(q<=0)return;
    const imp=d.provI?P.mismoProv(l.proveedor,d.provI):d.provN?!P.mismoProv(l.proveedor,d.provN):false;
    const o=g.get(k)||{t:0,i:0};o.t+=q;if(imp)o.i+=q;g.set(k,o);});
  g.forEach((o,k)=>{m.get(k).fI=o.t>0?Math.round(o.i/o.t*10000)/10000:0;});
  return m;
};
// p = cálculo congelado de la clave (con p.dual); tipo = NACIONAL | IMPORTACION; o = {cont:true} redondea al contenedor
P.dualP=(p,tipo,o)=>{
  if(!p||!tipo||!p.dual)return p;
  const d=p.dual,bo=Math.max(0,Number(p.bo)||0),boI=Math.round(bo*(Number(d.fI)||0)*10000)/10000,boN=Math.round((bo-boI)*10000)/10000;
  const v=(x,def)=>x!=null&&x!==''&&isFinite(+x)?+x:def;
  const q=Object.assign({},p,{tipo,lt0:p.lt,pm0:p.pm,boCEDI:bo,boN,boI});
  if(tipo==='NACIONAL'){q.lt=v(d.ltN,p.lt);q.pm=v(d.pmN,p.pm);q.bo=boN;q.xd=0;q.tope=d.stk!=null?Math.max(0,d.stk):null;q.mc=0;}
  else{q.lt=v(d.ltI,p.lt);q.pm=v(d.pmI,p.pm);q.bo=bo;q.xd=d.stk>0?d.stk:0;q.tope=null;q.mc=o&&o.cont&&d.mc>0?Number(d.mc):0;}
  return q;
};
// Avisos del tipo de compra para el folio. Regresa {av:[...], amarillo: texto si el pedido debe pedir motivo}
P.dualAvisos=(p,c,conBO,ped)=>{
  const av=[],d=p.dual||{},fN=x=>Math.round(x).toLocaleString('es-MX'),fF=f=>f?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):'';let am=null;
  const par=(p.lt!==p.lt0||p.pm!==p.pm0)?' (hoja Detalle: '+p.lt0+' y '+p.pm0+')':'';
  av.push('Compra '+P.TIPO_L[p.tipo].toLowerCase()+': T. entrega '+p.lt+' y objetivo '+p.pm+' meses'+par);
  if(p.tipo==='NACIONAL'){
    if(d.stk==null)av.push(d.stkV!=null?'El stock del proveedor nacional está vencido (corte '+fF(d.stkVF)+', más de '+P.R.STK_DIAS+' días): la propuesta no tiene tope; actualízalo en Admin':'Sin stock del proveedor nacional cargado: la propuesta no tiene tope');
    else{const sin=P.propSug(Object.assign({},p,{tope:null}),c,conBO);
      av.push('Stock disponible en '+(d.stkP||'el proveedor nacional')+': '+fN(d.stk)+' pzs (corte '+fF(d.stkF)+')');
      if(sin!=null&&sin>d.stk)av.push('El proveedor nacional no alcanza: se necesitan '+fN(sin)+' y solo tiene '+fN(d.stk)+'; faltan '+fN(sin-d.stk)+' que se deben cubrir con importación');
      if(ped!=null&&ped>d.stk)am='Pide '+fN(ped-d.stk)+' pzs más de lo que tiene disponible el proveedor nacional ('+fN(d.stk)+')';}
    if(p.boI>0)av.push('BO de importación en camino: '+fN(p.boI)+' pzs (no se resta en la compra nacional)');
  }else{
    if(d.stk>0)av.push('Cubre con el stock del proveedor nacional: '+fN(d.stk)+' pzs (corte '+fF(d.stkF)+')');
    else if(d.stkV!=null)av.push('El stock del proveedor nacional está vencido (corte '+fF(d.stkVF)+'): no se considera');
    if(conBO&&(p.boN>0||p.boI>0))av.push('BO considerado: '+fN(p.boN)+' nacional + '+fN(p.boI)+' importación');
    if(!conBO&&p.boI>0)av.push('Hay '+fN(p.boI)+' pzs de importación en camino que NO se restan (folio sin BO)');
    if(p.mc>0)av.push('Propuesta redondeada al mínimo por contenedor ('+fN(p.mc)+' pzs)');
    if(d.mc>0&&ped>0&&Math.abs(ped/d.mc-Math.round(ped/d.mc))>1e-6)av.push('El pedido no es múltiplo del mínimo por contenedor ('+fN(d.mc)+' pzs)');
  }
  return{av,amarillo:am};
};
P.PROP_MOTIVOS=['Mínimo de compra o flete del proveedor','Múltiplo de empaque','Temporada','Venta especial o proyecto','Compra de oportunidad o cambio de precio','Proveedor con entregas incumplidas (más stock de seguridad)','Redistribución de MF','Clave nueva o en lanzamiento','Reducir inventario o descontinuar','Otro (explicar en comentario)'];
// ══ Calendario de pedidos por proveedor (oct-2026) ══
// Ciclo automático por valor de compra mensual del proveedor (demanda × costo): semanal / quincenal / mensual.
P.R.CAL_SEMANAL=150000;P.R.CAL_QUINCENAL=40000;P.R.CAL_HORIZ=90;
// Llave para empatar nombres de proveedor (sin puntos ni "SA DE CV", "S DE RL DE CV", "SAPI DE CV"…)
P.provKey=s=>{let t=P.norm(s).replace(/[.,;()]/g,' ').replace(/\s+/g,' ').trim().split(' ');
  const SUF=new Set(['S','A','SA','DE','C','V','CV','SAPI','SAB','RL','R','L','SC','SPR','P','I','B','SRL']);
  while(t.length>1&&SUF.has(t[t.length-1]))t.pop();return t.join(' ');};
P.provValido=s=>!!s&&!/OTROS INGRESOS|AJUSTE|TRASPASO|INVENTARIO INICIAL/.test(P.norm(s));
// Última OC por clave (proveedores válidos): Map clave → {p, f, n (proveedores distintos)}
P.ultimaOC=lineas=>{const m=new Map();(lineas||[]).forEach(l=>{if(!P.provValido(l.proveedor))return;const k=Number(l.clave),f=String(l.fecha_oc||'').slice(0,10);
  const x=m.get(k)||{p:null,f:'',ps:new Set()};x.ps.add(P.provKey(l.proveedor));if(f>=x.f){x.f=f;x.p=String(l.proveedor).trim();}m.set(k,x);});
  m.forEach(x=>{x.n=x.ps.size;delete x.ps;});return m;};
// Proveedor por clave con prioridad: catálogo cargado → proveedor aprobado en Comparativos → última OC → marca
P.provPorClave=(filas,src)=>{const out=new Map(),cat=src.cat||new Map(),cmp=src.cmp||new Map(),oc=src.oc||new Map();
  (filas||[]).forEach(r=>{const k=Number(r.c);const c=cat.get(k),a=cmp.get(k),o=oc.get(k);
    const x=c?{p:c,o:'CATÁLOGO'}:a&&a.p?{p:a.p,o:'COMPARATIVO'}:o&&o.p?{p:o.p,o:'ÚLTIMA OC'}:{p:'MARCA '+(r.m||'SIN MARCA'),o:'MARCA'};
    x.cmp=a?a.p:null;x.cmpF=a?a.f:null;x.oc=o?o.p:null;x.ocF=o?o.f:null;x.ocN=o?o.n:0;out.set(k,x);});return out;};
P.diasSemana=t=>{if(!t)return null;const M={DO:0,LU:1,MA:2,MI:3,JU:4,VI:5,SA:6};const s=new Set();
  P.norm(t).split(/[\s,;\/]+/).forEach(w=>{const d=M[w.slice(0,2)];if(d!=null)s.add(d);else if(w==='X')s.add(3);else if(w==='L')s.add(1);else if(w==='M')s.add(2);else if(w==='J')s.add(4);else if(w==='V')s.add(5);});return s.size?s:null;};
P.diasTexto=set=>set?[1,2,3,4,5,6,0].filter(d=>set.has(d)).map(d=>['DOM','LUN','MAR','MIE','JUE','VIE','SAB'][d]).join(','):null;
P.calFecha=(f0,d)=>{const x=new Date(f0+'T12:00:00');x.setDate(x.getDate()+d);return x.toISOString().slice(0,10);};
// Día de pedido ≥ d (días desde f0): días fijos del proveedor o, si no tiene, cualquier día menos domingo
P.calSnap=(f0,d,dias)=>{let t=Math.max(0,Math.ceil(d-1e-9));for(let i=0;i<14;i++,t++){const w=new Date(P.calFecha(f0,t)+'T12:00:00').getDay();if(dias?dias.has(w):w!==0)return t;}return t;};
// Calendario: filas del cálculo publicado → grupos (proveedor, marca o grupo) con sus pedidos estimados en el horizonte.
// Cada clave se pide cuando su cobertura (existencia + BO) baja a T. entrega × 1.2 (donde entraría a riesgo);
// al pedido del grupo se suman las claves que llegarían a ese punto dentro del ciclo del proveedor.
P.calendario=(filas,o)=>{
  const H=o.horiz||P.R.CAL_HORIZ,MD=30.4,ag=o.agrupar||'PROV',reglas=o.reglas||new Map(),prov=o.prov||new Map();
  const regla=g=>ag==='PROV'?reglas.get(P.provKey(g))||null:null;
  const G=new Map(),NOM=new Map();
  (filas||[]).forEach(r=>{
    if(r.pr||P.esProd(r)||P.R.SIN_SUG_ROT.includes(r.rot))return;const D=Number(P.baseRec(r).c)||0;if(!(D>0)||D<P.R.D_MIN)return;
    const k=Number(r.c),pv=prov.get(k)||{p:'MARCA '+(r.m||'SIN MARCA'),o:'MARCA'};
    // por proveedor se agrupa con la llave (sin SA DE CV, puntos, mayúsculas) y se muestra el nombre más usado
    const g=ag==='MARCA'?(r.m||'SIN MARCA'):ag==='GRUPO'?(r.g||'SIN GRUPO'):ag==='COMPRADOR'?(r.comp||'SIN COMPRADOR'):ag==='ORIGEN'?((o.origen&&o.origen.get(k))||'SIN ORIGEN DE RECOLECCIÓN'):P.provKey(pv.p);
    if(ag==='PROV'){const n=NOM.get(g)||new Map();n.set(pv.p,(n.get(pv.p)||0)+1);NOM.set(g,n);}
    const rg=regla(g),lt=rg&&rg.lead_time_dias>0?rg.lead_time_dias/MD:(Number(r.lt)||0),pm=Number(r.pm)||0,rop=lt*P.R.FACT_ENTRA_RIESGO,meta=lt+pm;
    const pos=((Number(r.ex)||0)+(o.conBO===false?0:(Number(r.bo)||0)))/D;
    (G.get(g)||G.set(g,[]).get(g)).push({r,k,D,pv,lt,pm,rop,meta,pos0:pos,t0:0,due:(pos-rop)*MD,costo:o.costo?o.costo.get(k)||null:null,emp:o.emp?o.emp.get(k):null});
  });
  const out=[];
  G.forEach((its,gk)=>{
    let g=gk;if(ag==='PROV'){let mx=-1;NOM.get(gk).forEach((n,nom)=>{if(n>mx){mx=n;g=nom;}});}
    const rg=regla(g),valMes=its.reduce((a,i)=>a+i.D*(i.costo||0),0);
    const auto=valMes>=P.R.CAL_SEMANAL?7:valMes>=P.R.CAL_QUINCENAL?14:30,ciclo=rg&&rg.ciclo_dias>0?Number(rg.ciclo_dias):auto,dias=P.diasSemana(rg&&rg.dias_pedido);
    const ped=[];
    for(let n=0;n<40;n++){
      const tmin=Math.min(...its.map(i=>i.due));if(!(tmin<=H))break;
      const t=P.calSnap(o.hoy,Math.max(0,tmin),dias);if(t>H)break;
      const lote=its.filter(i=>i.due<=t+ciclo);
      const L=lote.map(i=>{const pos=i.pos0-(t-i.t0)/MD;let q=Math.max(0,P.ceil3(i.D*(i.meta-pos)));const e=q>0?P.empaque(q,i.emp,i.r.u):{q,ok:false};q=e.q||0;
        const x={c:i.k,n:i.r.n,m:i.r.m||'',g:i.r.g||'',comp:i.r.comp,est:i.r.est,u:i.r.u||'',D:i.D,pos:Math.round(pos*10)/10,rop:Math.round(i.rop*10)/10,
          fp:P.calFecha(o.hoy,Math.round(i.due)),atr:i.due<0?Math.round(-i.due):0,q,emp:e.ok?e.tipo:null,costo:i.costo,valor:i.costo!=null?Math.round(q*i.costo*100)/100:null,prov:i.pv};
        i.pos0=pos+q/i.D;i.t0=t;i.due=t+(i.pos0-i.rop)*MD;if(!(i.due>t))i.due=t+ciclo;return x;}).filter(x=>x.q>0);
      if(!L.length)continue;
      const valor=L.reduce((a,x)=>a+(x.valor||0),0),pzas=L.reduce((a,x)=>a+x.q,0),sinCosto=L.filter(x=>x.costo==null).length;
      const av=[];
      if(rg&&rg.minimo_monto>0&&valor<rg.minimo_monto)av.push('no llega al mínimo de compra: faltan $'+Math.round(rg.minimo_monto-valor).toLocaleString('es-MX'));
      if(rg&&rg.minimo_piezas>0&&pzas<rg.minimo_piezas)av.push('no llega al mínimo de piezas: faltan '+Math.round(rg.minimo_piezas-pzas).toLocaleString('es-MX'));
      if(rg&&rg.flete_completo&&rg.monto_flete>0&&valor<rg.monto_flete)av.push('no completa el flete: faltan $'+Math.round(rg.monto_flete-valor).toLocaleString('es-MX'));
      ped.push({t,f:P.calFecha(o.hoy,t),atr:Math.max(0,...L.map(x=>x.atr)),lineas:L,claves:L.length,pzas,valor:Math.round(valor*100)/100,sinCosto,av});
    }
    const comps=[...new Set(its.map(i=>i.r.comp).filter(Boolean))],org={};its.forEach(i=>org[i.pv.o]=(org[i.pv.o]||0)+1);
    out.push({g,ag,regla:rg,ciclo,cicloAuto:!(rg&&rg.ciclo_dias>0),auto,dias:rg&&rg.dias_pedido||null,valMes:Math.round(valMes),claves:its.length,comps,org,pedidos:ped,prox:ped[0]||null});
  });
  return out.sort((a,b)=>(a.prox?a.prox.t:1e9)-(b.prox?b.prox.t:1e9)||(b.prox?b.prox.atr:0)-(a.prox?a.prox.atr:0)||b.valMes-a.valMes);
};

// Lee todo lo que necesita el calendario (catálogo, reglas, OCs, Comparativos, costos, empaques). Cada fuente es opcional.
P.calFuentes=async(sb,sbc)=>{
  const todo=async q=>{let out=[];for(let i=0;i<200;i++){const{data,error}=await q().range(i*1000,i*1000+999);if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)break;}return out;};
  const F={cat:new Map(),reglas:new Map(),oc:new Map(),cmp:new Map(),costo:new Map(),emp:new Map(),origen:new Map(),avisos:[]};
  const paso=async(n,fn)=>{try{await fn();}catch(e){F.avisos.push(n+': '+(e.message||e));}};
  await Promise.all([
    paso('Catálogo proveedor por clave (¿ya corriste plan_tablas_16.sql?)',async()=>(await todo(()=>sb.from('plan_prov_clave').select('clave,proveedor').order('clave'))).forEach(r=>{if(P.provValido(r.proveedor))F.cat.set(Number(r.clave),String(r.proveedor).trim());})),
    paso('Reglas de proveedores (¿ya corriste plan_tablas_16.sql?)',async()=>(await todo(()=>sb.from('plan_proveedores').select('*').order('proveedor'))).forEach(r=>F.reglas.set(P.provKey(r.proveedor),r))),
    paso('OCs',async()=>{F.oc=P.ultimaOC(await todo(()=>sb.from('plan_oc_lineas').select('clave,proveedor,fecha_oc').order('folio').order('clave')));}),
    paso('Costos',async()=>(await todo(()=>sb.from('plan_costos').select('clave,costo').order('clave'))).forEach(r=>{if(Number(r.costo)>0)F.costo.set(Number(r.clave),Number(r.costo));})),
    paso('Origen de recolección (¿ya corriste plan_tablas_17.sql?)',async()=>(await todo(()=>sb.from('plan_origen_clave').select('clave,origen').order('clave'))).forEach(r=>F.origen.set(Number(r.clave),r.origen))),
    paso('Empaques',async()=>(await todo(()=>sb.from('plan_empaques').select('*').order('clave'))).forEach(r=>F.emp.set(Number(r.clave),r))),
    paso('Proveedor aprobado en Comparativos',async()=>{if(!sbc)return;(await todo(()=>sbc.from('cmp_asignaciones').select('clave,proveedor,aprobado_en').eq('vigente',true).order('clave'))).forEach(r=>{
      const k=Number(r.clave),f=String(r.aprobado_en||'').slice(0,10),x=F.cmp.get(k);if(P.provValido(r.proveedor)&&(!x||f>=x.f))F.cmp.set(k,{p:String(r.proveedor).trim(),f});});}),
  ]);
  return F;
};

// Compradores para los selectores: los dados de alta como comprador en la tabla usuarios del portal (activos) + la lista base.
// Así un comprador nuevo (p. ej. MARITZA HERNANDEZ) aparece sin tocar el código. PRODUCCION no es comprador.
// Mismo comprador con nombre corto en el Excel y completo en usuarios: "MARITZA" = "MARITZA HERNANDEZ" (uno empieza con el otro + espacio)
P.mismoComp=(a,b)=>{a=P.norm(a);b=P.norm(b);return!!a&&!!b&&(a===b||a.startsWith(b+' ')||b.startsWith(a+' '));};
// Nombre del comprador como viene en el Excel (el de la lista) para un usuario del portal
P.compCanon=(n,lista)=>{const x=P.norm(n);if(!x)return'';if((lista||[]).includes(x))return x;return(lista||[]).find(c=>P.mismoComp(c,x))||x;};
P.compradores=async(sb,base)=>{let us=[];try{const{data}=await sb.from('usuarios').select('nombre,tipo,activo');us=(data||[]).filter(u=>P.norm(u.tipo)==='COMPRADOR'&&u.activo!==false).map(u=>P.norm(u.nombre));}catch(e){}
  const out=[...new Set(base||[])];us.forEach(u=>{if(!out.some(c=>P.mismoComp(c,u)))out.push(u);});
  return out.filter(x=>x&&x!=='PRODUCCION'&&x!=='ADMIN').sort((a,b)=>a.localeCompare(b,'es'));};

/*PARSE-END*/
if(typeof window!=='undefined')window.P=P;   // para páginas que preguntan por window.P (Estatus Back Orders)
