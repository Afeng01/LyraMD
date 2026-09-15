import type { ElectronAPI } from '../preload/index'

declare module '*.md?raw' {
  const content: string
  export default content
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
