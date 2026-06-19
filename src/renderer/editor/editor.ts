import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, remarkPluginsCtx, editorViewOptionsCtx, prosePluginsCtx } from '@milkdown/kit/core'
import { DOMSerializer, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import remarkBreaks from 'remark-breaks'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { replaceAll } from '@milkdown/kit/utils'
import remarkFrontmatter from 'remark-frontmatter'
import {
  SearchQuery,
  findNext as findNextMatch,
  findPrev as findPreviousMatch,
  getSearchState as getProsemirrorSearchState,
  search as createProsemirrorSearchPlugin,
  setSearchState as setProsemirrorSearchState,
  type SearchResult,
} from 'prosemirror-search'
import { htmlView } from './html-view'
import { frontmatterSchema, frontmatterView } from './frontmatter-node'
import { imageView } from './image-node'
import {
  replaceClipboardLocalImageSources,
  sanitizeClipboardHtml,
  serializeClipboardPlainText,
} from './clipboard'
import {
  buildSearchMatchPreview,
  normalizeSearchQuery,
  type SearchState,
  type SearchMatchPreview,
} from './search'
import { resolveAutoPairBackspace, resolveAutoPairTextInput } from './auto-pair'
import { resolveActiveMatchAfterRefresh } from './search-memory'
import {
  createOutlineId,
  normalizeHeadingText,
  shouldIncludeHeadingLevel,
  type OutlineItem,
} from './outline'
import { normalizeMarkdownImageDestinations, resolveMarkdownImageSrc } from './markdown-media'
import { collectMarkdownTokenRanges } from './markdown-tags'

import '@milkdown/kit/prose/view/style/prosemirror.css'

let editorInstance: Editor | null = null
let isProgrammaticChange = false
let onUserEditCallback: (() => void) | null = null
let searchState: SearchState = {
  scope: 'current-file',
  query: '',
  normalizedQuery: '',
  sourceText: '',
  matches: [],
  activeIndex: -1,
  totalMatches: 0,
}
let lastEditorSelection: { anchor: number; head: number } | null = null
let isManagedSelectionChange = false
let embedLocalImagesOnCopy = false
let pasteImageHandler: ((file: File) => Promise<string | null>) | null = null
const clipboardLocalImageSources = new Map<string, string>()

type AiSuggestionPreview = {
  from: number
  to: number
  originalText: string
  newText: string
}

export type AiTextSelectionSnapshot = {
  from: number
  to: number
  text: string
}

const aiSuggestionPluginKey = new PluginKey<AiSuggestionPreview | null>('ai-suggestion-preview')

const inlineStyles: Record<string, string> = {
  'h1': 'font-size:1.8em;font-weight:700;margin:1em 0 .5em;padding-bottom:.3em;border-bottom:1px solid #eee;',
  'h2': 'font-size:1.4em;font-weight:600;margin:1em 0 .5em;padding-bottom:.25em;border-bottom:1px solid #eee;',
  'h3': 'font-size:1.2em;font-weight:600;margin:.8em 0 .4em;',
  'h4': 'font-weight:600;margin:.8em 0 .4em;',
  'h5': 'font-weight:600;margin:.8em 0 .4em;',
  'h6': 'font-weight:600;margin:.8em 0 .4em;',
  'p': 'margin:.5em 0;line-height:1.75;',
  'strong': 'font-weight:600;',
  'a': 'color:#0969da;text-decoration:none;',
  'code': 'background:rgba(175,184,193,0.2);padding:2px 6px;border-radius:3px;font-size:.875em;font-family:Menlo,Monaco,monospace;',
  'pre': 'background:#f6f8fa;padding:16px;border-radius:6px;overflow-x:auto;margin:1em 0;',
  'blockquote': 'border-left:4px solid #ddd;padding-left:16px;margin:1em 0;color:#666;',
  'ul': 'padding-left:24px;margin:.5em 0;',
  'ol': 'padding-left:24px;margin:.5em 0;',
  'li': 'margin:.25em 0;',
  'table': 'border-collapse:collapse;width:100%;margin:1em 0;',
  'th': 'border:1px solid #ddd;padding:8px 12px;text-align:left;font-weight:600;background:#f6f8fa;',
  'td': 'border:1px solid #ddd;padding:8px 12px;text-align:left;',
  'hr': 'border:none;border-top:2px solid #ddd;margin:2em 0;',
  'img': 'max-width:100%;',
}

function enhanceClipboard(e: ClipboardEvent): void {
  const html = e.clipboardData?.getData('text/html')
  if (!html) return

  const doc = new DOMParser().parseFromString(sanitizeClipboardHtml(html), 'text/html')

  for (const [tag, style] of Object.entries(inlineStyles)) {
    doc.querySelectorAll(tag).forEach((el) => {
      ;(el as HTMLElement).setAttribute('style', style)
    })
  }

  // pre > code: override code style inside code blocks
  doc.querySelectorAll('pre code').forEach((el) => {
    ;(el as HTMLElement).setAttribute('style', 'background:none;padding:0;font-size:.875em;line-height:1.6;font-family:Menlo,Monaco,monospace;')
  })

  const styledHtml = sanitizeClipboardHtml(doc.body.innerHTML)
  e.clipboardData?.setData('text/html', embedLocalImagesOnCopy
    ? replaceClipboardLocalImageSources(styledHtml, clipboardLocalImageSources)
    : styledHtml)
}

async function handleEditorPaste(event: ClipboardEvent): Promise<void> {
  if (!pasteImageHandler) return

  const imageFile = Array.from(event.clipboardData?.items ?? []).find((item) => (
    item.kind === 'file' && item.type.startsWith('image/')
  ))?.getAsFile()

  if (!imageFile) return

  event.preventDefault()
  const imagePath = await pasteImageHandler(imageFile)
  if (!imagePath) return
  insertImage(imagePath)
}

const defaultContent = ''
const YAML_TAGS_HEADER_RE = /^\s*tags\s*:\s*$/iu

function addMarkdownTokenDecorations(
  decorations: Decoration[],
  node: ProseNode,
  basePos: number,
  options: Parameters<typeof collectMarkdownTokenRanges>[1] = {},
): void {
  node.descendants((descendant, pos) => {
    if (!descendant.isText || !descendant.text) return

    for (const token of collectMarkdownTokenRanges(descendant.text, options)) {
      decorations.push(Decoration.inline(
        basePos + pos + token.from,
        basePos + pos + token.to,
        {
          class: `markdown-token markdown-token-${token.kind}`,
          'data-markdown-token': token.kind,
        },
      ))
    }
  })
}

function createMarkdownTokenPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = []

        let nextListIsYamlTags = false
        state.doc.forEach((node, offset) => {
          const basePos = offset + 1

          if (nextListIsYamlTags && node.type.name === 'bullet_list') {
            addMarkdownTokenDecorations(decorations, node, basePos, { yamlListItem: true })
            nextListIsYamlTags = false
            return
          }

          addMarkdownTokenDecorations(decorations, node, basePos)
          nextListIsYamlTags = YAML_TAGS_HEADER_RE.test(node.textContent)
        })
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}

