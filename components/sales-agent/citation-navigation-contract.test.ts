import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('Sales Agent citation navigation contract', () => {
  it('closes the expanded Agent before following a grounded citation', () => {
    const shell = readFileSync(join(root, 'components/sales-agent/sales-agent-shell.tsx'), 'utf8')
    const markdown = readFileSync(join(root, 'components/sales-agent/markdown-message.tsx'), 'utf8')

    expect(shell).toContain('onNavigate={() => {')
    expect(shell).toContain('setIsExpanded(false)')
    expect(shell).toContain('setOpen(false)')
    expect(markdown).toContain('onClick={onNavigate}')
    expect(markdown).toContain('prefetch')
  })
})
