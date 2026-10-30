import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Form, Input, InputNumber, Modal, Select } from 'antd'
import { FormSubmit } from '../../components/FormSubmit'
import * as api from './api'
import type { Drone, DroneCapability, DroneInput } from './types'
import { capabilityLabels, droneError } from './workflow'

const capabilityOptions = (Object.keys(capabilityLabels) as DroneCapability[]).map(value => ({ value, label: capabilityLabels[value] }))

type FormValues = {
  code: string; name: string; model: string; manufacturer: string; capabilities: DroneCapability[]
  serialNumber: string; registrationNumber: string; registrationDate: string; registrationExpiryDate: string
  weightKg: number | null; notes: string
}

function toInput(values: FormValues): DroneInput {
  return {
    code: values.code.trim(), name: values.name.trim(),
    model: values.model.trim() || null, manufacturer: values.manufacturer.trim() || null,
    capabilities: values.capabilities,
    serialNumber: values.serialNumber.trim() || null, registrationNumber: values.registrationNumber.trim() || null,
    registrationDate: values.registrationDate || null, registrationExpiryDate: values.registrationExpiryDate || null,
    weightKg: values.weightKg ?? null, notes: values.notes.trim() || null,
  }
}

export function DroneFormModal({ token, drone, close }: { token: string; drone: Drone | null; close: () => void }) {
  const [form] = Form.useForm<FormValues>()
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const input = toInput(values)
      if (input.capabilities.length === 0) throw new Error('Chọn tối thiểu một năng lực (capability) cho drone.')
      if (input.registrationDate && input.registrationExpiryDate && input.registrationExpiryDate < input.registrationDate) throw new Error('Hạn đăng ký không được sớm hơn ngày đăng ký.')
      return drone ? api.updateDrone(token, drone.id, { ...input, expectedVersion: drone.version }) : api.registerDrone(token, input)
    },
    onSuccess: async () => { close(); await client.invalidateQueries({ queryKey: ['system-drones'] }) },
  })
  const initialValues: FormValues = drone ? {
    code: drone.code, name: drone.name, model: drone.model ?? '', manufacturer: drone.manufacturer ?? '',
    capabilities: drone.specifications.capabilities, serialNumber: drone.serialNumber ?? '', registrationNumber: drone.registrationNumber ?? '',
    registrationDate: drone.registrationDate ?? '', registrationExpiryDate: drone.registrationExpiryDate ?? '', weightKg: drone.weightKg, notes: drone.notes ?? '',
  } : { code: '', name: '', model: '', manufacturer: '', capabilities: [], serialNumber: '', registrationNumber: '', registrationDate: '', registrationExpiryDate: '', weightKg: null, notes: '' }

  return <Modal open title={drone ? `Chỉnh sửa Drone · ${drone.name}` : 'Tạo Drone'} okText={drone ? 'Lưu thay đổi' : 'Tạo Drone'} cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }}>
    <Form<FormValues> form={form} layout="vertical" disabled={mutation.isPending} initialValues={initialValues} onFinish={values => mutation.mutate(values)}>
      <FormSubmit disabled={mutation.isPending} />
      <Form.Item name="code" label="Mã drone" rules={[{ required: true, message: 'Nhập mã drone.' }, { max: 30, message: 'Mã drone tối đa 30 ký tự.' }]}>
        <Input disabled={Boolean(drone)} maxLength={30} placeholder="DRONE-001" />
      </Form.Item>
      <Form.Item name="name" label="Tên drone" rules={[{ required: true, message: 'Nhập tên drone.' }, { max: 100, message: 'Tên drone tối đa 100 ký tự.' }]}>
        <Input maxLength={100} />
      </Form.Item>
      <Form.Item name="capabilities" label="Năng lực (capabilities)" rules={[{ required: true, message: 'Chọn tối thiểu một năng lực.' }]}>
        <Select mode="multiple" options={capabilityOptions} placeholder="Chọn năng lực phù hợp với mục đích bay" />
      </Form.Item>
      <Form.Item name="model" label="Model (không bắt buộc)" rules={[{ max: 100, message: 'Model tối đa 100 ký tự.' }]}><Input maxLength={100} /></Form.Item>
      <Form.Item name="manufacturer" label="Hãng sản xuất (không bắt buộc)" rules={[{ max: 100, message: 'Hãng sản xuất tối đa 100 ký tự.' }]}><Input maxLength={100} /></Form.Item>
      <Form.Item name="serialNumber" label="Số serial (không bắt buộc)" rules={[{ max: 100, message: 'Số serial tối đa 100 ký tự.' }]}><Input maxLength={100} /></Form.Item>
      <Form.Item name="registrationNumber" label="Số đăng ký (không bắt buộc)" rules={[{ max: 100, message: 'Số đăng ký tối đa 100 ký tự.' }]}><Input maxLength={100} /></Form.Item>
      <Form.Item name="registrationDate" label="Ngày đăng ký (không bắt buộc)"><Input type="date" /></Form.Item>
      <Form.Item name="registrationExpiryDate" label="Hạn đăng ký (không bắt buộc)"><Input type="date" /></Form.Item>
      <Form.Item name="weightKg" label="Khối lượng (kg, không bắt buộc)"><InputNumber min={0.01} step={0.1} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="notes" label="Ghi chú (không bắt buộc)"><Input.TextArea rows={3} /></Form.Item>
    </Form>
    {mutation.error ? <Alert type="error" showIcon message={droneError(mutation.error)} /> : null}
  </Modal>
}
