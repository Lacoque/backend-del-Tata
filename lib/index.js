// Código mínimo de itty-router
const Router = () => {
  const routes = [];
  const router = async (request, ...args) => {
      for (const route of routes) {
          const match = request.url.match(route.pattern);
          if (match) {
              const params = Object.fromEntries(
                  [...match.slice(1)].map((value, index) => [route.keys[index] || index, value])
              );
              return await route.handler({ request, params }, ...args);
          }
      }
      return new Response("Not Found", { status: 404 });
  };
  router.get = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
  router.post = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
  router.all = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
  return router;
};

export { Router };
