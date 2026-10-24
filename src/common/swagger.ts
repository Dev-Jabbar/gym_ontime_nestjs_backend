import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME } from './cookie.js';

// Interactive API documentation (Swagger UI) at /api/docs, generated from the
// controllers and DTOs, so it can't drift out of date. The raw OpenAPI JSON is
// at /api/docs-json. On by default; set SWAGGER_ENABLED=false to switch it off.
export const DOCS_PATH = 'api/docs';

export function swaggerEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.SWAGGER_ENABLED?.trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'off');
}

export function setupSwagger(app: INestApplication): void {
  if (!swaggerEnabled()) return;

  const config = new DocumentBuilder()
    .setTitle('Gym Ontime API')
    .setDescription(
      [
        'Gym class booking API: NestJS + Prisma + PostgreSQL, Redis, BullMQ, WebSocket, Paystack payments.',
        '',
        '**Try it:** call `POST /api/users/login` below with an account. The server answers with an HTTP-only `token` cookie, and your browser then sends it automatically on every other request made from this page. Routes marked with a lock need that cookie; the role needed is written in each route\'s description.',
        '',
        'Live seat counts are pushed over WebSocket (socket.io, namespace `/classes`, events `class:capacity` and `class:removed`), which OpenAPI cannot describe.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addCookieAuth(AUTH_COOKIE_NAME)
    .addTag('Auth', 'Register, log in, log out, current user')
    .addTag('Users', 'User administration')
    .addTag('Classes', 'Class schedule, enrollment and trainers')
    .addTag('Members', 'Member profiles')
    .addTag('Trainers', 'Trainer profiles')
    .addTag('Payments', 'Paystack checkout, verification and the webhook')
    .addTag('Notifications', 'In-app notifications and push device tokens')
    .addTag('Admin profile', 'The logged-in admin\'s own profile')
    .addTag('Uploads', 'Signed Cloudinary uploads')
    .addTag('Maintenance (admin)', 'Manually trigger the background jobs')
    .addTag('System', 'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Global prefix is not applied to this path, so it is spelled out in full.
  SwaggerModule.setup(DOCS_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
  });
}
