MySQL Backup & Restore
======================

Quick backup
- Script: deploy/backup/mysql-backup.sh
- Usage:
  ./deploy/backup/mysql-backup.sh ./backups

This creates a gzip-compressed dump like: backups/panel_YYYY-mm-dd_HH-MM-SS.sql.gz

Restore
Option A (new DB)
1) Create a new database container or drop/recreate schema
2) Decompress and pipe to mysql:
   gunzip -c backups/panel_YYYY-mm-dd_HH-MM-SS.sql.gz | docker compose exec -T hosting_mysql sh -lc "mysql -u root -proot"

Option B (into running DB)
- Be careful: this will overwrite existing tables
  gunzip -c backups/panel_YYYY-mm-dd_HH-MM-SS.sql.gz | docker compose exec -T hosting_mysql sh -lc "mysql -u root -proot panel"

Automate (cron)
- Example cron entry to back up every night at 2am (host machine):
  0 2 * * * cd /path/to/project && ./deploy/backup/mysql-backup.sh /path/to/backups >> /var/log/velvacloud-backup.log 2>&1

Tips
- Rotate old backups with a simple find command:
  find /path/to/backups -type f -name 'panel_*.sql.gz' -mtime +14 -delete
- Keep credentials in docker-compose.yml synced with this script.