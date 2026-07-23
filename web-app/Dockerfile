# Build stage
FROM node:22-alpine AS workspace

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . ./

# Accept build arguments for React environment variables
ARG REACT_APP_API_URL=""
ARG REACT_APP_KEYCLOAK_URL=http://localhost:8080
ARG REACT_APP_KEYCLOAK_REALM=medimesh
ARG REACT_APP_KEYCLOAK_CLIENT_ID=medimesh-client
ARG REACT_APP_DEV_MODE=true
ARG REACT_APP_IDENTITY_MODE=local
ARG REACT_APP_SHOW_DEMO_LOGIN=false

# Set them as environment variables for the build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_KEYCLOAK_URL=$REACT_APP_KEYCLOAK_URL
ENV REACT_APP_KEYCLOAK_REALM=$REACT_APP_KEYCLOAK_REALM
ENV REACT_APP_KEYCLOAK_CLIENT_ID=$REACT_APP_KEYCLOAK_CLIENT_ID
ENV REACT_APP_DEV_MODE=$REACT_APP_DEV_MODE
ENV REACT_APP_IDENTITY_MODE=$REACT_APP_IDENTITY_MODE
ENV REACT_APP_SHOW_DEMO_LOGIN=$REACT_APP_SHOW_DEMO_LOGIN
ENV GENERATE_SOURCEMAP=false

FROM workspace AS test
CMD ["npm", "test", "--", "--watchAll=false", "--runInBand"]

FROM workspace AS build

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
