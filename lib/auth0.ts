import { Auth0Client } from '@auth0/nextjs-auth0/server'

export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email',
  },
  // FastLane uses the SDK as a token-mediating BFF. Browser code never receives
  // an API access token from the SDK's convenience endpoint.
  enableAccessTokenEndpoint: false,
})
