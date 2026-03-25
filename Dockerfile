# Stage 1: Build the static site
FROM node:20-alpine AS build

WORKDIR /repo/website

# Copy the full repo (specs + protocol needed at build time)
COPY specs/ /repo/specs/
COPY protocol/ /repo/protocol/
COPY website/ /repo/website/

# Install dependencies and build
RUN npm ci
RUN node scripts/copy-protocol.mjs
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

COPY --from=build /repo/website/build /usr/share/nginx/html
COPY website/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
