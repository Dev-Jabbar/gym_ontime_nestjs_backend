import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
} from '../common/cookie.js';
import { AUTH_THROTTLE } from '../common/throttle.js';

// Holds the authentication actions (register, login, logout, me). The
// admin and self-service CRUD routes live in UsersController. Both
// controllers deliberately share the 'users' base path, so the final URLs
// are /api/users/register, /api/users/login, /api/users/logout and
// /api/users/me, matching the Express version of this API.
@ApiTags('Auth')
@Controller('users')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/users/register: public. Rate limited per IP against account
  // spam (see common/throttle.ts).
  @ApiOperation({ summary: 'Register a new member account' })
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: AUTH_THROTTLE })
  async register(@Body() dto: RegisterDto) {
    // No try/catch: exceptions such as ConflictException are turned into the
    // right HTTP response by Nest's exception filter.
    return this.authService.register(dto);
  }

  // POST /api/users/login: public by necessity, since it issues the token.
  // Rate limited per IP against password guessing (see common/throttle.ts).
  @ApiOperation({ summary: 'Log in (sets the token cookie)' })
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: AUTH_THROTTLE })
  @HttpCode(200) // Nest defaults POST to 201; logging in creates nothing.
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(dto);

    // HTTP-only, so client-side JavaScript can never read the raw token.
    // Options are environment-aware (src/common/cookie.ts): lax locally,
    // SameSite=None and Secure in production so it works across domains.
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());

    // The token is in the cookie only, never in the JSON body.
    return user;
  }

  // GET /api/users/me: protected. Without a valid cookie, JwtAuthGuard
  // responds 401.
  @ApiOperation({ summary: 'Get the logged-in user' })
  @Get('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: any) {
    return user;
  }

  // POST /api/users/logout: clears the cookie. No guard is needed because
  // calling it without a cookie is harmless. The clearCookie options must
  // match the options the cookie was set with (httpOnly, sameSite, secure) or
  // the browser will not clear it; both come from src/common/cookie.ts so
  // they cannot drift apart.
  @ApiOperation({ summary: 'Log out (clears the cookie)' })
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
    return { message: 'Logged out successfully' };
  }
}
