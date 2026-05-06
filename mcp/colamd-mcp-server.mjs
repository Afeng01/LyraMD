#!/usr/bin/env node

import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const SERVER_NAME = 'colamd-mcp-server'
const SERVER_VERSION = '0.1.0'
const DEFAULT_PROTOCOL_VERSION = '2024-11-05'

let inputBuffer = Buffer.alloc(0)

function bridgeFilePath() {
  return process.env.LYRAMD_MCP_BRIDGE_FILE || join(homedir(), '.lyramd', 'mcp-bridge.json')
}

function readBridgeFile() {
  const payload = JSON.parse(readFileSync(bridgeFilePath(), 'utf-8'))
  if (!payload || typeof payload.port !== 'number' || typeof payload.token !== 'string') {
    throw new Error('Invalid LyraMD bridge file')
  }
  return payload
}

async function callBridge(type, args = {}) {
  const bridge = readBridgeFile()
  const response = await fetch(`http://127.0.0.1:${bridge.port}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bridge.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type, args }),
  })
  const payload = await response.json()
  if (!payload.success) {
    throw new Error(payload.error || `Bridge request failed: ${response.status}`)
  }
  return payload.data
}

function sendMessage(message) {
  const body = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}

function sendResult(id, result) {
  sendMessage({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

function toolTextResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

function toolErrorResult(error) {
  return {
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  }
}

const tools = [
  {
    name: 'session',
    description: 'Read the current LyraMD session state. Use action=get_state before choosing a document operation.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_state'],
          description: 'Session action.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'document',
    description:
      'Read or replace the current LyraMD Markdown document. Use read -> reason -> write. Pass expected_revision from read to write to avoid overwriting newer user edits.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write'],
          description: 'Document action.',
        },
        content: {
          type: 'string',
          description: 'Full Markdown content for write.',
        },
        expected_revision: {
          type: 'string',
          description: 'Revision returned by the most recent read.',
        },
      },
      required: ['action'],
    },
  },
]

async function callTool(name, args = {}) {
  try {
    if (name === 'session') {
      if (args.action !== 'get_state') return toolErrorResult('Invalid session action')
      return toolTextResult(await callBridge('lyramd.session.get_state', {}))
    }

    if (name === 'document') {
      if (args.action === 'read') {
        return toolTextResult(await callBridge('lyramd.document.read', {}))
      }
      if (args.action === 'write') {
        if (typeof args.content !== 'string') return toolErrorResult('content is required')
        return toolTextResult(await callBridge('lyramd.document.write', {
          content: args.content,
          expected_revision: typeof args.expected_revision === 'string' ? args.expected_revision : undefined,
        }))
      }
      return toolErrorResult('Invalid document action')
    }

    return toolErrorResult(`Unknown tool: ${name}`)
  } catch (error) {
    return toolErrorResult(error)
  }
}

async function handleRequest(message) {
  const { id, method, params } = message
  if (!method) return

  if (method.startsWith('notifications/')) return

  try {
    switch (method) {
      case 'initialize':
        sendResult(id, {
          protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        })
        return
      case 'ping':
        sendResult(id, {})
        return
      case 'tools/list':
        sendResult(id, { tools })
        return
      case 'tools/call':
        sendResult(id, await callTool(params?.name, params?.arguments || {}))
        return
      case 'resources/list':
        sendResult(id, { resources: [] })
        return
      case 'prompts/list':
        sendResult(id, { prompts: [] })
        return
      default:
        sendError(id, -32601, `Unknown method: ${method}`)
    }
  } catch (error) {
    sendError(id, -32603, error instanceof Error ? error.message : String(error))
  }
}

function processInputBuffer() {
  while (true) {
    const headerEnd = inputBuffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) return

    const header = inputBuffer.subarray(0, headerEnd).toString('utf-8')
    const contentLengthMatch = header.match(/content-length:\s*(\d+)/i)
    if (!contentLengthMatch) {
      inputBuffer = Buffer.alloc(0)
      return
    }

    const contentLength = Number(contentLengthMatch[1])
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + contentLength
    if (inputBuffer.length < bodyEnd) return

    const body = inputBuffer.subarray(bodyStart, bodyEnd).toString('utf-8')
    inputBuffer = inputBuffer.subarray(bodyEnd)

    try {
      void handleRequest(JSON.parse(body))
    } catch (error) {
      sendError(null, -32700, error instanceof Error ? error.message : String(error))
    }
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
  processInputBuffer()
})

process.stdin.on('end', () => {
  process.exit(0)
})
