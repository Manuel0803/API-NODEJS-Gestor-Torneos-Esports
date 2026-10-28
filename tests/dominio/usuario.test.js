import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Usuario, ROLES } from '../../src/dominio/entidades/Usuario.js';
import { ReglaDeNegocioError } from '../../src/dominio/errores/index.js';

describe('Entidad de Dominio: Usuario', () => {
  const usuarioBase = {
    id: 'usr-1',
    email: 'capitan@test.com',
    passwordHash: '$argon2id$...',
    nombreUsuario: 'Faker',
    gamerTag: 'T1_Faker',
    rol: ROLES.CAPITAN
  };

  it('crea un usuario válido con 1000 puntos ELO por defecto', () => {
    const usuario = new Usuario(usuarioBase);

    assert.equal(usuario.id, 'usr-1');
    assert.equal(usuario.email, 'capitan@test.com');
    assert.equal(usuario.puntosElo, 1000);
    assert.equal(usuario.esCapitan(), true);
    assert.equal(usuario.esArbitro(), false);
    assert.ok(usuario.creadoEn instanceof Date);

    const conStringDate = new Usuario({ ...usuarioBase, creadoEn: '2026-10-26T14:49:59Z' });
    assert.ok(conStringDate.creadoEn instanceof Date);
  });

  it('rechaza roles no permitidos', () => {
    assert.throws(
      () => new Usuario({ ...usuarioBase, rol: 'SUPERADMIN' }),
      ReglaDeNegocioError
    );
  });

  it('rechaza emails con formato inválido', () => {
    assert.throws(
      () => new Usuario({ ...usuarioBase, email: 'emailinvalido' }),
      ReglaDeNegocioError
    );
  });

  it('identifica correctamente cada rol', () => {
    const admin = new Usuario({ ...usuarioBase, id: 'u2', rol: ROLES.ORGANIZADOR });
    const arbitro = new Usuario({ ...usuarioBase, id: 'u3', rol: ROLES.ARBITRO });
    const jugador = new Usuario({ ...usuarioBase, id: 'u4', rol: ROLES.JUGADOR });

    assert.equal(admin.esOrganizador(), true);
    assert.equal(arbitro.esArbitro(), true);
    assert.equal(jugador.esJugador(), true);
  });

  it('actualiza los puntos ELO correctamente', () => {
    const usuario = new Usuario(usuarioBase);
    usuario.actualizarElo(1250);

    assert.equal(usuario.puntosElo, 1250);
  });

  it('rechaza puntos ELO negativos', () => {
    const usuario = new Usuario(usuarioBase);

    assert.throws(
      () => usuario.actualizarElo(-50),
      ReglaDeNegocioError
    );
  });

  it('actualiza el gamerTag correctamente y hace trim', () => {
    const usuario = new Usuario(usuarioBase);
    usuario.actualizarGamerTag('  Faker_God  ');

    assert.equal(usuario.gamerTag, 'Faker_God');
  });

  it('rechaza gamerTag vacío o inválido', () => {
    const usuario = new Usuario(usuarioBase);

    assert.throws(() => usuario.actualizarGamerTag(''), ReglaDeNegocioError);
    assert.throws(() => usuario.actualizarGamerTag('   '), ReglaDeNegocioError);
    assert.throws(() => usuario.actualizarGamerTag(null), ReglaDeNegocioError);
  });

  it('rechaza campos obligatorios faltantes en constructor', () => {
    assert.throws(() => new Usuario({ ...usuarioBase, id: null }), ReglaDeNegocioError);
    assert.throws(() => new Usuario({ ...usuarioBase, email: '' }), ReglaDeNegocioError);
    assert.throws(() => new Usuario({ ...usuarioBase, passwordHash: null }), ReglaDeNegocioError);
    assert.throws(() => new Usuario({ ...usuarioBase, nombreUsuario: '' }), ReglaDeNegocioError);
    assert.throws(() => new Usuario({ ...usuarioBase, gamerTag: '' }), ReglaDeNegocioError);
    assert.throws(() => new Usuario({ ...usuarioBase, rol: null }), ReglaDeNegocioError);
  });
});
