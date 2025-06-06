import { describe, test } from 'node:test'
import { launchDockerSubprocess } from './docker.js'
import { fetchRetry } from './fetch.js'
import {
  sleep,
  periodically,
  neverResolve,
  UnexpectedResolveError,
} from './promises.js'
import assert from 'node:assert'
import cluster from 'node:cluster'
import { WatchdogTimer } from './timers.js'

async function executionTime(promise: Promise<unknown>) {
  const start = performance.now()
  await promise
  const stop = performance.now()
  return stop - start
}

const tolerance = 10

describe('sleep', () => {
  const expected = 100
  test('finishes normally when not interrupted', async () => {
    const elapsed = await executionTime(sleep(expected))
    assert(elapsed > expected - tolerance)
  })
  test('finishes early when interrupted', async () => {
    const signal = AbortSignal.timeout(expected)
    const elapsed = await executionTime(sleep(10 * expected, signal))
    assert(elapsed > expected - tolerance)
    assert(elapsed < 2 * expected)
  })
})

describe('neverResolve', () => {
  test('raises an exception if it resolves', async () => {
    await assert.rejects(
      neverResolve(Promise.resolve()),
      UnexpectedResolveError
    )
  })
  test('raises the original exception if the promise rejects', async () => {
    await assert.rejects(
      neverResolve(Promise.reject(new TypeError())),
      TypeError
    )
  })
})

describe('periodically', () => {
  test('resolves quickly when aborted', async () => {
    const signal = AbortSignal.timeout(550)
    let count = 0
    const time = await executionTime(periodically(() => count++, 100, signal))
    assert(count > 5)
    assert(count < 7)
    assert(time > 550 - tolerance)
    assert(time < 575)
  })
})

describe('WatchdogTimer', () => {
  test('alarms when timer expires', async () => {
    let alarming = false
    const abortController = new AbortController()
    const watchdog = new WatchdogTimer(250, abortController.signal)
    watchdog.addEventListener('alarm', () => {
      alarming = true
    })
    const interval = setInterval(() => watchdog.kick(), 100)
    await sleep(1000)
    assert.ok(!alarming)
    clearInterval(interval)
    await sleep(500)
    assert.ok(alarming)
    abortController.abort()
    alarming = false
    await sleep(500)
    assert.ok(!alarming)
  })
})

const port = 9200
const url = `http://localhost:${port}/`

function launchDocker() {
  return launchDockerSubprocess({
    Image: 'httpd',
    HostConfig: {
      PortBindings: {
        '80/tcp': [{ HostIP: '127.0.0.1', HostPort: `${port}` }],
      },
    },
  })
}

if (!cluster.isPrimary) {
  const { waitUntilStopped } = launchDocker()
  await waitUntilStopped()
  process.exit()
}

describe('launchDockerSubprocess', () => {
  test('exits when killed programmatically', async () => {
    const { kill, waitUntilStopped } = launchDocker()
    await fetchRetry(url)
    await kill()
    await waitUntilStopped()
    await assert.rejects(fetch(url), TypeError)
  })

  test('exits when the parent process dies suddenly', async () => {
    const child = cluster.fork()
    await fetchRetry(url)
    child.kill('SIGKILL')
    await sleep(1000) // Wait for Docker container to die
    await assert.rejects(fetch(url), TypeError)
  })
})
