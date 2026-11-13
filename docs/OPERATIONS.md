# Launch monitoring

## Sentry

Create a Sentry project with Node.js and browser platforms. Set `SENTRY_DSN` to the project's public client DSN in the production secret store. The server SDK reports sanitized server exceptions; the browser SDK is served locally from `/vendor/sentry` and reports browser exceptions. `sendDefaultPii` is disabled. After deploying, use Sentry's test-event control to confirm both platforms arrive, then configure an alert for new issues and send an alert test to the owner.

Browser monitoring is not loaded when `SENTRY_DSN` is empty. The DSN is a public client identifier; all other Sentry credentials remain in Sentry and are not configured in the app.

## Uptime checks

Create an UptimeRobot HTTP(s) monitor for `/` and `/api/health`, at five-minute intervals, with failure email sent to the owner. The health route returns 200 only when its database check succeeds. Send an alert test after configuring the destination.

## Worker

Run `npm run worker` as a supervised process on one worker host. It publishes scheduled posts every five minutes, retries Blogger sync every fifteen minutes, and runs cleanup, recount, and encrypted backups daily at 02:00 UTC. Configure `BACKUP_DIR`, `BACKUP_SECONDARY_DIR`, and MySQL client tools before starting backups. A missing secondary directory makes the backup job fail visibly; see [RESTORE.md](./RESTORE.md) for the required restore drill.

These external monitors and alert destinations require production account access. They are not activated by source code alone.
