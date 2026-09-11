import * as api from './api'
export type Values = Record<string, string>
export type Field = { key: string; label: string; value?: string; optional?: boolean; max?: number; kind?: 'password' | 'email' | 'number' | 'multiline' }
export type Action = { title: string; description?: string; fields: Field[]; danger?: boolean; success?: string; run: (values: Values) => Promise<unknown>; after?: () => void | Promise<void> }
export const text = (v: Values, key: string) => (v[key] ?? '').trim()
export function validate(fields: Field[], v: Values) {
  for (const f of fields) {
    const value = f.kind === 'password' ? v[f.key] ?? '' : text(v, f.key)
    if (!f.optional && !value.trim()) throw new Error('Vui lòng nhập ' + f.label.toLowerCase() + '.')
    if (f.max && value.length > f.max) throw new Error(f.label + ' tối đa ' + f.max + ' ký tự.')
    if (f.kind === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Email chưa đúng định dạng.')
  }
}
export const emailField: Field = { key: 'email', label: 'Email', kind: 'email', max: 254 }
export function profileAction(token: string, current: api.Profile, save: (profile: api.Profile) => void | Promise<void>): Action {
  return { title: 'Chỉnh sửa hồ sơ', fields: [{ key: 'name', label: 'Họ và tên', value: current.fullName, max: 150 }, { key: 'phone', label: 'Số điện thoại', value: current.phone ?? '', max: 30 }], run: async v => save(await api.updateProfile(token, { name: text(v, 'name'), phone: text(v, 'phone') })) }
}
export function passwordAction(token: string, logout: () => void | Promise<void>): Action {
  return { title: 'Đổi mật khẩu', description: 'Sau khi đổi mật khẩu, hãy đăng nhập lại bằng mật khẩu mới.', fields: [{ key: 'oldPassword', label: 'Mật khẩu hiện tại', kind: 'password' }, { key: 'newPassword', label: 'Mật khẩu mới', kind: 'password' }, { key: 'confirm', label: 'Nhập lại mật khẩu mới', kind: 'password' }], run: v => {
    if (v.newPassword.length < 8) throw new Error('Mật khẩu mới cần ít nhất 8 ký tự.')
    if (v.newPassword !== v.confirm) throw new Error('Xác nhận mật khẩu chưa khớp.')
    return api.changePassword(token, { oldPassword: v.oldPassword, newPassword: v.newPassword })
  }, after: logout }
}
export function inviteAction(token: string): Action {
  return { title: 'Mời quản trị viên', description: 'Gửi lời mời tham gia đơn vị với vai trò Tenant Admin qua email.', fields: [emailField], run: v => api.inviteAdmin(token, text(v, 'email')), success: 'Đã tạo lời mời. Người nhận cần chấp nhận qua email.' }
}
export function acceptAction(token = ''): Action {
  return { title: 'Chấp nhận lời mời', description: 'Nhập mã trong liên kết mời. Nếu chưa có tài khoản, điền thêm họ tên và mật khẩu.', fields: [{ key: 'token', label: 'Mã lời mời', value: token, max: 512 }, { key: 'fullName', label: 'Họ và tên (tài khoản mới)', optional: true, max: 150 }, { key: 'phone', label: 'Số điện thoại', optional: true, max: 30 }, { key: 'password', label: 'Mật khẩu (tài khoản mới)', kind: 'password', optional: true }], run: v => {
    if (v.password && v.password.length < 8) throw new Error('Mật khẩu cần ít nhất 8 ký tự.')
    return api.acceptInvitation({ token: text(v, 'token'), fullName: text(v, 'fullName') || null, phone: text(v, 'phone') || null, password: v.password || null })
  }, success: 'Đã chấp nhận lời mời. Bạn có thể đăng nhập để chọn đơn vị.' }
}
export function confirmation(title: string, description: string, run: () => Promise<unknown>, after?: Action['after']): Action {
  return { title, description, fields: [], danger: true, run, after }
}
function optionalNumber(v: string, label: string, min: number, max = Infinity) {
  if (!v.trim()) return null
  const normalized = v.trim().replace(',', '.')
  const n = Number(normalized)
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(n) || n < min || n > max) throw new Error(label + ' không hợp lệ.')
  return n
}
export function farmBody(v: Values, farm: api.FarmUpdate): api.FarmUpdate {
  const longitude = optionalNumber(v.longitude ?? '', 'Kinh độ', -180, 180)
  const latitude = optionalNumber(v.latitude ?? '', 'Vĩ độ', -90, 90)
  if ((longitude === null) !== (latitude === null)) throw new Error('Nhập đủ kinh độ và vĩ độ, hoặc để trống cả hai.')
  if (!Number.isSafeInteger(farm.expectedVersion) || farm.expectedVersion < 1) throw new Error('Hãy tải lại thông tin nông trại.')
  return { name: text(v, 'name'), address: text(v, 'address') || null, areaHectares: optionalNumber(v.area ?? '', 'Diện tích', 0), boundary: farm.boundary, centerPoint: longitude === null || latitude === null ? null : { type: 'Point', coordinates: [longitude, latitude] }, expectedVersion: farm.expectedVersion }
}
export function farmAction(token: string, farmId: string, farm: api.FarmUpdate): Action {
  return { title: 'Chỉnh sửa nông trại', description: 'Mã nông trại và ranh giới đã lưu được giữ nguyên.', fields: [
    { key: 'name', label: 'Tên nông trại', value: farm.name, max: 150 },
    { key: 'address', label: 'Địa chỉ', value: farm.address ?? '', optional: true, max: 200 },
    { key: 'area', label: 'Diện tích (ha)', value: farm.areaHectares == null ? '' : String(farm.areaHectares), optional: true, kind: 'number' },
    { key: 'longitude', label: 'Kinh độ', value: String(farm.centerPoint?.coordinates[0] ?? ''), optional: true, kind: 'number' },
    { key: 'latitude', label: 'Vĩ độ', value: String(farm.centerPoint?.coordinates[1] ?? ''), optional: true, kind: 'number' },
  ], run: v => api.updateFarm(token, farmId, farmBody(v, farm)) }
}
export const roleLabel = (role?: number) => role === 0 ? 'Owner' : role === 1 ? 'Quản trị viên' : 'Thành viên'

