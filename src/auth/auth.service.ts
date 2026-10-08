import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service.js";
import { RegisterDto } from "./dto/register.dto.js";
import { LoginDto } from "./dto/login.dto.js";

// NOTE ON ERROR HANDLING vs YOUR EXPRESS VERSION:
// Your Express app has a custom `AppError` class (message + statusCode) that
// the controller's catch block translates into a response. NestJS gives you
// this for free as built-in exception classes — UnauthorizedException,
// ConflictException, NotFoundException, etc. — each already tied to the
// right HTTP status. Throw one anywhere in a service, and Nest's built-in
// exception filter turns it into the right JSON response automatically.
// You don't write a catch block in the controller at all — that's the
// biggest structural difference from your Express controller.
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Same "check including soft-deleted" lookup as your registerUser()
    const existing = await this.usersService.findByEmailIncludingDeleted(
      dto.email,
    );

    if (existing && existing.isActive) {
      // Equivalent of: throw new AppError("Email already in use", 409)
      throw new ConflictException("Email already in use");
    }

    let user;
    if (existing && !existing.isActive) {
      // Branch 2 from your Express version: revive the soft-deleted account.
      // (Your real version wraps this in a MongoDB transaction because it
      // touches User + MemberProfile together. This in-memory stand-in only
      // touches one record, so there's nothing to roll back yet — Step 2,
      // once MemberProfile exists in Prisma, is where a real Prisma
      // $transaction belongs, for the same reason yours does.)
      user = await this.usersService.restore(existing.id, {
        name: dto.name,
        password: dto.password,
      });
    } else {
      // Branch 3: brand new email
      user = await this.usersService.create(dto);
    }

    // Same shape as your controller's response: never return the password
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findActiveByEmail(dto.email);

    // Same deliberately-generic error for BOTH "no user" and "wrong password"
    // as your loginUser() — never confirm which one was wrong.
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
      token, // controller puts this in the cookie, not the JSON body
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
