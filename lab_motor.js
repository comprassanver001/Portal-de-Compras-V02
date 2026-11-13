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
const L={VERSION:'0.1.0'};

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
  CICLO:1,            // meses entre un pedido y el siguiente
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
// Política de revisión periódica: cada CICLO meses se pide lo necesario para llegar a «pedir hasta».
//   pedir hasta = venta que no se rebasa con probabilidad = nivel de servicio durante (T. entrega + ciclo)
//   punto de pedido = lo mismo durante el T. entrega
L.inventario=(x,P)=>{
  // x = {Fh (pronóstico en T. entrega + ciclo), Flt (pronóstico en T. entrega), Dm (venta mensual esperada), esc, escLt, qServ, qServLt, ex, bo, conBO}
  const tope=P.SEG_MAX>0&&x.Dm>0?P.SEG_MAX*x.Dm:Infinity;
  const hasta=Math.max(0,x.Fh+Math.min(tope,Math.max(0,x.qServ)*x.esc));
  const punto=Math.max(0,x.Flt+Math.min(tope,Math.max(0,x.qServLt!=null?x.qServLt:x.qServ)*x.escLt));
  const disp=(x.ex||0)+(x.conBO?(x.bo||0):0);
  return{hasta,punto,seguridad:hasta-x.Fh,propuesta:Math.max(0,hasta-disp),pedir:disp<=punto};
};

// ── Confiabilidad ──
// error = Σ|pronóstico − real| ÷ Σ real en las pruebas de la clave (venta de H_SEL meses)
L.calificar=(errRel,n,P)=>n<P.CONF_MIN_PRUEBAS||errRel==null||isNaN(errRel)?'C':errRel<=P.CONF_A?'A':errRel<=P.CONF_B?'B':'C';

if(typeof module!=='undefined'&&module.exports)module.exports=L;else root.LAB=L;
})(typeof window!=='undefined'?window:globalThis);
