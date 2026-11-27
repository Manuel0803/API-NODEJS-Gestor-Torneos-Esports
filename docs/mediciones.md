# Informe de medición

Este informe cubre dos mediciones: la tarea pesada (llave de 1024 participantes y recálculo de ranking ELO) y la carrera principal (inscripción concurrente y reportes simultáneos). Los campos marcados con `COMPLETAR` se llenan con datos reales; ninguna hipótesis se modifica después de ver los resultados.

## 1. Tarea pesada: llave de 1024 participantes y recálculo de ranking

### 1.1 Hipótesis (escrita antes de medir)

- H1. Con la versión ingenua (cálculo en el hilo principal), el p95 de `GET /health` bajo carga sube de unos 5 ms a más de 500 ms mientras dura el cálculo, y el lag máximo del event loop supera los 500 ms.
- H2. Con la versión final (worker thread), el p95 de `GET /health` se mantiene por debajo de 50 ms, el lag máximo del event loop se mantiene por debajo de 100 ms y el rendimiento total no cae más de un 10 por ciento respecto de la línea de base.
- H3. El tiempo total de la tarea con worker es similar al de la versión ingenua (diferencia menor a 20 por ciento), porque el trabajo es el mismo y solo cambia el hilo donde corre.

### 1.2 Entorno

| Dato | Valor |
| --- | --- |
| Máquina (CPU, núcleos, RAM) | COMPLETAR |
| Sistema operativo | COMPLETAR |
| Node.js | COMPLETAR (`node -v`) |
| PostgreSQL | COMPLETAR (`SELECT version();`) |
| Base en Docker | COMPLETAR |
| Otros procesos en ejecución | COMPLETAR |
| Datos cargados | COMPLETAR (cantidad de usuarios y torneos) |

### 1.3 Comandos exactos

Servidor con la medición de lag expuesta:

```bash
npm run setup
npm start
```

Línea de base, sin tarea pesada (30 s, 50 conexiones):

```bash
npx autocannon -c 50 -d 30 http://localhost:3000/health
```

Versión ingenua: lanzar la tarea y la carga a la vez.

```bash
COMPLETAR_COMANDO_QUE_DISPARA_LA_TAREA_INGENUA &
npx autocannon -c 50 -d 30 http://localhost:3000/health
```

Versión con worker:

```bash
COMPLETAR_COMANDO_QUE_DISPARA_LA_TAREA_CON_WORKER &
npx autocannon -c 50 -d 30 http://localhost:3000/health
```

Lectura del lag del event loop:

```bash
curl http://localhost:3000/COMPLETAR_ENDPOINT_DE_METRICAS
```

Cada escenario se ejecuta tres veces, reiniciando el servidor y con la base en el mismo estado.

### 1.4 Resultados

Latencia de `GET /health` en milisegundos. Lag del event loop en milisegundos. Memoria RSS en megabytes.

| Escenario | Corrida | p50 (ms) | p95 (ms) | p99 (ms) | Pedidos/s | Lag máx (ms) | Lag p99 (ms) | Memoria (MB) | Duración de la tarea (s) |
| --- | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Línea de base | 1 | | | | | | | | |
| Línea de base | 2 | | | | | | | | |
| Línea de base | 3 | | | | | | | | |
| Ingenua | 1 | | | | | | | | |
| Ingenua | 2 | | | | | | | | |
| Ingenua | 3 | | | | | | | | |
| Worker | 1 | | | | | | | | |
| Worker | 2 | | | | | | | | |
| Worker | 3 | | | | | | | | |

### 1.5 Conclusión

COMPLETAR: si H1, H2 y H3 se cumplieron, con qué números y por qué. Si alguna falló, se deja escrita igual y se explica la causa. Informar si las tres corridas difieren mucho entre sí.

## 2. Carrera principal: inscripción concurrente de 50 equipos sobre 10 cupos

### 2.1 Hipótesis

- H4. Con `SELECT ... FOR UPDATE` sobre el torneo, los 50 pedidos simultáneos terminan con exactamente 10 inscriptos y 40 rechazos, y la latencia p95 de la inscripción queda por debajo de 500 ms.
- H5. Sin el bloqueo, el `CHECK` de la base evita pasar de 10, pero los rechazos llegan como errores de restricción y no como rechazos de negocio, y el contador `inscriptos_actuales` puede quedar inconsistente con la cantidad de filas en `inscripciones`.

### 2.2 Comandos exactos

Verificación del dato final:

```bash
node --test tests/integracion/postgres-carrera-inscripciones.test.js
```

Verificación negativa (quitar el bloqueo y repetir): reemplazar `FOR UPDATE` por nada en `RepoTorneoPostgres.obtenerPorId` y ejecutar de nuevo el mismo comando. Restaurar el archivo después.

Carga sostenida sobre el endpoint de inscripción (COMPLETAR con tokens y torneo reales):

```bash
npx autocannon -c 50 -a 50 -m POST -H "Authorization: Bearer COMPLETAR" -H "Content-Type: application/json" -b COMPLETAR_CUERPO http://localhost:3000/torneos/COMPLETAR_ID/inscripciones
```

### 2.3 Resultados

| Variante | Inscriptos finales | Rechazos de negocio | Errores de restricción | p50 (ms) | p95 (ms) | p99 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Con bloqueo (corrida 1) | | | | | | |
| Con bloqueo (corrida 2) | | | | | | |
| Con bloqueo (corrida 3) | | | | | | |
| Sin bloqueo (corrida 1) | | | | | | |

### 2.4 Conclusión

COMPLETAR: resultado frente a H4 y H5. Resultado observado en una verificación previa de desarrollo: sin el bloqueo, el test de 50 inscripciones sobre 10 cupos fallaba y los reportes simultáneos de capitanes dejaban el partido en estados inconsistentes (ver `tests/concurrencia/postgres-carrera-partidos.test.js`).
