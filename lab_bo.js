// AMBIENTE DE PRUEBAS · BO del CEDI completado con las OCs abiertas (decisión de Fernando, 24-nov-2026)
// El BO del cálculo diario sale de la columna BACK ORDER del archivo; las OCs levantadas el día del corte o después aún no vienen ahí.
// BO usado = mínimo( BO del archivo (ya sin entregas directas) + pendiente de OCs válidas levantadas el día del cálculo o después ,
//                     pendiente de todas las OCs válidas )
// OC válida: abierta, no cancelada, sin entrega directa, sin destino de tienda (van directo a la tienda) y con máximo 90 días de levantada.
// La cantidad de la OC se pasa a la unidad de la clave con el factor del RP03-08 (plan_unidades.f_compra); sin factor, misma unidad.
(function(){
  'use strict';
  var B=window.LABBO={DIAS_MAX:90,cache:null};
  var todo=async function(q){var out=[];for(var i=0;i<200000;i+=1000){var r=await q().range(i,i+999);if(r.error)throw r.error;out=out.concat(r.data||[]);if(!r.data||r.data.length<1000)break;}return out;};
  B.cargar=function(sb){
    if(B.cache)return B.cache;
    B.cache=(async function(){
      var lim=new Date(Date.now()-B.DIAS_MAX*864e5).toISOString().slice(0,10);
      var ocs=await todo(function(){return sb.from('plan_oc_lineas').select('folio,clave,fecha_oc,cantidad_pend,destino').is('cerrada_en',null).not('cancelada','is',true).not('entrega_directa','is',true).gte('fecha_oc',lim).gt('cantidad_pend',0).order('folio').order('clave');});
      var U=new Map();try{(await todo(function(){return sb.from('plan_unidades').select('clave,f_compra').order('clave');})).forEach(function(x){var f=Number(x.f_compra);if(f>0)U.set(Number(x.clave),f);});}catch(e){}
      var M=new Map();ocs.forEach(function(o){if(o.destino&&String(o.destino).trim())return;var c=Number(o.clave),q=(Number(o.cantidad_pend)||0)*(U.get(c)||1);
        var x=M.get(c);if(!x)M.set(c,x=[]);x.push({folio:o.folio,fecha:String(o.fecha_oc).slice(0,10),q:q});});
      return M;})();
    return B.cache;
  };
  // rows: filas del cálculo con c (clave) y bo; fecha: AAAA-MM-DD del cálculo. Cambia r.bo y deja r.boArch, r.boNuevas, r.boOCs.
  B.ajustar=async function(sb,rows,fecha){
    var M;try{M=await B.cargar(sb);}catch(e){B.error=e.message||String(e);return null;}
    var f0=String(fecha||'').slice(0,10),res={sube:0,baja:0,pzsSube:0,pzsBaja:0};
    rows.forEach(function(r){if(r.boArch!=null)return;var bo=Math.max(0,Number(r.bo)||0),l=M.get(Number(r.c))||[];var tot=0,nue=0,fn=[];
      l.forEach(function(o){tot+=o.q;if(o.fecha>=f0){nue+=o.q;fn.push(o.folio);}});
      var b=Math.round(Math.min(bo+nue,tot)*10000)/10000;r.boArch=bo;r.boNuevas=nue;r.boOCs=tot;r.boFolios=fn;
      if(Math.abs(b-bo)>1e-6){if(b>bo){res.sube++;res.pzsSube+=b-bo;}else{res.baja++;res.pzsBaja+=bo-b;}r.bo=b;}});
    B.res=res;return res;
  };
  B.texto=function(r){if(r.boArch==null)return'';var t='BO del archivo '+Math.round(r.boArch*100)/100;
    if(r.boNuevas>0)t+=' + OCs nuevas '+Math.round(r.boNuevas*100)/100+' (folio '+r.boFolios.join(', ')+')';
    t+=' · OCs abiertas válidas '+Math.round(r.boOCs*100)/100+' → <b>BO usado '+Math.round((Number(r.bo)||0)*100)/100+'</b>';return t;};
})();
