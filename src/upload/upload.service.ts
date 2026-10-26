import { Injectable, InternalServerErrorException } from '@nestjs/common';
import cloudinary from './cloudinary.config.js';

// Issues signed parameters for direct-to-Cloudinary uploads.
//
// How the signed flow works:
// 1. The browser calls this endpoint (with its auth cookie) to get a
//    signature.
// 2. The browser uploads the file directly to Cloudinary, attaching the
//    signature, timestamp, api_key and folder.
// 3. Cloudinary re-derives the signature with the same secret, proving the
//    request was authorised by this backend.
//
// CLOUDINARY_API_SECRET is only ever used here, on the server, and is never
// sent to the browser. This backend never handles the file bytes.
//
// No `req.user` check is needed: JwtAuthGuard rejects unauthenticated
// requests before this method runs.
@Injectable()
export class UploadService {
  getUploadSignature() {
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const folder = 'avatars';

      // Every parameter signed here must be sent back with the upload
      // request exactly as is. Cloudinary re-derives the signature from the
      // parameters it receives, so a missing, changed or extra parameter
      // causes a rejection.
      const paramsToSign = { timestamp, folder };

      const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        process.env.CLOUDINARY_API_SECRET as string,
      );

      return {
        signature,
        timestamp,
        folder,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      };
    } catch (error) {
      // api_sign_request is synchronous and only realistically throws when the
      // API secret is missing or malformed, which is a configuration problem.
      // An explicit catch returns a specific message instead of Nest's generic
      // "Internal server error".
      console.error('Cloudinary signature error:', error);
      throw new InternalServerErrorException(
        'Failed to generate upload signature',
      );
    }
  }
}
