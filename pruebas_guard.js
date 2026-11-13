// AMBIENTE DE PRUEBAS · protección de los datos de producción
// Este repositorio es una copia del Portal de Compras V2 conectada a las mismas bases de datos.
// Este archivo va primero en cada página y hace que la copia sea de SOLO LECTURA:
//   · se permite leer todo, iniciar sesión y verificar PIN
//   · se permite escribir solo en tablas del laboratorio (prefijo lab_)
//   · se bloquea cualquier otra escritura (tablas, funciones, archivos) y el envío a Telegram
(function(){
  'use strict';
  var RPC_LECTURA=['cmp_verificar_pin','cmp_usuarios_con_pin'];
  var G=window.PRUEBAS={activo:true,bloqueados:[]};
  // ¿Se permite esta petición? Devuelve '' si sí, o el motivo si no.
  G.revisar=function(url,metodo){
    var m=String(metodo||'GET').toUpperCase(),u;
    try{u=new URL(url,location.href);}catch(e){return'';}
    if(/(^|\.)telegram\.org$/.test(u.hostname))return'envío a Telegram';
    if(!/\.supabase\.co$/.test(u.hostname))return'';
    if(m==='GET'||m==='HEAD'||m==='OPTIONS')return'';
    var p=u.pathname;
    if(p.indexOf('/auth/v1/')===0)return'';
    if(p.indexOf('/rest/v1/rpc/')===0){var f=p.slice(13).split('/')[0];return RPC_LECTURA.indexOf(f)>=0||f.indexOf('lab_')===0?'':'función '+f;}
    if(p.indexOf('/rest/v1/')===0){var t=p.slice(9).split('/')[0];return t.indexOf('lab_')===0?'':'escritura en la tabla '+t;}
    if(p.indexOf('/storage/v1/object/sign/')===0||p.indexOf('/storage/v1/object/list/')===0)return'';
    if(p.indexOf('/storage/v1/')===0)return'cambio de archivos guardados';
    return'escritura en la base de datos';
  };
  var aviso=function(motivo){
    G.bloqueados.push({cuando:new Date().toISOString(),motivo:motivo});
    try{
      var d=document.getElementById('pruebas-aviso');
      if(!d){d=document.createElement('div');d.id='pruebas-aviso';d.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:360px;background:#7a1f1f;color:#fff;font:13px/1.35 Arial,sans-serif;padding:10px 14px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.35)';(document.body||document.documentElement).appendChild(d);}
      d.textContent='Ambiente de pruebas: no se guardó ('+motivo+'). Los datos reales no cambian.';d.style.display='block';
      clearTimeout(G._t);G._t=setTimeout(function(){d.style.display='none';},6000);
    }catch(e){}
  };
  var f0=window.fetch;
  window.fetch=function(entrada,opc){
    var url=typeof entrada==='string'?entrada:(entrada&&entrada.url)||String(entrada);
    var met=(opc&&opc.method)||(entrada&&typeof entrada!=='string'&&entrada.method)||'GET';
    var motivo=G.revisar(url,met);
    if(motivo){aviso(motivo);
      return Promise.resolve(new Response(JSON.stringify({message:'Ambiente de pruebas: solo lectura ('+motivo+')',code:'PRUEBAS',details:null,hint:null}),{status:403,statusText:'Ambiente de pruebas',headers:{'Content-Type':'application/json'}}));}
    return f0.apply(this,arguments);
  };
  // Por si alguna página usa otra vía para enviar datos
  var x0=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(met,url){var motivo=G.revisar(url,met);if(motivo){aviso(motivo);throw new Error('Ambiente de pruebas: solo lectura ('+motivo+')');}return x0.apply(this,arguments);};
  if(navigator.sendBeacon){var b0=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(url){var motivo=G.revisar(url,'POST');if(motivo){aviso(motivo);return false;}return b0.apply(null,arguments);};}
  // Franja visible (solo en la página principal, no en cada pestaña interna)
  var franja=function(){
    if(window.top!==window.self||document.getElementById('pruebas-franja'))return;
    var d=document.createElement('div');d.id='pruebas-franja';
    d.style.cssText='position:sticky;top:0;z-index:2147483646;background:#b45309;color:#fff;font:bold 13px Arial,sans-serif;text-align:center;padding:5px 8px;letter-spacing:.3px';
    d.textContent='AMBIENTE DE PRUEBAS · datos reales en solo lectura · aquí nada se guarda en el portal de producción';
    document.body.insertBefore(d,document.body.firstChild);
  };
  if(document.body)franja();else document.addEventListener('DOMContentLoaded',franja);
})();
