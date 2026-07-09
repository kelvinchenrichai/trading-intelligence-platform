-- 004_cme_import_reparse_fix.sql
-- Allows the same CME PG40 PDF to be re-imported by a newer parser version.

alter table public.cme_bulletin_imports
  drop constraint if exists cme_bulletin_imports_sha256_key;

create unique index if not exists cme_bulletin_imports_sha256_parser_version_uq
  on public.cme_bulletin_imports (sha256, parser_version);
