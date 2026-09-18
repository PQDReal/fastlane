import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('header identity request guards', () => {
  it('waits for a confirmed customer role and accepts a server profile', () => {
    const header = fs.readFileSync(path.join(process.cwd(), 'components/header.tsx'), 'utf8')
    const profile = fs.readFileSync(path.join(process.cwd(), 'app/profile/profile-client.tsx'), 'utf8')

    expect(header).toContain('userSubject && isAdmin === false')
    expect(header).not.toContain('userSubject && isAdmin !== true')
    expect(header).toContain('userSubject && !initialProfile')
    expect(profile).toContain('<Header initialProfile={profile} />')
  })
})
