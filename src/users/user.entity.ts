// TEMPORARY: this is standing in for your Mongoose `User` model (user.model.ts)
// until Step 2 swaps this whole module for Prisma + PostgreSQL.
// The shape deliberately mirrors your existing IUser interface.
export type Role = 'member' | 'trainer' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // stored hashed, same as your Mongoose model
  role: Role;
  isActive: boolean;
  deletedAt: Date | null;
}
