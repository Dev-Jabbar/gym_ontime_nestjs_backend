import { register } from 'node:module';

// OpenTelemetry tracing, switched on with OTEL_ENABLED=true. Off by default,
// and it never stops the API from starting: any problem is logged and the
// app runs without tracing (fail-open, like Redis and Firebase).
//
// IMPORTANT: this file must not statically import anything OpenTelemetry
// instruments (express, pg, ioredis, http...). Everything is loaded with
// dynamic import() AFTER the ESM hook below is registered.
//
// Env:
//   OTEL_ENABLED                    "true" to turn tracing on
//   OTEL_SERVICE_NAME               default "gym-ontime-backend"
//   OTEL_EXPORTER_OTLP_ENDPOINT     default "http://localhost:4318" (Jaeger)
export async function startTracing(): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') return;

  // Traces only. Jaeger has no metrics/logs endpoint, so without these the
  // SDK would keep POSTing to /v1/metrics and /v1/logs and log errors.
  process.env.OTEL_METRICS_EXPORTER ??= 'none';
  process.env.OTEL_LOGS_EXPORTER ??= 'none';

  try {
    // Lets OpenTelemetry wrap packages that are imported from ES modules.
    register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME } = await import(
      '@opentelemetry/semantic-conventions'
    );
    const { HttpInstrumentation } = await import(
      '@opentelemetry/instrumentation-http'
    );
    const { ExpressInstrumentation, ExpressLayerType } = await import(
      '@opentelemetry/instrumentation-express'
    );
    const { NestInstrumentation } = await import(
      '@opentelemetry/instrumentation-nestjs-core'
    );
    const { PgInstrumentation } = await import('@opentelemetry/instrumentation-pg');
    const { IORedisInstrumentation } = await import(
      '@opentelemetry/instrumentation-ioredis'
    );

    const serviceName = process.env.OTEL_SERVICE_NAME || 'gym-ontime-backend';
    const base = (
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
    ).replace(/\/+$/, '');
    const url = `${base}/v1/traces`;

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        'deployment.environment': process.env.NODE_ENV || 'development',
      }),
      traceExporter: new OTLPTraceExporter({ url }),
      instrumentations: [
        new HttpInstrumentation({
          // Skip browser preflights and socket.io polling: pure noise.
          ignoreIncomingRequestHook: (req) =>
            req.method === 'OPTIONS' || !!req.url?.startsWith('/socket.io/'),
        }),
        // Nest already gives one span per controller handler; hide Express's
        // per-middleware spans (cookie-parser, json, cors...).
        new ExpressInstrumentation({
          ignoreLayersType: [
            ExpressLayerType.MIDDLEWARE,
            ExpressLayerType.ROUTER,
          ],
        }),
        new NestInstrumentation(),
        // requireParentSpan: only record DB and Redis calls that happen
        // inside a request or job. BullMQ polls Redis nonstop in the
        // background, which would otherwise create endless one-span traces.
        new PgInstrumentation({ requireParentSpan: true }),
        new IORedisInstrumentation({ requireParentSpan: true }),
      ],
    });

    sdk.start();
    console.log(`[otel] tracing enabled: service=${serviceName} -> ${url}`);

    // Flush buffered spans on shutdown so the last requests aren't lost.
    const shutdown = () => {
      sdk
        .shutdown()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (err) {
    console.warn(
      `[otel] failed to start tracing; continuing without it: ${(err as Error).message}`,
    );
  }
}
