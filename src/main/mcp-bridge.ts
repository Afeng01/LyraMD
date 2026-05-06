import { randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { mkdir, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'

export interface McpBridgeStatus {
  bridgeFilePath: string
  port: number | null
  running: boolean
}

export interface McpBridgeRequest {
  args?: Record<string, unknown>
  type: string
}

export interface McpBridgeResponse {
  data?: unknown
  error?: string
  success: boolean
}

export type McpBridgeRequestHandler = (request: McpBridgeRequest) => Promise<unknown>

export interface CreateMcpBridgeControllerOptions {
  bridgeFilePath: string
  handleRequest: McpBridgeRequestHandler
}

interface BridgeFilePayload {
  port: number
  token: string
  updatedAt: number
}

function jsonResponse(res: ServerResponse, statusCode: number, payload: McpBridgeResponse): void {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(body)
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('error', reject)
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'))
    })
  })
}

function parseBridgeRequest(body: string): McpBridgeRequest | null {
  try {
    const parsed = JSON.parse(body) as Partial<McpBridgeRequest>
    if (!parsed || typeof parsed.type !== 'string') return null
    if (parsed.args !== undefined && (typeof parsed.args !== 'object' || parsed.args === null || Array.isArray(parsed.args))) {
      return null
    }
    return {
      type: parsed.type,
      args: parsed.args,
    }
  } catch {
    return null
  }
}

function createAuthToken(): string {
  return randomBytes(24).toString('hex')
}

export class McpBridgeController {
  private readonly bridgeFilePath: string
  private readonly handleRequest: McpBridgeRequestHandler
  private port: number | null = null
  private server: Server | null = null
  private token: string | null = null

  constructor(options: CreateMcpBridgeControllerOptions) {
    this.bridgeFilePath = options.bridgeFilePath
    this.handleRequest = options.handleRequest
  }

  getStatus(): McpBridgeStatus {
    return {
      bridgeFilePath: this.bridgeFilePath,
      port: this.port,
      running: this.server !== null,
    }
  }

  async start(): Promise<McpBridgeStatus> {
    if (this.server) return this.getStatus()

    this.token = createAuthToken()
    this.server = createServer((req, res) => {
      void this.handleHttpRequest(req, res)
    })

    await new Promise<void>((resolve, reject) => {
      const server = this.server
      if (!server) {
        reject(new Error('MCP bridge was not initialized'))
        return
      }

      const onError = (error: Error): void => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        server.off('error', onError)
        resolve()
      }

      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, '127.0.0.1')
    })

    const address = this.server.address()
    if (!address || typeof address === 'string') {
      await this.stop()
      throw new Error('MCP bridge did not receive a TCP port')
    }

    this.port = address.port
    await this.writeBridgeFile({
      port: this.port,
      token: this.token,
      updatedAt: Date.now(),
    })
    return this.getStatus()
  }

  async stop(): Promise<McpBridgeStatus> {
    const server = this.server
    this.server = null
    this.port = null
    this.token = null

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }

    await rm(this.bridgeFilePath, { force: true }).catch(() => {})
    return this.getStatus()
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/mcp') {
      jsonResponse(res, 404, { success: false, error: 'Not found' })
      return
    }

    const expectedAuth = this.token ? `Bearer ${this.token}` : null
    if (!expectedAuth || req.headers.authorization !== expectedAuth) {
      jsonResponse(res, 401, { success: false, error: 'Unauthorized' })
      return
    }

    const body = await readRequestBody(req).catch((error: unknown) => {
      jsonResponse(res, 400, { success: false, error: error instanceof Error ? error.message : String(error) })
      return null
    })
    if (body === null) return

    const request = parseBridgeRequest(body)
    if (!request) {
      jsonResponse(res, 400, { success: false, error: 'Invalid MCP bridge request' })
      return
    }

    try {
      const data = await this.handleRequest(request)
      jsonResponse(res, 200, { success: true, data })
    } catch (error) {
      jsonResponse(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async writeBridgeFile(payload: BridgeFilePayload): Promise<void> {
    await mkdir(dirname(this.bridgeFilePath), { recursive: true })
    await writeFile(this.bridgeFilePath, JSON.stringify(payload, null, 2), 'utf-8')
  }
}

export function createMcpBridgeController(options: CreateMcpBridgeControllerOptions): McpBridgeController {
  return new McpBridgeController(options)
}
