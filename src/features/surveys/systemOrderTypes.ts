import type { AssignedOrder } from './orderTypes'

export type SystemOrder = AssignedOrder
export type SystemOrderFilters = { status?: string; tenantId?: string; farmId?: string }
