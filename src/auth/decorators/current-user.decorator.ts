import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Purely a convenience — instead of writing `req.user` inside every
// protected controller method, this lets you write a parameter like:
//   getMe(@CurrentUser() user) { ... }
// and Nest injects req.user (set earlier by JwtAuthGuard) directly.
// Nothing like this exists in Express — there, you'd just read
// `req.user` directly off the request object every time.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
