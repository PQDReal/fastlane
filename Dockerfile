FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG APP_BASE_URL
ARG AUTH0_AUDIENCE
ARG AUTH0_CLIENT_ID
ARG AUTH0_CLIENT_SECRET
ARG AUTH0_DOMAIN
ARG AUTH0_ISSUER_BASE_URL
ARG AUTH0_JWKS_URI
ARG AUTH0_ROLE_CLAIM
ARG AUTH0_SECRET
ARG NEXT_PUBLIC_SUPABASE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ENV APP_BASE_URL=${APP_BASE_URL} \
    AUTH0_AUDIENCE=${AUTH0_AUDIENCE} \
    AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID} \
    AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET} \
    AUTH0_DOMAIN=${AUTH0_DOMAIN} \
    AUTH0_ISSUER_BASE_URL=${AUTH0_ISSUER_BASE_URL} \
    AUTH0_JWKS_URI=${AUTH0_JWKS_URI} \
    AUTH0_ROLE_CLAIM=${AUTH0_ROLE_CLAIM} \
    AUTH0_SECRET=${AUTH0_SECRET} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
