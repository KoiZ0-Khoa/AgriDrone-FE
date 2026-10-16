import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createServer, loadConfigFromFile } from 'vite'

test('development proxy preserves the public intake cookie, idempotency key and API response', async () => {
  const received = []
  const backend = createHttpServer(async (request, response) => {
    let body = ''
    for await (const part of request) body += part
    received.push({ url: request.url, cookie: request.headers.cookie, key: request.headers['idempotency-key'], body })
    response.writeHead(201, { 'Content-Type': 'application/json', 'Set-Cookie': 'AgriDrone.PublicSurveySession=test-session; HttpOnly; SameSite=Lax; Path=/' })
    response.end(JSON.stringify({ requestNumber: 'SR-TEST' }))
  })
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const close = server => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() })
  let vite
  let frontend
  try {
    await listen(backend)
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, fileURLToPath(new URL('../vite.config.ts', import.meta.url)))
    assert.equal(loaded.config.define['import.meta.env.VITE_API_BASE_URL'], '""')
    const target = `http://127.0.0.1:${backend.address().port}`
    const proxy = Object.fromEntries(Object.entries(loaded.config.server.proxy).map(([path, value]) => [path, { ...value, target }]))
    vite = await createServer({ ...loaded.config, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null, proxy }, optimizeDeps: { noDiscovery: true, include: [] } })
    frontend = createHttpServer(vite.middlewares)
    await listen(frontend)
    const url = `http://127.0.0.1:${frontend.address().port}/api/public/survey-requests`
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'retry-same-operation' }, body: JSON.stringify({ farmName: 'Test farm' }) }
    const first = await fetch(url, options)
    assert.equal(first.status, 201)
    assert.equal((await first.json()).requestNumber, 'SR-TEST')
    const cookie = first.headers.get('set-cookie')
    assert.match(cookie, /HttpOnly/)
    const second = await fetch(url, { ...options, headers: { ...options.headers, Cookie: cookie.split(';')[0] } })
    assert.equal(second.status, 201)
    await second.arrayBuffer()
    assert.equal(received.length, 2)
    assert.equal(received[1].cookie, 'AgriDrone.PublicSurveySession=test-session')
    assert.equal(received[1].key, 'retry-same-operation')
    assert.equal(received[1].body, options.body)
    assert.equal(received[1].url, '/api/public/survey-requests')
  } finally {
    if (frontend) await close(frontend)
    if (vite) await vite.close()
    await close(backend)
  }
})
