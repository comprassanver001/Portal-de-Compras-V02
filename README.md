# Portal de Compras V2 · AMBIENTE DE PRUEBAS

Copia del Portal de Compras V2 para probar el **Laboratorio de pronóstico y compra**. No es el portal de producción.

- `pruebas_guard.js` va primero en todas las páginas: los datos reales quedan en solo lectura y solo se puede escribir en tablas `lab_`.
- `lab.html` — pantalla del laboratorio (resumen y confiabilidad, claves, variables y escenarios).
- `lab_motor.js` — motor de pronóstico y niveles de inventario (`LAB.correr`); todas las variables están en `LAB.PARAM`.
- `lab_worker.js` — corre el cálculo en segundo plano.
- `lab_prueba.js` — la misma prueba desde la línea de comandos: `node lab_prueba.js datos.json plan_logica.js salida.json [parametros.json]`.
- `lab_tablas_01.sql` — tablas `lab_` (proyecto Supabase SANVER_Forte).
