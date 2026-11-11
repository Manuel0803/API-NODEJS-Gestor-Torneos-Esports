import pg from 'pg';

export function crearPool(env) {
  return new pg.Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export async function verificarConexion(pool) {
  await pool.query('SELECT 1');
}

export async function esquemaAplicado(pool) {
  const res = await pool.query("SELECT to_regclass('public.usuarios') AS tabla");
  return res.rows[0].tabla !== null;
}

export async function cerrarPool(pool) {
  await pool.end();
}