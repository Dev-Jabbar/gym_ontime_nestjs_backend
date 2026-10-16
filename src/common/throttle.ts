// Rate limit for the public auth routes (login, register), per client IP.
// 10 attempts per minute is invisible to a real person but makes password
// guessing and account spam impractical.
// THROTTLE_DISABLED=true switches limiting off (handy for load tests or
// repeated Postman runs); never set it in production.
export const AUTH_THROTTLE = { limit: 10, ttl: 60_000 };

export function throttlingDisabled(): boolean {
  return process.env.THROTTLE_DISABLED === 'true';
}
