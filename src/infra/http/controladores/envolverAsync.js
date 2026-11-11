export function envolverAsync(manejador) {
  return (req, res, next) => {
    Promise.resolve(manejador(req, res, next)).catch(next);
  };
}
