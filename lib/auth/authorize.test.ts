import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { authorizeAccessToken, authorizeRequest } from './authorize'
import type { Auth0ApiConfig } from './config'
import { createAccessTokenVerifier } from './jwt'

const config: Auth0ApiConfig = {
  audience: 'https://api.fastlane.test',
  issuer: 'https://fastlane-test.us.auth0.com/',
  jwksUri: new URL('https://fastlane-test.us.auth0.com/.well-known/jwks.json'),
  rolesClaim: 'https://fastlane.test/roles',
}

let privateKey: CryptoKey
let otherPrivateKey: CryptoKey
let verify: ReturnType<typeof createAccessTokenVerifier>

beforeAll(async () => {
  const keys = await generateKeyPair('RS256')
  privateKey = keys.privateKey
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey
  const publicJwk = await exportJWK(keys.publicKey)
  publicJwk.kid = 'fastlane-test-key'
  publicJwk.use = 'sig'
  publicJwk.alg = 'RS256'
  verify = createAccessTokenVerifier(
    config,
    createLocalJWKSet({ keys: [publicJwk] }),
  )
})

async function token({
  audience = config.audience,
  expiresIn = '5m',
  issuer = config.issuer,
  notBefore,
  omitPermissions = false,
  omitRoles = false,
  permissions = [],
  roles = ['Customer'],
  signingKey = privateKey,
  subject = 'auth0|customer-1',
}: {
  audience?: string
  expiresIn?: string | number
  issuer?: string
  notBefore?: string | number
  omitPermissions?: boolean
  omitRoles?: boolean
  permissions?: unknown
  roles?: unknown
  signingKey?: CryptoKey
  subject?: string
} = {}) {
  const claims: Record<string, unknown> = {}
  if (!omitRoles) claims[config.rolesClaim] = roles
  if (!omitPermissions) claims.permissions = permissions

  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'fastlane-test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiresIn)

  if (notBefore !== undefined) builder = builder.setNotBefore(notBefore)

  return builder.sign(signingKey)
}

describe('Auth0 bearer authorization', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    await expect(
      authorizeRequest(new Request('https://fastlane.test/api/v1/cart'), {}, verify),
    ).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    })
  })

  it.each([
    ['wrong audience', () => token({ audience: 'https://other-api.test' })],
    ['wrong issuer', () => token({ issuer: 'https://other.us.auth0.com/' })],
    ['bad signature', () => token({ signingKey: otherPrivateKey })],
    ['expired', () => token({ expiresIn: 0 })],
    ['not active yet', () => token({ notBefore: '10m' })],
  ])('returns 401 for a token with %s', async (_label, makeToken) => {
    await expect(
      authorizeAccessToken(
        await makeToken(),
        { requiredRoles: ['customer'] },
        verify,
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_ACCESS_TOKEN',
    })
  })

  it('returns 401 for an empty subject', async () => {
    await expect(
      authorizeAccessToken(
        await token({ subject: '' }),
        { requiredRoles: ['customer'] },
        verify,
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_ACCESS_TOKEN',
    })
  })

  it('does not convert a JWKS timeout into a client authentication error', async () => {
    const unavailableVerifier = createAccessTokenVerifier(config, async () => {
      throw new errors.JWKSTimeout()
    })

    await expect(unavailableVerifier(await token())).rejects.toBeInstanceOf(
      errors.JWKSTimeout,
    )
  })

  it('authorizes a Customer token for a customer policy', async () => {
    const claims = await authorizeAccessToken(
      await token(),
      { requiredRoles: ['customer'] },
      verify,
    )

    expect(claims).toMatchObject({
      subject: 'auth0|customer-1',
      roles: ['customer'],
    })
  })

  it('returns 403 when a Customer token lacks Admin access', async () => {
    await expect(
      authorizeAccessToken(
        await token(),
        {
          requiredRoles: ['admin'],
          requiredPermissions: ['catalog:manage'],
        },
        verify,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: 'INSUFFICIENT_PERMISSION',
    })
  })

  it('returns 403 when the role is valid but a permission is missing', async () => {
    await expect(
      authorizeAccessToken(
        await token({ roles: ['Admin'], permissions: ['catalog:manage'] }),
        {
          requiredRoles: ['admin'],
          requiredPermissions: ['catalog:manage', 'inventory:manage'],
        },
        verify,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: 'INSUFFICIENT_PERMISSION',
    })
  })

  it('returns 403 when required role and permission claims are absent', async () => {
    await expect(
      authorizeAccessToken(
        await token({ omitRoles: true, omitPermissions: true }),
        { requiredRoles: ['customer'] },
        verify,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: 'INSUFFICIENT_PERMISSION',
    })
  })

  it('rejects an empty authorization policy before token verification', async () => {
    await expect(authorizeAccessToken('unused', {}, verify)).rejects.toThrow(
      'Authorization policy must require at least one role.',
    )
  })

  it('rejects an Admin policy without a permission', async () => {
    await expect(
      authorizeAccessToken('unused', { requiredRoles: ['admin'] }, verify),
    ).rejects.toThrow(
      'Admin authorization policy must require a permission.',
    )
  })

  it('accepts multiple spaces in a Bearer credential', async () => {
    const claims = await authorizeRequest(
      new Request('https://fastlane.test/api/v1/cart', {
        headers: { authorization: `Bearer   ${await token()}` },
      }),
      { requiredRoles: ['customer'] },
      verify,
    )

    expect(claims.subject).toBe('auth0|customer-1')
  })

  it('returns 401 for a malformed Bearer credential', async () => {
    await expect(
      authorizeRequest(
        new Request('https://fastlane.test/api/v1/cart', {
          headers: { authorization: `Bearer ${await token()},extra` },
        }),
        { requiredRoles: ['customer'] },
        verify,
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_ACCESS_TOKEN',
    })
  })

  it('authorizes an Admin only when every required permission is present', async () => {
    const claims = await authorizeAccessToken(
      await token({
        roles: ['Admin'],
        permissions: ['catalog:manage', 'inventory:manage'],
      }),
      {
        requiredRoles: ['admin'],
        requiredPermissions: ['catalog:manage', 'inventory:manage'],
      },
      verify,
    )

    expect(claims.roles).toEqual(['admin'])
    expect(claims.permissions).toEqual(['catalog:manage', 'inventory:manage'])
  })
})
