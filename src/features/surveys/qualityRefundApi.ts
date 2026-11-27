import { apiRequest } from '../../api/client'
import type { Page } from './types'

export const refundIssueLabels = {
  FALSE_POSITIVE: 'Báo bệnh nhầm',
  FALSE_NEGATIVE: 'Bỏ sót bệnh',
  WRONG_POLE: 'Gán sai trụ',
}

export type RefundIssue = { poleCode: string; issueType: keyof typeof refundIssueLabels; details: string }
export type RefundFinding = { poleCode: string; confirmedError: boolean; reason: string }
export type RefundStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REFUNDED'
export type RefundCase = {
  id: string
  surveyOrderId: string
  surveyResultId: string
  status: RefundStatus
  issues: RefundIssue[]
  description: string
  managerFindings: RefundFinding[] | null
  managerVerifiedAt: string | null
  managerVerificationReason: string | null
  version: number
  createdAt: string
  updatedAt: string
}
export type RefundCaseDetails = RefundCase & {
  recipientBankName: string
  recipientAccountNumber: string
  recipientAccountName: string
  decisionReason: string | null
  approvedAmount: number | null
  bankTransferReference: string | null
  transferEvidenceReference: string | null
  transferredAt: string | null
}
export type RefundClaimWindow = {
  serverTime: string
  noticeCreatedAt: string | null
  deadlineExclusive: string | null
  canReport: boolean
  v3PublicationId?: string | null
  reason: string | null
}
export type RefundFarmPlant = {
  id: string
  plantCode: string
  zoneId: string | null
  row: number | null
  col: number | null
  lat: number | null
  lon: number | null
  lifecycleStatus: string
}
export type ReportRefundBody = {
  publicationId?: string
  issues: RefundIssue[]
  description: string
  recipientBankName: string
  recipientAccountNumber: string
  recipientAccountName: string
}
export type RefundOrder = { surveyOrderId: string; grossPaid: number; refunded: number; netCollected: number; currency: string; cases: RefundCaseDetails[] }
export type RefundQueueItem = { orderNumber: string; refundCase: RefundCaseDetails }

const owner = '/api/tenant-owner/survey-orders'
const manager = '/api/system-manager/survey-orders'
const admin = '/api/system-admin/survey-orders'
const refundsPath = (base: string, orderId: string) => `${base}/${encodeURIComponent(orderId)}/quality-refunds`
const casePath = (base: string, orderId: string, caseId: string) => `${refundsPath(base, orderId)}/${encodeURIComponent(caseId)}`

export const getRefundClaimWindow = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<RefundClaimWindow>(`${refundsPath(owner, orderId)}/claim-window`, { token, signal, cache: 'no-store' })
export const getRefundFarmPlants = (token: string, farmId: string, signal?: AbortSignal) =>
  apiRequest<RefundFarmPlant[]>(`/api/farms/${encodeURIComponent(farmId)}/plants`, { token, signal })
export const getOwnerRefunds = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<RefundCaseDetails[]>(refundsPath(owner, orderId), { token, signal })
export const reportRefund = (token: string, orderId: string, body: ReportRefundBody) =>
  apiRequest<RefundCaseDetails>(refundsPath(owner, orderId), { token, method: 'POST', body })
export const getManagerRefunds = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<RefundCase[]>(refundsPath(manager, orderId), { token, signal })
export const verifyRefund = (token: string, orderId: string, caseId: string, body: { findings: RefundFinding[]; reason: string; expectedVersion: number }) =>
  apiRequest<RefundCase>(`${casePath(manager, orderId, caseId)}/verify`, { token, method: 'POST', body })
export const getAdminRefundQueue = (token: string, page: number, signal?: AbortSignal) => {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  return apiRequest<Page<RefundQueueItem>>(`${admin}/quality-refunds?${params}`, { token, signal })
}
export const getAdminRefunds = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<RefundOrder>(refundsPath(admin, orderId), { token, signal })
export const decideRefund = (token: string, orderId: string, caseId: string, body: { approve: boolean; reason: string; expectedVersion: number }) =>
  apiRequest<RefundCaseDetails>(`${casePath(admin, orderId, caseId)}/decision`, { token, method: 'POST', body })

export async function uploadRefundEvidence(token: string, orderId: string, caseId: string, file: File) {
  const body = new FormData()
  body.set('file', file)
  const response = await apiRequest<{ transferEvidenceReference: string }>(`${casePath(admin, orderId, caseId)}/transfer-evidence`, { token, method: 'POST', body })
  return response.transferEvidenceReference
}

export const recordRefundTransfer = (token: string, orderId: string, caseId: string, body: { bankTransferReference: string; transferEvidenceReference: string; expectedVersion: number }) =>
  apiRequest<RefundCaseDetails>(`${casePath(admin, orderId, caseId)}/record-transfer`, { token, method: 'POST', body })

export async function getRefundEvidence(token: string, role: 'owner' | 'admin', orderId: string, caseId: string, signal?: AbortSignal) {
  const result = await apiRequest<{ url: string }>(`${casePath(role === 'owner' ? owner : admin, orderId, caseId)}/transfer-evidence`, { token, signal, cache: 'no-store' })
  const url = new URL(result.url)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Đường dẫn biên lai không hợp lệ.')
  return url.href
}
