// AMBIENTE DE PRUEBAS · aplica el cálculo del Laboratorio al portal de pruebas
// El laboratorio publica por clave (tabla lab_publicacion): venta mensual esperada, punto de alarma y «pedir hasta».
// Aquí se sustituyen, en el cálculo publicado que lee cada página, la demanda, los meses de inventario, el estatus
// de riesgo y la propuesta de compra. Las claves que no vienen en lo publicado conservan el cálculo del portal.
// Se apaga desde la franja naranja («Cálculo: Portal actual») para comparar.
(function(){
  'use strict';
  var A=window.LABAPL={pub:undefined,info:null};
  var top_=function(){try{return window.top;}catch(e){return window;}};
  A.activo=function(){try{return localStorage.getItem('lab_calc')!=='0';}catch(e){return true;}};
  var avisar=function(t,ok){A.info={texto:t,ok:!!ok};try{var w=top_();if(w.PRUEBAS&&w.PRUEBAS.modo)w.PRUEBAS.modo(t,!!ok);}catch(e){}};
  A.cargar=async function(sb){
    if(A.pub!==undefined)return A.pub;
    try{var r=await sb.from('lab_publicacion').select('*').eq('id','vigente').maybeSingle();A.pub=r.error||!r.data?null:r.data;}catch(e){A.pub=null;}
    if(A.pub){var m=new Map();(A.pub.datos||[]).forEach(function(x){m.set(Number(x[0]),{d:x[1],p:x[2],h:x[3],cf:x[4],inn:x[5]||0,mas:x[6]||0,e:x.length>7?{seg:x[7],H:x[8],cob:x[9],serv:x[10],aj:x[11],tipo:x[12],err:x[13],pa:x[14],parV:x[15],parC:x[16],parA:x[17],hs:x[18]}:null});});A.pub.mapa=m;}
    return A.pub;
  };
  // Redondeo a empaque con la misma regla del portal (P.empaque); inn y mas ya vienen en la unidad de la clave
  var emp=function(q,x){if(!q||!(x.inn>0||x.mas>0))return null;if(x.mas>0&&q>=x.mas)return Math.max(x.mas,Math.round(q/x.mas)*x.mas);if(x.inn>0)return Math.ceil(q/x.inn)*x.inn;return x.mas;};
  A.prop=function(r,conBO){var l=r.lab;return Math.max(0,P.ceil3(l.h-((Number(r.ex)||0)+(conBO?Math.max(0,Number(r.bo)||0):0)+(Number(r.xd)||0))));};
  A.fila=function(r,x,fecha){
    var ex=Number(r.ex)||0,bo=Math.max(0,Number(r.bo)||0),lt=Number(r.lt)||0,pm=Number(r.pm)||0,r2=function(v){return Math.round(v*100)/100;};
    r.lab={D:r.D,s:r.s,s0:r.s0,est:r.est,h:x.h,p:x.p,cf:x.cf,d:x.d,e:x.e};
    r.D=Math.round(x.d*10000)/10000;r.bD='MOTOR DEL LABORATORIO · confiabilidad '+x.cf;
    if(x.d>0){r.mi=r2(ex/x.d);r.miB=r2((ex+bo)/x.d);}
    if(x.d>0&&['RIESGO','OPTIMO','SOBRE INVENTARIO'].indexOf(r.est)>=0){
      // Riesgo = ya llegó al punto de alarma del motor; sobre inventario = regla del portal con la demanda del motor
      var e=ex<=x.p?'RIESGO':(ex/x.d>pm*P.R.FACT_MAX?'SOBRE INVENTARIO':'OPTIMO');
      if(e!==r.est||e==='RIESGO'){r.est=e;
        if(e==='RIESGO'&&!r.se){var rd=Number(r.rd)||x.d/P.R.MES_DIAS,dA=ex/rd,LTd=lt*P.R.MES_DIAS;
          r.dA=Math.round(dA*10)/10;r.fAg=fecha?P.addDias(fecha,Math.floor(dA)):null;r.nv=dA<=P.R.NIV_DIAS_ALTO||(LTd>0&&dA<=LTd*P.R.NIV_ALTO)?'ALTO':LTd>0&&dA<LTd*P.R.NIV_MEDIO?'MEDIO':'BAJO';}
        else{r.nv=null;r.dA=null;r.fAg=null;}}
    }
    if(P.R.SIN_SUG_ROT.indexOf(r.rot)<0){
      r.s=A.prop(r,true);r.sE=emp(r.s,x);r.s0=A.prop(r,false);r.sE0=emp(r.s0,x);
      if(r.sE==null)r.eT=null;
    }
  };
  A.aplicar=async function(sb,est){
    if(!est||!est.claves)return est;
    if(!A.activo()){avisar('Cálculo del portal actual (motor apagado)',false);return est;}
    var pub=await A.cargar(sb);
    if(!pub){avisar('Sin cálculo publicado del laboratorio: se usa el del portal',false);return est;}
    var n=0;est.claves.forEach(function(r){var x=pub.mapa.get(Number(r.c));if(x&&!r.lab){A.fila(r,x,est.fecha);n++;}});
    est.lab={claves:n,publicado:pub.creado_en,por:pub.creado_por,fecha:pub.fecha_calculo};
    var f=String(pub.creado_en||'').slice(0,10).split('-').reverse().join('/');
    avisar('Motor del laboratorio aplicado a '+n.toLocaleString('es-MX')+' claves · publicado '+f+(pub.creado_por?' por '+pub.creado_por:''),true);
    return est;
  };
  // ── Detalle de la clave en Planeación: cálculo del laboratorio, tiendas y destino de las entregas directas ──
  var esc=function(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var nf=function(v,d){return v==null||v===''||isNaN(v)?'—':Number(v).toLocaleString('es-MX',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});};
  var celda=function(el,rot){var bs=el.querySelectorAll('.kv > b');for(var i=0;i<bs.length;i++)if(bs[i].textContent.trim()===rot)return bs[i].nextElementSibling;return null;};
  var TIPO={'REGULAR':'venta regular','ERRATICA':'venta errática','INTERMITENTE':'venta intermitente','IRREGULAR':'venta irregular','SIN HISTORIA':'sin historia'};
  A.txtPropuesta=function(r,conBO){
    var l=r.lab,e=l.e,ex=Number(r.ex)||0,bo=Math.max(0,Number(r.bo)||0),s=conBO?r.s:(r.s0!=null?r.s0:r.s),sE=conBO?r.sE:(r.sE0!==undefined?r.sE0:r.sE);
    return 'pedir hasta '+nf(l.h)+' − ('+nf(ex)+' existencia'+(conBO?' + '+nf(bo)+' BO CEDI':'')+') = <b>'+nf(s)+'</b>'+(sE!=null?' → con empaque <b>'+nf(sE)+'</b>':'')+
      ' <span class="mut">· el portal actual propondría '+nf(conBO?l.s:(l.s0!=null?l.s0:l.s))+'</span>';
  };
  A.txtLab=function(r){
    var l=r.lab,e=l.e;if(!e)return 'Punto de alarma '+nf(l.p)+' · pedir hasta '+nf(l.h)+' · confiabilidad '+esc(l.cf)+' <span class="mut">(vuelve a dar «Aplicar al portal de pruebas» en el laboratorio para ver el desglose completo)</span>';
    var H=e.H||0,esp=l.d*H,cic=(e.hs!=null?e.hs:l.h)-l.p,t=[];
    t.push('Venta esperada <b>'+nf(l.d,1)+'</b> / mes'+(l.D!=null?' (portal actual '+nf(l.D,1)+')':'')+' · '+(TIPO[e.tipo]||'')+' · confiabilidad <b>'+esc(l.cf)+'</b>'+(e.err!=null?' (error '+Math.round(e.err*100)+'%)':''));
    if(e.parV!=null)t.push('Mes en curso: lleva '+nf(e.parV)+' · cierre estimado '+nf(e.parC)+' (el pronóstico era '+nf(e.parA)+')');
    t.push('Punto de alarma <b>'+nf(l.p)+'</b> = venta de '+nf(H,2)+' meses ('+nf(esp)+') + seguridad '+nf(e.seg)+' · servicio '+Math.round((e.serv||0)*100)+'%');
    t.push('Pedir hasta <b>'+nf(l.h)+'</b> = alarma '+nf(l.p)+' + '+nf(e.cob,1)+' meses de venta ('+nf(cic)+')'+(e.aj?(e.aj<0?' − '+nf(-e.aj)+' porque las tiendas tienen de sobra':' + '+nf(e.aj)+' porque las tiendas están debajo de su base'):''));
    if(e.pa!=null)t.push('Riesgo de agotarse antes de que llegue un pedido de hoy: <b>'+Math.round(e.pa*100)+'%</b>');
    return t.join('<br>');
  };
  // Destino de las OCs de entrega directa (se lee solo al abrir el detalle)
  A.txtDestino=function(d){
    if(!d)return 'entrega directa';var n=P.norm(d);
    if((P.R.ED_FRASES||[]).indexOf(n)>=0||/DIRECT/.test(n))return 'entrega directa';
    if(P.esLugarExtra(n))return 'entrega directa a cliente · '+esc(n);
    return 'entrega directa a sucursal '+esc(n);
  };
  // Unidad de las OCs: el BO viene del Excel maestro en la unidad de la clave; el pendiente de cada OC viene en la unidad de compra.
  // Si la suma de las OCs no coincide con el BO, están en otra unidad: factor = BO ÷ suma de OCs.
  A.unidadOC=function(r,ocs){var s=0;(ocs||[]).forEach(function(o){s+=Number(o[1])||0;});var bo=Number(r.boT!=null?r.boT:r.bo)||0;
    if(!(s>0)||!(bo>0))return{suma:s,f:1,distinta:false};var f=bo/s;return{suma:s,f:f,distinta:Math.abs(f-1)>0.03};};
  var metaRed=null;
  A.tiendas=async function(sb,c,det){
    var caja=det.querySelector('div');if(det.dataset.listo)return;det.dataset.listo='1';caja.textContent='Leyendo…';
    try{
      if(!metaRed){var m=await sb.from('lab_red_meta').select('*');if(m.error)throw m.error;metaRed={};(m.data||[]).forEach(function(x){metaRed[x.id]=x;});}
      var q=await Promise.all([sb.from('lab_red').select('datos').eq('clave',c).maybeSingle(),sb.from('lab_red_inv').select('datos').eq('clave',c).maybeSingle()]);
      var v=(q[0].data&&q[0].data.datos)||null,i=(q[1].data&&q[1].data.datos)||null;
      if(!v&&!i){caja.innerHTML='<span class="mut">Sin información de tiendas para esta clave'+(metaRed.ventas?'':' (aún no se carga la red en el laboratorio)')+'.</span>';return;}
      var mv=(metaRed.ventas&&metaRed.ventas.datos)||{},cerr=mv.cerradas||[],uOk=!v||!i||!v.uv||!i.u||v.uv===i.u,nom={};
      Object.keys((v&&v.t)||{}).concat(Object.keys((i&&i.t)||{})).forEach(function(s){nom[s]=1;});
      var filas=Object.keys(nom).filter(function(s){return cerr.indexOf(s)<0;}).map(function(s){var a=(v&&v.t[s])||[0,null],b=(i&&i.t[s])||[0,0],base=typeof a[1]==='number'?a[1]:null,inv=(b[0]||0)+(b[1]||0);
        return{s:s,v:a[0]||0,b:a[1],ex:b[0]||0,pe:b[1]||0,m:a[0]>0?inv/a[0]:null,dif:base!=null&&uOk?inv-base:null};});
      filas.sort(function(x,y){return(x.dif==null?1e15:x.dif)-(y.dif==null?1e15:y.dif)||y.v-x.v;});
      var T={v:0,b:0,ex:0,pe:0,f:0,sb:0};filas.forEach(function(f){T.v+=f.v;T.ex+=f.ex;T.pe+=f.pe;if(typeof f.b==='number')T.b+=f.b;if(f.dif<0)T.f-=f.dif;if(f.dif>0)T.sb+=f.dif;});
      var h='<div style="overflow:auto;max-height:300px;margin-top:4px"><table style="width:100%;font-size:11.5px;border-collapse:collapse"><tr style="background:#eef1f7"><th style="text-align:left;padding:3px 6px">Tienda</th><th>Venta mensual</th><th>Número base</th><th>Existencia</th><th>Por llegar</th><th>Meses de inventario</th><th>Contra su base</th></tr>';
      var td=function(x,c2){return '<td style="text-align:right;padding:2px 6px;'+(c2||'')+'">'+x+'</td>';};
      filas.forEach(function(f){h+='<tr style="border-bottom:1px solid #eef1f7"><td style="padding:2px 6px">'+esc(f.s)+'</td>'+td(nf(f.v,1))+td(typeof f.b==='number'?nf(f.b):(f.b?esc(f.b):'—'))+td(nf(f.ex))+td(f.pe?nf(f.pe):'—')+td(f.m!=null?nf(f.m,1):'—')+
        td(f.dif==null?'—':f.dif<0?'le faltan '+nf(-f.dif):f.dif>0?'le sobran '+nf(f.dif):'en su base',f.dif<0?'color:#b91c1c;font-weight:600':f.dif>0?'color:#15803d':'')+'</tr>';});
      h+='<tr style="font-weight:700;background:#f6f8fc"><td style="padding:3px 6px">Total '+filas.length+' tiendas</td>'+td(nf(T.v,1))+td(nf(T.b))+td(nf(T.ex))+td(T.pe?nf(T.pe):'—')+td(T.v>0?nf((T.ex+T.pe)/T.v,1):'—')+td((T.f?'faltan '+nf(T.f):'')+(T.f&&T.sb?' · ':'')+(T.sb?'sobran '+nf(T.sb):''))+'</tr></table></div>';
      var fi=metaRed.inv&&metaRed.inv.datos&&metaRed.inv.datos.fecha;
      h+='<div class="mut" style="font-size:11px;margin-top:3px">Venta mensual = promedio de los últimos 12 meses de cada tienda'+(fi?' · existencias al '+esc(String(fi).split('-').reverse().join('/')):'')+'. Letras en número base: B y BX bloqueada, P pendiente.'+(uOk?'':' <b style="color:#b45309">La existencia viene en '+esc(i.u)+' y la venta en '+esc(v.uv)+': no se comparan contra la base.</b>')+'</div>';
      caja.innerHTML=h;
    }catch(e){det.dataset.listo='';caja.innerHTML='<span class="mut">No se pudo leer el detalle de tiendas'+(/lab_red/.test(String(e.message||e))||e.code==='42P01'?' (faltan las tablas de la red: lab_tablas_03.sql)':'')+'.</span>';}
  };
  A.detalle=function(sb,el,r,ocs,conBO){
    try{
      var kv=el.querySelector('.kv');if(!kv||!r)return;
      if(r.lab){
        var cD=celda(el,'Demanda portal');if(cD)cD.innerHTML=nf(r.D,1)+' / mes · <b>motor del laboratorio</b> · confiabilidad '+esc(r.lab.cf);
        var cL=celda(el,'Límites');if(cL)cL.innerHTML='riesgo al llegar al punto de alarma del motor ('+nf(r.lab.p)+') · sobre inventario con más de '+nf(r.pm*P.R.FACT_MAX,1)+' meses · hoy '+nf(r.mi,1)+' meses ('+nf(r.miB,1)+' con BO)';
        var cP=celda(el,'Propuesta');if(cP){cP.innerHTML=A.txtPropuesta(r,!!conBO);cP.insertAdjacentHTML('afterend','<b style="color:#b45309">Cálculo del laboratorio</b><span>'+A.txtLab(r)+'</span>');}
      }
      // tiendas: se lee hasta que se despliega
      var ancla=celda(el,'Mas Ferre')||celda(el,'Propuesta');
      if(ancla){var p=ancla.parentNode,b=document.createElement('b'),sp=document.createElement('span');b.textContent='Tiendas';
        sp.innerHTML='<details><summary class="lk" style="cursor:pointer;color:#1d4ed8">Ver venta, número base y existencia por sucursal</summary><div></div></details>';
        var sig=r.lab&&ancla===celda(el,'Propuesta')?ancla.nextElementSibling.nextElementSibling.nextElementSibling:ancla.nextElementSibling;p.insertBefore(b,sig);p.insertBefore(sp,sig);
        var det=sp.querySelector('details');det.addEventListener('toggle',function(){if(det.open)A.tiendas(sb,Number(r.c),det);});}
      // OCs abiertas: cantidad en la unidad de la clave y destino de las entregas directas
      var cO=celda(el,'OCs abiertas'),U=P.ocUni(r,ocs),hayED=(ocs||[]).some(function(o){return o[4];});
      var fF=function(f){return f?String(f).slice(0,10).split('-').reverse().join('/').replace(/\/20(\d\d)$/,'/$1'):'—';};
      // mismas cantidades que el portal de producción (factor exacto del RP03-08); aquí solo se agrega el destino de las entregas directas
      var pinta=function(m){
        cO.innerHTML=P.ocAviso(U,r,nf)+ocs.slice(0,6).map(function(o){return P.ocRenglon(o,U,nf,fF,esc,o[4]?' · <b style="color:#7c3aed">'+A.txtDestino(m&&m[o[0]])+'</b>':'');}).join('<br>')+(ocs.length>6?'<br><span class="mut">… y '+(ocs.length-6)+' más</span>':'');};
      if(cO&&ocs&&ocs.length){
        if(hayED)sb.from('plan_oc_lineas').select('folio,destino').eq('clave',Number(r.c)).eq('entrega_directa',true).then(function(q){
          if(q.error||!q.data)return;var m={};q.data.forEach(function(x){if(x.destino&&!m[x.folio])m[x.folio]=x.destino;});pinta(m);});
      }
    }catch(e){}
  };
  // Las funciones del portal que recalculan la propuesta desde la demanda usan «pedir hasta» del motor en las filas sustituidas
  if(window.P){
    var b0=P.baseRec,x0=P.sugX,p0=P.propSug;
    P.baseRec=function(p){var r=b0.apply(this,arguments);return p&&p.lab?Object.assign({},r,{c:p.D}):r;};
    P.sugX=function(r,X,conBO){return r&&r.lab&&X!=null&&Number(X)===Number(r.D)&&P.R.SIN_SUG_ROT.indexOf(r.rot)<0?A.prop(r,!!conBO):x0.apply(this,arguments);};
    P.propSug=function(p,c,conBO){
      if(!(p&&p.lab&&c>0&&Number(c)===Number(p.D)&&P.R.SIN_SUG_ROT.indexOf(p.rot)<0))return p0.apply(this,arguments);
      var q=A.prop(p,conBO!==false),mc=Number(p.mc)||0;if(mc>0&&q>0)q=P.ceil3(q/mc)*mc;if(p.tope!=null&&q>Number(p.tope))q=Math.max(0,Math.floor(Number(p.tope)));return q;};
  }
})();
