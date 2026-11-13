// Portal de Compras V2 · LABORATORIO · motor de pronóstico y niveles de inventario
// Ambiente de pruebas: este archivo NO lo usa el portal de producción.
// Sin dependencias. El mismo código corre en el navegador (window.LAB) y en la prueba histórica (Node).
//
// Convención: una serie es un arreglo de ventas mensuales alineado a una lista global de meses.
//   o  = posición del primer mes a pronosticar (la historia es [0, o)).
//   m0 = mes del año (0 = enero) de la posición 0.
//   v  = arreglo 0/1 del mismo largo: 1 = el mes cuenta, 0 = no cuenta (agotado, antes de la primera venta…).
(function(root){
'use strict';
const L={VERSION:'0.2.0'};

// ── Variables del cálculo (todas modificables; estos son los valores sugeridos) ──
L.PARAM={
  // Nivel de venta
  HIST:12,            // meses de historia para el nivel
  MEDIA_VIDA:6,       // un mes de hace MEDIA_VIDA meses pesa la mitad que el último
  TOPE_PICO:5,        // un mes se topa a TOPE_PICO × la mediana de los meses con venta
  // Crecimiento por grupo (últimos 12 meses contra los 12 previos)
  CREC_MIN:-0.20, CREC_MAX:0.25, CREC_AMORT:0.5, CREC_MIN_CLAVES:5,
  // Índice de temporada (sub-subgrupo → subgrupo → grupo)
  IDX_K:10,           // con IDX_K clave-años pesa la mitad lo propio y la mitad el nivel superior
  IDX_MIN:0.3, IDX_MAX:3, IDX_MESES_MIN:6, IDX_TOPE:4,
  // Venta intermitente
  SBA_ALFA:0.10, TSB_ALFA:0.10, TSB_BETA:0.10,
  // Tendencia amortiguada
  TEND_ALFA:0.30, TEND_BETA:0.10, TEND_PHI:0.85, TEND_HIST:24,
  // Mismo mes del año pasado
  ANIO_CREC_MIN:0.7, ANIO_CREC_MAX:1.4,
  // Meses sospechosos de agotado cuando no hay dato de existencia
  REGULAR:10, RACHA:2,
  // Selección del método por clave
  H_SEL:3,            // se compara la venta acumulada de H_SEL meses
  ORIGENES:18,        // meses de prueba que se miran hacia atrás
  MIN_ORIGENES:12,    // con menos pruebas la clave usa el método de su tipo de venta
  MARGEN:0.30,        // el método propio debe ganarle 30% al del tipo para usarse (con menos margen, elegir por clave no mejoró en la prueba)
  // Rango e inventario
  SERVICIO:{'SAGRADOS':0.98,'ALTA ROTACION':0.95,'MEDIA ROTACION':0.90,'LENTA ROTACION':0.85,'NUEVOS':0.90},
  SERVICIO_DEF:0.90,
  DIAS_REACCION:7,    // días entre que suena la alarma y se levanta el pedido (se suman al T. entrega)
  COBERTURA_MESES:0,  // meses de venta que debe cubrir cada pedido; 0 = los meses objetivo de cada clave
  CON_BO:0,           // 1 = el BO del CEDI cuenta como disponible
  FACT_ALARMA:1.2,    // regla actual del portal: alarma con menos de T. entrega × este factor
  H_MAX:9,            // horizonte máximo que se puede probar con el historial
  K_MEZCLA:8,         // con K_MEZCLA pruebas pesa la mitad el error propio y la mitad el del tipo
  SEG_MAX:6,          // el inventario de seguridad no pasa de SEG_MAX meses de venta esperada (0 = sin tope)
  PISO_ESCALA:0.25,   // el error se mide contra al menos 25% de la venta promedio
  // Calificación de confiabilidad
  CONF_A:0.25, CONF_B:0.50, CONF_MIN_PRUEBAS:10
};
L.METODOS={
  EST:'Nivel con temporada y crecimiento',
  REC:'Últimos meses con temporada',
  P12:'Promedio 12 meses',
  SBA:'Intermitente (tamaño ÷ intervalo)',
  TSB:'Intermitente (probabilidad × tamaño)',
  TEND:'Tendencia amortiguada',
  ANIO:'Mismo mes del año pasado',
  MEZ:'Mezcla nivel + año pasado',
  CMB:'Combinado (nivel con temporada + promedio 12)',
  CM3:'Combinado de tres (nivel, promedio 12, intermitente)',
  PORTAL:'Método actual del portal'
};
L.params=p=>{const o=Object.assign({},L.PARAM,p||{});o.SERVICIO=Object.assign({},L.PARAM.SERVICIO,(p&&p.SERVICIO)||{});return o;};

// ── Utilidades ──
const mediana=a=>{if(!a.length)return NaN;const b=Array.from(a).sort((x,y)=>x-y);const n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;};
const clip=(x,a,b)=>Math.min(b,Math.max(a,x));
// Cuantil (interpolado) de un arreglo YA ordenado
// Posición p×(n+1): con pocas pruebas no se subestima el extremo (corrección de muestra chica)
const cuantilOrd=(b,p)=>{const n=b.length;if(!n)return NaN;if(n===1)return b[0];const h=clip(clip(p,0,1)*(n+1)-1,0,n-1),i=Math.floor(h);return i>=n-1?b[n-1]:b[i]+(h-i)*(b[i+1]-b[i]);};
L.mediana=mediana;L.cuantilOrd=cuantilOrd;
// Suma de los primeros H meses de f (H puede ser fraccional)
L.acum=(f,H,desde)=>{let t=0;const d=desde||0;for(let k=0;k<Math.ceil(H);k++){const x=f[d+k];if(x==null||isNaN(x))return NaN;t+=Math.min(1,H-k)*x;}return t;};

// ── Meses que cuentan ──
// Sin dato de existencia: clave regular (vendió ≥ REGULAR de los 12 meses previos) con una racha de ≥ RACHA meses en cero = sospechoso de agotado.
// Solo se mira la historia anterior a o (nunca información futura).
L.validos=(s,o,P,extra)=>{
  const v=new Uint8Array(s.length);let ini=-1;
  for(let t=0;t<o;t++)if(s[t]>0){ini=t;break;}
  if(ini<0)return v;
  for(let t=ini;t<o;t++){
    v[t]=1;
    if(extra&&extra[t]===0){v[t]=0;continue;}
    if(s[t]>0)continue;
    let n=0;for(let i=1;i<=12&&t-i>=0;i++)if(s[t-i]>0)n++;
    if(n<P.REGULAR)continue;
    let r=1;for(let x=t-1;x>=0&&!(s[x]>0);x--)r++;
    for(let x=t+1;x<o&&!(s[x]>0);x++)r++;
    if(r>=P.RACHA)v[t]=0;
  }
  return v;
};

// ── Índices de temporada por familia (sin información futura) ──
// items: [{s, v, llaves:[subsub, sub, grupo]}]. Devuelve función llaves → Float64Array(12) (promedio 1).
L.indices=(items,o,m0,P)=>{
  const niv=[new Map(),new Map(),new Map()];
  const get=(M,k)=>{let x=M.get(k);if(!x){x={s:new Float64Array(12),n:new Float64Array(12),c:0};M.set(k,x);}return x;};
  for(const it of items){
    const s=it.s,v=it.v;
    for(let fin=o;fin-12>=0;fin-=12){
      const a=fin-12;let tot=0,nv=0,nz=0;
      for(let t=a;t<fin;t++)if(v[t]){tot+=s[t];nv++;if(s[t]>0)nz++;}
      if(nv<10||nz<P.IDX_MESES_MIN||!(tot>0))continue;
      const prom=tot/nv;
      for(let j=0;j<3;j++){
        const x=get(niv[j],it.llaves[j]);x.c++;
        for(let t=a;t<fin;t++)if(v[t]){const mo=(m0+t)%12;x.s[mo]+=Math.min(P.IDX_TOPE,s[t]/prom);x.n[mo]++;}
      }
    }
  }
  const norm=I=>{let t=0;for(let i=0;i<12;i++){I[i]=clip(I[i],P.IDX_MIN,P.IDX_MAX);t+=I[i];}t/=12;for(let i=0;i<12;i++)I[i]/=t;return I;};
  const uno=new Float64Array(12).fill(1);
  const res=[new Map(),new Map(),new Map()];
  const mezcla=(x,padre)=>{const I=new Float64Array(12);for(let i=0;i<12;i++){const n=x.n[i];const propio=n>0?x.s[i]/n:padre[i];I[i]=(n*propio+P.IDX_K*padre[i])/(n+P.IDX_K);}return norm(I);};
  niv[2].forEach((x,k)=>res[2].set(k,mezcla(x,uno)));
  // el subgrupo necesita saber su grupo, y el sub-subgrupo su subgrupo: se toma de la primera clave que los trae
  const padreDe=[new Map(),new Map()];
  for(const it of items){if(!padreDe[0].has(it.llaves[0]))padreDe[0].set(it.llaves[0],it.llaves[1]);if(!padreDe[1].has(it.llaves[1]))padreDe[1].set(it.llaves[1],it.llaves[2]);}
  niv[1].forEach((x,k)=>res[1].set(k,mezcla(x,res[2].get(padreDe[1].get(k))||uno)));
  niv[0].forEach((x,k)=>res[0].set(k,mezcla(x,res[1].get(padreDe[0].get(k))||res[2].get(padreDe[1].get(padreDe[0].get(k)))||uno)));
  const f=ll=>res[0].get(ll[0])||res[1].get(ll[1])||res[2].get(ll[2])||uno;
  f.tablas=res;f.cuentas=niv;return f;
};

// ── Crecimiento por grupo (amortiguado) ──
L.crecimiento=(items,o,P)=>{
  const out=new Map();if(o<24)return k=>1;
  const por=new Map();
  for(const it of items){
    let a=0,na=0,b=0,nb=0;
    for(let t=o-12;t<o;t++)if(it.v[t]){a+=it.s[t];na++;}
    for(let t=o-24;t<o-12;t++)if(it.v[t]){b+=it.s[t];nb++;}
    if(na<6||nb<6||!(a>0)||!(b>0))continue;
    const k=it.llaves[2];(por.get(k)||por.set(k,[]).get(k)).push((a/na)/(b/nb));
  }
  por.forEach((a,k)=>{if(a.length>=P.CREC_MIN_CLAVES)out.set(k,Math.pow(clip(mediana(a),1+P.CREC_MIN,1+P.CREC_MAX),P.CREC_AMORT));});
  const f=k=>out.get(k)||1;f.tabla=out;return f;
};

// ── Métodos de pronóstico: cada uno devuelve Float64Array(H) con la venta mensual de o, o+1, … ──
const nivel=(s,v,o,I,m0,hist,mv,tope)=>{
  const a=Math.max(0,o-hist);const y=[],w=[],nz=[];
  for(let t=a;t<o;t++){if(!v[t])continue;const d=s[t]/I[(m0+t)%12];y.push(d);w.push(Math.pow(0.5,(o-1-t)/mv));if(s[t]>0)nz.push(d);}
  if(!y.length)return 0;
  const med=nz.length?mediana(nz):Infinity;let sy=0,sw=0;
  for(let i=0;i<y.length;i++){sy+=Math.min(y[i],tope*med)*w[i];sw+=w[i];}
  return sw>0?sy/sw:0;
};
L.nivel=nivel;
L.pronosticar=(c,H,P)=>{
  // c = {s, v, o, m0, I (12), g (crecimiento), portal (venta mensual del método actual, opcional)}
  const {s,v,o,m0,I}=c;const g=c.g||1;const F={};
  const mo=h=>(m0+o+h)%12;
  const plano=x=>new Float64Array(H).fill(Math.max(0,x||0));
  // EST: nivel sin temporada, ponderado a lo reciente, × crecimiento × índice
  const le=nivel(s,v,o,I,m0,P.HIST,P.MEDIA_VIDA,P.TOPE_PICO)*g;
  F.EST=new Float64Array(H);for(let h=0;h<H;h++)F.EST[h]=le*I[mo(h)];
  // REC: lo más reciente (4 meses), con temporada
  const lr=nivel(s,v,o,I,m0,4,2,P.TOPE_PICO);
  F.REC=new Float64Array(H);for(let h=0;h<H;h++)F.REC[h]=lr*I[mo(h)];
  // P12: promedio simple de los 12 meses válidos (picos topados)
  {const y=[],nz=[];for(let t=Math.max(0,o-12);t<o;t++)if(v[t]){y.push(s[t]);if(s[t]>0)nz.push(s[t]);}
   const med=nz.length?mediana(nz):Infinity;let t=0;y.forEach(x=>t+=Math.min(x,P.TOPE_PICO*med));F.P12=plano(y.length?t/y.length:0);}
  // SBA y TSB: venta intermitente
  {let z=null,p=null,q=1,b=null,zt=null;const a=P.SBA_ALFA;
   for(let t=0;t<o;t++){if(!v[t])continue;const x=s[t];
     if(x>0){if(z==null){z=x;p=q;}else{z+=a*(x-z);p+=a*(q-p);}q=1;}else q++;
     if(zt==null){if(x>0){zt=x;b=0.5;}}else{if(x>0){zt+=P.TSB_ALFA*(x-zt);b+=P.TSB_BETA*(1-b);}else b+=P.TSB_BETA*(0-b);}}
   F.SBA=plano(z!=null&&p>0?(1-a/2)*z/p:0);F.TSB=plano(zt!=null?b*zt:0);}
  // TEND: nivel y tendencia amortiguada sobre la serie sin temporada
  {let l=null,bt=0;const a0=Math.max(0,o-P.TEND_HIST);const ini=[];
   for(let t=a0;t<o;t++){if(!v[t])continue;const d=s[t]/I[(m0+t)%12];
     if(l==null){ini.push(d);if(ini.length===3){l=(ini[0]+ini[1]+ini[2])/3;}continue;}
     const lp=l;l=P.TEND_ALFA*d+(1-P.TEND_ALFA)*(lp+P.TEND_PHI*bt);bt=P.TEND_BETA*(l-lp)+(1-P.TEND_BETA)*P.TEND_PHI*bt;}
   if(l==null)l=ini.length?ini.reduce((x,y)=>x+y,0)/ini.length:0;
   F.TEND=new Float64Array(H);let acc=0;for(let h=0;h<H;h++){acc+=Math.pow(P.TEND_PHI,h+1)*bt;F.TEND[h]=Math.max(0,(l+acc)*I[mo(h)]);}}
  // ANIO: el mismo mes del año pasado × cómo va este año contra el pasado
  {let a=0,b=0,n=0;for(let t=o-6;t<o;t++){if(t-12<0||!v[t]||!v[t-12])continue;a+=s[t];b+=s[t-12];n++;}
   const r=n>=3&&b>0?clip(a/b,P.ANIO_CREC_MIN,P.ANIO_CREC_MAX):1;
   F.ANIO=new Float64Array(H);for(let h=0;h<H;h++){let t=o+h-12;while(t>=o)t-=12;F.ANIO[h]=(t>=0&&v[t])?s[t]*r:F.EST[h];}}
  // MEZ: mitad nivel con temporada de la familia, mitad año pasado de la propia clave
  F.MEZ=new Float64Array(H);for(let h=0;h<H;h++)F.MEZ[h]=(F.EST[h]+F.ANIO[h])/2;
  F.CMB=new Float64Array(H);F.CM3=new Float64Array(H);
  for(let h=0;h<H;h++){F.CMB[h]=(F.EST[h]+F.P12[h])/2;F.CM3[h]=(F.EST[h]+F.P12[h]+F.TSB[h])/3;}
  if(c.portal!=null)F.PORTAL=plano(c.portal);
  return F;
};

// ── Tipo de venta (para el método por omisión y para agrupar errores) ──
// REGULAR: vende casi todos los meses y varía poco · ERRATICA: vende casi todos los meses pero varía mucho
// INTERMITENTE: vende algunos meses, cantidades parecidas · IRREGULAR: vende algunos meses y cantidades muy distintas
L.tipo=(s,v,o)=>{
  const nz=[];let n=0;for(let t=Math.max(0,o-24);t<o;t++){if(!v[t])continue;n++;if(s[t]>0)nz.push(s[t]);}
  if(n<6||nz.length<2)return'SIN HISTORIA';
  const adi=n/nz.length;const m=nz.reduce((a,b)=>a+b,0)/nz.length;let q=0;nz.forEach(x=>q+=(x-m)*(x-m));const cv2=(q/nz.length)/(m*m);
  return adi<1.32?(cv2<0.49?'REGULAR':'ERRATICA'):(cv2<0.49?'INTERMITENTE':'IRREGULAR');
};

// ── Selección del método ──
// pruebas: por método, arreglo de |error| de las pruebas pasadas de la clave (mismo orden y largo para todos)
// omision: método del tipo de venta. Devuelve {m, propio:boolean}
L.elegir=(errPorMetodo,n,omision,P)=>{
  if(n<P.MIN_ORIGENES||errPorMetodo[omision]==null)return{m:omision,propio:false};
  let best=omision,eb=errPorMetodo[omision];
  for(const m in errPorMetodo){if(errPorMetodo[m]<eb){eb=errPorMetodo[m];best=m;}}
  if(best!==omision&&eb<=(1-P.MARGEN)*errPorMetodo[omision])return{m:best,propio:true};
  return{m:omision,propio:false};
};

// ── Rango del pronóstico ──
// u = (venta real − pronóstico) ÷ escala, de pruebas pasadas. Mezcla el cuantil propio con el del tipo de venta.
L.cuantilMezcla=(propiosOrd,tipoOrd,p,P)=>{
  const n=propiosOrd?propiosOrd.length:0;const qt=tipoOrd&&tipoOrd.length?cuantilOrd(tipoOrd,p):NaN;
  if(n<3)return isNaN(qt)?0:qt;
  const qp=cuantilOrd(propiosOrd,p);if(isNaN(qt))return qp;
  const w=n/(n+P.K_MEZCLA);return w*qp+(1-w)*qt;
};
L.escala=(F,prom12,H,P)=>Math.max(F,P.PISO_ESCALA*prom12*H,0);   // 0 = sin venta ni pronóstico: no hay con qué medir

// ── Niveles de inventario ──
// Los pedidos se disparan con la alarma (revisión diaria), no en fechas fijas:
//   punto de pedido = venta que no se rebasa, con la probabilidad del nivel de servicio, durante T. entrega + días de reacción
//   pedir hasta     = punto de pedido + venta esperada de los meses de cobertura del pedido
L.inventario=(x,P)=>{
  // x = {Fh (pronóstico en el periodo de protección), Dm (venta mensual esperada), esc, qServ, Fcic (venta esperada de la cobertura), ex, bo, conBO}
  const tope=P.SEG_MAX>0&&x.Dm>0?P.SEG_MAX*x.Dm:Infinity;
  const punto=Math.max(0,x.Fh+Math.min(tope,Math.max(0,x.qServ)*x.esc));
  const hasta=punto+Math.max(0,x.Fcic||0);
  const disp=(x.ex||0)+(x.conBO?(x.bo||0):0);
  return{punto,hasta,seguridad:punto-x.Fh,disp,propuesta:Math.max(0,hasta-disp),pedir:disp<=punto,
    dias:x.Dm>0?Math.max(0,(disp-punto)/(x.Dm/30)):null};
};

// ── Confiabilidad ──
// error = Σ|pronóstico − real| ÷ Σ real en las pruebas de la clave (venta de H_SEL meses)
L.calificar=(errRel,n,P)=>n<P.CONF_MIN_PRUEBAS||errRel==null||isNaN(errRel)?'C':errRel<=P.CONF_A?'A':errRel<=P.CONF_B?'B':'C';

// ── Cálculo completo: prueba histórica + niveles vigentes ──
// D = {meses:['AAAA-MM',…], claves:[{c,rot,g,sg,ssg,lt,pm,ex,bo,s:[venta por mes], ag:[1 = mes agotado] (opcional)}],
//      portal:(i,o)=>venta mensual del método actual con información anterior a la posición o (opcional)}
// En cada mes de prueba solo se usa información anterior a ese mes.
L.TIPOS=['REGULAR','ERRATICA','INTERMITENTE','IRREGULAR','SIN HISTORIA'];
L.ROT_PRUEBA=['SAGRADOS','ALTA ROTACION','MEDIA ROTACION'];
L.correr=(D,Pin,hooks)=>{
  const P=L.params(Pin),av=(hooks&&hooks.progreso)||(()=>{});
  const MES=D.meses,T=MES.length,m0=Number(MES[0].slice(5))-1,K=D.claves,n=K.length;
  const MET=['EST','REC','P12','SBA','TSB','TEND','ANIO','MEZ','CMB','CM3'],nM=MET.length,iM={};MET.forEach((m,i)=>iM[m]=i);
  const O_MIN=12,nO=T-O_MIN+1,oi=o=>o-O_MIN,TIPOS=L.TIPOS;
  const hb=H=>H<=2?0:H<=4?1:2;
  const F3=new Float32Array(n*nO*nM),FH=new Float32Array(n*nO*nM);
  const A3=new Float32Array(n*nO).fill(NaN),AH=new Float32Array(n*nO).fill(NaN),PR=new Float32Array(n*nO),TP=new Uint8Array(n*nO);
  const Hp=K.map(k=>clip((k.lt||0)+P.DIAS_REACCION/30,0.25,P.H_MAX));
  const noAg=K.map(k=>{if(!k.ag)return null;const e=new Uint8Array(T).fill(1);for(let t=0;t<T;t++)if(k.ag[t])e[t]=0;return e;});
  const vFin=K.map((k,i)=>L.validos(k.s,T,P,noAg[i]));
  const ll=K.map(k=>[k.g+'|'+(k.sg||'')+'|'+(k.ssg||''),k.g+'|'+(k.sg||''),k.g]);
  const ultimo=new Array(n);
  // 1. Pronósticos de todos los métodos en todos los meses de origen
  for(let o=O_MIN;o<=T;o++){
    const items=K.map((k,i)=>({s:k.s,v:L.validos(k.s,o,P,noAg[i]),llaves:ll[i]}));
    const idx=L.indices(items,o,m0,P),cre=L.crecimiento(items,o,P);
    for(let i=0;i<n;i++){
      const k=K[i],it=items[i],I=idx(it.llaves),g=cre(k.g);
      const F=L.pronosticar({s:k.s,v:it.v,o,m0,I,g},12,P);const b=i*nO+oi(o);
      for(let m=0;m<nM;m++){const f=F[MET[m]];F3[b*nM+m]=L.acum(f,P.H_SEL);FH[b*nM+m]=L.acum(f,Hp[i]);}
      let t=0,c=0;for(let x=Math.max(0,o-12);x<o;x++)if(it.v[x]){t+=k.s[x];c++;}PR[b]=c?t/c:0;
      TP[b]=TIPOS.indexOf(L.tipo(k.s,it.v,o));
      // venta real posterior: no se usa si en esos meses la clave estuvo agotada
      const libre=(a,z)=>{for(let x=a;x<z;x++)if(!vFin[i][x]&&(k.s[x]===0||(noAg[i]&&!noAg[i][x])))return false;return true;};
      if(o+P.H_SEL<=T&&libre(o,o+P.H_SEL)){let a=0;for(let h=0;h<P.H_SEL;h++)a+=k.s[o+h];A3[b]=a;}
      const hc=Math.ceil(Hp[i]);if(o+hc<=T&&libre(o,o+hc))AH[b]=L.acum(k.s,Hp[i],o);
      if(o===T)ultimo[i]={F,I,g,v:it.v};
    }
    av('Pronósticos de prueba · '+(MES[o]||'vigente'),0.5*(o-O_MIN+1)/nO);
  }
  // 2. Método con lo conocido antes de t
  const elegirEn=t=>{
    const a=Math.max(O_MIN,t-P.H_SEL-P.ORIGENES+1),bf=t-P.H_SEL;
    const err=new Float64Array(n*nM),cnt=new Uint16Array(n),sumA=new Float64Array(n);
    for(let i=0;i<n;i++)for(let o=a;o<=bf;o++){const b=i*nO+oi(o);const A=A3[b];if(isNaN(A))continue;cnt[i]++;sumA[i]+=A;for(let m=0;m<nM;m++)err[i*nM+m]+=Math.abs(F3[b*nM+m]-A);}
    const tot=TIPOS.map(()=>new Float64Array(nM));const tt=oi(Math.min(t,T));
    for(let i=0;i<n;i++){if(cnt[i]<3||!(sumA[i]>0))continue;const tp=TP[i*nO+tt];for(let m=0;m<nM;m++)tot[tp][m]+=err[i*nM+m]/(sumA[i]/cnt[i]);}
    const omi=tot.map(x=>{let b=iM.CMB;if(x[b]===0&&x[0]===0)return b;for(let m=0;m<nM;m++)if(x[m]<x[b])b=m;return b;});
    const sel=new Uint8Array(n),propio=new Uint8Array(n),gr=new Uint8Array(n),GR={A:0,B:1,C:2};
    for(let i=0;i<n;i++){
      const e={};for(let m=0;m<nM;m++)e[MET[m]]=err[i*nM+m];
      const r=L.elegir(e,cnt[i],MET[omi[TP[i*nO+tt]]],P);sel[i]=iM[r.m];propio[i]=r.propio?1:0;
      gr[i]=GR[L.calificar(sumA[i]>0?err[i*nM+sel[i]]/sumA[i]:NaN,cnt[i],P)];
    }
    return{sel,propio,omi,cnt,err,sumA,gr};
  };
  // Errores pasados del método elegido, al periodo de protección; se juntan entre claves parecidas (tipo, horizonte, confiabilidad)
  const erroresEn=(t,E)=>{
    const propios=new Array(n),pozo=TIPOS.map(()=>[0,1,2].map(()=>[[],[],[]]));const tt=oi(Math.min(t,T));
    for(let i=0;i<n;i++){
      const hc=Math.ceil(Hp[i]),a=Math.max(O_MIN,t-hc-P.ORIGENES-6),bf=t-hc;const u=[];
      for(let o=a;o<=bf;o++){const b=i*nO+oi(o);const A=AH[b];if(isNaN(A))continue;const F=FH[b*nM+E.sel[i]];const e=L.escala(F,PR[b],Hp[i],P);if(e>1e-6)u.push(Math.min(20,(A-F)/e));}
      u.sort((x,y)=>x-y);propios[i]=u;
      if(L.ROT_PRUEBA.indexOf(K[i].rot)>=0){const z=pozo[TP[i*nO+tt]][hb(Hp[i])][E.gr[i]];for(const x of u)z.push(x);}
    }
    pozo.forEach(a=>a.forEach(b=>b.forEach(z=>z.sort((x,y)=>x-y))));
    return{propios,pozo};
  };
  // 3. Prueba
  const enU=i=>L.ROT_PRUEBA.indexOf(K[i].rot)>=0;
  const nueva=()=>({n:0,ae:0,se:0,sa:0,at:0,corto:0,pasa:0,nr:0});
  const sumar=(M,F,A,esc)=>{M.n++;M.ae+=Math.abs(F-A)/esc;M.se+=(F-A)/esc;M.sa+=A/esc;if(A>0){M.nr++;const r=F/A;if(Math.abs(r-1)<=0.3)M.at++;if(r<0.7)M.corto++;if(r>1.5)M.pasa++;}};
  const cerrar=M=>M.n?{n:M.n,error:M.ae/M.sa,sesgo:M.se/M.sa,atina30:M.at/M.nr,muyCorto:M.corto/M.nr,sePasa:M.pasa/M.nr}:null;
  const pruebas=[];for(let t=O_MIN+P.H_SEL+P.MIN_ORIGENES;t+P.H_SEL<=T;t++)pruebas.push(t);
  const escC=new Float64Array(n);for(let i=0;i<n;i++){let s=0,c=0;for(const t of pruebas){const A=A3[i*nO+oi(t)];if(!isNaN(A)){s+=A;c++;}}escC[i]=c&&s>0?s/c:0;}
  const res={},acc=(m,g)=>((res[m]=res[m]||{})[g]=res[m][g]||nueva());
  const cal={},accC=g=>cal[g]=cal[g]||{n:0,cN:0,cA:0,mN:0,mA:0,obj:0,dem:0,fN:0,fA:0,aN:[],aA:[]};
  const porG={A:nueva(),B:nueva(),C:nueva()};const GN=['A','B','C'];
  const MOTOR='Motor',ACT='Método actual del portal';
  pruebas.forEach((t,ip)=>{
    const E=elegirEn(t),er=erroresEn(t,E);
    for(let i=0;i<n;i++){
      if(!enU(i)||!(escC[i]>0))continue;
      const b=i*nO+oi(t),A=A3[b];const pd=D.portal?D.portal(i,t):null;
      if(!isNaN(A)){
        for(const g of ['Todas',K[i].rot,TIPOS[TP[b]]]){
          sumar(acc(MOTOR,g),F3[b*nM+E.sel[i]],A,escC[i]);
          if(pd!=null)sumar(acc(ACT,g),pd*P.H_SEL,A,escC[i]);
          if(g==='Todas')for(let m=0;m<nM;m++)sumar(acc(L.METODOS[MET[m]],g),F3[b*nM+m],A,escC[i]);
        }
        sumar(porG[GN[E.gr[i]]],F3[b*nM+E.sel[i]],A,escC[i]);
      }
      const AHt=AH[b];
      if(!isNaN(AHt)){
        const p=P.SERVICIO[K[i].rot]||P.SERVICIO_DEF,F=FH[b*nM+E.sel[i]],esc=L.escala(F,PR[b],Hp[i],P);
        const q=L.cuantilMezcla(er.propios[i],er.pozo[TP[b]][hb(Hp[i])][E.gr[i]],p,P);
        const punto=L.inventario({Fh:F,Dm:F/Hp[i],esc,qServ:q},P).punto;
        const pA=pd!=null?pd*(K[i].lt||0)*P.FACT_ALARMA:null,em=escC[i]/P.H_SEL;
        for(const g of ['Todas',K[i].rot]){const c=accC(g);c.n++;c.obj+=p;if(AHt<=punto+1e-9)c.cN++;c.mN+=punto/em;c.aN.push(punto/em);c.dem+=AHt/em;c.fN+=Math.max(0,AHt-punto)/em;
          if(pA!=null){if(AHt<=pA+1e-9)c.cA++;c.mA+=pA/em;c.aA.push(pA/em);c.fA+=Math.max(0,AHt-pA)/em;}}
      }
    }
    av('Prueba · '+MES[t],0.5+0.45*(ip+1)/pruebas.length);
  });
  const resumen={};for(const m in res){resumen[m]={};for(const g in res[m])resumen[m][g]=cerrar(res[m][g]);}
  const calibracion={};for(const g in cal){const c=cal[g],hp=!!D.portal;calibracion[g]={n:c.n,objetivo:c.obj/c.n,cubreMotor:c.cN/c.n,mesesMotor:c.mN/c.n,medMotor:mediana(c.aN),surtidoMotor:1-c.fN/c.dem,
    cubreActual:hp?c.cA/c.n:null,mesesActual:hp?c.mA/c.n:null,medActual:hp?mediana(c.aA):null,surtidoActual:hp?1-c.fA/c.dem:null};}
  // 4. Niveles vigentes por clave
  const E=elegirEn(T),er=erroresEn(T,E);const claves=new Array(n);
  for(let i=0;i<n;i++){
    const k=K[i],u=ultimo[i],b=i*nO+oi(T),m=MET[E.sel[i]],f=u.F[m],H=Hp[i];
    const p=P.SERVICIO[k.rot]||P.SERVICIO_DEF,cob=P.COBERTURA_MESES>0?P.COBERTURA_MESES:(k.pm||1);
    const Fh=L.acum(f,H),esc=L.escala(Fh,PR[b],H,P),Dm=Fh/H;
    const Fcic=Math.max(0,L.acum(f,Math.min(12,H+cob))-Fh);
    const pozo=er.pozo[TP[b]][hb(H)][E.gr[i]],pr=er.propios[i],q=x=>L.cuantilMezcla(pr,pozo,x,P);
    const inv=L.inventario({Fh,Dm,esc,qServ:q(p),Fcic,ex:k.ex,bo:k.bo,conBO:!!P.CON_BO},P);
    // probabilidad de agotarse antes de que llegue un pedido levantado hoy (según los errores pasados de claves parecidas)
    let pa=null;const base=pozo.length>=20?pozo:null;
    if(base&&esc>0){const lim=(inv.disp-Fh)/esc;let lo=0,hi=base.length;while(lo<hi){const md=(lo+hi)>>1;if(base[md]<=lim)lo=md+1;else hi=md;}pa=1-lo/base.length;}
    const eRel=E.sumA[i]>0?E.err[i*nM+E.sel[i]]/E.sumA[i]:null,pd=D.portal?D.portal(i,T):null;
    const r3=x=>Math.round(x*1000)/1000;
    claves[i]={c:k.c,tipo:TIPOS[TP[b]],metodo:m,propio:!!E.propio[i],pruebas:E.cnt[i],errRel:eRel,conf:GN[E.gr[i]],servicio:p,H,cob,Dm,
      f:Array.from(f,r3),idx:Array.from(u.I,r3),crec:u.g,q10:q(0.10)*(Fh>0?esc/Fh:0),q90:q(0.90)*(Fh>0?esc/Fh:0),
      bajo:Math.max(0,Fh+q(0.10)*esc),esperado:Fh,alto:Math.max(0,Fh+q(0.90)*esc),
      punto:inv.punto,hasta:inv.hasta,seguridad:inv.seguridad,disp:inv.disp,propuesta:inv.propuesta,pedir:inv.pedir,dias:inv.dias,pAgotar:pa,
      Dportal:pd,puntoPortal:pd!=null?pd*(k.lt||0)*P.FACT_ALARMA:null,hastaPortal:pd!=null?pd*((k.lt||0)+(k.pm||0)):null,
      val:Array.from(u.v)};
  }
  av('Listo',1);
  return{version:L.VERSION,param:P,meses:MES,pruebas:pruebas.map(t=>MES[t]),resumen,calibracion,
    porConfiabilidad:{A:cerrar(porG.A),B:cerrar(porG.B),C:cerrar(porG.C)},omision:Object.fromEntries(TIPOS.map((t,j)=>[t,MET[E.omi[j]]])),claves};
};

// ── Método actual del portal, con la misma serie y los mismos meses agotados ──
// PL = objeto P de plan_logica.js. Devuelve función (i, o) → venta mensual; guarda lo ya calculado.
L.portalDe=(PL,D)=>{
  const MES=D.meses,T=MES.length,memo=new Map();
  const obj=D.claves.map(k=>{const o={};k.s.forEach((x,t)=>{if(x)o[MES[t]]=x;});return o;});
  const ags=D.claves.map(k=>{if(!k.ag)return null;const z=new Set();k.ag.forEach((x,t)=>{if(x)z.add(MES[t]);});return z;});
  return(i,o)=>{
    const key=i*64+o;let r=memo.get(key);if(r!==undefined)return r;
    const k=D.claves[i],ref=MES[o]||PL.ym(MES[T-1],1);const s={};for(const m in obj[i])if(m<ref)s[m]=obj[i][m];
    const N=Math.max(1,Math.ceil(k.pm||1)),ag=ags[i]?m=>ags[i].has(m):()=>false;
    const ap=PL.antPron(s,ref,N,ag,PL.ym(ref,-1),MES[0]);
    const Dp=ap.I!=null?ap.I:(ap.A!=null&&ap.P!=null?(ap.A+ap.P)/2:(ap.A!=null?ap.A:(ap.P!=null?ap.P:0)));
    const ly=PL.R.TEMP_MODO==='INDICE'?PL.antPron(s,PL.ym(ref,-12),N,ag,PL.ym(ref,-13),MES[0]):null;
    const br=PL.baseRec({A:ap.A,P:ap.P,N,pm:k.pm,nA:ap.nA,nP:ap.nP,bD:ap.I!=null?'INTERMITENTE 12 MESES':'',D:Dp,Aly:ly?ly.A:undefined,nAly:ly?ly.nA:undefined});
    let c0=br.c;if(br.b!=='INTER'&&ap.W>0&&ap.nW>=6&&(!(c0>0)||c0<ap.W/PL.R.IRREG||c0>ap.W*PL.R.IRREG))c0=ap.W;
    r=c0>PL.R.D_MIN*1.0001?c0:0;memo.set(key,r);return r;
  };
};

if(typeof module!=='undefined'&&module.exports)module.exports=L;else root.LAB=L;
})(typeof window!=='undefined'?window:globalThis);
