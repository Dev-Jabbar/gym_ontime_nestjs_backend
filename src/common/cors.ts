// One list of allowed browser origins, shared by the HTTP API (bootstrap.ts)
// and the WebSocket gateway so the two can never drift apart.
//
// Configure with CORS_ORIGINS, a comma-separated list of origins, e.g.
//   CORS_ORIGINS=https://gym-ontime.vercel.app,https://www.mygym.com
// When it is unset the built-in list below is used. FRONTEND_URL (already
// required for the Paystack redirect) is always allowed too, so the deployed
// frontend can never be locked out by forgetting to list it twice.
const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4000',
  'https://gym-ontime.vercel.app',
];

// Origins never end with a slash ("https://x.com", not "https://x.com/"),
// and the browser compares them exactly, so normalise what people type.
function clean(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map(clean)
    .filter(Boolean);

  const base = configured.length > 0 ? configured : DEFAULT_ORIGINS;
  const frontend = env.FRONTEND_URL ? [clean(env.FRONTEND_URL)] : [];

  return [...new Set([...base, ...frontend])];
}

// Evaluated once when this file is first imported. main.ts loads .env before
// anything else, so the environment is already filled in at that point.
export const ALLOWED_ORIGINS = parseOrigins();
