import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../docs/dashboard-redesign-2026-10-26/', import.meta.url)
const files = /^(owner|admin|member|partial|empty|loading|error|long|permission|manager|manager-partial|manager-empty|manager-loading|manager-error|farm-catalogue|manager-order-list|manager-farm-detail|account)\.html$|^emblem\.png$|^inter-(latin|vietnamese)\.woff2$/
const server = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1)
  if (request.method !== 'GET' || !files.test(name)) { response.writeHead(404).end(); return }
  try {
    const content = await readFile(new URL(name, root))
    response.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.png') ? 'image/png' : 'font/woff2' }).end(content)
  } catch { response.writeHead(404).end() }
})
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port, directory: fileURLToPath(root) })))
process.on('SIGINT', () => server.close(() => process.exit(0)))
