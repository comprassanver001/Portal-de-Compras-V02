# Laboratorio de pronóstico y compra · Portal de Compras V2 (ambiente de pruebas)

Estos archivos **no los usa el portal de producción**. Viven en el branch/repositorio de pruebas.

| Archivo | Qué es |
|---|---|
| `lab_motor.js` | Motor de pronóstico y niveles de inventario. Sin dependencias; el mismo código corre en el navegador (`window.LAB`) y en la prueba. Todas las variables están en `LAB.PARAM`. |
| `lab_prueba.js` | Prueba histórica (Node). En cada mes de prueba solo usa información anterior a ese mes. Compara contra el método actual usando `plan_logica.js` tal cual está en producción. |

## Correr la prueba
```
node lab_prueba.js datos.json ../plan_logica.js salida.json [parametros.json]
```
- `datos.json`: `{meses:['2023-01',…], claves:[{c,d,g,sg,ssg,comp,rot,lt,pm,ex,Dact,s:[venta por mes]}]}`
- `parametros.json` (opcional): solo las variables que se quieran cambiar, p. ej. `{"SEG_MAX":4,"SERVICIO":{"ALTA ROTACION":0.97}}`

## Qué hace el motor
1. **Meses que cuentan**: desde la primera venta; se quitan los meses sospechosos de agotado (y los que se le indiquen).
2. **Temporada** por sub-subgrupo → subgrupo → grupo, y **crecimiento** por grupo, calculados solo con historia.
3. **Métodos**: nivel con temporada y crecimiento, últimos meses, promedio 12, dos de venta intermitente, tendencia amortiguada, mismo mes del año pasado, mezclas y el método actual del portal.
4. **Método por clave**: el del tipo de venta (regular, errática, intermitente, irregular); una clave usa otro solo si le gana por 30% en al menos 12 pruebas.
5. **Rango**: con los errores reales pasados de la clave y de claves parecidas (mismo tipo, horizonte y confiabilidad).
6. **Inventario**: «pedir hasta» = venta que no se rebasa con la probabilidad del nivel de servicio durante T. entrega + ciclo; punto de pedido = lo mismo durante el T. entrega.
7. **Confiabilidad** A / B / C según el error de la clave en sus propias pruebas.
