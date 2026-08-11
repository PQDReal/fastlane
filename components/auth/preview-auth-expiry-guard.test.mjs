import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const guard = readFileSync(new URL('./preview-auth-expiry-guard.tsx', import.meta.url), 'utf8')

describe('preview auth expiry guard', () => {
  it('uses an application dialog and replays only read-only requests', () => {
    expect(guard).toContain('<PreviewAuthDialog')
    expect(guard).toContain('canReplayAfterPreviewAuth(method)')
    expect(guard).toContain('if (canReplay) return originalFetch(retryInput, init)')
    expect(guard).toContain('return response')
    expect(guard).not.toContain('window.location.replace')
  })
})
