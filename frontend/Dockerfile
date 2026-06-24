# --- Stage 1: build the static site -----------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build.
COPY . .

# VITE_API_URL must be provided at BUILD time (Vite inlines it into the bundle).
# On Coolify, set it as a build-time environment variable / build arg.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Stage 2: serve with nginx ----------------------------------------------
FROM nginx:1.27-alpine

# SPA-aware nginx config (client-side routing fallback).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static build output.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
