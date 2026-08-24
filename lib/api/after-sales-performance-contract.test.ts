import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('after-sales navigation performance contract', () => {
  it('keeps the public page and read API eligible for ISR caching', () => {
    const page = readFileSync(join(root, 'app/after-sales/page.tsx'), 'utf8')
    const apiRoute = readFileSync(join(root, 'app/api/v1/after-sales/route.ts'), 'utf8')

    expect(page).toContain('export const revalidate = 300')
    expect(apiRoute).toContain('export const revalidate = 300')
    expect(page).not.toContain("dynamic = 'force-dynamic'")
    expect(apiRoute).not.toContain("dynamic = 'force-dynamic'")
    expect(page).toContain('workshops: []')
  })

  it('caches manual models and article reads across requests', () => {
    const source = readFileSync(join(root, 'lib/api/manuals-server.ts'), 'utf8')

    expect(source).toContain("from 'next/cache'")
    expect(source).toContain("tags: ['manual-content']")
    expect(source.match(/unstable_cache\(/g)).toHaveLength(5)
  })

  it('loads the large workshop collection only when its tab is opened', () => {
    const client = readFileSync(join(root, 'app/after-sales/after-sales-client.tsx'), 'utf8')
    const workshopRoute = readFileSync(join(root, 'app/api/v1/after-sales/workshops/route.ts'), 'utf8')

    expect(client).toContain('/api/v1/after-sales/workshops?vehicle=')
    expect(client).toContain("activeTab !== 'workshop'")
    expect(workshopRoute).toContain('workshop.services.includes(vehicle)')
    expect(workshopRoute).not.toContain("dynamic = 'force-dynamic'")
  })
})
