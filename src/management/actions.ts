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
export function inviteMemberAction(token: string): Action {
  return { title: 'Mời thành viên', description: 'Gửi lời mời qua email. Sau khi chấp nhận, thành viên cần được phân công vào Farm để có quyền làm việc.', fields: [emailField], run: v => api.inviteMember(token, text(v, 'email')), success: 'Đã tạo lời mời thành viên. Người nhận cần chấp nhận qua email.' }
}
export const farmRoleLabel = (role: api.FarmRole) => role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'
export function canRevokeFarmMember(actorRole: string, member: api.FarmMember) {
  return member.status === 'ACTIVE' && (actorRole === 'OWNER' || (actorRole === 'TENANT_ADMIN' && member.tenantRole === 'MEMBER'))
}
export function revokeFarmAction(token: string, member: api.FarmMember, actorRole: string): Action {
  return {
    title: 'Thu hồi phân công',
    description: `Thu hồi quyền làm việc của ${member.fullName} (${member.email}) tại nông trại này. Tài khoản và tư cách thành viên đơn vị vẫn được giữ lại.`,
    fields: [{ key: 'reason', label: 'Lý do (không bắt buộc)', optional: true, max: 500, kind: 'multiline' }],
    danger: true,
    run: v => {
      if (!canRevokeFarmMember(actorRole, member)) throw new Error('Bạn không có quyền thu hồi phân công này.')
      if (!Number.isSafeInteger(member.version) || member.version <= 0) throw new Error('Hãy tải lại danh sách thành viên.')
      const reason = text(v, 'reason')
      if (reason.length > 500) throw new Error('Lý do tối đa 500 ký tự.')
      return api.revokeFarmAssignment(token, member.farmId, member.userId, { expectedVersion: member.version, reason: reason || null })
    },
    success: 'Đã thu hồi phân công tại nông trại.',
  }
}
export function acceptAction(token: string, preview: api.InvitationPreview, onAccepted?: () => void): Action {
  const createAccount = preview.requiresAccountCreation
  const fields: Field[] = createAccount ? [
    { key: 'fullName', label: 'Họ và tên', max: 150 },
    { key: 'phone', label: 'Số điện thoại', optional: true, max: 30 },
    { key: 'password', label: 'Mật khẩu mới', kind: 'password' },
    { key: 'confirm', label: 'Nhập lại mật khẩu mới', kind: 'password' },
  ] : []
  return {
    title: createAccount ? 'Tạo tài khoản và nhận lời mời' : 'Chấp nhận lời mời',
    description: preview.tenantName + ' · ' + preview.maskedEmail + '. ' + (createAccount ? 'Email này chưa có tài khoản. Điền thông tin để tạo tài khoản và tham gia đơn vị.' : 'Email này đã có tài khoản. Bạn chỉ cần xác nhận tham gia, không cần đăng ký hoặc đặt lại mật khẩu.'),
    fields,
    run: async v => {
      validate(fields, v)
      if (createAccount && v.password.length < 8) throw new Error('Mật khẩu cần ít nhất 8 ký tự.')
      if (createAccount && v.password !== v.confirm) throw new Error('Xác nhận mật khẩu chưa khớp.')
      await api.acceptInvitation({ token: token.trim(), fullName: createAccount ? text(v, 'fullName') : null, phone: createAccount ? text(v, 'phone') || null : null, password: createAccount ? v.password : null })
      onAccepted?.()
    },
    success: 'Đã chấp nhận lời mời. Đăng nhập bằng tài khoản của email được mời để chọn đơn vị.',
  }
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
