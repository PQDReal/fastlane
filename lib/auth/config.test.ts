import { describe, expect, it } from 'vitest'

import { readAuth0ApiConfig } from './config'

function environment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    AUTH0_AUDIENCE: 'https://api.fastlane.test',
    AUTH0_CLIENT_ID: 'fastlane-client-id',
    AUTH0_DOMAIN: 'fastlane-test.us.auth0.com',
    AUTH0_ISSUER_BASE_URL: 'https://fastlane-test.us.auth0.com/',
    AUTH0_JWKS_URI:
      'https://fastlane-test.us.auth0.com/.well-known/jwks.json',
    AUTH0_ROLE_CLAIM: 'https://fastlane.test/roles',
    ...overrides,
    NODE_ENV: overrides.NODE_ENV ?? 'test',
  }
}

describe('Auth0 API configuration', () => {
  it('accepts one tenant with a distinct API audience', () => {
    expect(readAuth0ApiConfig(environment())).toMatchObject({
      audience: 'https://api.fastlane.test',
      issuer: 'https://fastlane-test.us.auth0.com/',
    })
  })

  it('rejects a browser/API tenant mismatch', () => {
    expect(() =>
      readAuth0ApiConfig(environment({ AUTH0_DOMAIN: 'other.us.auth0.com' })),
    ).toThrow('AUTH0_DOMAIN must identify the same tenant as the issuer')
  })

  it('rejects an audience equal to the application client ID', () => {
    expect(() =>
      readAuth0ApiConfig(
        environment({ AUTH0_CLIENT_ID: 'https://api.fastlane.test' }),
      ),
    ).toThrow('AUTH0_AUDIENCE must differ from AUTH0_CLIENT_ID')
  })
})
