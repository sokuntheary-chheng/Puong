#!/bin/sh
# Choose the server block before nginx reads it. Executed, in sorted order,
# by nginx's entrypoint — see 40-self-signed-cert.sh for what being a
# separate process implies (its exit status stops the container).

# Plain http unless TLS_MODE says otherwise: `docker compose up` runs the
# default stack, the tls overlay sets TLS_MODE=true on the web service.
if [ "${TLS_MODE:-false}" != "true" ]; then
  return 0
fi

# The redirect has to name the port the container is published on, and
# nginx's $host has no port. Default matches docker-compose.tls.yml; the
# overlay passes WEB_TLS_PORT through from the shell or a root .env.
export WEB_TLS_PORT="${WEB_TLS_PORT:-8443}"

# envsubst replaces only the variables named in the second argument, so
# nginx's own `$host` and `$request_uri` pass through untouched.
#
# Rendered into a temporary file first. A failed render that had already
# truncated default.conf would leave nginx an empty configuration to die on
# with a message about *that*; failing here instead names the real reason.
# envsubst is part of the nginx image and the input is a file in the image,
# so this branch should be unreachable — which is why it is loud rather than
# quiet, and non-zero: the entrypoint runs under `set -e`, and a container
# that cannot honour TLS_MODE must not pretend it is serving TLS.
if envsubst '${WEB_TLS_PORT}' < /etc/nginx/nginx.tls.conf > /tmp/default.conf.tls; then
  mv /tmp/default.conf.tls /etc/nginx/conf.d/default.conf
else
  rm -f /tmp/default.conf.tls
  echo "25-select-tls.sh: TLS_MODE=true but the https configuration could not be rendered" >&2
  return 1
fi

echo "25-select-tls.sh: serving https on :443, redirecting http to :${WEB_TLS_PORT}" >&2

return 0
