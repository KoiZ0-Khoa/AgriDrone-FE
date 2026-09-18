import { ApiError } from '../../api/client'
import type { TenantSelectionResponse } from './types'

class TenantSelectionExpiredError extends Error {
  constructor() {
    super('Phiên chọn đơn vị đã hết hạn. Hãy quay lại đăng nhập để tạo phiên mới.')
    this.name = 'TenantSelectionExpiredError'
  }
}

export function assertTenantSelectionFresh(selection: TenantSelectionResponse | null, now = Date.now()): asserts selection is TenantSelectionResponse {
  if (!selection?.selectionToken || !Number.isFinite(Date.parse(selection.expiresAt)) || Date.parse(selection.expiresAt) <= now) {
    throw new TenantSelectionExpiredError()
  }
}

export function requiresFreshTenantLogin(error: unknown) {
  return error instanceof TenantSelectionExpiredError || (error instanceof ApiError && error.status === 401)
}

export function getAuthErrorMessage(error: Error, step: 'login' | 'tenant-selection') {
  if (step === 'tenant-selection' && requiresFreshTenantLogin(error)) {
    return error instanceof TenantSelectionExpiredError ? error.message : 'Phiên chọn đơn vị không hợp lệ hoặc đã hết hạn. Hãy quay lại đăng nhập rồi chọn đơn vị ngay.'
  }
  if (error instanceof ApiError && error.status === 401) return 'Email hoặc mật khẩu không đúng.'
  if (step === 'tenant-selection' && error instanceof ApiError && error.status === 403) return 'Bạn không còn quyền vào đơn vị này. Hãy chọn đơn vị khác hoặc liên hệ quản trị viên.'
  if (error instanceof TypeError) return 'Không kết nối được tới máy chủ. Hãy kiểm tra backend đang chạy.'
  return error.message || 'Đăng nhập không thành công. Vui lòng thử lại.'
}
