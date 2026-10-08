import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/user.entity.js';

// In your Express version, allowed roles are passed straight into the
// middleware call: protect(["admin"]). Nest splits that into two pieces:
// this decorator just ATTACHES metadata ("this route wants these roles")
// onto the route — it doesn't check anything itself. RolesGuard (next file)
// is what actually reads that metadata and enforces it. Splitting
// "declare what's allowed" from "enforce it" is a very Nest-flavored
// pattern — you'll see the same split show up again and again.
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
