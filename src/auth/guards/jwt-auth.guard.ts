import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

// THIS is your protect() middleware, rewritten as a Guard.
//
// Your Express version:
//   export const protect = (roles?: Role[]) => async (req, res, next) => {
//     const token = req.cookies.token;
//     const payload = verifyToken(token);
//     req.user = payload;
//     if (roles && !roles.includes(payload.role)) return res.status(403)...
//     next();
//   };
//
// Same job here: read the cookie, verify the JWT, attach the user to the
// request, reject if invalid. The one real difference is WHEN it runs —
// Nest guards run as part of the request lifecycle Nest itself manages,
// after routing decides which controller method matches, but before that
// method's body executes. You attach it with a decorator on the controller
// or route instead of passing it into the route definition.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.token;

    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      // Same verifyToken() call your Express middleware makes
      const payload = this.jwtService.verify(token);
      // Same as `req.user = payload` in your Express middleware —
      // this makes it available to a later RolesGuard, and to the
      // controller via the @CurrentUser() decorator we add next.
      (req as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
