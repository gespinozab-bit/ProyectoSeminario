export type UserRole = 'ADMINISTRADOR' | 'DOCENTE';

export interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INACTIVE';
  roles: UserRole[];
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsersResponse {
  users: ManagedUser[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}
