#!/bin/sh
# Executed (not sourced) by nginx's entrypoint: docker-entrypoint.sh runs
# every executable `/docker-entrypoint.d/*.sh` as its own process, in
# sorted order, *before* nginx starts. Two consequences shape this file:
#
#   - the entrypoint's `set -e` does not reach in here, so a failing command
#     would be swallowed unless this file checks it — the ones that matter
#     are in `if` conditions;
#   - the exit status is the entrypoint's, under its `set -e`: exit non-zero
#     and the container stops with this script's message as the reason. So
#     `return 0` at the end of every path — busybox ash treats a top-level
#     `return` as "leave the script with this status", which is exactly the
#     fail-soft behaviour wanted when a certificate cannot be written.

# Only the TLS configuration needs a certificate, so look for one before
# generating anything. The config is read off disk rather than through
# `nginx -T`: the *reason* this script exists is that nginx cannot load the
# configuration (missing certificate), so `nginx -T` fails before it prints
# anything and would report "no https" while https is exactly what is
# configured. The server block lives in one of these two files; the rules it
# includes contain no `listen` at all.
HAS_TLS=0
for f in /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf; do
  [ -f "${f}" ] || continue
  if grep -q 'listen 443' "${f}" 2>/dev/null; then
    HAS_TLS=1
    break
  fi
done
if [ "${HAS_TLS}" = "0" ]; then
  return 0
fi

CERT_DIR=/etc/nginx/certs
CERT_FILE=${CERT_DIR}/tls.crt
KEY_FILE=${CERT_DIR}/tls.key

# A real certificate (from a volume, or mounted in) always wins: the script
# only ever fills an empty directory.
if [ -s "${CERT_FILE}" ] && [ -s "${KEY_FILE}" ]; then
  return 0
fi

mkdir -p "${CERT_DIR}" 2>/dev/null

# openssl (installed in the Dockerfile) writes a self-signed certificate the
# first time the TLS server starts, so the stack needs no PKI setup at all.
# `-addext` supplies the SAN browsers require — a certificate with only a CN
# is refused outright — and RSA-2048 generates in well under a second; this
# is a development certificate and the README says so.
if openssl req -x509 -nodes -newkey rsa:2048 \
  -days 3650 \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -subj "/CN=localhost/O=Puong" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  >/dev/null 2>&1; then
  echo "40-self-signed-cert.sh: generated a self-signed certificate for localhost (development only)" >&2
else
  # Fail soft: nginx may still start if a certificate was mounted somewhere
  # else, and the log line is more useful than a silent boot failure.
  echo "40-self-signed-cert.sh: could not generate a certificate; https will not start until one exists in ${CERT_DIR}" >&2
fi

return 0
