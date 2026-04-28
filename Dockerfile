# Stage 1: Build the static site
FROM node:20-alpine AS build

WORKDIR /repo/website

# Copy the full repo (specs + protocol needed at build time)
COPY version.json /repo/version.json
COPY specs/ /repo/specs/
COPY protocol/ /repo/protocol/
COPY website/ /repo/website/

# Build-time variable for the version footer
ARG VITE_GIT_TAG
ENV VITE_GIT_TAG=$VITE_GIT_TAG

# Install dependencies and build
RUN npm ci
RUN node scripts/copy-protocol.mjs
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

COPY --from=build /repo/website/build /usr/share/nginx/html
COPY website/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
