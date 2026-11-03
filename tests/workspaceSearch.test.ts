import { describe, expect, it } from 'vitest'
import type { WorkspaceRecord } from '../src/logic.js'
import {
  createWorkspaceSearchIndex,
  filterWorkspaceSearch,
  moveActiveIndex,
  normalizeSearchText,
  searchTerms,
  workspaceDisplayName,
} from '../src/workspaceSearch.js'

const workspace = (id: string, title: string, path: string): WorkspaceRecord => ({
  workspaceId: id,
  title,
  path,
  sessionIds: [],
})

const workspaces: readonly WorkspaceRecord[] = [
  workspace('w1', '广州项目', '/srv/guangzhou'),
  workspace('w2', '北京项目', '/srv/beijing'),
  workspace('w3', 'Project Alpha', '/srv/alpha'),
  workspace('w4', '项目-2', '/srv/项目-2'),
  workspace('w5', '重庆', '/srv/chongqing'),
]

const index = createWorkspaceSearchIndex(workspaces)
const ids = (query: string): string[] => filterWorkspaceSearch(index, query).map((entry) => entry.workspace.workspaceId)

describe('workspace search index', () => {
  it('keeps the host order and indexes the display title and path', () => {
    expect(index.map((entry) => entry.workspace.workspaceId)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5'])
    expect(index[0].name).toBe('广州项目')
    expect(index[0].path).toBe('/srv/guangzhou')
    expect(index[0].pinyin).toBe('guangzhouxiangmu')
    expect(index[0].initials).toBe('gzxm')
  })

  it('matches a Chinese title by substring', () => {
    expect(ids('广州')).toEqual(['w1'])
    expect(ids('项目')).toEqual(['w1', 'w2', 'w4'])
  })

  it('matches toneless full pinyin and initials', () => {
    expect(ids('guangzhou')).toEqual(['w1'])
    expect(ids('guang zhou')).toEqual(['w1'])
    expect(ids('gzxm')).toEqual(['w1'])
    expect(ids('cq')).toEqual(['w5'])
  })

  it('matches the full path without transliterating it', () => {
    expect(ids('/srv/alpha')).toEqual(['w3'])
    expect(ids('alpha')).toEqual(['w3'])
    expect(ids('用户')).toEqual([])
    expect(ids('项目-2')).toEqual(['w4'])
  })

  it('ANDs whitespace-separated terms across different fields', () => {
    expect(ids('gz /srv/guangzhou')).toEqual(['w1'])
    expect(ids('guangzhou missing')).toEqual([])
    expect(ids('项目 alpha')).toEqual([])
    expect(ids('项目 guangzhou')).toEqual(['w1'])
  })

  it('normalizes case, width and surrounding whitespace', () => {
    expect(ids('  GZXM  ')).toEqual(['w1'])
    expect(ids('ＧＺＸＭ')).toEqual(['w1'])
    expect(ids('PROJECT')).toEqual(['w3'])
    expect(normalizeSearchText('  Ａlpha  ')).toBe('alpha')
  })

  it('returns the complete index for an empty query', () => {
    expect(ids('')).toEqual(['w1', 'w2', 'w3', 'w4', 'w5'])
    expect(ids('   ')).toEqual(['w1', 'w2', 'w3', 'w4', 'w5'])
    expect(searchTerms('   ')).toEqual([])
  })

  it('returns no rows for a query that matches nothing', () => {
    expect(ids('nonexistent')).toEqual([])
  })

  it('indexes the ü vowel as v for keyboard pinyin', () => {
    const umlaut = createWorkspaceSearchIndex([workspace('u1', '绿色项目', '/srv/lvse')])
    const umlautIds = (query: string): string[] => (
      filterWorkspaceSearch(umlaut, query).map((entry) => entry.workspace.workspaceId)
    )
    expect(umlaut[0].pinyin).toBe('lvsexiangmu')
    expect(umlautIds('lvse')).toEqual(['u1'])
    expect(umlautIds('lüse')).toEqual(['u1'])
    expect(umlautIds('绿色')).toEqual(['u1'])
  })
})

describe('workspace display name', () => {
  it('uses the stored title when present', () => {
    expect(workspaceDisplayName(workspace('w1', ' Alpha ', '/srv/alpha'))).toBe('Alpha')
  })

  it('falls back to the path basename for an empty title', () => {
    expect(workspaceDisplayName(workspace('w1', '  ', '/srv/team/alpha/'))).toBe('alpha')
    expect(workspaceDisplayName(workspace('w1', '', 'C:\\work\\alpha'))).toBe('alpha')
  })

  it('never renders an empty label', () => {
    expect(workspaceDisplayName(workspace('w1', '', '/'))).toBe('未命名工作区')
    expect(workspaceDisplayName(workspace('w1', '', ''))).toBe('未命名工作区')
  })
})

describe('active row movement', () => {
  it('wraps in both directions', () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0)
    expect(moveActiveIndex(2, 1, 3)).toBe(0)
    expect(moveActiveIndex(0, -1, 3)).toBe(2)
    expect(moveActiveIndex(-1, -1, 3)).toBe(2)
  })

  it('reports no active row for an empty result list', () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1)
    expect(moveActiveIndex(-1, -1, 0)).toBe(-1)
  })
})
