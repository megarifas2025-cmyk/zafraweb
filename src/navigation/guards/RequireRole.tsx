import React from 'react';
import type { ReactNode } from 'react';
import type { RolUsuario } from '@/shared/types';

type RequireRoleProps = {
  currentRole: RolUsuario | null | undefined;
  allowedRoles: readonly RolUsuario[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function hasAllowedRole(
  currentRole: RolUsuario | null | undefined,
  allowedRoles: readonly RolUsuario[],
): boolean {
  return !!currentRole && allowedRoles.includes(currentRole);
}

export function RequireRole({
  currentRole,
  allowedRoles,
  children,
  fallback = null,
}: RequireRoleProps) {
  if (!hasAllowedRole(currentRole, allowedRoles)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
