// Portal de Compras V2 · LABORATORIO · prueba histórica del motor desde la línea de comandos (Node)
// Uso: node lab_prueba.js datos.json plan_logica.js salida.json [parametros.json]
// Es el mismo cálculo que corre la pantalla del laboratorio (LAB.correr en lab_motor.js).
'use strict';
const fs=require('fs');const L=require('./lab_motor.js');
const [,,fDatos,fLogica,fSalida,fParam]=process.argv;
const D=JSON.parse(fs.readFileSync(fDatos,'utf8'));
const PL=new Function(fs.readFileSync(fLogica,'utf8').replace(/if\(typeof window[^\n]*\n?/,'')+';return P;')();
D.portal=L.portalDe(PL,D);
const t0=Date.now();let ult='';
const R=L.correr(D,fParam?JSON.parse(fs.readFileSync(fParam,'utf8')):null,{progreso:(t,f)=>{const p=Math.floor(f*10);if(p!==ult){ult=p;console.error(((Date.now()-t0)/1000).toFixed(1)+'s '+t);}}});
fs.writeFileSync(fSalida,JSON.stringify(R));
