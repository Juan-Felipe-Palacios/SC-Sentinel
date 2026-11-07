// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Rol del dashboard para componentes cliente (sidebar, topbar, chat, IA).

'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface DashboardRoleValue {
  role: 'admin' | 'guest';
  guestExpiresAt?: number;
}

const DashboardRoleContext = createContext<DashboardRoleValue>({ role: 'admin' });

export function DashboardRoleProvider({
  role,
  guestExpiresAt,
  children,
}: DashboardRoleValue & { children: ReactNode }) {
  return (
    <DashboardRoleContext.Provider value={{ role, guestExpiresAt }}>
      {children}
    </DashboardRoleContext.Provider>
  );
}

export function useDashboardRole(): DashboardRoleValue {
  return useContext(DashboardRoleContext);
}
