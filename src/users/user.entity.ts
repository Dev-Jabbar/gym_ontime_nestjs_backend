// Domain types for User. `Role` is shared by the auth guards and decorators.
export type Role = 'member' | 'trainer' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // Stored as a bcrypt hash.
  role: Role;
  isActive: boolean;
  deletedAt: Date | null;
}
