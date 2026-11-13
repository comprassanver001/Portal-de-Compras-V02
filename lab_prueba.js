// Portal de Compras V2 · LABORATORIO · prueba histórica del motor (Node)
// Uso: node lab_prueba.js datos.json plan_logica.js salida.json [parametros.json]
// Regla de oro: en cada mes de prueba solo se usa información anterior a ese mes
// (ventas, temporada, crecimiento, elección de método y márgenes de error).
'use strict';
const fs=require('fs');const L=require('./lab_motor.js');
const [,,fDatos,fLogica,fSalida,fParam]=process.argv;
const P=L.params(fParam?JSON.parse(fs.readFileSync(fParam,'utf8')):null);
const D=JSON.parse(fs.readFileSync(fDatos,'utf8'));
const PL=new Function(fs.readFileSync(fLogica,'utf8').replace(/if\(typeof window[^\n]*\n?/,'')+';return P;')();
const MES=D.meses,T=MES.length,m0=Number(MES[0].slice(5))-1;
const K=D.claves,n=K.length;
const MET=['EST','REC','P12','SBA','TSB','TEND','ANIO','MEZ','CMB','CM3','PORTAL'],nM=MET.length,iM=Object.fromEntries(MET.map((m,i)=>[m,i]));
const O_MIN=12,nO=T-O_MIN+1;          // orígenes O_MIN..T
const oi=o=>o-O_MIN;
const TIPOS=['REGULAR','ERRATICA','INTERMITENTE','IRREGULAR','SIN HISTORIA'];
const hb=H=>H<=2?0:H<=4?1:2;          // grupo de horizonte para juntar errores
const t0=Date.now();const log=s=>console.error(((Date.now()-t0)/1000).toFixed(1)+'s '+s);

// ── 1. Pronósticos de todos los métodos en todos los meses de origen ──
const F3=new Float32Array(n*nO*nM),FH=new Float32Array(n*nO*nM);   // venta acumulada pronosticada a H_SEL y al horizonte de protección
const A3=new Float32Array(n*nO).fill(NaN),AH=new Float32Array(n*nO).fill(NaN),PR=new Float32Array(n*nO),TP=new Uint8Array(n*nO);
const Hp=K.map(k=>Math.min(P.H_MAX,Math.max(0.5,(k.lt||0)+P.CICLO)));
const vFin=K.map(k=>L.validos(k.s,T,P));
const sObj=K.map(k=>{const o={};k.s.forEach((x,t)=>{if(x)o[MES[t]]=x;});return o;});
const portalD=(i,o)=>{
  const k=K[i],ref=MES[o]||PL.ym(MES[T-1],1);const s={};for(const m in sObj[i])if(m<ref)s[m]=sObj[i][m];
  const N=Math.max(1,Math.ceil(k.pm||1));const no=()=>false;
  const ap=PL.antPron(s,ref,N,no,PL.ym(ref,-1),MES[0]);
  const Dprom=ap.I!=null?ap.I:(ap.A!=null&&ap.P!=null?(ap.A+ap.P)/2:(ap.A??ap.P??0));
  const ly=PL.R.TEMP_MODO==='INDICE'?PL.antPron(s,PL.ym(ref,-12),N,no,PL.ym(ref,-13),MES[0]):null;
  const br=PL.baseRec({A:ap.A,P:ap.P,N,pm:k.pm,nA:ap.nA,nP:ap.nP,bD:ap.I!=null?'INTERMITENTE 12 MESES':'',D:Dprom,Aly:ly?ly.A:undefined,nAly:ly?ly.nA:undefined});
  let c0=br.c;if(br.b!=='INTER'&&ap.W>0&&ap.nW>=6&&(!(c0>0)||c0<ap.W/PL.R.IRREG||c0>ap.W*PL.R.IRREG))c0=ap.W;
  return c0>PL.R.D_MIN*1.0001?c0:0;
};
const fCache=fDatos+'.portal.cache.json';let CP=null;try{CP=JSON.parse(fs.readFileSync(fCache,'utf8'));}catch(e){}
const nuevoCP=CP?null:new Array(n*nO);
const ultimo={};   // datos del último origen (o = T) para la salida por clave
for(let o=O_MIN;o<=T;o++){
  const items=K.map((k,i)=>({s:k.s,v:L.validos(k.s,o,P),llaves:[k.g+'|'+k.sg+'|'+k.ssg,k.g+'|'+k.sg,k.g]}));
  const idx=L.indices(items,o,m0,P),cre=L.crecimiento(items,o,P);
  for(let i=0;i<n;i++){
    const k=K[i],it=items[i],I=idx(it.llaves),g=cre(k.g);
    const pd=CP?CP[i*nO+oi(o)]:(nuevoCP[i*nO+oi(o)]=Math.round(portalD(i,o)*1e4)/1e4);
    const F=L.pronosticar({s:k.s,v:it.v,o,m0,I,g,portal:pd},12,P);
    const b=(i*nO+oi(o));
    for(let m=0;m<nM;m++){const f=F[MET[m]];F3[b*nM+m]=L.acum(f,P.H_SEL);FH[b*nM+m]=L.acum(f,Hp[i]);}
    let t=0,c=0;for(let x=Math.max(0,o-12);x<o;x++)if(it.v[x]){t+=k.s[x];c++;}PR[b]=c?t/c:0;
    TP[b]=TIPOS.indexOf(L.tipo(k.s,it.v,o));
    // venta real posterior (solo si esos meses no son sospechosos de agotado)
    if(o+P.H_SEL<=T){let ok=1,a=0;for(let h=0;h<P.H_SEL;h++){if(!vFin[i][o+h]&&k.s[o+h]===0)ok=0;a+=k.s[o+h];}if(ok)A3[b]=a;}
    const hc=Math.ceil(Hp[i]);if(o+hc<=T){let ok=1;for(let h=0;h<hc;h++)if(!vFin[i][o+h]&&k.s[o+h]===0)ok=0;if(ok)AH[b]=L.acum(k.s,Hp[i],o);}
    if(o===T)ultimo[i]={F,I,g,pd,v:it.v};
  }
  if(o%6===0||o===T)log('origen '+(MES[o]||'siguiente'));
}

if(nuevoCP)fs.writeFileSync(fCache,JSON.stringify(nuevoCP));
// ── 2. Elección del método con lo conocido antes de t ──
// Devuelve por clave el método elegido y sus pruebas pasadas
const elegirEn=(t,candidatos)=>{
  const cand=candidatos.map(m=>iM[m]);
  const a=Math.max(O_MIN,t-P.H_SEL-P.ORIGENES+1),bf=t-P.H_SEL;
  const err=new Float64Array(n*nM),cnt=new Uint16Array(n),sumA=new Float64Array(n);
  for(let i=0;i<n;i++)for(let o=a;o<=bf;o++){const b=i*nO+oi(o);const A=A3[b];if(isNaN(A))continue;cnt[i]++;sumA[i]+=A;for(const m of cand)err[i*nM+m]+=Math.abs(F3[b*nM+m]-A);}
  // método por omisión de cada tipo de venta: el de menor error escalado sumando sus claves
  const tot=TIPOS.map(()=>new Float64Array(nM));
  for(let i=0;i<n;i++){if(cnt[i]<3||!(sumA[i]>0))continue;const tp=TP[i*nO+oi(Math.min(t,T))];for(const m of cand)tot[tp][m]+=err[i*nM+m]/(sumA[i]/cnt[i]);}
  const omi=tot.map(x=>{let b=cand[0];for(const m of cand)if(x[m]<x[b])b=m;return b;});
  const sel=new Uint8Array(n),propio=new Uint8Array(n);
  for(let i=0;i<n;i++){
    const tp=TP[i*nO+oi(Math.min(t,T))];const e={};for(const m of cand)e[MET[m]]=err[i*nM+m];
    const r=L.elegir(e,cnt[i],MET[omi[tp]],P);sel[i]=iM[r.m];propio[i]=r.propio?1:0;
  }
  return{sel,propio,omi,cnt,err,sumA};
};
// Errores escalados (u) pasados del método elegido, al horizonte de protección
const GR={A:0,B:1,C:2};
const gradoEn=E=>{const g=new Uint8Array(n);for(let i=0;i<n;i++)g[i]=GR[L.calificar(E.sumA[i]>0?E.err[i*nM+E.sel[i]]/E.sumA[i]:NaN,E.cnt[i],P)];return g;};
// Los errores se juntan entre claves parecidas: mismo tipo de venta, mismo horizonte y misma confiabilidad
const erroresEn=(t,sel,gr)=>{
  const propios=new Array(n);const pozo=TIPOS.map(()=>[0,1,2].map(()=>[[],[],[]]));
  for(let i=0;i<n;i++){
    const hc=Math.ceil(Hp[i]),a=Math.max(O_MIN,t-hc-P.ORIGENES-6),bf=t-hc;const u=[];
    for(let o=a;o<=bf;o++){const b=i*nO+oi(o);const A=AH[b];if(isNaN(A))continue;const F=FH[b*nM+sel[i]];const e=L.escala(F,PR[b],Hp[i],P);if(e>1e-6)u.push(Math.min(20,(A-F)/e));}
    u.sort((x,y)=>x-y);propios[i]=u;
    if(K[i].rot==='SAGRADOS'||K[i].rot==='ALTA ROTACION'||K[i].rot==='MEDIA ROTACION'){const z=pozo[TP[i*nO+oi(Math.min(t,T))]][hb(Hp[i])][gr[i]];for(const x of u)z.push(x);}
  }
  pozo.forEach(a=>a.forEach(b=>b.forEach(z=>z.sort((x,y)=>x-y))));
  return{propios,pozo};
};

// ── 3. Prueba: meses t donde ya se conoce la venta real posterior ──
const ROT=['SAGRADOS','ALTA ROTACION','MEDIA ROTACION'];
const enUniverso=i=>ROT.includes(K[i].rot);
const nuevaMet=()=>({n:0,ae:0,se:0,sa:0,at:0,corto:0,pasa:0,nr:0});
const sumar=(M,F,A,esc)=>{M.n++;M.ae+=Math.abs(F-A)/esc;M.se+=(F-A)/esc;M.sa+=A/esc;if(A>0){M.nr++;const r=F/A;if(Math.abs(r-1)<=0.3)M.at++;if(r<0.7)M.corto++;if(r>1.5)M.pasa++;}};
const cerrar=M=>({n:M.n,error:M.ae/M.sa,sesgo:M.se/M.sa,atina30:M.at/M.nr,muyCorto:M.corto/M.nr,sePasa:M.pasa/M.nr});
const pruebas=[];for(let t=O_MIN+P.H_SEL+P.MIN_ORIGENES;t+P.H_SEL<=T;t++)pruebas.push(t);
const escClave=new Float64Array(n);{for(let i=0;i<n;i++){let s=0,c=0;for(const t of pruebas){const A=A3[i*nO+oi(t)];if(!isNaN(A)){s+=A;c++;}}escClave[i]=c&&s>0?s/c:0;}}
const res={};const acc=(nombre,grupo)=>((res[nombre]=res[nombre]||{})[grupo]=res[nombre][grupo]||nuevaMet());
const cal={};const accCal=g=>cal[g]=cal[g]||{n:0,cubreNuevo:0,cubreActual:0,mesesNuevo:0,mesesActual:0,objetivo:0,nm:0,dem:0,fNuevo:0,fActual:0,aN:[],aA:[]};
const porGrado={A:nuevaMet(),B:nuevaMet(),C:nuevaMet()};const usoMet={};
const VARIANTES={'Motor (elige método por clave)':MET,'Motor sin el método actual':MET.filter(m=>m!=='PORTAL')};
for(const t of pruebas){
  const reciente=MES[t]>='2025-11';
  const elec={};for(const v in VARIANTES)elec[v]=elegirEn(t,VARIANTES[v]);
  const E=elec['Motor (elige método por clave)'];const gr=gradoEn(E);const er=erroresEn(t,E.sel,gr);
  for(let i=0;i<n;i++){
    if(!enUniverso(i)||!(escClave[i]>0))continue;
    const b=i*nO+oi(t),A=A3[b];
    if(!isNaN(A)){
      const grupos=['Todas',K[i].rot,TIPOS[TP[b]]].concat(reciente?['Todas · nov-2025 a ago-2026']:[]);
      for(const g of grupos){
        for(const m of MET)sumar(acc(L.METODOS[m],g),F3[b*nM+iM[m]],A,escClave[i]);
        for(const v in VARIANTES)sumar(acc(v,g),F3[b*nM+elec[v].sel[i]],A,escClave[i]);
      }
      const eRel=E.sumA[i]>0?E.err[i*nM+E.sel[i]]/E.sumA[i]:NaN;
      sumar(porGrado[L.calificar(eRel,E.cnt[i],P)],F3[b*nM+E.sel[i]],A,escClave[i]);
      usoMet[MET[E.sel[i]]]=(usoMet[MET[E.sel[i]]]||0)+1;
    }
    // Calibración del nivel de servicio al horizonte de protección (T. entrega + ciclo)
    const AHt=AH[b];
    if(!isNaN(AHt)&&t+Math.ceil(Hp[i])<=T){
      const p=P.SERVICIO[K[i].rot]||P.SERVICIO_DEF;const F=FH[b*nM+E.sel[i]];const esc=L.escala(F,PR[b],Hp[i],P);
      const q=L.cuantilMezcla(er.propios[i],er.pozo[TP[b]][hb(Hp[i])][gr[i]],p,P);
      const hasta=L.inventario({Fh:F,Flt:F,Dm:F/Hp[i],esc,escLt:esc,qServ:q},P).hasta;const Dp=FH[b*nM+iM.PORTAL]/Hp[i];const hastaAct=Dp*((K[i].lt||0)+(K[i].pm||0));
      for(const g of ['Todas',K[i].rot]){const c=accCal(g);c.n++;c.objetivo+=p;if(AHt<=hasta+1e-9)c.cubreNuevo++;if(AHt<=hastaAct+1e-9)c.cubreActual++;
        const em=escClave[i]/P.H_SEL;c.nm++;c.aN.push(hasta/em);c.aA.push(hastaAct/em);c.mesesNuevo+=hasta/em;c.mesesActual+=hastaAct/em;c.dem+=AHt/em;c.fNuevo+=Math.max(0,AHt-hasta)/em;c.fActual+=Math.max(0,AHt-hastaAct)/em;}
    }
  }
  log('prueba '+MES[t]);
}
const resumen={};for(const m in res){resumen[m]={};for(const g in res[m])resumen[m][g]=cerrar(res[m][g]);}
const calib={};for(const g in cal){const c=cal[g];calib[g]={n:c.n,objetivo:c.objetivo/c.n,cubreMotor:c.cubreNuevo/c.n,cubreActual:c.cubreActual/c.n,mesesMotor:c.mesesNuevo/c.nm,mesesActual:c.mesesActual/c.nm,medMotor:L.mediana(c.aN),medActual:L.mediana(c.aA),surtidoMotor:1-c.fNuevo/c.dem,surtidoActual:1-c.fActual/c.dem};}

// ── 4. Cálculo vigente (o = T): salida por clave ──
const E=elegirEn(T,MET),grT=gradoEn(E),er=erroresEn(T,E.sel,grT);
const claves=[];
for(let i=0;i<n;i++){
  const k=K[i],u=ultimo[i],b=i*nO+oi(T),m=MET[E.sel[i]],f=u.F[m];
  const p=P.SERVICIO[k.rot]||P.SERVICIO_DEF,H=Hp[i],lt=Math.max(0.25,k.lt||0);
  const Fh=L.acum(f,H),Flt=L.acum(f,Math.min(lt,H)),esc=L.escala(Fh,PR[b],H,P),escLt=L.escala(Flt,PR[b],Math.min(lt,H),P);
  const pozo=er.pozo[TP[b]][hb(H)][grT[i]],pr=er.propios[i];
  const q=x=>L.cuantilMezcla(pr,pozo,x,P);
  const Dm=Fh/H;
  const inv=L.inventario({Fh,Flt,Dm,esc,escLt,qServ:q(p),ex:k.ex,bo:0,conBO:false},P);
  const eRel=E.sumA[i]>0?E.err[i*nM+E.sel[i]]/E.sumA[i]:null;
  claves.push({c:k.c,d:k.d,g:k.g,sg:k.sg,ssg:k.ssg,comp:k.comp,rot:k.rot,lt:k.lt,pm:k.pm,ex:k.ex,
    tipo:TIPOS[TP[b]],metodo:m,propio:!!E.propio[i],pruebas:E.cnt[i],errRel:eRel,conf:L.calificar(eRel,E.cnt[i],P),
    servicio:p,H,Dm,f:Array.from(f,x=>Math.round(x*1000)/1000),idx:Array.from(u.I,x=>Math.round(x*1000)/1000),crec:u.g,
    bajo:Math.max(0,Fh+q(0.10)*esc),esperado:Fh,alto:Math.max(0,Fh+q(0.90)*esc),
    hasta:inv.hasta,punto:inv.punto,seguridad:inv.seguridad,propuesta:inv.propuesta,pedir:inv.pedir,
    Dportal:u.pd,DportalExcel:k.Dact,propPortal:Math.max(0,u.pd*((k.lt||0)+(k.pm||0))-k.ex),
    mesesHasta:Dm>0?inv.hasta/Dm:null,mesesPortal:(k.lt||0)+(k.pm||0)});
}
fs.writeFileSync(fSalida,JSON.stringify({version:L.VERSION,param:P,meses:MES,pruebas:pruebas.map(t=>MES[t]),resumen,calibracion:calib,
  porConfiabilidad:Object.fromEntries(Object.entries(porGrado).map(([g,M])=>[g,cerrar(M)])),usoMetodos:usoMet,
  omision:Object.fromEntries(TIPOS.map((t,j)=>[t,MET[E.omi[j]]])),claves}));
log('listo');
