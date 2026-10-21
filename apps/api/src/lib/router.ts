import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

/**
 * Wraps an async handler so rejected promises reach the Express error
 * handler instead of becoming unhandled rejections (Express 4 does not await
 * handlers automatically).
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'all';

/**
 * Creates a router whose handlers are automatically wrapped with
 * `asyncHandler`, so every route in the API fails safely.
 */
export function createRouter(): Router {
  const router = Router();
  const methods: Method[] = ['get', 'post', 'put', 'patch', 'delete', 'all'];

  for (const method of methods) {
    const original = router[method].bind(router) as (...args: unknown[]) => Router;
    (router as unknown as Record<Method, unknown>)[method] = (
      path: string,
      ...handlers: RequestHandler[]
    ) => original(path, ...handlers.map((handler) => asyncHandler(handler)));
  }

  return router;
}
