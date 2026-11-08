import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { cargarEnv } from '../../config/env.js';
import { crearPool, cerrarPool } from './pool.js';

const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const USUARIOS_SEMILLA = [
  { nombre: 'Organizador', email: 'organizador@torneos.test', rol: 'ORGANIZADOR' },
  { nombre: 'Arbitro', email: 'arbitro@torneos.test', rol: 'ARBITRO' },
  { nombre: 'Capitan', email: 'capitan@torneos.test', rol: 'CAPITAN' },
  { nombre: 'Jugador', email: 'jugador@torneos.test', rol: 'JUGADOR' },
];

async function main() {
  const env = cargarEnv();
  const clave = process.env.SEED_PASSWORD;
  if (!clave || clave.length < 8) {
    console.error('SEED_PASSWORD es obligatoria y debe tener al menos 8 caracteres');
    process.exit(1);
  }

  const pool = crearPool(env);
  try {
    const sql = await readFile(new URL('./esquema.sql', import.meta.url), 'utf8');
    await pool.query(sql);

    const hash = await argon2.hash(clave, OPCIONES_ARGON2);
      for (const u of USUARIOS_SEMILLA) {
      await pool.query(
        `INSERT INTO usuarios (id, nombre_usuario, gamer_tag, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING`,
        [randomUUID(), u.nombre, u.nombre, u.email, hash, u.rol],
      );
    }
    console.log('Esquema aplicado y usuarios semilla cargados');
  } finally {
    await cerrarPool(pool);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});