function createAiSuggestionWidget(preview: AiSuggestionPreview): HTMLSpanElement {
  const shell = document.createElement('span')
  shell.className = 'ai-suggestion-widget'
  shell.setAttribute('contenteditable', 'false')
  shell.dataset.originalText = preview.originalText

  const ghost = document.createElement('span')
  ghost.className = 'ai-suggestion-ghost'
  ghost.textContent = preview.newText
  shell.appendChild(ghost)

  const actions = document.createElement('span')
  actions.className = 'ai-suggestion-actions'

  const accept = document.createElement('button')
  accept.type = 'button'
  accept.className = 'ai-suggestion-btn ai-suggestion-btn-accept'
  accept.setAttribute('aria-label', '接受 AI 建议')
  accept.textContent = '✓'
  accept.addEventListener('mousedown', (event) => event.preventDefault())
  accept.addEventListener('click', (event) => {
    event.preventDefault()
    acceptAiSuggestion()
  })

  const reject = document.createElement('button')
  reject.type = 'button'
  reject.className = 'ai-suggestion-btn ai-suggestion-btn-reject'
  reject.setAttribute('aria-label', '拒绝 AI 建议')
  reject.textContent = '×'
  reject.addEventListener('mousedown', (event) => event.preventDefault())
  reject.addEventListener('click', (event) => {
    event.preventDefault()
    rejectAiSuggestion()
  })

  actions.append(accept, reject)
  shell.appendChild(actions)
  return shell
}

