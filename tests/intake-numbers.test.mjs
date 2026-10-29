import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/features/surveys/intakeNumbers.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { intakeDecimal, intakeArea, intakeCoordinate, intakePositiveDecimal, intakeInteger, intakeOptionalArea } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('survey numbers preserve dot and comma decimals when producing numeric API values', () => {
  for (const [text, expected] of [['2.5123', 2.5123], ['2,5123', 2.5123], ['.5123', 0.5123], [',5123', 0.5123], ['90.0001', 90.0001], ['0,0001', 0.0001], ['2.50000', 2.5]]) assert.equal(intakeArea(text), expected)
  for (const text of ['11.01234567', '11,01234567']) assert.equal(intakeCoordinate(text, 'latitude'), 11.01234567)
  assert.equal(intakeCoordinate('108.12345678', 'longitude'), 108.12345678)
  assert.equal(intakeCoordinate('-10,1234567', 'latitude'), -10.1234567)
})

test('invalid coordinates are rejected without being clamped to a pole or antimeridian', () => {
  for (const text of ['90.2112', '-90.00001', '91']) assert.throws(() => intakeCoordinate(text, 'latitude'), /-90 đến 90/)
  for (const text of ['180.00001', '-180.01']) assert.throws(() => intakeCoordinate(text, 'longitude'), /-180 đến 180/)
  assert.equal(intakeCoordinate('90', 'latitude'), 90)
  assert.equal(intakeCoordinate('-180', 'longitude'), -180)
})

test('area validation matches the BE four-decimal limit and never silently rounds', () => {
  for (const value of ['90.00001', '2,51234', '0.00001', 1e-7, 2.512345]) assert.throws(() => intakeArea(value), /4 chữ số thập phân/)
  for (const value of ['0', '-2.5', '100000000', 'Infinity', 'NaN']) assert.throws(() => intakeArea(value), /diện tích/)
  assert.equal(intakeArea(0.0001), 0.0001)
  assert.equal(intakeArea('99999999.9999'), 99999999.9999)
})

test('incomplete or mixed decimal formats are not converted to a different number', () => {
  for (const value of ['', ' ', '-', '.', ',', '1.234,56', '1,2,3', '2 ha', '1e2']) assert.equal(Number.isNaN(intakeDecimal(value)), true)
})

test('boundary thresholds retain decimals and reject out-of-range input', () => {
  assert.equal(intakePositiveDecimal('5,25', 0.1, 50, 'Khoảng cách'), 5.25)
  for (const value of ['0,09', '50,001', '']) assert.throws(() => intakePositiveDecimal(value, 0.1, 50, 'Khoảng cách'))
})

test('optional numeric fields preserve zero and do not round fractional integers', () => {
  for (const value of [null, undefined, '', ' ']) assert.equal(intakeOptionalArea(value), null)
  assert.equal(intakeOptionalArea('0'), 0)
  assert.equal(intakeOptionalArea('2,512345'), 2.512345)
  assert.throws(() => intakeOptionalArea('-0,5'))
  assert.equal(intakeInteger('12', 1, 100, 'Số trụ'), 12)
  assert.throws(() => intakeInteger('12,5', 1, 100, 'Số trụ'))
})
