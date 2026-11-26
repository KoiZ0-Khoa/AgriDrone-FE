import type { AssignedOrder } from './orderTypes'

export type AdminCancellationKind = 'OPERATIONAL_POSTPONEMENT' | 'SERVICE_FAILURE'
export type AdminCancellationBody = {
  requesterId: string
  decisionKind: AdminCancellationKind
  requestedRetentionAmount: 0
  reasonCode: string
  reasonDescription: string
  expectedOrderVersion: number
  operationId: string
  payloadFingerprint: string
}

export type SystemOrder = AssignedOrder
export type SystemOrderFilters = { status?: string; tenantId?: string; farmId?: string }