function createAiSuggestionPlugin(): Plugin {
  return new Plugin<AiSuggestionPreview | null>({
    key: aiSuggestionPluginKey,
    state: {
      init: (): AiSuggestionPreview | null => null,
      apply(tr, value: AiSuggestionPreview | null): AiSuggestionPreview | null {
        const action = tr.getMeta(aiSuggestionPluginKey) as
          | { type: 'set'; preview: AiSuggestionPreview }
          | { type: 'clear' }
          | undefined

        if (action?.type === 'set') return action.preview
        if (action?.type === 'clear') return null
        if (!value || !tr.docChanged) return value

        const preview = value
        const from = tr.mapping.map(preview.from)
        const to = tr.mapping.map(preview.to)
        if (from >= to) return null
        return {
          ...preview,
          from,
          to,
        }
      },
    },
    props: {
      decorations(state) {
        const preview = aiSuggestionPluginKey.getState(state)
        if (!preview) return null
        return DecorationSet.create(state.doc, [
          Decoration.inline(preview.from, preview.to, { class: 'ai-suggestion-original' }),
          Decoration.widget(preview.to, () => createAiSuggestionWidget(preview), { side: 1 }),
        ])
      },
    },
  })
}

function createAutoPairInputPlugin(): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace') return false
        const { from, to } = view.state.selection
        const selectedText = from === to
          ? ''
          : view.state.doc.textBetween(from, to, '\n\n', '\n')
        const previousText = from > 0
          ? view.state.doc.textBetween(from - 1, from, '\n\n', '\n')
          : ''
        const nextText = view.state.doc.textBetween(
          from,
          Math.min(from + 1, view.state.doc.content.size),
          '\n\n',
          '\n',
        )
        const action = resolveAutoPairBackspace({
          previousText,
          nextText,
          selectedText,
          cursor: from,
        })
        if (!action) return false

        event.preventDefault()
        const tr = view.state.tr.delete(action.deleteFrom, action.deleteTo)
        tr.setSelection(TextSelection.create(tr.doc, action.selectionAnchor, action.selectionHead))
        view.dispatch(tr.scrollIntoView())
        return true
      },
      handleTextInput(view, from, to, text) {
        const nextText = view.state.doc.textBetween(
          from,
          Math.min(from + text.length, view.state.doc.content.size),
          '\n\n',
          '\n',
        )
        const selectedText = from === to
          ? ''
          : view.state.doc.textBetween(from, to, '\n\n', '\n')
        const action = resolveAutoPairTextInput({
          text,
          selectedText,
          nextText,
          cursor: from,
        })
        if (!action) return false

        const tr = view.state.tr
        if (action.insertText) tr.insertText(action.insertText, from, to)
        tr.setSelection(TextSelection.create(tr.doc, action.selectionAnchor, action.selectionHead))
        view.dispatch(tr.scrollIntoView())
        return true
      },
    },
  })
}

export async function createEditor(
  rootId: string,
  onChange?: (markdown: string) => void
): Promise<Editor> {
  const root = document.getElementById(rootId)
  if (!root) throw new Error(`Element #${rootId} not found`)

  editorInstance = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, defaultContent)
      ctx.set(remarkPluginsCtx, [
        { plugin: remarkFrontmatter, options: ['yaml'] },
        { plugin: remarkBreaks, options: undefined },
      ])
      ctx.update(prosePluginsCtx, (plugins) => plugins.concat(
        createAutoPairInputPlugin(),
        createProsemirrorSearchPlugin(),
        createMarkdownTokenPlugin(),
        createAiSuggestionPlugin(),
      ))
      ctx.set(editorViewOptionsCtx, {
        clipboardTextSerializer: (content) => serializeClipboardPlainText(content),
      })
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        if (onChange) onChange(markdown)
        if (!isProgrammaticChange && onUserEditCallback) onUserEditCallback()
        isProgrammaticChange = false
      })
      ctx.get(listenerCtx).selectionUpdated((_ctx, selection) => {
        if (isManagedSelectionChange) {
          isManagedSelectionChange = false
          return
        }

        lastEditorSelection = {
          anchor: selection.anchor,
          head: selection.head,
        }
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(frontmatterSchema)
    .use(frontmatterView)
    .use(imageView)
    .use(htmlView)
    .create()

  // Enhance clipboard with inline styles for rich text paste (e.g. WeChat)
  root.addEventListener('copy', enhanceClipboard)
  root.addEventListener('cut', enhanceClipboard)
  root.addEventListener('paste', (event) => {
    void handleEditorPaste(event)
  })

  // Cmd+click (Mac) / Ctrl+click (Win/Linux) to open links in browser
  root.addEventListener('click', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const link = (e.target as HTMLElement).closest('a')
    if (!link) return
    const href = link.getAttribute('href')
    if (href) {
      e.preventDefault()
      window.electronAPI.openExternal(href)
    }
  })

  searchState = readSearchStateFromEditor(searchState.query)
  rememberCurrentSelection()

  return editorInstance
}

