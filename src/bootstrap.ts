import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { ALLOWED_ORIGINS } from './common/cors.js';
import { validateEnv } from './common/env.validation.js';
import { DOCS_PATH, setupSwagger } from './common/swagger.js';

// Application start-up. main.ts imports this dynamically, after tracing has
// started (see the note in main.ts), so it must never be imported statically.
async function bootstrap() {
  // Stop immediately, with a clear message, if a required setting is missing.
  validateEnv();

  // rawBody: true makes Nest keep the exact bytes of every JSON request on
  // req.rawBody (a Buffer) next to the parsed req.body. The Paystack webhook
  // needs it: Paystack signs the bytes it sent, and re-serialising the parsed
  // body with JSON.stringify can differ (spacing, key order, number
  // formatting) and wrongly fail the signature check.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Behind a platform proxy (Render, Railway, Fly, a Kubernetes ingress)
  // every request arrives from the proxy's address, so without this the login
  // rate limit would see one client for everybody and lock real users out
  // together. TRUST_PROXY_HOPS is the number of proxies in front of the app:
  // 1 by default in production, off locally.
  const hops = Number(
    process.env.TRUST_PROXY_HOPS ??
      (process.env.NODE_ENV === 'production' ? 1 : 0),
  );
  if (Number.isInteger(hops) && hops > 0) app.set('trust proxy', hops);

  // Standard security headers (nosniff, frame protection, HSTS over https,
  // no X-Powered-By). The API only returns JSON, so helmet's default
  // Content-Security-Policy is appropriate. Cross-Origin-Resource-Policy is
  // relaxed to cross-origin so the frontend on another domain can read
  // responses. The Swagger UI needs inline scripts and styles, which the
  // default policy blocks, so the docs paths get helmet without CSP and every
  // other path keeps the full policy.
  const apiHelmet = helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } });
  const docsHelmet = helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  app.use((req: { path: string }, res: unknown, next: unknown) => {
    const isDocs = req.path === `/${DOCS_PATH}` || req.path.startsWith(`/${DOCS_PATH}/`) || req.path === `/${DOCS_PATH}-json`;
    (isDocs ? docsHelmet : apiHelmet)(req as never, res as never, next as never);
  });

  // Parses cookies so req.cookies is populated; JwtAuthGuard reads the login
  // token from there.
  app.use(cookieParser());

  // Runs every DTO's class-validator rules globally, before any controller
  // method sees the request body.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // Every route is served under /api. The paths match the Express version
  // of this API (for example /api/users/register), so the same frontend
  // works against either backend.
  app.setGlobalPrefix('api');

  // Interactive API docs at /api/docs (see common/swagger.ts).
  setupSwagger(app);

  // credentials: true is required for the browser to send and receive the
  // HTTP-only cookie cross-origin. The allowed origins come from
  // common/cors.ts, which is shared with the WebSocket gateway.
  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
