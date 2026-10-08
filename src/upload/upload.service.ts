import { Injectable, InternalServerErrorException } from '@nestjs/common';
import cloudinary from './cloudinary.config.js';

// Direct port of upload.controller.ts's getUploadSignature, minus the
// `if (!req.user)` check — that check existed in Express because protect()
// only guarantees a token was verified, not that the controller can trust
// req.user is populated by the time it runs its own body. Here,
// JwtAuthGuard throws UnauthorizedException itself and this method never
// executes unless it already returned true, so there's nothing left to
// check for.
//
// How the signed flow works (same as Express):
// 1. Browser calls this endpoint (with auth cookie) to get a signature.
// 2. Browser uploads the file directly to Cloudinary's API, attaching
//    that signature + timestamp + api_key + folder.
// 3. Cloudinary verifies the signature server-side using the same secret
//    this service used to generate it — proving the request was
//    authorized by *our* backend, not forged by a random client.
//
// The API secret (CLOUDINARY_API_SECRET) is used here, in Node, and is
// never sent to or visible from the browser at any point. This backend
// never touches the file bytes themselves — only issues permission to
// upload directly to Cloudinary.
@Injectable()
export class UploadService {
  getUploadSignature() {
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const folder = 'avatars';

      // Every parameter included here MUST be sent back with the actual
      // upload request later, exactly as-is — Cloudinary re-derives the
      // signature from whatever params arrive and compares it to this one.
      // Mismatched or missing params (even an extra one) => rejected.
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
      // Kept as an explicit try/catch (unlike most other services, which
      // lean on Nest's automatic exception filter) specifically to match
      // Express's custom error message. `cloudinary.utils.api_sign_request`
      // is synchronous and only realistically throws if the API secret is
      // missing/malformed — a config problem, not a per-request one — but
      // Express surfaced a specific message for it, so this does too rather
      // than falling through to Nest's generic "Internal server error".
      console.error('Cloudinary signature error:', error);
      throw new InternalServerErrorException(
        'Failed to generate upload signature',
      );
    }
  }
}
