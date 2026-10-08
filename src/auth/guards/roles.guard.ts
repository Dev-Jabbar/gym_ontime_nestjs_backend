import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { Role } from '../../users/user.entity.js';

// The second half of your protect(roles?) middleware — the "if (roles &&
// !roles.includes(payload.role)) return res.status(403)" part specifically.
// This ALWAYS runs after JwtAuthGuard (order matters — see auth.controller.ts),
// because it reads `req.user`, which JwtAuthGuard is what sets.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Reflector reads whatever @Roles(...) attached to this route.
    // If a route has no @Roles() at all, this is undefined — meaning
    // "any logged-in user," same as calling protect() with no argument.
    const requiredRoles = this.reflector.get<Role[]>(
      ROLES_KEY,
      context.getHandler(),
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }

    return true;
  }
}
