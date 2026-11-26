import { text, type Action, type Field, type Values } from '../../management/actions'

import {
  bundleStream, serviceCodes, writeCommercialPolicy,
  type Bundle, type CommercialPolicies, type CommercialService, type Price, type Revision, type ServiceCode, type Version,
} from './commercialPoliciesApi'

export const serviceNames: Record<ServiceCode, string> = { MAP: 'Bản đồ nền', COMBO: 'Bản đồ nền và sàng lọc sức khỏe cây' }

const auditFields: Field[] = [
  { key: 'reason', label: 'Lý do thay đổi', max: 100 },
  { key: 'evidence', label: 'Tham chiếu tài liệu', max: 500, optional: true },
]
const audit = (values: Values) => ({ reasonCode: text(values, 'reason'), evidenceReference: text(values, 'evidence') || null })
const detailsFields = (name: string, description: string, max: number): Field[] => [
  { key: 'name', label: 'Tên dịch vụ', value: name, max: 150 },
  { key: 'description', label: 'Mô tả', kind: 'multiline', value: description, max },
]
const details = (v: Values) => ({ name: text(v, 'name'), description: text(v, 'description') })

function integerField(key: string, label: string, value?: number): Field {
  return { key, label, kind: 'number', value: value?.toString() }
}
function integer(v: Values, key: string, label: string, min: number, max: number) {
  const value = text(v, key)
  const amount = Number(value)
  if (!/^\d+$/.test(value) || amount < min || amount > max) {
    throw new Error(`${label} phải là số nguyên từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}.`)
  }
  return amount
}
const select = (key: string, label: string, options: NonNullable<Field['options']>, value?: string): Field =>
  ({ key, label, kind: 'select', options, value })

function boolField(key: string, label: string, value?: boolean, yes = 'Có', no = 'Không'): Field {
  return select(key, label, [{ label: yes, value: 'true' }, { label: no, value: 'false' }], value?.toString())
}
const checked = (v: Values, key: string) => text(v, key) === 'true'

export const isEffective = (version: Version | undefined, now: number) =>
  version != null && Date.parse(version.effectiveFrom) <= now && (version.effectiveTo == null || Date.parse(version.effectiveTo) > now)

export function createServiceAction(token: string, code: ServiceCode): Action {
  return {
    title: `Tạo dịch vụ ${code}`,
    fields: detailsFields(serviceNames[code], '', 4000),
    run: v => writeCommercialPolicy('services', token, { code, activateImmediately: true, ...details(v) }),
  }
}

export function revisionAction(token: string, service: CommercialService, revision?: Revision, usedByActiveBundle = false): Action {
  return {
    title: `Ban hành nội dung dịch vụ · ${service.code}`,
    description: usedByActiveBundle ? 'Bản mới sẽ thay thế bản mà gói đang kích hoạt sử dụng. Hãy tạo và kích hoạt gói mới để cập nhật danh mục đăng ký.' : undefined,
    fields: [...detailsFields(revision?.name ?? service.name, (revision?.description ?? service.description).slice(0, 2000), 2000), ...auditFields],
    run: v => writeCommercialPolicy('revisions', token, {
      surveyServiceId: service.id,
      mapsPoles: true,
      screensDisease: service.code === 'COMBO',
      expectedLatestVersionNumber: revision?.versionNumber ?? 0,
      ...details(v), ...audit(v),
    }),
  }
}

export function priceAction(token: string, service: CommercialService, price?: Price): Action {
  return {
    title: `Đặt đơn giá · ${service.code}`,
    fields: [integerField('price', 'Đơn giá (VND/trụ)', price?.pricePerPole), ...auditFields],
    run: v => writeCommercialPolicy('prices', token, {
      surveyServiceId: service.id, pricePerPole: integer(v, 'price', 'Đơn giá', 1, 1_000_000_000), currency: 'VND',
      expectedLatestPriceVersion: price?.versionNumber ?? 0, ...audit(v),
    }),
  }
}

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const policyDescription = 'Phiên bản mới cần được đưa vào một gói chính sách mới và kích hoạt để danh mục đăng ký sử dụng.'

