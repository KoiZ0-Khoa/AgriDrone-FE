import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import * as api from './api'
import type { PriceHistory, SurveyService } from './types'
import { dateTime, priceLabel, serviceLabels, workflowError } from './workflow'

export function ServicesPage() {
  const token = useAuth().session!.accessToken
  const [action, setAction] = useState<Action | null>(null)
  const [history, setHistory] = useState<SurveyService | null>(null)
  const query = useQuery({ queryKey: ['survey-services'], queryFn: ({ signal }) => api.getServices(token, signal) })
  function statusAction(service: SurveyService, state: 'activate' | 'experimental' | 'retire') {
    const title = { activate: 'Kích hoạt dịch vụ', experimental: 'Chuyển sang thử nghiệm', retire: 'Ngừng cung cấp dịch vụ' }[state]
    setAction({ title, description: state === 'retire' ? 'Dịch vụ ngừng cung cấp không thể kích hoạt lại. Lịch sử được giữ nguyên.' : `Thay đổi trạng thái của ${service.name}.`, danger: state === 'retire', fields: [{ key: 'reason', label: 'Lý do', kind: 'multiline', max: 2000 }], run: values => api.changeServiceState(token, service.surveyServiceId, state, { expectedVersion: service.version, reason: text(values, 'reason') }) })
  }
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">DỊCH VỤ KHẢO SÁT</span><h1>Dịch vụ & đơn giá</h1><p>Giá theo trụ bằng VND. Hiện chỉ cung cấp dịch vụ sức khỏe cây trồng (Plant Health).</p></div><Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel">
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <Table<SurveyService> rowKey="surveyServiceId" loading={query.isPending} dataSource={query.data ?? []} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Chưa có dịch vụ được cấu hình.' }} columns={[
        { title: 'Dịch vụ', render: (_, service) => <><strong>{service.name}</strong><p className="form-hint">{service.code}</p><span>{service.description}</span></> },
        { title: 'Trạng thái', render: (_, service) => <Tag color={service.status === 'ACTIVE' ? 'success' : 'default'}>{serviceLabels[service.status]}</Tag> },
        { title: 'Đơn giá hiện hành', render: (_, service) => service.currentPrice ? <><strong>{priceLabel(service.currentPrice.amountPerPole, service.currentPrice.currency)}</strong><div className="form-hint">Từ {dateTime(service.currentPrice.effectiveFrom)}</div></> : 'Chưa thiết lập' },
        { title: 'Thao tác', width: 340, render: (_, service) => <Space wrap>
          <Button onClick={() => setHistory(service)}>Lịch sử giá</Button>
          {service.status !== 'RETIRED' ? <>
            <Button onClick={() => setAction({ title: `Chỉnh sửa · ${service.name}`, fields: [{ key: 'name', label: 'Tên dịch vụ', value: service.name, max: 150 }, { key: 'description', label: 'Mô tả', kind: 'multiline', value: service.description, max: 4000 }], run: values => api.updateService(token, service.surveyServiceId, { name: text(values, 'name'), description: text(values, 'description'), expectedVersion: service.version }) })}>Chỉnh sửa</Button>
            {service.serviceType === 'PLANT_HEALTH' ? <>
              <Button onClick={() => setAction({ title: `Đơn giá mới · ${service.name}`, description: 'Đơn giá có hiệu lực ngay khi lưu. Giá cũ được giữ trong lịch sử; các đơn hàng đã chốt giá không tự thay đổi.', fields: [{ key: 'amount', label: 'Đơn giá (VND/trụ)', kind: 'number' }], run: values => {
                const amount = Number(text(values, 'amount'))
                if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error('Đơn giá phải lớn hơn 0 và có tối đa hai chữ số thập phân.')
                return api.createServicePrice(token, service.surveyServiceId, { amountPerPole: amount, currency: 'VND', expectedServiceVersion: service.version })
              } })}>Đặt đơn giá</Button>
              {service.status === 'EXPERIMENTAL' ? <Button disabled={!service.currentPrice} onClick={() => statusAction(service, 'activate')}>Kích hoạt</Button> : <Button onClick={() => statusAction(service, 'experimental')}>Chuyển thử nghiệm</Button>}
            </> : <span className="form-hint">Chưa cung cấp trong phiên bản hiện tại</span>}
            <Button danger onClick={() => statusAction(service, 'retire')}>Ngừng cung cấp</Button>
          </> : null}
        </Space> },
      ]} />}
    </section>
    {history ? <PriceHistoryDrawer token={token} service={history} close={() => setHistory(null)} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
function PriceHistoryDrawer({ token, service, close }: { token: string; service: SurveyService; close: () => void }) {
  const query = useQuery({ queryKey: ['survey-price-history', service.surveyServiceId], queryFn: ({ signal }) => api.getPriceHistory(token, service.surveyServiceId, signal) })
  return <Drawer open size={680} title={`Lịch sử giá · ${service.name}`} onClose={close}>
    {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <Table<PriceHistory> rowKey="priceVersionId" loading={query.isPending} dataSource={query.data ?? []} pagination={false} columns={[
      { title: 'Đơn giá', render: (_, price) => price.isLegacyPerHectarePrice ? `${price.legacyPricePerHa?.toLocaleString('vi-VN')} ${price.currency}/ha (giá cũ)` : price.pricePerPole == null ? 'Chưa có' : priceLabel(price.pricePerPole, price.currency) },
      { title: 'Hiệu lực từ', render: (_, price) => dateTime(price.effectiveFrom) },
      { title: 'Kết thúc', render: (_, price) => price.effectiveTo ? dateTime(price.effectiveTo) : 'Chưa kết thúc' },
    ]} />}
  </Drawer>
}
