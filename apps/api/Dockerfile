FROM node:20-alpine AS base

# Install Python 3 for PDF generation (reportlab)
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages reportlab

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm ci --workspace=@analog-routine-tracker/api --workspace=@analog-routine-tracker/shared --include-workspace-root

# Copy API source
COPY apps/api/ ./apps/api/

# Build shared + API
RUN npm run build:api

# Create uploads directory
RUN mkdir -p /data/uploads/photos /data/uploads/pdfs

EXPOSE 3001

# Entrypoint: run migrations then start
COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "--require", "./apps/api/dist/instrumentation.js", "apps/api/dist/index.js"]
