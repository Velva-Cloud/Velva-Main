#!/usr/bin/env bash
set -euo pipefail

# Simple MySQL backup from the mysql container using mysqldump
# Usage:
#   ./deploy/backup/mysql-backup.sh [output-dir]
#
# Example:
#   ./deploy/backup/mysql-backup.sh ./backups
#
# Requires:
#   - docker compose
#   - mysql container name: hosting_mysql
#   - credentials must match docker-compose.yml

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

DATESTAMP="$(date +'%Y-%m-%d_%H-%M-%S')"
FILE="$OUT_DIR/panel_${DATESTAMP}.sql.gz"

echo "Creating MySQL backup to ${FILE} ..."
docker compose exec -T hosting_mysql sh -lc \
  "mysqldump -u root -proot --databases panel --single-transaction --quick --lock-tables=false" \
  | gzip -9 > "$FILE"

echo "Backup complete: $FILE"