import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, remarkPluginsCtx } from '@milkdown/kit/core'
import { editorViewOptionsCtx, prosePluginsCtx } from '@milkdown/core'
import { DOMSerializer, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { TextSelection } from '@milkdown/kit/prose/state'
import remarkBreaks from 'remark-breaks'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { replaceAll } from '@milkdown/kit/utils'
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
import {
  sanitizeClipboardHtml,
  serializeClipboardPlainText,
} from './clipboard'
import {
  buildSearchMatchPreview,
  normalizeSearchQuery,
  type SearchState,
  type SearchMatchPreview,
} from './search'
import { resolveActiveMatchAfterRefresh } from './search-memory'
import {
  createOutlineId,
  normalizeHeadingText,
  shouldIncludeHeadingLevel,
  type OutlineItem,
} from './outline'

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

  e.clipboardData?.setData('text/html', sanitizeClipboardHtml(doc.body.innerHTML))
}

const defaultContent = ''

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
      ctx.set(remarkPluginsCtx, [{ plugin: remarkBreaks, options: undefined }])
      ctx.update(prosePluginsCtx, (plugins) => plugins.concat(createProsemirrorSearchPlugin()))
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
    .use(htmlView)
    .create()

  // Enhance clipboard with inline styles for rich text paste (e.g. WeChat)
  root.addEventListener('copy', enhanceClipboard)
  root.addEventListener('cut', enhanceClipboard)

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

export function setMarkdown(content: string): void {
  if (!editorInstance) return
  const currentContent = getMarkdown()
  if (currentContent === content) return

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
  editorInstance.action(replaceAll(content, true))
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
