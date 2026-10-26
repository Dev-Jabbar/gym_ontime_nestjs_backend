import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/user.entity.js';

// Declares which roles may call a route, e.g. @Roles('admin'). It only
// attaches metadata to the route and checks nothing itself. RolesGuard reads
// that metadata and enforces it, which separates "what is allowed" from "how
// it is enforced".
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
