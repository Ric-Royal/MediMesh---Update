# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . ./

# Accept build arguments for React environment variables
ARG REACT_APP_API_URL=http://localhost:3001
ARG REACT_APP_KEYCLOAK_URL=http://localhost:8080
ARG REACT_APP_KEYCLOAK_REALM=medimesh
ARG REACT_APP_KEYCLOAK_CLIENT_ID=medimesh-client
ARG REACT_APP_DEV_MODE=true

# Set them as environment variables for the build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_KEYCLOAK_URL=$REACT_APP_KEYCLOAK_URL
ENV REACT_APP_KEYCLOAK_REALM=$REACT_APP_KEYCLOAK_REALM
ENV REACT_APP_KEYCLOAK_CLIENT_ID=$REACT_APP_KEYCLOAK_CLIENT_ID
ENV REACT_APP_DEV_MODE=$REACT_APP_DEV_MODE

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