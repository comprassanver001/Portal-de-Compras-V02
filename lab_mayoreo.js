// AMBIENTE DE PRUEBAS · Venta de mayoreo por clave para las fichas del portal de prueba (Planeación, Histórico de Inventarios).
// Sale de la plantilla de ventas mensuales cargada en el Laboratorio (hoja VENTAS_MAYOREO → tablas lab_red y lab_red_meta).
// El mayoreo es parte de la venta SANVER (SANVER = mayoreo + distribución a tiendas).
(function(){
  'use strict';
  var M=window.LABMY={meta:null};
  M.cargarMeta=function(sb){
    if(!M.meta)M.meta=sb.from('lab_red_meta').select('datos,cargado_en').eq('id','ventas').maybeSingle()
      .then(function(r){return r.error||!r.data?null:{meses:(r.data.datos||{}).meses||[],en:r.data.cargado_en};}).catch(function(){return null;});
    return M.meta;
  };
  // pone o.ventas.MAYOREO = {'AAAA-MM': piezas}
  // con claves sustituidas (o.sust.lst = [{o, f}]) se suma su mayoreo por su parte, igual que la venta SANVER
  M.cargar=async function(sb,c,o){
    try{var mt=await M.cargarMeta(sb);if(!mt||!mt.meses.length)return;
      var lst=[[c,1]].concat(((o.sust&&o.sust.lst)||[]).map(function(x){return[Number(x.o),Number(x.f)||1];}));
      var r=await sb.from('lab_red').select('clave,datos').in('clave',lst.map(function(x){return x[0];}));if(r.error||!r.data||!r.data.length)return;
      var v={},hay=false;r.data.forEach(function(row){var f=(lst.find(function(x){return x[0]===Number(row.clave);})||[0,1])[1],p=(row.datos||{}).my||[];
        for(var i=0;i<p.length;i+=2){var m=mt.meses[p[i]];if(m){v[m]=(v[m]||0)+(Number(p[i+1])||0)*f;hay=true;}}});
      if(!hay)return;mt.meses.forEach(function(m){if(v[m]==null)v[m]=0;});o.ventas.MAYOREO=v;o.myEn=mt.en;
    }catch(e){}
  };
  // texto del resumen: venta de mayoreo de los últimos 12 meses cerrados y su parte de la venta SANVER
  M.resumen=function(o,ref){
    var my=o.ventas.MAYOREO,sv=o.ventas.SANVER||{};if(!my)return'';var ks=Object.keys(my).filter(function(m){return m<ref;}).sort().slice(-12),t=0,s=0;
    ks.forEach(function(m){t+=my[m]||0;s+=Number(sv[m])||0;});
    var f=function(x){return Math.round(x).toLocaleString('es-MX');};
    return 'últimos 12 meses '+f(t)+(s>0?' · '+Math.round(t/s*100)+'% de la venta SANVER':'');
  };
})();
