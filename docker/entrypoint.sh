#!/bin/sh
# Container entrypoint: apply migrations, ensure TLS material, start the API.
#
# HTTPS behaviour (IHY_SSL):
#   auto (default)  use the certificate at IHY_SSL_CERT/IHY_SSL_KEY when both
#                   files exist; otherwise generate a self-signed pair once
#                   into /data/ssl, where it persists in the data volume
#   off             serve plain HTTP
#
# Extra names for the generated certificate can be passed via IHY_SSL_SAN,
# e.g. IHY_SSL_SAN="IP:192.168.1.10,DNS:ihy.home"
set -e

alembic upgrade head

SSL_MODE="${IHY_SSL:-auto}"
CERT="${IHY_SSL_CERT:-/data/ssl/cert.pem}"
KEY="${IHY_SSL_KEY:-/data/ssl/key.pem}"

if [ "$SSL_MODE" = "off" ]; then
  echo "IHY_SSL=off - serving plain HTTP on port 8000"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "No TLS certificate found - generating a self-signed one in $(dirname "$CERT")"
  mkdir -p "$(dirname "$CERT")" "$(dirname "$KEY")"
  SAN="DNS:localhost,IP:127.0.0.1${IHY_SSL_SAN:+,$IHY_SSL_SAN}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=${IHY_SSL_CN:-ihy.local}" \
    -addext "subjectAltName=$SAN"
  echo "Certificate generated (SAN: $SAN). Import cert.pem on your devices"
  echo "to make browsers trust it, or mount your own certificate instead."
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --ssl-certfile "$CERT" --ssl-keyfile "$KEY"
