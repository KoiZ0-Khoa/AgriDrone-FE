import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const { droneCapabilities } = await import(dataUrl(compile('../src/features/drones/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))

test('legacy drone specifications without capabilities remain renderable without inventing flight capabilities', () => {
  for (const specifications of [{}, null, undefined, [], 'legacy', { capabilities: null }, { capabilities: 'PLANT_HEALTH' }]) {
    assert.deepEqual(droneCapabilities(specifications), [])
  }
})

test('capability labels support persisted lowercase values and ignore duplicate or unsupported entries', () => {
  assert.deepEqual(droneCapabilities({ capabilities: ['plant_health', 'PLANT_HEALTH', 'BASELINE_MAPPING', null, 3, 'UNKNOWN', '__proto__'] }), ['PLANT_HEALTH', 'BASELINE_MAPPING'])
  assert.deepEqual(droneCapabilities({ capabilities: ['HARVEST_READINESS'] }), ['HARVEST_READINESS'])
})
