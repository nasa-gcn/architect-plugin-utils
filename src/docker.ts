/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import once from 'lodash/once.js'
import { updater } from '@architect/utils'
import Dockerode, { type ContainerCreateOptions } from 'dockerode'
import { fork } from 'node:child_process'
import { promisify } from 'node:util'
import { periodically } from './promises.js'
import { WatchdogTimer } from './timers.js'

const [, , command, jsonifiedArgs] = process.argv

type Options = Omit<ContainerCreateOptions, 'Image'> &
  Required<Pick<ContainerCreateOptions, 'Image'>>

if (command === 'launch-docker-subprocess') {
  const options: Options = JSON.parse(jsonifiedArgs)
  ;(options.HostConfig ??= {}).AutoRemove = true
  const docker = new Dockerode()

  await promisify(docker.modem.followProgress)(await docker.pull(options.Image))

  const container = await docker.createContainer(options)
  const stream = await container.attach({ stream: true, stderr: true })
  stream.pipe(process.stderr)
  await container.start()

  const kill = once(() => {
    container.kill()
  })

  const signals = ['disconnect', 'SIGTERM', 'SIGINT']
  signals.forEach((signal) => process.on(signal, kill))

  // SIGTERM and SIGINT are not supported on Windows, so we have to make sure
  // to kill the container and exit if our parent process dies. We do this
  // using a watchdog timer. We kick the timer every time we receive an IPC
  // message from the parent process. If the watchdog timer ever trips, we
  // stop the container.
  const watchdog = new WatchdogTimer(500)
  watchdog.addEventListener('alarm', kill)
  process.on('message', (message) => {
    if (message === 'kick') watchdog.kick()
    else if (message === 'kill') kill()
  })

  await container.wait()
  process.exit()
}

/**
 * Launch a Docker container; stop and remove it when the process exits.
 *
 * Since Windows does not support SIGINT and SIGTERM or any general-purpose
 * means of intercepting a request for process termination, our strategy is
 * to detach a child process which is kept alive by means of interprocess
 * communication signals that reset a watchdog timer. If the watchdog timer
 * ever expires, the detached process stops the Docker container and then
 * exits.
 */
export function launchDockerSubprocess(options: Options) {
  const update = updater('Docker')
  update.start(`Launching container ${options.Image}`)
  const subprocess = fork(
    new URL(import.meta.url),
    ['launch-docker-subprocess', JSON.stringify(options)],
    { detached: true }
  )
  update.done(`Launched container ${options.Image}`)

  const abortController = new AbortController()

  async function send(s: string) {
    try {
      await new Promise<void>((resolve, reject) => {
        subprocess.send(s, (e) => {
          if (e) reject(e)
        })
        resolve()
      })
    } catch (e) {
      // It's not an error if we can't reach the child process because it
      // is already dead.
      if (
        !(
          e instanceof Error &&
          'code' in e &&
          e.code === 'ERR_IPC_CHANNEL_CLOSED'
        )
      )
        throw e
    }
  }

  periodically(async () => await send('kick'), 250, abortController.signal)

  return {
    async kill() {
      update.update(`Stopping container ${options.Image}`)
      abortController.abort()
      await send('kill')
    },
    async waitUntilStopped() {
      return new Promise<void>((resolve) => {
        subprocess.on('exit', () => {
          update.done(`Stopped container ${options.Image}`)
          resolve()
        })
      })
    },
  }
}
