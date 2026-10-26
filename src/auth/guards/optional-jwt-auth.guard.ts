import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

// For routes that are public but show a little more to a logged-in user.
// Unlike JwtAuthGuard it never rejects: a missing, expired or invalid cookie
// simply means "anonymous" (req.user stays undefined) and the request
// continues.
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.token;
    if (token) {
      try {
        (req as any).user = this.jwtService.verify(token);
      } catch {
        // Invalid token: treat as anonymous.
      }
    }
    return true;
  }
}
