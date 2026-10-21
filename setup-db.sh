#!/bin/bash
# Setup PostgreSQL su Void Linux e crea il database per el-quince-de-mayo
set -e

echo "=== Installazione PostgreSQL 18 ==="
xbps-install -Sy postgresql18

echo "=== Inizializzazione cluster ==="
# Void Linux: il cluster viene creato in /var/lib/postgresql/data
if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then
  su - postgres -c "initdb -D /var/lib/postgresql/data"
fi

echo "=== Avvio servizio ==="
ln -sf /etc/sv/postgresql /var/service/ 2>/dev/null || true
sv start postgresql || pg_ctlcluster 18 main start 2>/dev/null || true
sleep 2

echo "=== Creazione utente e database ==="
su - postgres -c "psql -c \"CREATE USER \\\"user\\\" WITH PASSWORD 'password';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE elquincedemayo OWNER \\\"user\\\";\"" 2>/dev/null || true
su - postgres -c "psql -d elquincedemayo -c \"GRANT ALL PRIVILEGES ON DATABASE elquincedemayo TO \\\"user\\\";\"" 2>/dev/null || true

echo ""
echo "=== PostgreSQL pronto ==="
echo "Ora esegui: cd /home/anto/el-quince-de-mayo && npm run db:migrate && ./server/node_modules/.bin/tsx server/src/db/seed.ts"
