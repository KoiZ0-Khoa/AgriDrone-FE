// Headless checks of local SSR fixtures; this does not use a signed-in browser or production data.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [profile, baseUrl] = process.argv.slice(2)
if (!profile || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl)) throw new Error('Usage: node tests/render-dashboard-preview.mjs <isolated-browser-profile> <local-preview-url>')
const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0])
const version = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json()
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let nextId = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  const job = pending.get(message.id)
  if (!job) return
  pending.delete(message.id); clearTimeout(job.timer)
  if (message.error) job.reject(new Error(JSON.stringify(message.error))); else job.resolve(message.result)
})
function command(method, params = {}, sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out' + (params.expression ? ': ' + params.expression.slice(0, 120) : ''))) }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}
const root = new URL('../docs/dashboard-redesign-2026-10-26/', import.meta.url)
const captures = [
  ['manager-order-list-mobile', 'manager-order-list', 390, 844],
  ['manager-desktop', 'manager', 1440, 1100], ['manager-mobile', 'manager', 390, 844],
  ['manager-partial-mobile', 'manager-partial', 390, 844], ['manager-empty-mobile', 'manager-empty', 390, 844], ['manager-loading-mobile', 'manager-loading', 390, 844], ['manager-error-mobile', 'manager-error', 390, 844],
  ['farm-catalogue-desktop', 'farm-catalogue', 1440, 1100], ['farm-catalogue-mobile', 'farm-catalogue', 390, 844],
  ['manager-farm-detail-mobile', 'manager-farm-detail', 390, 844], ['account-mobile', 'account', 390, 844],
  ['member-mobile', 'member', 390, 844],
  ['admin-desktop', 'admin', 1440, 1100], ['owner-desktop', 'owner', 1440, 1100],
  ['owner-mobile', 'owner', 390, 844], ['admin-mobile', 'admin', 390, 844], ['long-mobile', 'long', 390, 844],
  ['owner-compact', 'owner', 1235, 900], ['admin-tablet', 'admin', 1000, 900],
  ['empty-mobile', 'empty', 390, 844], ['loading-mobile', 'loading', 390, 844], ['error-mobile', 'error', 390, 844],
  ['partial-desktop', 'partial', 1440, 1100], ['permission-mobile', 'permission', 390, 844],
]
const results = []
try {
  for (const [name, page, width, height] of captures) {
    const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
    const evaluate = async expression => {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
      return response.result.value
    }
    await command('Page.enable', {}, sessionId)
    await command('Page.bringToFront', {}, sessionId)
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId)
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId)
    await command('Page.navigate', { url: baseUrl + '/' + page + '.html' }, sessionId)
    let loaded = false
    for (let attempt = 0; attempt < 100; attempt++) {
      loaded = await evaluate('document.readyState === "complete" && location.pathname === ' + JSON.stringify('/' + page + '.html'))
      if (loaded) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.equal(loaded, true, name + ': page loaded')
    await evaluate('document.fonts.ready.then(() => true)')
    const observation = await evaluate(`(() => {
      const root = document.querySelector('.workspace-dashboard') || document.querySelector('.app-content') || document.body;
      const controls = [...root.querySelectorAll('a,button')].filter(e => e.getBoundingClientRect().width > 0);
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
        unlabelled: controls.filter(e => !e.textContent.trim() && !e.getAttribute('aria-label') && !e.querySelector('[role="img"][aria-label]:not([aria-hidden="true"])')).length,
        smallControls: controls.filter(e => e.getBoundingClientRect().height < ${width < 600 ? 44 : 24}).map(e => e.textContent.trim()),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transition: getComputedStyle(root.querySelector('.dw-button') || root).transitionDuration,
        successTagBackground: root.querySelector('.ant-tag-success') ? getComputedStyle(root.querySelector('.ant-tag-success')).backgroundColor : null,
        minTextSize: Math.min(...[...root.querySelectorAll('p,small,strong,h1,h2,.dw-metric-top,.dw-metric-footer,.dw-badge,.dw-row-code,.dw-text-link,.dw-button')].filter(e => e.textContent.trim()).map(e => parseFloat(getComputedStyle(e).fontSize))) };
    })()`)
    assert.equal(observation.width, width, name + ': exact viewport')
    assert.ok(observation.scrollWidth <= width, name + ': no page overflow')
    assert.equal(observation.unlabelled, 0, name + ': all controls have names')
    if (observation.successTagBackground) assert.equal(observation.successTagBackground, 'rgb(240, 247, 238)', name + ': readable status background')
    if (page !== 'permission') assert.deepEqual(observation.smallControls, [], name + ': touch targets')
    if (page !== 'permission') {
      assert.ok(observation.minTextSize >= 13, name + ': readable supporting text');
      const controlCount = await evaluate(`(() => {
        const root = document.querySelector('.workspace-dashboard') || document.querySelector('.app-content');
        const controls = [...root.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && !e.disabled && e.tabIndex >= 0);
        globalThis.dashboardFocusControls = controls;
        controls[0].focus();
        return controls.length;
      })()`)
      for (let control = 0; control < controlCount; control++) {
        if (control > 0) {
          await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
          await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
        }
        const focus = await evaluate('({ expected: document.activeElement === globalThis.dashboardFocusControls[' + control + '], outline: getComputedStyle(document.activeElement).outlineWidth, focusVisible: document.activeElement.matches(":focus-visible"), rule: document.activeElement.matches(".app-shell .ant-pagination [tabindex]:focus-visible"), element: document.activeElement.outerHTML.slice(0, 250) })')
        assert.equal(focus.expected, true, name + ': logical Tab order at control ' + control)
        assert.equal(focus.outline, '3px', name + ': visible focus at control ' + control + ' ' + JSON.stringify(focus))
      }
      observation.keyboard = { checkedControls: controlCount, logicalOrder: true, visibleFocus: true }
      await evaluate('document.activeElement.blur(); document.querySelectorAll(".ant-table-content,.ant-table-body").forEach(e => { e.scrollLeft = 0 }); scrollTo({ top: 0, left: 0, behavior: "instant" })')
      assert.equal(observation.reducedMotion, true, name + ': reduced motion preference')
      assert.ok(parseFloat(observation.transition) <= 0.001, name + ': reduced motion respected')
    }
    const metrics = await command('Page.getLayoutMetrics', {}, sessionId)
    const fullPage = !['admin-desktop', 'owner-desktop', 'owner-mobile', 'admin-mobile'].includes(name)
    const clip = { x: 0, y: 0, width, height: fullPage ? Math.ceil(metrics.cssContentSize.height) : height, scale: 1 }
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }, sessionId)
    writeFileSync(new URL(name + '.png', root), Buffer.from(screenshot.data, 'base64'))
    results.push({ name, page, viewport: width + 'x' + height, artifact: name + '.png', ...observation })
    await command('Target.closeTarget', { targetId })
    console.log(name + ': rendered, viewport, overflow, labels and focus verified')
  }
  writeFileSync(new URL('browser-checks.json', root), JSON.stringify(results, null, 2) + '\n')
} finally {
  await command('Browser.close').catch(() => {})
  socket.close()
}