export function getMarkdown(): string {
  if (!editorInstance) return ''
  let markdown = ''
  editorInstance.action((ctx) => {
    const serializer = ctx.get(serializerCtx)
    const view = ctx.get(editorViewCtx)
    markdown = serializer(view.state.doc)
  })
  return markdown
}

export function getHTML(): string {
  if (!editorInstance) return ''
  let html = ''
  editorInstance.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const div = document.createElement('div')
    const fragment = DOMSerializer.fromSchema(view.state.schema).serializeFragment(view.state.doc.content)
    div.appendChild(fragment)
    html = div.innerHTML
  })
  return html
}

export function getSelectedPlainText(): string {
  return withEditorView((view) => {
    const { from, to, empty } = view.state.selection
    if (empty) return ''
    return view.state.doc.textBetween(from, to, '\n\n', '\n')
  }) ?? ''
}

export function getSelectedTextSnapshot(): AiTextSelectionSnapshot | null {
  return withEditorView((view) => {
    const { from, to, empty } = view.state.selection
    if (empty) return null
    return {
      from,
      to,
      text: view.state.doc.textBetween(from, to, '\n\n', '\n'),
    }
  }) ?? null
}

export function replaceSelectedText(text: string): boolean {
  return withEditorView((view) => {
    const { from, to, empty } = view.state.selection
    if (empty || text.length === 0) return false
    const tr = view.state.tr.insertText(text, from, to)
    view.dispatch(tr.scrollIntoView())
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function insertTextBelowSelection(text: string): boolean {
  return withEditorView((view) => {
    if (text.length === 0) return false
    const { to } = view.state.selection
    const prefix = to > 0 ? '\n\n' : ''
    const tr = view.state.tr.insertText(`${prefix}${text}`, to, to)
    view.dispatch(tr.scrollIntoView())
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function insertImage(src: string, alt = '', title = ''): boolean {
  return withEditorView((view) => {
    const imageNodeType = view.state.schema.nodes.image
    if (!imageNodeType || !src.trim()) return false

    const imageNode = imageNodeType.create({
      src,
      alt,
      title,
    })
    const tr = view.state.tr.replaceSelectionWith(imageNode)
    const selectionAnchor = Math.min(tr.doc.content.size, tr.selection.to)
    view.dispatch(
      tr
        .setSelection(TextSelection.create(tr.doc, selectionAnchor))
        .scrollIntoView(),
    )
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function createAiSuggestionFromSelection(text: string): boolean {
  return withEditorView((view) => {
    const { from, to, empty } = view.state.selection
    const newText = text.trim()
    if (empty || newText.length === 0) return false

    const originalText = view.state.doc.textBetween(from, to, '\n\n', '\n')
    const preview: AiSuggestionPreview = {
      from,
      to,
      originalText,
      newText,
    }
    const tr = view.state.tr.setMeta(aiSuggestionPluginKey, { type: 'set', preview })
    view.dispatch(tr.scrollIntoView())
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function createAiSuggestionFromSnapshot(text: string, snapshot: AiTextSelectionSnapshot): boolean {
  return withEditorView((view) => {
    const newText = text.trim()
    if (newText.length === 0) return false
    if (snapshot.from >= snapshot.to || snapshot.to > view.state.doc.content.size) return false

    const currentText = view.state.doc.textBetween(snapshot.from, snapshot.to, '\n\n', '\n')
    if (currentText !== snapshot.text) return false

    const preview: AiSuggestionPreview = {
      from: snapshot.from,
      to: snapshot.to,
      originalText: snapshot.text,
      newText,
    }
    const selection = createSafeTextSelection(view.state.doc, snapshot.from, snapshot.to)
    if (!selection) return false
    const tr = view.state.tr
      .setSelection(selection)
      .setMeta(aiSuggestionPluginKey, { type: 'set', preview })
    view.dispatch(tr.scrollIntoView())
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function acceptAiSuggestion(): boolean {
  return withEditorView((view) => {
    const preview = aiSuggestionPluginKey.getState(view.state)
    if (!preview) return false

    const tr = view.state.tr
      .insertText(preview.newText, preview.from, preview.to)
      .setMeta(aiSuggestionPluginKey, { type: 'clear' })
    view.dispatch(tr.scrollIntoView())
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function rejectAiSuggestion(): boolean {
  return withEditorView((view) => {
    const preview = aiSuggestionPluginKey.getState(view.state)
    if (!preview) return false

    view.dispatch(view.state.tr.setMeta(aiSuggestionPluginKey, { type: 'clear' }))
    rememberCurrentSelection()
    return true
  }) ?? false
}

export function setMarkdown(content: string, options: { preserveHistory?: boolean } = {}): void {
  if (!editorInstance) return
  const normalizedContent = normalizeMarkdownImageDestinations(content)
  const currentContent = getMarkdown()
  if (currentContent === normalizedContent) return
  const preserveHistory = options.preserveHistory ?? false

  const selectionBeforeReplace = lastEditorSelection
  const previousActiveFrom = withEditorView((view) => {
    const search = getProsemirrorSearchState(view.state)
    if (!search?.query.valid) return null

    const activeResult = collectSearchResults(view.state, search.query, search.range).find((result) => {
      return result.from === view.state.selection.from && result.to === view.state.selection.to
    })
    return activeResult?.from ?? null
  }) ?? null
  isProgrammaticChange = true
  editorInstance.action(replaceAll(normalizedContent, !preserveHistory))
  if (selectionBeforeReplace) {
    restoreSelection(selectionBeforeReplace)
  }
  withEditorView((view) => {
    const search = getProsemirrorSearchState(view.state)
    if (!search?.query.valid || !normalizeSearchQuery(search.query.search)) return

    const nextMatches = collectSearchResults(view.state, search.query, search.range)
    const nextActiveIndex = resolveActiveMatchAfterRefresh(
      previousActiveFrom ?? view.state.selection.from,
      nextMatches.map((match, index) => ({ index, from: match.from, to: match.to })),
    )

    if (nextActiveIndex < 0) return

    const nextActiveMatch = nextMatches[nextActiveIndex]
    if (!nextActiveMatch) return
    selectSearchResult(view, nextActiveMatch, true)
  })
  searchState = readSearchStateFromEditor(searchState.query)
  rememberCurrentSelection()
}

export function onUserEdit(cb: () => void): void {
  onUserEditCallback = cb
}

export function setSearchQuery(query: string): SearchState {
  const normalizedQuery = normalizeSearchQuery(query)

  withEditorView((view) => {
    const nextQuery = new SearchQuery({
      search: normalizedQuery,
      caseSensitive: false,
      regexp: false,
      wholeWord: false,
      literal: true,
    })

    view.dispatch(setProsemirrorSearchState(view.state.tr, nextQuery, null))

    if (!nextQuery.valid || !normalizedQuery) return

    const search = getProsemirrorSearchState(view.state)
    if (!search) return

    const currentSelectionMatches = collectSearchResults(view.state, search.query, search.range).some((result) => {
      return result.from === view.state.selection.from && result.to === view.state.selection.to
    })

    if (!currentSelectionMatches) {
      findNextMatch(view.state, view.dispatch)
    }
  })

  searchState = readSearchStateFromEditor(query)
  return searchState
}

export function getSearchState(): SearchState {
  searchState = readSearchStateFromEditor(searchState.query)
  return searchState
}

export function nextSearchMatch(): SearchState {
  withEditorView((view) => {
    findNextMatch(view.state, view.dispatch)
  })
  searchState = readSearchStateFromEditor(searchState.query)
  return searchState
}

export function previousSearchMatch(): SearchState {
  withEditorView((view) => {
    findPreviousMatch(view.state, view.dispatch)
  })
  searchState = readSearchStateFromEditor(searchState.query)
  return searchState
}

export function getOutlineItems(): OutlineItem[] {
  return withEditorView((view) => collectOutlineItems(view.state.doc)) ?? []
}

export function scrollToOutlineItem(id: string): boolean {
  return withEditorView((view) => {
    const item = collectOutlineItems(view.state.doc).find((candidate) => candidate.id === id)
    if (!item) return false

    const selection = createSafeTextSelection(view.state.doc, item.pos + 1, item.pos + 1)
    if (!selection) return false

    isManagedSelectionChange = true
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
    view.focus()
    return true
  }) ?? false
}

export function activateSearchMatch(index: number): SearchState {
  withEditorView((view) => {
    const search = getProsemirrorSearchState(view.state)
    if (!search?.query.valid) return

    const result = collectSearchResults(view.state, search.query, search.range)[index]
    if (!result) return
    selectSearchResult(view, result, true)
  })

  searchState = readSearchStateFromEditor(searchState.query)
  return searchState
}

export function focusEditorAtLastSelection(): void {
  withEditorView((view) => {
    const fallback = {
      anchor: view.state.selection.anchor,
      head: view.state.selection.head,
    }
    const target = lastEditorSelection ?? fallback
    const selection = createSafeTextSelection(view.state.doc, target.anchor, target.head)
    if (selection) {
      isManagedSelectionChange = true
      view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
    }
    view.focus()
  })
}

export function focusEditorPreservingSelection(): void {
  withEditorView((view) => {
    view.focus()
  })
}

export function isEditorTextFocused(): boolean {
  const root = document.querySelector('#editor .ProseMirror') as HTMLElement | null
  if (!root) return false

  const activeElement = document.activeElement as HTMLElement | null
  return activeElement === root || (!!activeElement && root.contains(activeElement))
}

export function refreshMarkdownImageSources(markdownFilePath: string | null): void {
  const root = document.querySelector('#editor .ProseMirror')
  if (!root) return

  root.querySelectorAll('img').forEach((image) => {
    const img = image as HTMLImageElement
    const originalSrc = img.dataset.markdownSrc ?? img.getAttribute('src') ?? ''
    if (!img.dataset.markdownSrc) {
      img.dataset.markdownSrc = originalSrc
    }

    const resolvedSrc = resolveMarkdownImageSrc(originalSrc, markdownFilePath)
    if (resolvedSrc && img.getAttribute('src') !== resolvedSrc) {
      img.setAttribute('src', resolvedSrc)
    }
  })
}

export function setEmbedLocalImagesOnCopy(enabled: boolean): void {
  embedLocalImagesOnCopy = enabled
}

export function setPasteImageHandler(handler: ((file: File) => Promise<string | null>) | null): void {
  pasteImageHandler = handler
}

export function setClipboardLocalImageReplacement(src: string, dataUrl: string | null): void {
  if (!dataUrl) {
    clipboardLocalImageSources.delete(src)
    return
  }
  clipboardLocalImageSources.set(src, dataUrl)
}

export function clearClipboardLocalImageReplacements(): void {
  clipboardLocalImageSources.clear()
}

function rememberCurrentSelection(): void {
  withEditorView((view) => {
    lastEditorSelection = {
      anchor: view.state.selection.anchor,
      head: view.state.selection.head,
    }
  })
}

function restoreSelection(selectionSnapshot: { anchor: number; head: number }): void {
  withEditorView((view) => {
    const selection = createSafeTextSelection(
      view.state.doc,
      selectionSnapshot.anchor,
      selectionSnapshot.head,
    )
    if (!selection) return

    isManagedSelectionChange = true
    view.dispatch(view.state.tr.setSelection(selection))
  })
}

function readSearchStateFromEditor(fallbackQuery = ''): SearchState {
  return withEditorView((view) => buildEditorSearchState(view, fallbackQuery))
    ?? createEmptySearchState(fallbackQuery)
}

function withEditorView<T>(callback: (view: ReturnType<typeof getEditorView>) => T): T | null {
  const view = getEditorView()
  if (!view) return null
  return callback(view)
}

function getEditorView() {
  if (!editorInstance) return null
  let view: ReturnType<typeof editorViewCtx['slice']['type']> | null = null
  editorInstance.action((ctx) => {
    view = ctx.get(editorViewCtx)
  })
  return view
}

function createEmptySearchState(query = '', sourceText = ''): SearchState {
  return {
    scope: 'current-file',
    query,
    normalizedQuery: normalizeSearchQuery(query),
    sourceText,
    matches: [],
    activeIndex: -1,
    totalMatches: 0,
  }
}

function buildEditorSearchState(
  view: NonNullable<ReturnType<typeof getEditorView>>,
  fallbackQuery = '',
): SearchState {
  const textIndex = buildTextIndex(view.state.doc)
  const search = getProsemirrorSearchState(view.state)
  const query = search?.query.search ?? fallbackQuery
  const normalizedQuery = normalizeSearchQuery(query)

  if (!search?.query.valid || !normalizedQuery) {
    return createEmptySearchState(query, textIndex.text)
  }

  const rawMatches = collectSearchResults(view.state, search.query, search.range)
  const matches: SearchMatchPreview[] = []
  let activeIndex = -1

  for (const result of rawMatches) {
    const offsets = resolveOffsetsFromDocRange(textIndex.segments, result.from, result.to)
    if (!offsets) continue

    const preview = buildSearchMatchPreview(textIndex.text, {
      index: matches.length,
      from: offsets.from,
      to: offsets.to,
    })

    if (result.from === view.state.selection.from && result.to === view.state.selection.to) {
      activeIndex = matches.length
    }

    matches.push(preview)
  }

  if (activeIndex < 0 && matches.length > 0) {
    activeIndex = 0
  }

  return {
    scope: 'current-file',
    query,
    normalizedQuery,
    sourceText: textIndex.text,
    matches,
    activeIndex,
    totalMatches: matches.length,
  }
}

function buildTextIndex(doc: ProseNode): {
  text: string
  segments: Array<{ from: number; to: number; startOffset: number; endOffset: number }>
} {
  const segments: Array<{ from: number; to: number; startOffset: number; endOffset: number }> = []
  let text = ''

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return

    const blockSegments: Array<{ from: number; to: number; text: string }> = []
    node.descendants((child, childPos) => {
      if (!child.isText || !child.text) return

      blockSegments.push({
        from: pos + childPos + 1,
        to: pos + childPos + 1 + child.text.length,
        text: child.text,
      })
    })

    if (blockSegments.length === 0) return false

    if (text.length > 0) {
      text += '\n'
    }

    for (const segment of blockSegments) {
      const startOffset = text.length
      text += segment.text
      segments.push({
        from: segment.from,
        to: segment.to,
        startOffset,
        endOffset: text.length,
      })
    }

    return false
  })

  return { text, segments }
}

function collectOutlineItems(doc: ProseNode): OutlineItem[] {
  const items: OutlineItem[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return

    const level = Number(node.attrs.level)
    if (!shouldIncludeHeadingLevel(level)) return

    items.push({
      id: createOutlineId(pos, items.length),
      level,
      title: normalizeHeadingText(node.textContent),
      pos,
    })

    return false
  })

  return items
}

function resolveOffsetsFromDocRange(
  segments: Array<{ from: number; to: number; startOffset: number; endOffset: number }>,
  from: number,
  to: number,
): { from: number; to: number } | null {
  let fromOffset: number | null = null
  let toOffset: number | null = null

  for (const segment of segments) {
    if (fromOffset == null && from >= segment.from && from <= segment.to) {
      fromOffset = segment.startOffset + (from - segment.from)
    }

    if (toOffset == null && to >= segment.from && to <= segment.to) {
      toOffset = segment.startOffset + (to - segment.from)
    }

    if (fromOffset != null && toOffset != null) break
  }

  if (fromOffset == null || toOffset == null) return null
  return { from: fromOffset, to: Math.max(fromOffset, toOffset) }
}

function collectSearchResults(
  state: NonNullable<ReturnType<typeof getEditorView>>['state'],
  query: SearchQuery,
  range: { from: number; to: number } | null,
): SearchResult[] {
  const results: SearchResult[] = []
  const from = range?.from ?? 0
  const to = range?.to ?? state.doc.content.size

  for (let cursor = from; cursor <= to;) {
    const next = query.findNext(state, cursor, to)
    if (!next) break

    results.push(next)
    cursor = next.to > cursor ? next.to : cursor + 1
  }

  return results
}

function selectSearchResult(
  view: NonNullable<ReturnType<typeof getEditorView>>,
  result: SearchResult,
  scrollIntoView = false,
): void {
  const selection = createSafeTextSelection(view.state.doc, result.from, result.to)
  if (!selection) return

  isManagedSelectionChange = true
  const tr = view.state.tr.setSelection(selection)
  view.dispatch(scrollIntoView ? tr.scrollIntoView() : tr)
}

function createSafeTextSelection(doc: ProseNode, anchor: number, head: number): TextSelection | null {
  const maxPos = doc.content.size
  const safeAnchor = Math.max(0, Math.min(anchor, maxPos))
  const safeHead = Math.max(0, Math.min(head, maxPos))

  try {
    return TextSelection.create(doc, safeAnchor, safeHead)
  } catch {
    return null
  }
}
