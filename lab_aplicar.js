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
    if(A.pub){var m=new Map();(A.pub.datos||[]).forEach(function(x){m.set(Number(x[0]),{d:x[1],p:x[2],h:x[3],cf:x[4],inn:x[5]||0,mas:x[6]||0});});A.pub.mapa=m;}
    return A.pub;
  };
  // Redondeo a empaque con la misma regla del portal (P.empaque); inn y mas ya vienen en la unidad de la clave
  var emp=function(q,x){if(!q||!(x.inn>0||x.mas>0))return null;if(x.mas>0&&q>=x.mas)return Math.max(x.mas,Math.round(q/x.mas)*x.mas);if(x.inn>0)return Math.ceil(q/x.inn)*x.inn;return x.mas;};
  A.prop=function(r,conBO){var l=r.lab;return Math.max(0,P.ceil3(l.h-((Number(r.ex)||0)+(conBO?Math.max(0,Number(r.bo)||0):0)+(Number(r.xd)||0))));};
  A.fila=function(r,x,fecha){
    var ex=Number(r.ex)||0,bo=Math.max(0,Number(r.bo)||0),lt=Number(r.lt)||0,pm=Number(r.pm)||0,r2=function(v){return Math.round(v*100)/100;};
    r.lab={D:r.D,s:r.s,s0:r.s0,est:r.est,h:x.h,p:x.p,cf:x.cf};
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
