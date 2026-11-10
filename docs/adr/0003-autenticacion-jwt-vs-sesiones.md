# ADR 0003: Estrategia de Autenticación (JWT Stateless vs. Sesiones en Servidor) y Hashing de Contraseñas

- **Estado:** Aceptado
- **Fecha:** 2026-11-09
- **Participantes:** Manuel, Franco Tofa

---

## Contexto

La API del Gestor de Torneos Esports requiere autenticar y autorizar las peticiones de cuatro roles autenticados (`ORGANIZADOR`, `ARBITRO`, `CAPITAN` y `JUGADOR`), además de permitir consultas públicas sin autenticación para el rol `ESPECTADOR`.

El Bloque 5 del contrato técnico exige:
1. Elegir y justificar entre **JSON Web Tokens (JWT)** y **Sesiones con estado en servidor** (en memoria o base de datos).
2. Hashear las contraseñas exclusivamente con `bcrypt` o `argon2` declarando explícitamente el factor de costo.
3. Garantizar que la identidad del usuario (`sub`) y su rol provengan siempre del mecanismo de autenticación verificado en el servidor y jamás de campos manipulables en el cuerpo o parámetros de la petición (prevención de IDOR).

---

## Opciones Consideradas

### Opción 1: JSON Web Tokens (JWT) Stateless con algoritmo simétrico `HS256` y `bcrypt`

Al autenticarse en `POST /auth/login` (verificando el hash `bcrypt` con factor de costo `10`), el servidor emite un token firmado con `HS256` que contiene las claims estándar:
- `sub`: UUID del usuario autenticado.
- `rol`: Rol del usuario (`ORGANIZADOR`, `ARBITRO`, `CAPITAN`, `JUGADOR`).
- `iss`: Emisor esperado (`api-torneos-esports`).
- `aud`: Audiencia esperada (`clientes-torneos-esports`).
- `exp`: Tiempo de expiración acotado (`2h`).

En cada petición protegida, el cliente envía `Authorization: Bearer <token>` y el middleware verifica criptográficamente la firma, el algoritmo (`algorithms: ['HS256']`), el emisor (`iss`), la audiencia (`aud`) y la vigencia (`exp`) sin consultar la base de datos.

- **Pros:**
  - **Cero sobrecarga en PostgreSQL por request:** La verificación de firma `HS256` ocurre en memoria en microsegundos, evitando hacer un `SELECT` de sesión en cada petición (crítico durante picos de concurrencia como la inscripción simultánea de 50 equipos o el reporte simultáneo de resultados).
  - **Integración directa con colecciones de pruebas HTTP:** Herramientas de API (Bruno, Insomnia, Postman y `supertest`) manejan nativamente el encabezado estándar `Authorization: Bearer <token>` sin requerir gestión de cookies ni tokens anti-CSRF.
  - **Defensa contra confusión de algoritmos y reutilización cruzada:** Al forzar `algorithms: ['HS256']`, `issuer` y `audience` en `jwt.verify()`, se bloquean ataques de `alg: none` y tokens emitidos para otros servicios.
- **Contras:**
  - Un token emitido permanece válido hasta su expiración (`exp`) a menos que se mantenga una lista de revocación. Se mitiga con un tiempo de vida corto (`2h`).

### Opción 2: Sesiones con estado en PostgreSQL (Cookie `HttpOnly` + tabla `sesiones`)

Al iniciar sesión, el servidor inserta una fila en una tabla `sesiones` en PostgreSQL y entrega el identificador de sesión en una cookie `HttpOnly`.

- **Pros:**
  - Permite revocación instantánea borrando la fila de la tabla `sesiones`.
- **Contras:**
  - **Cuello de botella en base de datos:** Cada petición autenticada requiere al menos una consulta SQL adicional para validar y extender la sesión, compitiendo por conexiones del pool de PostgreSQL durante las carreras concurrentes del Bloque 6.
  - Mayor complejidad en clientes HTTP de línea de comandos y suites de tests automatizados por el manejo de cookies y protección CSRF.

---

## Decisión

Elegimos la **Opción 1: Autenticación stateless mediante JWT (`jsonwebtoken` con `HS256`, `iss`, `aud` y `exp`) combinada con `bcrypt` (factor de costo `SALT_ROUNDS = 10`)** para el hashing de contraseñas.

---

## Consecuencias

- **Positivas:**
  - El middleware `autenticacion.js` valida en un único paso firma, algoritmo, emisor, audiencia y expiración, inyectando `req.usuario = { id, rol, email }`.
  - Cuando falta el token o es inválido, el servidor responde `401 Unauthorized` incluyendo el encabezado estándar `WWW-Authenticate: Bearer` y formato `application/problem+json` (RFC 9457).
  - Cuando el rol del token no posee permisos para la ruta o intenta operar sobre recursos de otro usuario/equipo (IDOR), responde `403 Forbidden`.
- **Negativas / Compromisos:**
  - El secreto `JWT_SECRET` debe tener alta entropía (validado al arranque en `src/config/env.js` con longitud mínima de 16 caracteres).

---

## Qué nos haría cambiar de decisión

Si el sistema incorporara un requerimiento de cierre de sesión forzado inmediato por parte de administradores (ban en tiempo real antes de que expire el token de 2 horas), agregaríamos una lista negra de identificadores de token (`jti`) en memoria/Redis o migraríamos a sesiones persistidas con token de refresco.

