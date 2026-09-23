import type { UserRole } from '../utils/constants';

export interface User {
  id: string;
  organizationId: string | null;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const UserModel = {
  table: 'users',
} as const;
