import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

// This controller holds the AUTH-ACTION routes from your user.routes.ts
// (register/login/logout/me). The CRUD/admin routes from that same file
// live in UsersController instead (users.controller.ts) — both share the
// 'users' base path below on purpose, so the final URLs match Express.
//
// @Controller('users') is deliberately the SAME base path as
// UsersController. Two different controller classes contributing routes
// to one shared prefix is valid Nest, and mirrors how Express did it:
// one router, multiple concerns. This makes register/login/logout/me land
// at /api/users/register, /api/users/login, /api/users/logout,
// /api/users/me — matching your Express paths exactly.
@Controller('users')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/users/register — no guard, same as your public register route
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    // No try/catch here — if authService.register() throws
    // ConflictException, Nest's built-in exception filter turns that into
    // a 409 response automatically. Compare this to your Express
    // controller's explicit catch block that checks `instanceof AppError`.
    return this.authService.register(dto);
  }

  // POST /api/users/login — also public; this IS the login route itself,
  // so it can't require a token yet
  @Post('login')
  @HttpCode(200) // Nest defaults POST to 201; login isn't "creating" anything
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(dto);

    // Same cookie-setting approach as your Express controller:
    // HTTP-only, so client-side JS can never read the raw token.
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true, // enable once served over HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Token is in the cookie only — never in the JSON body,
    // exactly like your Express version.
    return user;
  }

  // GET /api/users/me — protected. This is the route that actually exercises
  // JwtAuthGuard end to end: no valid cookie -> 401, automatically.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: any) {
    return user;
  }

  // POST /api/users/logout — equivalent of your Express logout(): just clears
  // the cookie, no guard needed (calling this with no cookie is harmless).
  // clearCookie options must match the options the cookie was SET with
  // (httpOnly/sameSite/secure) or the browser won't actually clear it —
  // kept identical to login()'s res.cookie(...) call above on purpose.
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true, // enable once served over HTTPS, same as login()
    });
    return { message: 'Logged out successfully' };
  }
}
