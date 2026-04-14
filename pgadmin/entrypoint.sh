#!/bin/sh
set -e

PGPASS_FILE="/var/lib/pgadmin/pgpass"
echo "${DB_HOST:-db}:${DB_PORT:-5432}:${POSTGRES_DB:-planta_db}:${POSTGRES_USER:-planta_user}:${POSTGRES_PASSWORD:?ERROR: POSTGRES_PASSWORD no definido}" > "$PGPASS_FILE"
chmod 600 "$PGPASS_FILE"
chown 5050:5050 "$PGPASS_FILE"

cat > /pgadmin4/servers.json << EOF
{
  "Servers": {
    "1": {
      "Name": "Planta DB",
      "Group": "Servers",
      "Host": "${DB_HOST:-db}",
      "Port": ${DB_PORT:-5432},
      "MaintenanceDB": "${POSTGRES_DB:-planta_db}",
      "Username": "${POSTGRES_USER:-planta_user}",
      "PassFile": "/var/lib/pgadmin/pgpass",
      "SSLMode": "prefer"
    }
  }
}
EOF

echo "pgpass y servers.json generados"
echo "Host: ${DB_HOST:-db}:${DB_PORT:-5432}"

exec /entrypoint.sh "$@"