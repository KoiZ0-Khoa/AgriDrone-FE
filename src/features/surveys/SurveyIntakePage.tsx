import { CopyReference, readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input, InputNumber, Pagination, Radio, Select, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BrandMark } from '../../components/BrandMark'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getFarms } from '../farms/farmsApi'
import * as api from './api'
import type { PublicIntake } from './types'
import { operationFor, priceLabel, validateIntake, validatePublicTenant, validateRequestWindow, workflowError } from './workflow'
import { intakeArea, intakeCoordinate } from './intakeNumbers'

type IntakeValues = Omit<PublicIntake, 'approximateAreaHa' | 'longitude' | 'latitude'> & { farmId?: string; approximateAreaHa: string | number; longitude: string | number; latitude: string | number }
export function SurveyIntakePage({ owner = false }: { owner?: boolean }) {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'new' | 'existing'>(params.get('farmId') ? 'existing' : 'new')
  const [farmPage, setFarmPage] = useState(1)
  const [form] = Form.useForm<IntakeValues>()
  const operation = useRef<ReturnType<typeof operationFor> | null>(null)
  const services = useQuery({ queryKey: ['public-survey-services'], queryFn: ({ signal }) => api.getPublicServices(signal) })
  const farms = useQuery({ queryKey: ['farms', session?.tenant?.id, farmPage], queryFn: () => getFarms(session!.accessToken, farmPage), enabled: owner && session?.role === 'OWNER' && mode === 'existing' })
  const serviceId = Form.useWatch('surveyServiceId', form)
  const selectedService = services.data?.find(service => service.surveyServiceId === serviceId)
  const mutation = useMutation({ mutationFn: async (values: IntakeValues) => {
    const common = { surveyServiceId: values.surveyServiceId, estimatedPoleCount: values.estimatedPoleCount ?? null, preferredStartAt: values.preferredStartAt ? new Date(values.preferredStartAt).toISOString() : null, preferredEndAt: values.preferredEndAt ? new Date(values.preferredEndAt).toISOString() : null, notes: values.notes?.trim() || null }
    validateRequestWindow(common)
    if (owner && mode === 'existing') {
      if (!values.farmId) throw new Error('Hãy chọn nông trại.')
      operation.current = operationFor(operation.current, { farmId: values.farmId, ...common })
      return api.submitExistingFarmRequest(session!.accessToken, values.farmId, common, operation.current.key)
    }
    const newFarm = { ...common, farmName: values.farmName.trim(), farmAddress: values.farmAddress.trim(), approximateAreaHa: intakeArea(values.approximateAreaHa), longitude: intakeCoordinate(values.longitude, 'longitude'), latitude: intakeCoordinate(values.latitude, 'latitude') }
    validateIntake(newFarm)
    const body = owner ? newFarm : { ...newFarm, tenantCode: values.tenantCode.trim(), tenantName: values.tenantName.trim(), applicantName: values.applicantName.trim(), applicantEmail: values.applicantEmail.trim(), applicantPhone: values.applicantPhone.trim() }
    if (!owner) validatePublicTenant(body as PublicIntake)
    operation.current = operationFor(operation.current, body)
    return owner ? api.submitNewFarmRequest(session!.accessToken, newFarm, operation.current.key) : api.submitPublicRequest(body as PublicIntake, operation.current.key)
  } })
  if (owner && session?.role !== 'OWNER') return <CommonState type="forbidden" description="Chủ đơn vị gửi yêu cầu khảo sát cho nông trại." />
  const newFarm = !owner || mode === 'new'
  const content = <>
    <section className="resource-page-heading"><div><span className="page-kicker">DỊCH VỤ AGRIDRONE</span><h1>Đăng ký khảo sát</h1><p>{owner ? 'Yêu cầu khảo sát cho nông trại mới hoặc nông trại đang quản lý.' : 'Gửi thông tin nông trại. Chúng tôi sẽ xét duyệt và gửi lời mời tham gia qua email khi yêu cầu được chấp nhận.'}</p></div></section>
    {mutation.isSuccess ? <section className="resource-panel" aria-live="polite"><Alert showIcon type="success" title="Đã tiếp nhận yêu cầu khảo sát" description="Yêu cầu đang chờ xét duyệt. Đây chưa phải xác nhận lịch bay hay thanh toán." /><div className="workflow-toolbar"><CopyReference value={mutation.data.requestNumber} label="Sao chép mã yêu cầu" /><Button onClick={() => { mutation.reset(); operation.current = null; form.resetFields() }}>Gửi yêu cầu khác</Button><Link className="workflow-detail-link" to={owner ? '/farms' : '/login'}>{owner ? 'Về nông trại' : 'Đến trang đăng nhập'} <ArrowRightOutlined /></Link></div></section> : <section className="resource-panel">
      {services.isPending ? <CommonState type="loading" title="Đang tải dịch vụ" /> : services.isError ? <CommonState type="error" description={workflowError(services.error)} retry={() => services.refetch()} /> : services.data.length === 0 ? <CommonState type="empty" title="Chưa có dịch vụ nhận yêu cầu" description="Vui lòng quay lại khi dịch vụ được mở đăng ký." /> : <>
        {owner ? <Radio.Group className="workflow-mode" value={mode} disabled={mutation.isPending} onChange={event => { setMode(event.target.value); mutation.reset() }} options={[{ value: 'new', label: 'Nông trại mới' }, { value: 'existing', label: 'Nông trại hiện có' }]} /> : null}
        <Form form={form} layout="vertical" initialValues={{ farmId: params.get('farmId') ?? undefined }} disabled={mutation.isPending} onFinish={values => { if (!mutation.isPending) mutation.mutate(values) }}>
          {!owner ? <><h2 className="workflow-form-heading">Đơn vị đăng ký</h2><div className="form-two-columns"><Form.Item name="tenantName" label="Tên đơn vị" rules={[{ required: true, whitespace: true }, { max: 150 }]}><Input maxLength={150} autoComplete="organization" /></Form.Item><Form.Item name="tenantCode" label="Mã đơn vị" extra="Mã đề xuất cho đơn vị, ví dụ ANPHU. Đơn vị chỉ được tạo khi yêu cầu được duyệt." rules={[{ required: true, whitespace: true }, { max: 50 }]}><Input maxLength={50} placeholder="ANPHU" /></Form.Item></div></> : null}
          <Form.Item name="surveyServiceId" label="Dịch vụ khảo sát" rules={[{ required: true, message: 'Chọn dịch vụ khảo sát' }]}><Select placeholder="Chọn dịch vụ" options={services.data.map(service => ({ value: service.surveyServiceId, label: `${service.name}${service.isExperimental ? ' · Thử nghiệm' : ''}` }))} /></Form.Item>
          {selectedService ? <div className="workflow-service-summary"><strong>{priceLabel(selectedService.indicativePrice.amountPerPole, selectedService.indicativePrice.currency)}</strong>{selectedService.isExperimental ? <Tag>Thử nghiệm</Tag> : null}<p>{selectedService.description}</p><small>Giá tham khảo theo trụ. Tổng giá được xác nhận sau khi xác minh số trụ chính thức.</small></div> : null}
          {!owner ? <><h2 className="workflow-form-heading">Thông tin liên hệ</h2><div className="form-two-columns"><Form.Item name="applicantName" label="Họ và tên" rules={[{ required: true, whitespace: true }, { max: 150 }]}><Input autoComplete="name" maxLength={150} /></Form.Item><Form.Item name="applicantPhone" label="Số điện thoại" rules={[{ required: true }, { validator: (_, value: string) => !value || (/^\+?[\d ().-]+$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15) ? Promise.resolve() : Promise.reject(new Error('Nhập số điện thoại từ 7 đến 15 chữ số.')) }]}><Input type="tel" autoComplete="tel" maxLength={30} /></Form.Item></div><Form.Item name="applicantEmail" label="Email nhận thông báo" rules={[{ required: true }, { type: 'email' }, { max: 320 }]}><Input type="email" autoComplete="email" /></Form.Item></> : null}
          <h2 className="workflow-form-heading">Thông tin nông trại</h2>
          {newFarm ? <>
            <Form.Item name="farmName" label="Tên nông trại" rules={[{ required: true, whitespace: true }, { max: 200 }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="farmAddress" label="Địa chỉ nông trại" rules={[{ required: true, whitespace: true }, { max: 2000 }]}><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
            <div className="form-two-columns"><Form.Item name="approximateAreaHa" label="Diện tích ước tính (ha)" extra="Tối đa 4 chữ số thập phân, ví dụ 2,5123." rules={[{ required: true, whitespace: true, message: 'Nhập diện tích nông trại.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeArea(value) } }]}><Input inputMode="decimal" placeholder="Ví dụ: 2,5123" /></Form.Item><Form.Item name="estimatedPoleCount" label="Số trụ ước tính (không bắt buộc)"><InputNumber min={1} max={2147483647} precision={0} /></Form.Item></div>
            <div className="form-two-columns"><Form.Item name="longitude" label="Kinh độ" rules={[{ required: true, whitespace: true, message: 'Nhập kinh độ.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeCoordinate(value, 'longitude') } }]}><Input inputMode="decimal" placeholder="Ví dụ: 108,1234567" /></Form.Item><Form.Item name="latitude" label="Vĩ độ" rules={[{ required: true, whitespace: true, message: 'Nhập vĩ độ.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeCoordinate(value, 'latitude') } }]}><Input inputMode="decimal" placeholder="Ví dụ: 11,0123456" /></Form.Item></div><p className="form-hint">Kinh độ từ -180 đến 180; vĩ độ từ -90 đến 90. Dùng dấu chấm hoặc dấu phẩy cho phần thập phân.</p>
          </> : <>
            <Form.Item name="farmId" label="Nông trại" rules={[{ required: true, message: 'Chọn nông trại' }]}><Select showSearch optionFilterProp="label" loading={farms.isPending} options={farms.data?.items.map(farm => ({ value: farm.id, label: readableCode(farm.code) ? `${farm.name} · ${readableCode(farm.code)}` : farm.name }))} /></Form.Item>
            <Pagination size="small" current={farmPage} total={farms.data?.totalCount ?? 0} pageSize={20} showSizeChanger={false} disabled={mutation.isPending} onChange={page => { form.setFieldValue('farmId', undefined); setFarmPage(page) }} />
            {farms.isError ? <Alert showIcon type="error" title={workflowError(farms.error)} action={<Button onClick={() => { void farms.refetch() }}>Thử lại</Button>} /> : null}
            <Form.Item name="estimatedPoleCount" label="Số trụ ước tính (không bắt buộc)"><InputNumber min={1} max={2147483647} precision={0} /></Form.Item>
          </>}
          <h2 className="workflow-form-heading">Thời gian mong muốn</h2>
          <p className="form-hint">Có thể để trống cả hai thời điểm. Lịch khảo sát chính thức sẽ được xác nhận sau.</p>
          <div className="form-two-columns"><Form.Item name="preferredStartAt" label="Từ lúc"><Input type="datetime-local" /></Form.Item><Form.Item name="preferredEndAt" label="Đến lúc"><Input type="datetime-local" /></Form.Item></div>
          <Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={3} maxLength={4000} showCount /></Form.Item>
          {mutation.isError ? <Alert className="workflow-notice" showIcon type="error" title={workflowError(mutation.error)} /> : null}
          <Button type="primary" htmlType="submit" loading={mutation.isPending} disabled={owner && mode === 'existing' && !farms.isSuccess}>Gửi yêu cầu khảo sát</Button>
        </Form>
      </>}
    </section>}
  </>
  if (owner) return content
  return <main className="survey-public-page"><header><Link to="/" aria-label="AgriDrone - Trang chủ"><BrandMark /></Link><Link to="/login">Đăng nhập</Link></header><div className="survey-public-content"><Link className="back-link" to="/"><ArrowLeftOutlined /> Trang chủ</Link>{content}</div></main>
}
