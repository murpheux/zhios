/** User roles for RBAC. */
export const ROLES = ['admin', 'manager', 'employee', 'user'] as const;
export type Role = (typeof ROLES)[number];

export function assertRole(value: string): Role {
  if (!(ROLES as readonly string[]).includes(value)) {
    throw new Error(`Invalid role: ${value}`);
  }
  return value as Role;
}

/** Fine-grained permissions. */
export const PERMISSIONS = [
  'read:profile',
  'write:profile',
  'read:transactions',
  'write:transactions',
  'admin:users',
  'admin:system',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export function assertPermission(value: string): Permission {
  if (!(PERMISSIONS as readonly string[]).includes(value)) {
    throw new Error(`Invalid permission: ${value}`);
  }
  return value as Permission;
}

/** Marital status. */
export const MARITAL_STATUSES = [
  'single',
  'married',
  'divorced',
  'widowed',
  'registered-partnership',
  'prefer-not-to-say',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export function assertMaritalStatus(value: string): MaritalStatus {
  if (!(MARITAL_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Invalid marital status: ${value}`);
  }
  return value as MaritalStatus;
}

/** Employment status. */
export const EMPLOYMENT_STATUSES = ['active', 'inactive', 'on-leave', 'terminated'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export function assertEmploymentStatus(value: string): EmploymentStatus {
  if (!(EMPLOYMENT_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Invalid employment status: ${value}`);
  }
  return value as EmploymentStatus;
}

/** UI theme preference. */
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function assertTheme(value: string): Theme {
  if (!(THEMES as readonly string[]).includes(value)) {
    throw new Error(`Invalid theme: ${value}`);
  }
  return value as Theme;
}
