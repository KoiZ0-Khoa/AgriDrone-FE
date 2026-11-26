import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const client = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const v3WorkflowUrl = urlFor(compile('../src/features/surveys/v3Workflow.ts'))
const surveyWorkflow = urlFor(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(client)).replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl)))
const api = await import(urlFor(compile('../src/features/reports/revenueApi.ts').replace("'../../api/client'", JSON.stringify(client))))
const workflow = await import(urlFor(compile('../src/features/reports/revenueWorkflow.ts')
  .replace("'../../api/client'", JSON.stringify(client)).replace("'../surveys/workflow'", JSON.stringify(surveyWorkflow))))
const { ApiError } = await import(client)
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('Dashboard calls the v3 revenue endpoint with Bearer token, omits service for "all" and forwards cancellation', async () => {
  const controller = new AbortController()
  const seen = []
  globalThis.fetch = async (url, options) => {
    seen.push(new URL(url))
    assert.equal(options.headers.Authorization, 'Bearer admin')
    assert.equal(options.signal, controller.signal)
    return Response.json({ year: 2026, month: 11, lines: [], netCash: -5 })
  }
  const report = await api.getRevenueReport('admin', { year: 2026, month: 11, service: null }, controller.signal)
  assert.equal(report.netCash, -5)
  assert.equal(seen[0].pathname, '/api/v3/system-admin/reports/revenue')
  assert.equal(seen[0].searchParams.get('year'), '2026')
  assert.equal(seen[0].searchParams.get('month'), '11')
  assert.equal(seen[0].searchParams.has('service'), false)
  await api.getRevenueReport('admin', { year: 2026, month: 3, service: 'COMBO' }, controller.signal)
  assert.equal(seen[1].searchParams.get('service'), 'COMBO')
})

test('Excel export returns the blob with server file name and surfaces text/plain 400 instead of saving it', async () => {
  const snapshotId = 'b338a4e9-e5c5-484f-90a2-550a2d0f4a18'
  globalThis.fetch = async url => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/v3/system-admin/reports/revenue/export')
    assert.equal(parsed.searchParams.get('service'), 'MAP')
    assert.equal(parsed.searchParams.get('snapshotId'), snapshotId)
    return new Response(new Uint8Array([80, 75]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename=revenue-2026-11.xlsx' } })
  }
  const file = await api.exportRevenueReport('admin', { year: 2026, month: 11, service: 'MAP', snapshotId })
  assert.equal(file.fileName, 'revenue-2026-11.xlsx')
  assert.equal(file.blob.size, 2)

  globalThis.fetch = async () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } })
  assert.equal((await api.exportRevenueReport('admin', { year: 2026, month: 2, service: null })).fileName, 'revenue-2026-02.xlsx')

  globalThis.fetch = async () => new Response('Invalid year/month/service filter.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  await assert.rejects(api.exportRevenueReport('admin', { year: 2026, month: 11, service: null }), error => error instanceof ApiError && error.status === 400 && error.message === 'Invalid year/month/service filter.')
  globalThis.fetch = async () => new Response('<html>' + 'x'.repeat(400) + '</html>', { status: 502, headers: { 'Content-Type': 'text/plain' } })
  await assert.rejects(api.exportRevenueReport('admin', { year: 2026, month: 11, service: null }), error => error.message === 'Không thể xử lý yêu cầu.')
  globalThis.fetch = async () => new Response(null, { status: 403 })
  await assert.rejects(api.exportRevenueReport('admin', { year: 2026, month: 11, service: null }), error => error.status === 403)
})

test('Default period follows Asia/Ho_Chi_Minh and URL filters reject future, invalid and ALL values', () => {
  const lastUtcHourOfOctober = Date.parse('2026-10-31T17:30:00Z') // 00:30 1/11 giờ Việt Nam
  assert.deepEqual(workflow.currentVnPeriod(lastUtcHourOfOctober), { year: 2026, month: 11 })
  assert.deepEqual(workflow.currentVnPeriod(Date.parse('2026-10-31T16:59:59Z')), { year: 2026, month: 10 })
  const now = Date.parse('2026-11-24T03:00:00Z')
  assert.deepEqual(workflow.parseRevenueFilters(new URLSearchParams('year=2026&month=10&service= map '), now), { year: 2026, month: 10, service: 'MAP' })
  assert.deepEqual(workflow.parseRevenueFilters(new URLSearchParams('year=2026&month=12'), now), { year: 2026, month: 11, service: null })
  assert.deepEqual(workflow.parseRevenueFilters(new URLSearchParams('year=1999&month=5&service=ALL'), now), { year: 2026, month: 11, service: null })
  assert.deepEqual(workflow.parseRevenueFilters(new URLSearchParams('year=2026&month=13'), now), { year: 2026, month: 11, service: null })
  assert.equal(workflow.revenueSearchParams({ year: 2026, month: 4, service: null }).toString(), 'year=2026&month=4')
})

test('Money keeps negative values in VND and incomplete reasons explain why the period is provisional', () => {
  assert.match(workflow.revenueMoney(-1500000), /^-1\.500\.000\s?₫$/)
  assert.equal(workflow.vnDateTime('2026-10-31T17:00:00+00:00'), '00:00 01/11/2026')
  const base = { startUtc: '2026-09-30T17:00:00+00:00', endUtc: '2026-10-31T17:00:00+00:00', historyAvailableFrom: '2026-11-21T05:00:00+00:00', reconciliationOrders: 0 }
  const before = workflow.incompleteReasons(base, Date.parse('2026-11-24T00:00:00Z'))
  assert.equal(before.length, 1)
  assert.match(before[0], /kết thúc trước thời điểm hệ thống bắt đầu lưu lịch sử/)
  assert.equal(workflow.periodBeforeHistory(base), true)
  const running = workflow.incompleteReasons({ startUtc: '2026-10-31T17:00:00+00:00', endUtc: '2026-11-30T17:00:00+00:00', historyAvailableFrom: base.historyAvailableFrom, reconciliationOrders: 3 }, Date.parse('2026-11-24T00:00:00Z'))
  assert.equal(running.length, 3)
  assert.match(running[1], /Tháng chưa kết thúc/)
  assert.match(running[2], /3 đơn cần đối soát/)
})

test('Revenue errors map HTTP status to actionable Vietnamese messages', () => {
  assert.match(workflow.revenueError(new ApiError(400, 'Invalid year/month/service filter.')), /Bộ lọc báo cáo không hợp lệ/)
  assert.match(workflow.revenueError(new ApiError(401, 'x')), /Phiên đăng nhập đã hết hạn/)
  assert.match(workflow.revenueError(new ApiError(403, 'x'), 'export'), /thiếu thông tin xác thực/)
  assert.match(workflow.revenueError(new ApiError(403, 'x')), /không có quyền xem/)
  assert.match(workflow.revenueError(new ApiError(409, 'x'), 'export'), /Nhấn Tải lại trước khi xuất Excel/)
  assert.match(workflow.revenueError(new ApiError(503, 'Service Unavailable')), /Chưa kết nối được máy chủ/)
  assert.equal(workflow.isUnauthorized(new ApiError(401, 'x')), true)
})
