import { PuertoReloj } from '../../dominio/puertos/index.js';

export class RelojSistema extends PuertoReloj {
  ahora() {
    return new Date();
  }
}

