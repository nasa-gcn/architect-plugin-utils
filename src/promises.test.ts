import {
  sleep,
  periodically,
  neverResolve,
  UnexpectedResolveError,
} from './promises.js'

async function executionTime(promise: Promise<unknown>) {
  const start = performance.now()
  await promise
  const stop = performance.now()
  return stop - start
}

function abortIn(millis: number) {
  const controller = new AbortController()
  setTimeout(() => {
    controller.abort()
  }, millis)
  return controller.signal
}

const tolerance = 10

describe('sleep', () => {
  const expected = 100
  test('finishes normally when not interrupted', async () => {
    const elapsed = await executionTime(sleep(expected))
    expect(elapsed).toBeGreaterThan(expected - tolerance)
  })
  test('finishes early when interrupted', async () => {
    const signal = abortIn(expected)
    const elapsed = await executionTime(sleep(10 * expected, signal))
    expect(elapsed).toBeGreaterThan(expected - tolerance)
    expect(elapsed).toBeLessThan(2 * expected)
  })
})

describe('neverResolve', () => {
  test('raises an exception if it resolves', async () => {
    await expect(neverResolve(Promise.resolve())).rejects.toBeInstanceOf(
      UnexpectedResolveError
    )
  })
  test('raises the original exception if the promise rejects', async () => {
    const reject = Symbol()
    await expect(neverResolve(Promise.reject(reject))).rejects.toBe(reject)
  })
})

describe('periodically', () => {
  test('resolves quickly when aborted', async () => {
    const signal = abortIn(550)
    let count = 0
    const time = await executionTime(periodically(() => count++, 100, signal))
    expect(count).toBeGreaterThan(5)
    expect(count).toBeLessThan(7)
    expect(time).toBeGreaterThan(550 - tolerance)
    expect(time).toBeLessThan(575)
  })
})
