// Fail fast at boot: a missing or weak setting should stop the app with a
// clear message right away, instead of surfacing hours later when the first
// customer tries to pay or log in.

export interface EnvProblems {
  errors: string[]; // the app must not start
  warnings: string[]; // the app starts, but a feature will be off
}

const isSet = (v: string | undefined) => !!v && v.trim() !== '';

export function findEnvProblems(
  env: NodeJS.ProcessEnv = process.env,
): EnvProblems {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';

  // Always required.
  if (!isSet(env.DATABASE_URL)) {
    errors.push('DATABASE_URL is not set (Postgres connection string).');
  }
  if (!isSet(env.PAYSTACK_SECRET_KEY)) {
    errors.push('PAYSTACK_SECRET_KEY is not set (payments and webhook need it).');
  }

  // JWT_SECRET: the code falls back to a public default when it is unset, so
  // in production that would let anyone forge login tokens.
  if (!isSet(env.JWT_SECRET)) {
    (production ? errors : warnings).push(
      'JWT_SECRET is not set; the built-in development secret is being used.',
    );
  } else if (production && env.JWT_SECRET!.length < 32) {
    errors.push('JWT_SECRET is too short for production (use 32+ characters).');
  }

  // Production-only requirements.
  if (production) {
    if (!isSet(env.FRONTEND_URL)) {
      errors.push(
        'FRONTEND_URL is not set (Paystack redirects the browser there after payment).',
      );
    } else if (!/^https:\/\//.test(env.FRONTEND_URL!.trim())) {
      warnings.push('FRONTEND_URL is not https; the login cookie needs https.');
    }
    if (env.THROTTLE_DISABLED === 'true') {
      warnings.push('THROTTLE_DISABLED=true: login rate limiting is OFF.');
    }
  } else if (!isSet(env.FRONTEND_URL)) {
    warnings.push('FRONTEND_URL is not set; payment redirects will be broken.');
  }

  // Optional features: warn so a typo is visible, but do not block boot.
  if (!isSet(env.REDIS_URL)) {
    warnings.push('REDIS_URL is not set: caching and background jobs are off.');
  }
  if (
    !isSet(env.CLOUDINARY_CLOUD_NAME) ||
    !isSet(env.CLOUDINARY_API_KEY) ||
    !isSet(env.CLOUDINARY_API_SECRET)
  ) {
    warnings.push('CLOUDINARY_* is not fully set: image uploads will not work.');
  }

  return { errors, warnings };
}

/** Called once at the very start of bootstrap. Exits with code 1 on errors. */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const { errors, warnings } = findEnvProblems(env);

  for (const w of warnings) console.warn(`[env] warning: ${w}`);

  if (errors.length > 0) {
    console.error('\n[env] The app cannot start. Fix these settings:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('');
    process.exit(1);
  }
}
