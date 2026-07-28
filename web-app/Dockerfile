# Build stage
FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS workspace

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
FROM nginxinc/nginx-unprivileged:1.31.3-alpine@sha256:59ccf0943b0b8e8d9e6ea9039a39555730f544701a655c596f7df7d096c593f5

# Copy built app from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
