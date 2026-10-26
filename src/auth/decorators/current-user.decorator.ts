import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Parameter decorator that injects `req.user` (set earlier by JwtAuthGuard)
// into a controller method:
//   getMe(@CurrentUser() user) { ... }
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
