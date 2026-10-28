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

# The nginx image ships libssl but not the `openssl` command, and the script
# below is what writes the development certificate. ~1.5 MB for a stack that
# can come up on a machine with no PKI set up at all.
RUN apk add --no-cache openssl

# The default server (http) plus the shared rules both modes include.
# nginx.tls.conf is copied in beside it rather than over it: 25-select-tls.sh
# swaps it into conf.d/ when TLS_MODE=true, so one image serves both modes.
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/nginx.tls.conf /etc/nginx/nginx.tls.conf
COPY web/app.conf /etc/nginx/app.conf

# Executed, in sorted order, by the image's entrypoint before nginx starts:
# 25 picks the server block, 40 fills /etc/nginx/certs with a self-signed
# certificate when the picked block listens on 443. The `chmod` matters —
# this repository can be checked out on Windows, where the executable bit is
# not preserved, and nginx's entrypoint *ignores* a script it cannot execute.
COPY web/docker-entrypoint.d/25-select-tls.sh /docker-entrypoint.d/25-select-tls.sh
COPY web/docker-entrypoint.d/40-self-signed-cert.sh /docker-entrypoint.d/40-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/25-select-tls.sh /docker-entrypoint.d/40-self-signed-cert.sh

COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80 443
