# Build stage
FROM node:22.17.0-alpine3.21@sha256:0d722d537f07d5e962b82733cd641cfa1fb868eab8c597ebfc87b8fa0436daa9 AS workspace

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . ./

# Accept build arguments for public frontend configuration.
ARG VITE_API_URL=""
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=medimesh
ARG VITE_KEYCLOAK_CLIENT_ID=medimesh-client
ARG VITE_IDENTITY_MODE=local
ARG VITE_SHOW_DEMO_LOGIN=false

# Expose only explicitly public values to Vite.
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV VITE_IDENTITY_MODE=$VITE_IDENTITY_MODE
ENV VITE_SHOW_DEMO_LOGIN=$VITE_SHOW_DEMO_LOGIN

FROM workspace AS test
CMD ["npm", "test"]

FROM workspace AS development

ENV NODE_ENV=development

EXPOSE 5173

CMD ["npm", "start"]

FROM workspace AS build

# Build the app
RUN npm run build

# Production stage
FROM nginxinc/nginx-unprivileged:1.27.5-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0

# Copy built app from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
