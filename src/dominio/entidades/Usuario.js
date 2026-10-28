import { ReglaDeNegocioError } from '../errores/index.js';

export const ROLES = Object.freeze({
  ORGANIZADOR: 'ORGANIZADOR',
  ARBITRO: 'ARBITRO',
  CAPITAN: 'CAPITAN',
  JUGADOR: 'JUGADOR'
});

export class Usuario {
  constructor({
    id,
    email,
    passwordHash,
    nombreUsuario,
    gamerTag,
    rol,
    puntosElo = 1000,
    creadoEn = new Date()
  }) {
    if (!id || !email || !passwordHash || !nombreUsuario || !gamerTag || !rol) {
      throw new ReglaDeNegocioError('id, email, passwordHash, nombreUsuario, gamerTag y rol son obligatorios');
    }

    if (!Object.values(ROLES).includes(rol)) {
      throw new ReglaDeNegocioError(`Rol inválido: ${rol}`);
    }

    if (!email.includes('@')) {
      throw new ReglaDeNegocioError(`Formato de email inválido: ${email}`);
    }

    this.id = id;
    this.email = email.toLowerCase().trim();
    this.passwordHash = passwordHash;
    this.nombreUsuario = nombreUsuario.trim();
    this.gamerTag = gamerTag.trim();
    this.rol = rol;
    this.puntosElo = Number(puntosElo);
    this.creadoEn = creadoEn instanceof Date ? creadoEn : new Date(creadoEn);
  }

  esOrganizador() {
    return this.rol === ROLES.ORGANIZADOR;
  }

  esArbitro() {
    return this.rol === ROLES.ARBITRO;
  }

  esCapitan() {
    return this.rol === ROLES.CAPITAN;
  }

  esJugador() {
    return this.rol === ROLES.JUGADOR;
  }

  actualizarElo(nuevoElo) {
    const valor = Number(nuevoElo);
    if (isNaN(valor) || valor < 0) {
      throw new ReglaDeNegocioError('Los puntos ELO deben ser un número mayor o igual a 0');
    }
    this.puntosElo = Math.round(valor);
  }

  actualizarGamerTag(nuevoGamerTag) {
    if (!nuevoGamerTag || nuevoGamerTag.trim().length === 0) {
      throw new ReglaDeNegocioError('El gamerTag no puede estar vacío');
    }
    this.gamerTag = nuevoGamerTag.trim();
  }
}
