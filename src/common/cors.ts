// One list of allowed browser origins, shared by the HTTP API (main.ts)
// and the WebSocket gateway so the two can never drift apart.
export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4000',
  'https://gym-ontime.vercel.app',
];
