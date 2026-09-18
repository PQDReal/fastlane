import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('production runtime start contract', () => {
  it('serves local build assets with next start and keeps the container standalone entrypoint', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8')

    expect(packageJson.scripts.start).toBe('next start')
    expect(packageJson.scripts['start:standalone']).toContain('.next/standalone/server.js')
    expect(dockerfile).toContain('/app/.next/static ./.next/static')
    expect(dockerfile).toContain('CMD ["node", "server.js"]')
  })
})
