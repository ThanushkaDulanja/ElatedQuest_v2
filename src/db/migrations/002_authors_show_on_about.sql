-- Safe for databases initialized from database/schema.sql and for databases
-- that already applied 001_init.sql before this column was introduced.
-- Rollback: export any non-default show_on_about values first, then drop the
-- column. Do not drop it if those visibility choices need to be preserved.
SET @authors_show_on_about_ddl = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'authors'
        AND column_name = 'show_on_about'
    ),
    'SELECT 1',
    'ALTER TABLE authors ADD COLUMN show_on_about TINYINT(1) NOT NULL DEFAULT 0'
  )
);
PREPARE authors_show_on_about_statement FROM @authors_show_on_about_ddl;
EXECUTE authors_show_on_about_statement;
DEALLOCATE PREPARE authors_show_on_about_statement;
