import { v2 as cloudinary } from 'cloudinary';

// Direct port of Express's src/config/cloudinary.ts. Same three env vars,
// same singleton-config-on-import pattern (the cloudinary SDK holds this
// config in module-level state — there's no per-request client object to
// inject, so this isn't wrapped as an @Injectable() the way PrismaService
// is). Imported once, for its side effect, from upload.service.ts.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
