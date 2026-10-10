import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ALLOWED_ORIGINS } from './common/cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Equivalent of app.use(cookieParser()) in your Express server.ts —
  // without this, req.cookies is undefined and JwtAuthGuard can't read
  // the token cookie at all.
  app.use(cookieParser());

  // Equivalent of running loginUserSchema.parse(req.body) yourself in
  // every controller — this ONE line makes every DTO's class-validator
  // decorators run automatically, globally, before any controller method
  // sees the request body.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // Matches your Express app's `app.use("/api/classes", ...)` etc. — every
  // route in Express is mounted under /api. Nest routes were NOT under
  // /api until now, which meant e.g. /auth/register here vs
  // /api/users/register in Express: two completely different URLs. This
  // one line makes every @Controller() path in this app get an /api
  // prefix automatically, matching Express's mounting convention exactly.
  app.setGlobalPrefix('api');

  // Equivalent of your CORS setup — credentials: true is required for the
  // browser to send/receive the httpOnly cookie cross-origin. Origins kept
  // identical to your Express server.ts list so swapping which backend the
  // frontend points at doesn't also require a CORS change.
  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