export function policyActions(token: string, { deposits: [deposit], claims: [claim], cancellations: [cancellation] }: CommercialPolicies) {
  return {
    deposit: {
      title: 'Ban hành chính sách cọc',
      description: policyDescription,
      fields: [integerField('amount', 'Tiền cọc cố định (VND)', deposit?.amount), ...auditFields],
      run: v => writeCommercialPolicy('deposit-policies', token, {
        amount: integer(v, 'amount', 'Tiền cọc', 1, 1_000_000_000), currency: 'VND', expectedLatestVersion: deposit?.versionNumber ?? 0, ...audit(v),
      }),
    },
    claim: {
      title: 'Ban hành chính sách khiếu nại',
      description: policyDescription,
      fields: [
        integerField('days', 'Thời hạn (ngày lịch)', claim?.calendarWindowDays),
        { key: 'timeZone', label: 'Múi giờ IANA', value: claim?.timeZoneId ?? 'Asia/Ho_Chi_Minh', max: 100 },
        boolField('excludeNoticeDate', 'Bỏ qua ngày gửi thông báo khi tính hạn', claim?.excludeNoticeDate),
        ...auditFields,
      ],
      run: v => writeCommercialPolicy('claim-policies', token, {
        calendarWindowDays: integer(v, 'days', 'Thời hạn', 1, 365), timeZoneId: text(v, 'timeZone'),
        excludeNoticeDate: checked(v, 'excludeNoticeDate'), expectedLatestVersion: claim?.versionNumber ?? 0, ...audit(v),
      }),
    },
    cancellation: {
      title: 'Ban hành chính sách hủy và hoàn cọc',
      description: policyDescription,
      fields: [
        boolField('before', 'Hoàn cọc khi hủy trước thu thập', cancellation?.refundableBeforeCapture),
        boolField('after', 'Giữ cọc khi hủy sau thu thập', cancellation?.retainDepositAfterCapture),
        integerField('noShow', 'Số lần đổi lịch miễn phí khi khách vắng mặt', cancellation?.allowedFreeNoShowReschedules),
        boolField('postponement', 'Hoàn cọc khi dời lịch do vận hành', cancellation?.operationalPostponementRefundable),
        boolField('failure', 'Hoàn cọc khi thực hiện dịch vụ thất bại', cancellation?.serviceFailureRefundable),
        ...auditFields,
      ],
      run: v => writeCommercialPolicy('cancellation-policies', token, {
        refundableBeforeCapture: checked(v, 'before'), retainDepositAfterCapture: checked(v, 'after'),
        allowedFreeNoShowReschedules: integer(v, 'noShow', 'Số lần đổi lịch', 0, 100),
        operationalPostponementRefundable: checked(v, 'postponement'), serviceFailureRefundable: checked(v, 'failure'),
        expectedLatestVersion: cancellation?.versionNumber ?? 0, ...audit(v),
      }),
    },
  } satisfies Record<string, Action>
}

export function bundleAction(token: string, data: CommercialPolicies, now: number): Action | null {
  const [deposit] = data.deposits
  const [claim] = data.claims
  const [cancellation] = data.cancellations
  if (!deposit || !claim || !cancellation || ![deposit, claim, cancellation].every(version => isEffective(version, now))) return null

  const ready = serviceCodes.flatMap(code => {
    const service = data.services.find(item => item.code === code && item.status === 'ACTIVE')
    const revision = data.revisions.find(item => item.surveyServiceId === service?.id && isEffective(item, now))
    const price = data.prices.find(item => item.surveyServiceId === service?.id && isEffective(item, now))
    return revision && price ? [{ code, revision }] : []
  })
  if (!ready.length) return null

  const choices = ready.map(({ code, revision }) => ({ label: `${code} · v${revision.versionNumber}`, value: revision.id }))
  if (ready.length > 1) choices.push({ label: 'Cả MAP và COMBO', value: 'both' })

  return {
    title: 'Ban hành gói chính sách',
    description: `Gói gồm cọc ${vnd.format(deposit.amount)} (v${deposit.versionNumber}), khiếu nại v${claim.versionNumber} và hủy/hoàn cọc v${cancellation.versionNumber}. Sau khi lưu, hãy kích hoạt gói để áp dụng.`,
    fields: [select('services', 'Dịch vụ đưa vào gói', choices, choices.length === 1 ? choices[0].value : undefined), ...auditFields],
    run: v => writeCommercialPolicy('bundle-versions', token, {
      streamKey: bundleStream,
      serviceRevisionIds: text(v, 'services') === 'both' ? ready.map(item => item.revision.id) : [text(v, 'services')],
      depositPolicyId: deposit.id, claimPolicyId: claim.id, cancellationPolicyId: cancellation.id, pricingCurrency: 'VND',
      expectedLatestVersion: data.bundles[0]?.versionNumber ?? 0, ...audit(v),
    }),
  }
}

export function activationAction(token: string, bundle: Bundle, current: CommercialPolicies['activation']): Action {
  return {
    title: `Kích hoạt gói chính sách v${bundle.versionNumber}`,
    description: 'Trang đăng ký nhận yêu cầu mới khi cả ba mục bên dưới được bật.',
    fields: [
      boolField('intake', 'Đăng ký khảo sát công khai', current?.publicIntakeEnabled ?? false, 'Bật', 'Tắt'),
      boolField('capture', 'Thu thập dữ liệu', current?.captureEnabled ?? false, 'Bật', 'Tắt'),
      boolField('release', 'Phát hành kết quả', current?.releaseEnabled ?? false, 'Bật', 'Tắt'),
      ...auditFields,
    ],
    run: v => writeCommercialPolicy('activations', token, {
      targetPolicyVersionId: bundle.id,
      publicIntakeEnabled: checked(v, 'intake'), captureEnabled: checked(v, 'capture'), releaseEnabled: checked(v, 'release'),
      expectedLastDecisionId: current?.lastDecisionId ?? '00000000-0000-0000-0000-000000000000',
      decisionReasonCode: text(v, 'reason'), decisionEvidenceReference: text(v, 'evidence') || null,
    }),
  }
}
