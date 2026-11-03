/**
 * Search index for the enhanced native workspace picker.
 *
 * This module is React-free and side-effect free. It only shapes workspace
 * metadata the Host already published: no filesystem scans, no conversation
 * bodies, and no Host mutations. The picker keeps the Host's registration order
 * and filters it; it never invents a relevance order of its own.
 *
 * Matching rules:
 * - the workspace title and the full path match case-insensitive substrings;
 * - the title additionally matches toneless full pinyin and pinyin initials;
 * - whitespace-separated query terms are ANDed, and each term may hit a
 *   different field (for example `gz project`);
 * - the path is deliberately not transliterated: it is host data, not a name.
 */
import { pinyin } from 'pinyin-pro'
import type { WorkspaceRecord } from './logic.js'

/** One indexed workspace, retaining the original row for rendering. */
export interface WorkspaceSearchEntry {
  readonly workspace: WorkspaceRecord
  /** Display title, falling back to the path's last segment. */
  readonly name: string
  /** NFKC-normalized lower-case title. */
  readonly title: string
  /** NFKC-normalized lower-case path. */
  readonly path: string
  /** Toneless full pinyin of the title, compacted to letters and digits. */
  readonly pinyin: string
  /** Toneless pinyin initials of the title, compacted to letters and digits. */
  readonly initials: string
}

/** Normalize text for case-insensitive, compatibility-insensitive matching. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim()
}

/** Keep only letters and digits so pinyin syllables can be queried without spaces. */
function compactPinyin(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, '')
}

/**
 * Human label for a workspace.
 *
 * The Host allows an empty stored title; showing the path's last segment is
 * more useful than an empty row, and it never invents a name that is not
 * already in the metadata.
 */
export function workspaceDisplayName(workspace: Pick<WorkspaceRecord, 'title' | 'path'>): string {
  const title = workspace.title.trim()
  if (title !== '') return title
  const path = workspace.path.trim().replace(/[\\/]+$/, '')
  const segment = path.split(/[\\/]/).pop() ?? ''
  return segment !== '' ? segment : '未命名工作区'
}

/**
 * Build the immutable index for one workspace snapshot.
 *
 * The caller memoizes this by the snapshot's item array: pinyin conversion is
 * the expensive part and must not run on every keystroke.
 */
export function createWorkspaceSearchIndex(
  workspaces: readonly WorkspaceRecord[],
): readonly WorkspaceSearchEntry[] {
  return workspaces.map((workspace) => {
    const name = workspaceDisplayName(workspace)
    const full = pinyin(name, { toneType: 'none', type: 'array' }).join('')
    const first = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
    return {
      workspace,
      name,
      title: normalizeSearchText(name),
      path: normalizeSearchText(workspace.path),
      pinyin: compactPinyin(full),
      initials: compactPinyin(first),
    }
  })
}

/** Split a query into normalized terms; an empty query has no terms. */
export function searchTerms(query: string): readonly string[] {
  const normalized = normalizeSearchText(query)
  return normalized === '' ? [] : normalized.split(/\s+/).filter((term) => term !== '')
}

/**
 * Filter indexed workspaces in Host order.
 *
 * Every term must match at least one field. A term can match the title, the
 * path, the full pinyin, or the initials, so `gz` finds `广州项目` and
 * `project` still finds it through an English suffix.
 */
export function filterWorkspaceSearch(
  index: readonly WorkspaceSearchEntry[],
  query: string,
): readonly WorkspaceSearchEntry[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return index
  return index.filter((entry) => terms.every((term) => (
    entry.title.includes(term)
    || entry.path.includes(term)
    || entry.pinyin.includes(term)
    || entry.initials.includes(term)
  )))
}

/** Clamp one keyboard move onto the result list; -1 means "no active row". */
export function moveActiveIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  if (current < 0 || current >= length) return delta >= 0 ? 0 : length - 1
  return (current + delta + length) % length
}
