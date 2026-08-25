// @ts-check
'use strict'

const { spawn } = require('child_process')
const vscode = require('vscode')

/**
 * Open the current Markdown document in LyraMD.
 *
 * LyraMD watches files on disk, not editor buffers — so unsaved changes must
 * be written to disk first, otherwise LyraMD would show stale content.
 *
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('lyramd.openCurrentMarkdown', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showErrorMessage('LyraMD: no active text editor.')
        return
      }

      const document = editor.document

      if (document.languageId !== 'markdown') {
        vscode.window.showErrorMessage(
          `LyraMD: this command only works in Markdown editors (current language: "${document.languageId}").`
        )
        return
      }

      if (document.uri.scheme !== 'file') {
        vscode.window.showErrorMessage(
          `LyraMD: can only open files on disk, not "${document.uri.scheme}" documents. Save the file first.`
        )
        return
      }

      // 1. Unsaved content must be on disk before LyraMD can see it.
      if (document.isDirty) {
        const saved = await document.save()
        if (!saved) {
          vscode.window.showErrorMessage('LyraMD: failed to save the document, file not opened.')
          return
        }
      }

      // 2. Launch LyraMD with the saved file.
      const filePath = document.uri.fsPath
      const error = await launchLyraMD(filePath)
      if (error) {
        vscode.window.showErrorMessage(`LyraMD: could not open "${filePath}": ${error}`)
      }
    })
  )
}

/**
 * Launch LyraMD with the given file.
 *
 * Platform defaults (unless `lyramd.executablePath` is configured):
 *  - macOS:   `open -a LyraMD <file>`  (LyraMD.app resolved via LaunchServices)
 *  - Linux:   `lyramd <file>`          (`lyramd` must be on PATH)
 *  - Windows: `LyraMD.exe <file>`      (`LyraMD.exe` must be on PATH)
 *
 * @param {string} filePath
 * @returns {Promise<string | null>} Error message on failure, null on success.
 */
function launchLyraMD(filePath) {
  return new Promise((resolve) => {
    const platform = process.platform
    const configured = vscode.workspace.getConfiguration('lyramd').get('executablePath', '')

    let command
    let args
    if (configured) {
      command = configured
      args = [filePath]
    } else if (platform === 'darwin') {
      command = 'open'
      args = ['-a', 'LyraMD', filePath]
    } else if (platform === 'win32') {
      command = 'LyraMD.exe'
      args = [filePath]
    } else {
      command = 'lyramd'
      args = [filePath]
    }

    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      // ENOENT and friends: binary not found, permission denied, ...
      resolve(`failed to launch "${command}": ${err.message}`)
    })

    if (platform === 'darwin' && command === 'open') {
      // `open` always spawns — a missing app surfaces as a non-zero exit code.
      child.on('exit', (code) => {
        if (code === 0) {
          resolve(null)
        } else {
          resolve(stderr.trim() || `'open' exited with code ${code}`)
        }
      })
    } else {
      child.on('spawn', () => {
        child.unref()
        resolve(null)
      })
    }
  })
}

function deactivate() {}

module.exports = { activate, deactivate }
