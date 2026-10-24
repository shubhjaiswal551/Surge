# Surge Frontend Dockerfile
# Stage 1: Build production bundle
FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Serve with lightweight Nginx web server
FROM nginx:alpine

# Copy custom nginx configuration for client-side routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled SPA static files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
