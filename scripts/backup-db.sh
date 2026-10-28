#!/bin/sh
# Respaldo diario de las dos bases de producción (cron, 3:00 hora Argentina).
# Los guarda en $BACKUP_DIR/auto (por defecto /root/backups/auto) y borra los de más de 14 días.
# La pantalla Sistema > Configuración > Datos y backups lista estos archivos.
set -e
DIR="${BACKUP_DIR:-/root/backups}/auto"
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d)
for DB in dg_platform_excel dg_platform; do
  sudo -u postgres pg_dump -Fc "$DB" > "$DIR/$DB-$STAMP.dump.tmp"
  mv "$DIR/$DB-$STAMP.dump.tmp" "$DIR/$DB-$STAMP.dump"
done
find "$DIR" -name '*.dump' -mtime +14 -delete
echo "$(date -u +%FT%TZ) OK $(ls "$DIR" | wc -l) respaldos en $DIR"
