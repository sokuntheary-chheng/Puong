# Puong web — Vue 3 SPA, built by Vite and served by nginx.
#
# The build context is the repository root so that both the app and the
# nginx configuration can be copied in one build.

FROM node:20-bookworm-slim AS build

WORKDIR /app/web

# web/.npmrc sets legacy-peer-deps=true; copying the directory brings it
# along, which is why there is no separate configuration step.
COPY web/ ./
RUN npm ci && npm run build

# --- runtime ---------------------------------------------------------------
FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80
