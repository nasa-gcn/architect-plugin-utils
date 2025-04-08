/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypedEventTarget } from 'typescript-event-target'

/** A watchdog timer. */
export class WatchdogTimer extends TypedEventTarget<{ alarm: Event }> {
  #alarm = true

  kick() {
    this.#alarm = false
  }

  constructor(millis: number, signal?: AbortSignal) {
    super()
    const interval = setInterval(() => {
      if (this.#alarm) this.dispatchTypedEvent('alarm', new Event('alarm'))
      this.#alarm = true
    }, millis)
    signal?.addEventListener('abort', () => clearInterval(interval))
  }
}
