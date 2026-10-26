import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

// Authenticates a request: reads the JWT from the HTTP-only `token` cookie,
// verifies it, attaches the decoded payload to `req.user`, and rejects with
// 401 if the cookie is missing, invalid or expired. Role checks are done
// separately by RolesGuard.
//
// Apply it with @UseGuards(JwtAuthGuard) on a controller or a route.
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
      // Verifies the signature and expiry; throws if either is invalid.
      const payload = this.jwtService.verify(token);
      // Attach the user so RolesGuard and the @CurrentUser() decorator can
      // read it.
      (req as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
