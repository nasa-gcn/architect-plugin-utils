/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { sleep } from './promises.js'

export async function fetchRetry(
  ...props: Parameters<typeof fetch>
): ReturnType<typeof fetch> {
  let response
  try {
    response = await fetch(...props)
  } catch (e) {
    if (!(e instanceof TypeError)) throw e
  }

  if (response?.ok) {
    return response
  } else {
    await sleep(1000)
    return await fetchRetry(...props)
  }
}
