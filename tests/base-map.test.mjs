import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { candidate, draft, draftId, farmId, plantId, validation } from './base-map-fixtures.mjs'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/surveys/baseMapApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const flow = await import(dataUrl(compile('../src/features/surveys/baseMapWorkflow.ts')))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const root = `http://test.local/api/system-manager/farms/${farmId}/base-map-drafts/${draftId}`

test('draft read uses assigned Manager contract, cancellation and refuses mismatched identities', async () => {
  const abort = new AbortController()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, root); assert.equal(options.headers.Authorization, 'Bearer manager'); assert.equal(options.signal, abort.signal); assert.equal(options.cache, 'no-store')
    return Response.json(draft)
  }
  assert.equal((await api.getBaseMapDraft('manager', farmId, draftId, abort.signal)).candidates[0].treeId, 'tree_r1_c2')
  for (const changes of [{ farmId: plantId }, { draftId: plantId }]) {
    globalThis.fetch = async () => Response.json({ ...draft, ...changes })
    await assert.rejects(api.getBaseMapDraft('manager', farmId, draftId), /không khớp/)
  }
})

test('latest draft can be discovered by Farm or survey order and refuses a result from another order', async () => {
  const abort = new AbortController()
  for (const orderId of [undefined, draft.sourceSurveyOrderId]) {
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url)
      assert.equal(parsed.pathname, `/api/system-manager/farms/${farmId}/base-map-drafts`)
      assert.equal(parsed.searchParams.get('surveyOrderId'), orderId ?? null)
      assert.equal(options.headers.Authorization, 'Bearer manager')
      assert.equal(options.signal, abort.signal)
      return Response.json(draft)
    }
    assert.equal((await api.getCurrentBaseMapDraft('manager', farmId, orderId, abort.signal)).draftId, draftId)
  }
  for (const changes of [{ farmId: plantId }, { sourceSurveyOrderId: plantId }]) {
    globalThis.fetch = async () => Response.json({ ...draft, ...changes })
    await assert.rejects(api.getCurrentBaseMapDraft('manager', farmId, draft.sourceSurveyOrderId), /không khớp/)
  }
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ errorCode: 'FarmBaseMapDraft.NotFound' }, { status: 404 }) }
  await assert.rejects(api.getCurrentBaseMapDraft('manager', farmId), error => error.status === 404 && error.code === 'FarmBaseMapDraft.NotFound')
  assert.equal(calls, 1)
})

test('all review decisions preserve position order and require the correct existing plant identity', () => {
  const body = flow.candidateReviewBody(candidate, { decision: 'Relocate', longitude: 108.3, latitude: 11.2, plantId, row: 2, column: 3, reason: ' moved ' })
  assert.deepEqual(body, { decision: 'Relocate', correctedLongitude: 108.3, correctedLatitude: 11.2, correctedRowIndex: 2, correctedColumnIndex: 3, correctedMatchedPlantId: plantId, reason: 'moved' })
  for (const decision of ['MatchExisting', 'Replace']) assert.equal(flow.candidateReviewBody(candidate, { decision, plantId }).correctedMatchedPlantId, plantId)
  for (const decision of ['CreateNew', 'Reject']) assert.equal(flow.candidateReviewBody(candidate, { decision, plantId }).correctedMatchedPlantId, null)
  for (const values of [{ decision: 'Pending' }, { decision: 'Accept' }, { decision: 'Relocate', plantId }, { decision: 'MatchExisting' }, { decision: 'Replace', plantId: 'tree_r1_c2' }, { decision: 'CreateNew', longitude: 108 }, { decision: 'CreateNew', longitude: 181, latitude: 11 }, { decision: 'CreateNew', longitude: 108, latitude: NaN }, { decision: 'CreateNew', row: 0 }, { decision: 'CreateNew', column: 1.5 }]) assert.throws(() => flow.candidateReviewBody(candidate, values))
})

test('a map-selected position keeps WGS84 coordinate order and the original create decision', () => {
  const [latitude, longitude] = flow.reviewMapPosition(10.4616421, 106.4940462)
  const body = flow.candidateReviewBody(candidate, { decision: 'CreateNew', latitude, longitude })
  assert.equal(body.correctedLatitude, 10.4616421)
  assert.equal(body.correctedLongitude, 106.4940462)
  assert.equal(body.correctedMatchedPlantId, null)
  assert.equal(flow.reviewMapPosition(106.4940462, 10.4616421), null)
  assert.equal(flow.reviewMapPosition(null, 106.4940462), null)
})

