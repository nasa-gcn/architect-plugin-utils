/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export class UnexpectedResolveError extends Error {}

/**
 * Await a promise that never resolves.
 *
 * If the promise ever resolves, we raise an UnexpectedResolveError.
 */
export async function neverResolve<T>(promise: Promise<T>) {
  await promise
  throw new UnexpectedResolveError('promise resolved unexpectedly')
}

/**
 * Return a promise that resolves after a specified number of milliseconds have
 * elapsed, or optionally when aborted.
 */
export function sleep(millis: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    function done() {
      clearTimeout(timeoutHandle)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done)
    const timeoutHandle = setTimeout(done, millis)
  })
}

/**
 * Periodically call a function, optinally until aborted.
 */
export function periodically(
  func: () => unknown,
  millis: number,
  signal?: AbortSignal
) {
  let running = true

  function handleAbort() {
    running = false
  }

  signal?.addEventListener('abort', handleAbort)

  async function run() {
    try {
      while (running) {
        await func()
        await sleep(millis, signal)
      }
    } finally {
      signal?.removeEventListener('abort', handleAbort)
    }
  }

  return run()
}
