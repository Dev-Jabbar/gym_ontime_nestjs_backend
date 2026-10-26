import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Role, User } from '@prisma/client';
import { UsersRepository } from './users.repository.js';

// Business rules for users: password hashing and comparison, existence and
// state checks, and stripping the password from responses. All database
// access is in UsersRepository.
@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  findActiveByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findActiveByEmail(email);
  }

  findByEmailIncludingDeleted(email: string): Promise<User | null> {
    return this.usersRepo.findByEmailIncludingDeleted(email);
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findActiveById(id);
  }

  // Registration for a brand-new email. The repository creates the User and
  // its MemberProfile in one transaction. Hashing happens here, because
  // Prisma has no equivalent of a Mongoose pre("save") hook.
  async create(data: {
    name: string;
    email: string;
    password: string;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.usersRepo.createWithMemberProfile({
      name: data.name,
      email: data.email,
      hashedPassword,
    });
  }

  // Registration for a soft-deleted account: revives it.
  async restore(
    userId: string,
    data: { name: string; password: string },
  ): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.usersRepo.restoreAsMember(userId, {
      name: data.name,
      hashedPassword,
    });
  }

  comparePassword(user: User, candidate: string): Promise<boolean> {
    return bcrypt.compare(candidate, user.password);
  }

  // Active users only, with the password stripped.
  async findAllActive(): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersRepo.findAllActive();
    return users.map(({ password: _password, ...rest }) => rest);
  }

  // Known gap: the Express version also re-signs the JWT when the role or
  // email changes; this one does not yet.
  async update(
    id: string,
    data: { name?: string; email?: string; role?: Role },
  ): Promise<Omit<User, 'password'>> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException('User not found');

    const updated = await this.usersRepo.update(id, data);
    const { password: _password, ...rest } = updated;
    return rest;
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException('User not found');

    await this.usersRepo.softDeleteWithCascade(id);
  }

  async upgradeToTrainer(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'trainer') {
      throw new ConflictException('User is already a trainer');
    }

    const updatedUser = await this.usersRepo.promoteToTrainer(id);
    const { password: _password, ...rest } = updatedUser;
    return rest;
  }
}
