import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service.js";
import { RegisterDto } from "./dto/register.dto.js";
import { LoginDto } from "./dto/login.dto.js";

// Errors are thrown as Nest's built-in HTTP exceptions
// (UnauthorizedException, ConflictException, ...). Nest's exception filter
// turns them into the matching JSON response, so controllers need no
// try/catch.
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Look up the email including soft-deleted accounts.
    const existing = await this.usersService.findByEmailIncludingDeleted(
      dto.email,
    );

    if (existing && existing.isActive) {
      // The email belongs to an active account.
      throw new ConflictException("Email already in use");
    }

    let user;
    if (existing && !existing.isActive) {
      // The email belongs to a soft-deleted account: revive it instead of
      // creating a duplicate. The repository restores the User and its
      // MemberProfile in a single transaction.
      user = await this.usersService.restore(existing.id, {
        name: dto.name,
        password: dto.password,
      });
    } else {
      // Brand-new email.
      user = await this.usersService.create(dto);
    }

    // Never return the password.
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findActiveByEmail(dto.email);

    // Use the same generic error for "no such user" and "wrong password" so
    // the response never reveals which one was wrong.
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await this.usersService.comparePassword(user, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const token = this.jwtService.sign({
      id: user.id,
      role: user.role,
      email: user.email,
    });

    return {
      token, // The controller sets this in the cookie, never in the JSON body.
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
