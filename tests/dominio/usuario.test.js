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
});
