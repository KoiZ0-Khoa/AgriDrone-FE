import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Drawer, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import type { Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import {
  activationAction, bundleAction, createServiceAction, isEffective, policyActions, priceAction, revisionAction, serviceNames,
} from './commercialPolicyActions'
import { getCommercialPolicies, serviceCodes, type CommercialPolicies, type Price, type ServiceCode } from './commercialPoliciesApi'
import { dateTime, priceLabel, serviceLabels, workflowError } from './workflow'

export function ServicesPage() {
  const token = useAuth().session!.accessToken
  const [action, setAction] = useState<Action | null>(null)
  const [history, setHistory] = useState<ServiceCode | null>(null)
  const query = useQuery({
    queryKey: ['v3-commercial-policies'],
    queryFn: ({ signal }) => getCommercialPolicies(token, signal),
    retry: (count, error) => !(error instanceof ApiError && [401, 403, 404, 405].includes(error.status)) && count < 2,
  })
  const data = query.data
  const now = Date.now()
  const active = data?.activation
  const activeBundle = data?.bundles.find(bundle => bundle.id === active?.activeBusinessPolicyVersionId)
  const rows = serviceCodes.map(code => {
    const service = data?.services.find(item => item.code === code)
    const revisions = data?.revisions.filter(item => item.surveyServiceId === service?.id) ?? []
    const prices = data?.prices.filter(item => item.surveyServiceId === service?.id) ?? []
    return { code, service, revisions, prices }
  })

  let error = workflowError(query.error)
  if (query.error instanceof ApiError && [404, 405].includes(query.error.status)) {
    error = 'Máy chủ chưa cung cấp API đọc chính sách thương mại V3. Hãy triển khai bản BE có các API quản trị V3 rồi tải lại.'
  }

  return <>
    <section className="resource-page-heading">
      <div>
        <span className="page-kicker">DỊCH VỤ KHẢO SÁT</span>
        <h1>Dịch vụ & đơn giá</h1>
        <p>Cấu hình danh mục V3 dùng trên trang Đăng ký khảo sát.</p>
      </div>
      <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button>
    </section>

    {query.isError ? <CommonState type="error" description={error} retry={() => query.refetch()} /> : <section className="resource-panel">
      <h2>Dịch vụ MAP và COMBO</h2>
      <Table rowKey="code" loading={query.isPending} dataSource={data ? rows : []} pagination={false} scroll={{ x: 770 }} columns={[
        { title: 'Dịch vụ', render: (_, { code, service, revisions }) => <>
          <strong>{revisions[0]?.name ?? service?.name ?? serviceNames[code]}</strong>
          <p className="form-hint">{code}{revisions[0] ? ` · Nội dung v${revisions[0].versionNumber}` : ' · Chưa ban hành nội dung'}</p>
        </> },
        { title: 'Trạng thái', render: (_, { service }) => service ? <Tag color={service.status === 'ACTIVE' ? 'success' : 'default'}>{serviceLabels[service.status]}</Tag> : 'Chưa tạo' },
        { title: 'Đơn giá hiện hành', render: (_, { prices }) => {
          const price = prices.find(item => isEffective(item, now))
          return price ? <><strong>{priceLabel(price.pricePerPole, price.currency)}</strong><p className="form-hint">v{price.versionNumber} · Từ {dateTime(price.effectiveFrom)}</p></> : 'Chưa thiết lập'
        } },
        { title: 'Thao tác', render: (_, { code, service, revisions, prices }) => service ? <Space wrap>
          <Button disabled={!prices.length} onClick={() => setHistory(code)}>Lịch sử giá</Button>
          {service.status === 'ACTIVE' ? <>
            <Button onClick={() => setAction(revisionAction(token, service, revisions[0], activeBundle?.serviceRevisionIds.includes(revisions[0]?.id)))}>Ban hành nội dung</Button>
            <Button onClick={() => setAction(priceAction(token, service, prices[0]))}>Đặt đơn giá</Button>
          </> : null}
        </Space> : <Button onClick={() => setAction(createServiceAction(token, code))}>Tạo dịch vụ {code}</Button> },
      ]} />
    </section>}

    {data && !query.isError ? <CommercialPolicyPanels data={data} token={token} now={now} open={setAction} /> : null}
    {history ? <Drawer open size={680} title={`Lịch sử giá · ${history}`} onClose={() => setHistory(null)}>
      <Table<Price> rowKey="id" dataSource={rows.find(row => row.code === history)?.prices ?? []} columns={[
        { title: 'Phiên bản', dataIndex: 'versionNumber' },
        { title: 'Đơn giá', render: (_, price) => priceLabel(price.pricePerPole, price.currency) },
        { title: 'Hiệu lực từ', render: (_, price) => dateTime(price.effectiveFrom) },
        { title: 'Kết thúc', render: (_, price) => price.effectiveTo ? dateTime(price.effectiveTo) : 'Chưa kết thúc' },
      ]} />
    </Drawer> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}

const yesNo = (value: boolean) => value ? 'Có' : 'Không'
const onOff = (value: boolean) => value ? 'Bật' : 'Tắt'
const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

function CommercialPolicyPanels({ data, token, now, open }: { data: CommercialPolicies; token: string; now: number; open: (action: Action) => void }) {
  const { deposits: [deposit], claims: [claim], cancellations: [cancellation], bundles, activation } = data
  const actions = policyActions(token, data)
  const publishBundle = bundleAction(token, data, now)
  const latestBundle = bundles[0]
  const activeBundle = bundles.find(item => item.id === activation?.activeBusinessPolicyVersionId)
  const bundleServices = (bundle: typeof latestBundle) => bundle.serviceRevisionIds.flatMap(id => {
    const revision = data.revisions.find(item => item.id === id && isEffective(item, now))
    const service = data.services.find(item => item.id === revision?.surveyServiceId && item.status === 'ACTIVE')
    const price = data.prices.find(item => item.surveyServiceId === service?.id && isEffective(item, now))
    return service && price ? [service.code] : []
  })
  const usable = activeBundle != null && isEffective(activeBundle, now)
    && bundleServices(activeBundle).length > 0
    && isEffective(data.deposits.find(item => item.id === activeBundle.surveyDepositPolicyId), now)
    && isEffective(data.claims.find(item => item.id === activeBundle.claimPolicyId), now)
    && isEffective(data.cancellations.find(item => item.id === activeBundle.cancellationPolicyId), now)
  const bookingOpen = usable && activation?.publicIntakeEnabled && activation.captureEnabled && activation.releaseEnabled
  const policyRows = [
    { name: 'Tiền cọc cố định', version: deposit, summary: deposit && vnd.format(deposit.amount), action: actions.deposit },
    { name: 'Khiếu nại', version: claim, summary: claim && <>{claim.calendarWindowDays} ngày lịch · {claim.timeZoneId}<br />Bỏ qua ngày gửi thông báo: {yesNo(claim.excludeNoticeDate)}</>, action: actions.claim },
    { name: 'Hủy và hoàn cọc', version: cancellation, summary: cancellation && <>
      Hoàn trước thu thập: {yesNo(cancellation.refundableBeforeCapture)} · Giữ cọc sau thu thập: {yesNo(cancellation.retainDepositAfterCapture)}<br />
      Đổi lịch miễn phí khi vắng mặt: {cancellation.allowedFreeNoShowReschedules}<br />
      Hoàn khi dời lịch do vận hành: {yesNo(cancellation.operationalPostponementRefundable)} · Hoàn khi dịch vụ thất bại: {yesNo(cancellation.serviceFailureRefundable)}
    </>, action: actions.cancellation },
  ]

  return <>
    <section className="resource-panel">
      <h2>Chính sách dùng chung</h2>
      <Table rowKey="name" dataSource={policyRows} pagination={false} scroll={{ x: 650 }} columns={[
        { title: 'Chính sách', dataIndex: 'name' },
        { title: 'Phiên bản mới nhất', render: (_, row) => row.version ? <>v{row.version.versionNumber}<br />{row.summary}</> : 'Chưa thiết lập' },
        { title: 'Thao tác', render: (_, row) => <Button onClick={() => open(row.action)}>Ban hành phiên bản</Button> },
      ]} />
    </section>
    <section className="resource-panel">
      <h2>Gói chính sách và mở đăng ký</h2>
      <p>{latestBundle ? `Phiên bản mới nhất: v${latestBundle.versionNumber}` : 'Chưa ban hành gói chính sách.'}</p>
      {activeBundle ? <p>Đang áp dụng: v{activeBundle.versionNumber}{usable ? ` · ${bundleServices(activeBundle).join(', ')}` : ''}</p> : null}
      <Space wrap>
        <Tag color={bookingOpen ? 'success' : 'default'}>{bookingOpen ? 'Đăng ký công khai đang mở' : 'Đăng ký công khai đang đóng'}</Tag>
        {activation ? <>
          <Tag>Tiếp nhận: {onOff(activation.publicIntakeEnabled)}</Tag>
          <Tag>Thu thập: {onOff(activation.captureEnabled)}</Tag>
          <Tag>Phát hành: {onOff(activation.releaseEnabled)}</Tag>
        </> : null}
      </Space>
      {activation && !usable ? <Alert type="warning" showIcon title="Gói đang áp dụng thiếu cấu hình còn hiệu lực. Hãy kiểm tra các phiên bản và kích hoạt gói hợp lệ." /> : null}
      {!publishBundle ? <p className="form-hint">Cần ít nhất một dịch vụ đã có nội dung và giá cùng đủ ba chính sách dùng chung để ban hành gói.</p> : <p className="form-hint">Sau khi ban hành, kích hoạt gói mới để áp dụng. Ban hành gói mới kết thúc hiệu lực của gói trước.</p>}
      <Space wrap>
        <Button disabled={!publishBundle} onClick={() => { if (publishBundle) open(publishBundle) }}>Ban hành gói chính sách</Button>
        {latestBundle && isEffective(latestBundle, now) ?
          <Button type="primary" onClick={() => open(activationAction(token, latestBundle, activation))}>
            {latestBundle.id === activeBundle?.id ? 'Cập nhật trạng thái hoạt động' : `Kích hoạt gói v${latestBundle.versionNumber}`}
          </Button> : null}
      </Space>
    </section>
  </>
}
