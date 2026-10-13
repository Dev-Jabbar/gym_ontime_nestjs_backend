import 'dotenv/config';

// Tracing has to start BEFORE the app's libraries (express, pg, ioredis...)
// are loaded, otherwise OpenTelemetry cannot wrap them. In an ES-module
// project all static imports load first, so the app is pulled in with a
// dynamic import() only after startTracing() has run. With
// OTEL_ENABLED unset, startTracing() does nothing and the app starts as before.
const { startTracing } = await import('./telemetry/tracing.js');
await startTracing();

await import('./bootstrap.js');
