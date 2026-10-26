import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/pages/dashboardData.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { farmPageSummary } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('Dashboard summaries use only loaded Farm records and preserve unknown area instead of inventing zero', () => {
  assert.deepEqual(farmPageSummary([]), { area: null, knownAreas: 0, withBoundary: 0 })
  assert.equal(farmPageSummary([{ areaHectares: null, centerPoint: null, boundary: null }]).area, null)
  const boundary = { type: 'Polygon', coordinates: [[[108, 11], [108.01, 11], [108.01, 11.01], [108, 11]]] }
  const farms = [{ areaHectares: 2.5, centerPoint: { type: 'Point', coordinates: [108, 11] }, boundary }, { areaHectares: 1.25, centerPoint: null, boundary: null }, { areaHectares: null, centerPoint: null, boundary: null }]
  assert.deepEqual(farmPageSummary(farms), { area: 3.75, knownAreas: 2, withBoundary: 1 })
  assert.equal(farmPageSummary([{ areaHectares: NaN, centerPoint: null, boundary: null }]).area, null)
})
