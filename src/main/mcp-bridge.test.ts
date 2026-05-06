import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { createMcpBridgeController } from './mcp-bridge'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'lyramd-mcp-bridge-'))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('McpBridgeController', () => {
  it('starts an authenticated local bridge and forwards requests', async () => {
    const tempDir = await createTempDir()
    const bridgeFilePath = join(tempDir, 'mcp-bridge.json')
    const controller = createMcpBridgeController({
      bridgeFilePath,
      handleRequest: async (request) => ({
        echoed: request.type,
        args: request.args,
      }),
    })

    const status = await controller.start()
    expect(status.running).toBe(true)
    expect(status.port).toEqual(expect.any(Number))

    const bridgeFile = await import('fs/promises').then((fs) => fs.readFile(bridgeFilePath, 'utf-8'))
    const bridge = JSON.parse(bridgeFile) as { port: number; token: string }

    const response = await fetch(`http://127.0.0.1:${bridge.port}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bridge.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'lyramd.session.get_state',
        args: { ok: true },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        echoed: 'lyramd.session.get_state',
        args: { ok: true },
      },
    })

    await controller.stop()
    expect(controller.getStatus().running).toBe(false)
  })

  it('rejects unauthenticated bridge requests', async () => {
    const tempDir = await createTempDir()
    const controller = createMcpBridgeController({
      bridgeFilePath: join(tempDir, 'mcp-bridge.json'),
      handleRequest: async () => ({}),
    })
    const status = await controller.start()
    expect(status.port).toEqual(expect.any(Number))

    const response = await fetch(`http://127.0.0.1:${status.port}/mcp`, {
      method: 'POST',
      body: JSON.stringify({ type: 'lyramd.session.get_state' }),
    })

    expect(response.status).toBe(401)
    await controller.stop()
  })
})
