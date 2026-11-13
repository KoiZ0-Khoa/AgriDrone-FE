import { apiRequest } from '../../api/client'

export type DepositPolicy = { policyId: string; versionNumber: number; amountVnd: number; effectiveFrom: string }
export type ComboDiscountPolicy = { policyId: string; versionNumber: number; discountPercentage: number; effectiveFrom: string }
export const validPolicyVersion = (version: number) => Number.isInteger(version) && version >= 0 && version <= 2_147_483_647
const deposit = '/api/system-admin/survey-deposit'
const combo = '/api/system-admin/survey-combo-discount'

export const getDepositPolicy = (token: string, signal?: AbortSignal) => apiRequest<DepositPolicy>(deposit + '/current', { token, signal })
export const getDepositPolicyHistory = (token: string, signal?: AbortSignal) => apiRequest<DepositPolicy[]>(deposit + '/versions', { token, signal })
export const getComboDiscountPolicy = (token: string, signal?: AbortSignal) => apiRequest<ComboDiscountPolicy>(combo + '/current', { token, signal })
export const getComboDiscountHistory = (token: string, signal?: AbortSignal) => apiRequest<ComboDiscountPolicy[]>(combo + '/versions', { token, signal })

export function depositPolicyBody(raw: string, expectedVersion: number) {
  const amountVnd = Number(raw.trim())
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(amountVnd) || amountVnd < 0) throw new Error('Tiền cọc phải là số nguyên VND từ 0 trở lên.')
  if (!validPolicyVersion(expectedVersion)) throw new Error('Tải lại chính sách cọc trước khi cập nhật.')
  return { amountVnd, expectedVersion }
}
export function comboDiscountBody(raw: string, expectedVersion: number) {
  const normalized = raw.trim().replace(',', '.')
  const discountPercentage = Number(normalized)
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || !Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage >= 100) {
    throw new Error('Giảm giá phải từ 0 đến dưới 100%, tối đa 2 chữ số thập phân.')
  }
  if (!validPolicyVersion(expectedVersion)) throw new Error('Tải lại chính sách giảm giá trước khi cập nhật.')
  return { discountPercentage, expectedVersion }
}
export const saveDepositPolicy = (token: string, raw: string, expectedVersion: number) => apiRequest<DepositPolicy>(deposit + '/versions', { method: 'POST', token, body: depositPolicyBody(raw, expectedVersion) })
export const saveComboDiscountPolicy = (token: string, raw: string, expectedVersion: number) => apiRequest<ComboDiscountPolicy>(combo + '/versions', { method: 'POST', token, body: comboDiscountBody(raw, expectedVersion) })
