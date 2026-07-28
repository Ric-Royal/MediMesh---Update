FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS test

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

FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS runtime

# Create app directory
WORKDIR /app

# Create logs directory
RUN mkdir -p logs

# Install app dependencies
COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf \
    /root/.cache \
    /root/.npm \
    /opt/yarn-v1.22.22 \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /usr/local/lib/node_modules/corepack \
    /usr/local/lib/node_modules/npm

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
CMD ["node", "src/index.js"]
