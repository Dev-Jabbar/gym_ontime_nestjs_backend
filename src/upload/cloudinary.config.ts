import { v2 as cloudinary } from 'cloudinary';

// Configures the Cloudinary SDK from the three CLOUDINARY_* environment
// variables. The SDK keeps this configuration in module-level state (there is
// no per-request client to inject), so it is not wrapped as an @Injectable().
// It is imported once, for its side effect, from upload.service.ts.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
