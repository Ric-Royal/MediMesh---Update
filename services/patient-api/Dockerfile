FROM node:22.17.0-alpine3.21@sha256:0d722d537f07d5e962b82733cd641cfa1fb868eab8c597ebfc87b8fa0436daa9 AS test

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/

CMD ["npm", "test", "--", "--runInBand"]

FROM test AS development

ENV NODE_ENV=development

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=12 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["npm", "run", "dev"]

FROM node:22.17.0-alpine3.21@sha256:0d722d537f07d5e962b82733cd641cfa1fb868eab8c597ebfc87b8fa0436daa9 AS runtime

# Create app directory
WORKDIR /app

# Create logs directory
RUN mkdir -p logs

# Install app dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S medimesh -u 1001

# Change ownership of the app directory
RUN chown -R medimesh:nodejs /app
USER medimesh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start the application
CMD ["npm", "start"]
