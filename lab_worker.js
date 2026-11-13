// Portal de Compras V2 · LABORATORIO · cálculo en segundo plano (no congela la pantalla)
'use strict';
importScripts('plan_logica.js?v=20261113a','lab_motor.js?v=20261113c');
let D=null,portal=null;
self.onmessage=e=>{
  const m=e.data;
  try{
    if(m.tipo==='datos'){D=m.datos;portal=LAB.portalDe(P,D);self.postMessage({tipo:'datos-ok',claves:D.claves.length,meses:D.meses.length});return;}
    if(m.tipo==='correr'){
      if(!D)throw new Error('Aún no hay datos cargados');
      D.portal=m.comparar?portal:null;let ult=0;
      const R=LAB.correr(D,m.param,{progreso:(t,f)=>{const a=Date.now();if(a-ult>200||f>=1){ult=a;self.postMessage({tipo:'progreso',t,f});}}});
      self.postMessage({tipo:'listo',R,id:m.id});
    }
  }catch(err){self.postMessage({tipo:'error',mensaje:String(err&&err.message||err)});}
};
