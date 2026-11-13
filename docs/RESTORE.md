# Database backup and restore drill

The worker writes one daily MySQL dump, gzips it, encrypts it with AES-256-GCM using `ENCRYPTION_KEY`, and copies it to `BACKUP_SECONDARY_DIR`. It also copies `UPLOAD_DIR` into a dated `images/` directory there, retaining 30 snapshots. Configure that variable as durable storage on a separate volume or host. The primary directory keeps the newest 30 daily and 12 monthly database copies. The monthly copy is made from the first day's dump.

## Configure

1. Install MySQL client tools (`mysqldump` and `mysql`) on the worker host.
2. Set `BACKUP_DIR` to a private directory and `BACKUP_SECONDARY_DIR` to a separate durable mount or sync target. Do not use the same path.
3. Keep `ENCRYPTION_KEY` in the secret store and retain its current value with the backups. A backup cannot be decrypted without it.
4. Start the worker and check its logs for the daily encrypted backup. Each file begins with `EQBK1`; never serve either backup directory publicly.

## Restore drill

Run before launch and every three months. Use an empty scratch database on a non-production MySQL instance when possible.

1. Provision an empty database such as `elatedquest_restore_2026_11`. Do not use the configured application database.
2. Set `RESTORE_SCRATCH_DB` to that database name and ensure the app's DB credentials can create tables in it.
3. Run `node scripts/restore-backup.js <path-to-latest-backup.sql.gz.enc>`. The script refuses the configured app database and refuses a non-empty target. It decrypts and verifies the authentication tag before importing. Temporary plaintext is removed when the command exits.
4. Connect to the scratch database and verify post, user, and media tables, including that each post's media IDs and `media.url_path` references exist.
5. Record the backup filename, date, scratch database, verification results, and operator below. Delete the scratch database after verification using the database administration tool.

## Drill record

| Date | Backup file | Scratch database | Verification | Operator |
| --- | --- | --- | --- | --- |
| Not yet performed | — | — | Pending a configured backup store and MySQL environment | — |

The application code and encryption round-trip are covered by unit tests. Those tests do not replace a live restore drill.