test('batch reviews use the actual selected points and each point own corrected plant/position, never a shared plant ID', () => {
  const other = { ...candidate, candidateId: '40000000-0000-0000-0000-000000000002', proposedMatchedPlantId: draftId, correctedLongitude: 108.4, correctedLatitude: 11.3 }
  const snapshot = { ...draft, candidates: [candidate, other] }
  const body = flow.batchReviewBody(snapshot, [candidate.candidateId, other.candidateId], 'MatchExisting', ' reviewed ')
  assert.equal(body.batchReason, 'reviewed')
  assert.deepEqual(body.reviews.map(item => item.correctedMatchedPlantId), [plantId, draftId])
  assert.equal(body.reviews[1].correctedLongitude, 108.4)
  for (const ids of [[], ['unknown'], [candidate.candidateId, candidate.candidateId], Array.from({ length: 501 }, (_, index) => `id-${index}`)]) assert.throws(() => flow.batchReviewBody(draft, ids, 'CreateNew', ''))
  assert.throws(() => flow.batchReviewBody(draft, [candidate.candidateId], 'Relocate', ''))
  assert.throws(() => flow.batchReviewBody({ ...draft, status: 'Published' }, [candidate.candidateId], 'CreateNew', ''))
})

test('single and batch review use exact new endpoints/bodies; conflict is not automatically retried', async () => {
  const body = flow.candidateReviewBody(candidate, { decision: 'CreateNew' })
  const batchBody = flow.batchReviewBody(draft, [candidate.candidateId], 'Reject', 'duplicate')
  for (const [run, path, payload] of [[() => api.reviewMappingCandidate('manager', farmId, draftId, candidate.candidateId, body), `${root}/candidates/${candidate.candidateId}/review`, body], [() => api.reviewMappingBatch('manager', farmId, draftId, batchBody), `${root}/candidates/review-batch`, batchBody]]) {
    let calls = 0
    globalThis.fetch = async (url, options) => { calls++; assert.equal(url, path); assert.equal(options.method, 'POST'); assert.equal(options.headers.Authorization, 'Bearer manager'); assert.deepEqual(JSON.parse(options.body), payload); return Response.json({ errorCode: 'FarmBaseMapDraft.InvalidStatus', traceId: 'trace' }, { status: 409 }) }
    await assert.rejects(run(), error => error.status === 409 && error.traceId === 'trace')
    assert.equal(calls, 1)
  }
})

test('validation and publication use POST without invented expectedVersion or client pole counts', async () => {
  for (const [run, suffix] of [[() => api.validateBaseMapDraft('manager', farmId, draftId), '/validate'], [() => api.approveBaseMapDraft('manager', farmId, draftId), '/approve-internal']]) {
    globalThis.fetch = async (url, options) => { assert.equal(url, root + suffix); assert.equal(options.method, 'POST'); assert.equal(options.body, undefined); assert.equal(options.headers.Authorization, 'Bearer manager'); return Response.json(validation) }
    await run()
  }
})

test('review confirmation requires the stored decision, coordinates and grid values on the same candidate', () => {
  const review = { candidateId: candidate.candidateId, ...flow.candidateReviewBody(candidate, {
    decision: 'CreateNew', longitude: 108.121, latitude: 11.011, row: 5, column: 6, reason: 'Đối chiếu ảnh',
  }) }
  const stored = { ...candidate, reviewDecision: 'CreateNew', correctedLongitude: 108.121, correctedLatitude: 11.011,
    correctedRowIndex: 5, correctedColumnIndex: 6, reviewReason: 'Đối chiếu ảnh' }
  assert.equal(flow.draftShowsReviews({ ...draft, candidates: [stored] }, [review]), true)
  assert.equal(flow.draftShowsReviews(draft, [review]), false)
  for (const patch of [{ candidateId: plantId }, { correctedLongitude: null }, { correctedColumnIndex: 2 }, { reviewDecision: 'Reject' }, { reviewReason: null }]) {
    assert.equal(flow.draftShowsReviews({ ...draft, candidates: [{ ...stored, ...patch }] }, [review]), false)
  }
})

test('publication requires a current server validation, a reviewable draft, no pending/errors and a positive pole count', () => {
  const ready = { ...draft, pendingCount: 0, acceptedCount: 1, batchStatus: 'ReviewInProgress' }
  const stamp = flow.draftFingerprint(ready)
  assert.equal(flow.canPublishDraft(ready, validation, stamp), true)
  assert.equal(flow.canPublishDraft(ready, { ...validation, issues: [
    { severity: 'Warning', code: 'RowBearingToleranceExceeded' },
    { severity: 'Warning', code: 'PlantSpacingToleranceExceeded' },
    { severity: 'Warning', code: 'RowSpacingToleranceExceeded' },
  ] }, stamp), true)
  for (const changes of [{ status: 'Published' }, { status: 'Superseded' }, { batchStatus: 'Approved' }, { pendingCount: 1 }, { batchId: null }]) assert.equal(flow.canPublishDraft({ ...ready, ...changes }, validation, stamp), false)
  for (const value of [null, { ...validation, isValid: false }, { ...validation, pendingCount: 1 }, { ...validation, confirmedPublishablePoleCount: 0 }, { ...validation, totalCandidates: 2 }, { ...validation, issues: [{ severity: 'Error' }] }]) assert.equal(flow.canPublishDraft(ready, value, stamp), false)
  assert.equal(flow.canPublishDraft(ready, validation, flow.draftFingerprint(draft)), false)
  assert.equal(flow.validGuid('00000000-0000-0000-0000-000000000000'), false)
})
