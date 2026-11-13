import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, Space, Table } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import * as api from './paymentPolicyApi'
import { money } from './paymentWorkflow'
import { dateTime, workflowError } from './workflow'

export function PaymentPoliciesPanel({ token }: { token: string }) {
  const [action, setAction] = useState<Action | null>(null)
  const [history, setHistory] = useState<'deposit' | 'combo' | null>(null)
  const deposit = useQuery({ queryKey: ['survey-payment-policy', 'deposit'], queryFn: ({ signal }) => api.getDepositPolicy(token, signal), retry: false })
  const combo = useQuery({ queryKey: ['survey-payment-policy', 'combo'], queryFn: ({ signal }) => api.getComboDiscountPolicy(token, signal), retry: false })
  function editDeposit() {
    const policy = deposit.data
    if (!policy || !api.validPolicyVersion(policy.versionNumber)) return
    setAction({ title: 'Cập nhật tiền cọc khảo sát', description: 'Áp dụng cho đơn tạo sau khi lưu. Đặt 0đ để không thu cọc; các đơn đã có giữ chính sách cũ.', fields: [{ key: 'amount', label: 'Tiền cọc (VND)', kind: 'number', value: String(policy.amountVnd) }],
      run: values => api.saveDepositPolicy(token, text(values, 'amount'), policy.versionNumber) })
  }
  function editCombo() {
    const policy = combo.data
    if (!policy || !api.validPolicyVersion(policy.versionNumber)) return
    setAction({ title: 'Cập nhật giảm giá Combo', description: 'Áp dụng cho đơn mới đủ điều kiện Combo. Giảm giá dưới 100%, tối đa 2 chữ số thập phân; giá đơn cũ được giữ nguyên.', fields: [{ key: 'percentage', label: 'Giảm giá (%)', kind: 'number', value: String(policy.discountPercentage) }],
      run: values => api.saveComboDiscountPolicy(token, text(values, 'percentage'), policy.versionNumber) })
  }
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Chính sách thanh toán</strong><span>Tiền cọc và ưu đãi cho đơn khảo sát mới.</span></div><Button icon={<ReloadOutlined />} loading={deposit.isFetching || combo.isFetching} onClick={() => { void deposit.refetch(); void combo.refetch() }}>Tải lại chính sách</Button></div>
    <div className="payment-policy-grid">
      <article className="payment-policy-card">
        <h2>Cọc khảo sát</h2>
        {deposit.isPending ? <p>Đang tải tiền cọc…</p> : deposit.isError ? <CommonState type="error" description={workflowError(deposit.error)} retry={() => deposit.refetch()} /> : <><strong className="payment-policy-value">{money(deposit.data.amountVnd)}</strong><p className="form-hint">{deposit.data.amountVnd === 0 ? 'Không thu tiền cọc cho đơn mới.' : 'Thu cọc trước bước thực hiện khảo sát.'}</p><p className="form-hint">{deposit.data.versionNumber === 0 ? 'Mức mặc định của hệ thống' : 'Áp dụng từ ' + dateTime(deposit.data.effectiveFrom)}</p></>}
        <Space wrap><Button disabled={deposit.isFetching || deposit.isError || !deposit.data || !api.validPolicyVersion(deposit.data.versionNumber)} onClick={editDeposit}>Chỉnh tiền cọc</Button><Button onClick={() => setHistory('deposit')}>Lịch sử tiền cọc</Button></Space>
      </article>
      <article className="payment-policy-card">
        <h2>Giảm giá Combo</h2>
        {combo.isPending ? <p>Đang tải ưu đãi…</p> : combo.isError ? <CommonState type="error" description={workflowError(combo.error)} retry={() => combo.refetch()} /> : <><strong className="payment-policy-value">{combo.data.discountPercentage.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%</strong><p className="form-hint">Mức giảm trên đơn giá trụ của đơn đủ điều kiện Combo.</p><p className="form-hint">{combo.data.versionNumber === 0 ? 'Mức mặc định của hệ thống' : 'Áp dụng từ ' + dateTime(combo.data.effectiveFrom)}</p></>}
        <Space wrap><Button disabled={combo.isFetching || combo.isError || !combo.data || !api.validPolicyVersion(combo.data.versionNumber)} onClick={editCombo}>Chỉnh giảm giá</Button><Button onClick={() => setHistory('combo')}>Lịch sử giảm giá</Button></Space>
      </article>
    </div>
    {history ? <PolicyHistory token={token} kind={history} close={() => setHistory(null)} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </section>
}

function PolicyHistory({ token, kind, close }: { token: string; kind: 'deposit' | 'combo'; close: () => void }) {
  const query = useQuery<api.DepositPolicy[] | api.ComboDiscountPolicy[]>({ queryKey: ['survey-payment-policy-history', kind], queryFn: ({ signal }) => kind === 'deposit' ? api.getDepositPolicyHistory(token, signal) : api.getComboDiscountHistory(token, signal), retry: false })
  return <Drawer open size={640} title={kind === 'deposit' ? 'Lịch sử tiền cọc' : 'Lịch sử giảm giá Combo'} onClose={close}>
    {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <Table<api.DepositPolicy | api.ComboDiscountPolicy> rowKey="policyId" loading={query.isPending} dataSource={query.data ?? []} pagination={false} scroll={{ x: 420 }} locale={{ emptyText: 'Chưa có lần cập nhật. Đang dùng mức mặc định.' }} columns={[
      { title: kind === 'deposit' ? 'Tiền cọc' : 'Giảm giá', render: (_, policy) => 'amountVnd' in policy ? money(policy.amountVnd) : policy.discountPercentage.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%' },
      { title: 'Áp dụng từ', render: (_, policy) => dateTime(policy.effectiveFrom) },
    ]} />}
  </Drawer>
}
