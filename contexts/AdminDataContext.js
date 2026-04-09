// contexts/AdminDataContext.js
// Shared real-time data from AdminLayout's Firestore listeners.
// Pages consume this instead of creating duplicate onSnapshot listeners,
// which saves Firestore reads and billing.

import { createContext, useContext } from 'react';

const AdminDataContext = createContext({
  orders: [],
  waiterCalls: [],
  ordersLoaded: false,
  callsLoaded: false,
});

export const AdminDataProvider = AdminDataContext.Provider;

/**
 * Returns { orders: Order[], loaded: boolean }
 * Only works inside AdminLayout (which provides the context).
 */
export function useAdminOrders() {
  const ctx = useContext(AdminDataContext);
  return { orders: ctx.orders, loaded: ctx.ordersLoaded };
}

/**
 * Returns { calls: WaiterCall[], loaded: boolean }
 * Only works inside AdminLayout (which provides the context).
 */
export function useAdminWaiterCalls() {
  const ctx = useContext(AdminDataContext);
  return { calls: ctx.waiterCalls, loaded: ctx.callsLoaded };
}
