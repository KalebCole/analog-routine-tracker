FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json turbo.json ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci --workspace=@analog-routine-tracker/web --workspace=@analog-routine-tracker/shared --include-workspace-root

# Copy web source
COPY apps/web/ ./apps/web/

# Build args for Next.js (baked into the build)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_AUTH_TOKEN

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_TOKEN=$NEXT_PUBLIC_AUTH_TOKEN

# Build
RUN npm run build:web

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built app
COPY --from=base /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=base /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
