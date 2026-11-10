import { crearApp } from '../../../src/infra/http/app.js';

export function middlewaresDePrueba() {
  const verificarToken = (req, res, next) => {
    const cabecera = req.headers['x-usuario'];
    if (!cabecera) return res.status(401).json({ title: 'No autenticado' });
    const [sub, rol] = cabecera.split(':');
    req.user = { sub, rol };
    return next();
  };

  const exigirRoles = (...roles) => (req, res, next) => (
    roles.includes(req.user?.rol) ? next() : res.status(403).json({ title: 'Prohibido' })
  );

  const validarEsquema = ({ params, body, query }) => (req, _res, next) => {
    try {
      if (params) req.params = params.parse(req.params);
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };

  return { verificarToken, exigirRoles, validarEsquema };
}

export function construirApp(router) {
  return crearApp({ configurarRutas: (app) => app.use(router) });
}

export const como = (id, rol) => ({ 'x-usuario': `${id}:${rol}` });
