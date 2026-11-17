-- Hardening (idempotent). Run in Supabase > SQL Editor.

-- 1. Cap the size of the sealed keys (they are ~100 chars; blocks junk/abuse).
alter table public.vaults drop constraint if exists vaults_wrap_len;
alter table public.vaults add constraint vaults_wrap_len
  check (length(wrap_pass) <= 512 and length(wrap_recovery) <= 512);

-- 2. New functions in public must not be callable by anon/authenticated by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 3. Diagnostic: run each block and check the result.
-- 3a. Tables in public WITHOUT RLS (expected: none)
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
-- 3b. Grants to anon (expected: none)
select table_name, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon';
-- 3c. Public functions executable by anon (expected: none)
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
-- 3d. Permissive policies (expected: none with true)
select tablename, policyname, qual, with_check from pg_policies
 where schemaname = 'public' and (qual = 'true' or with_check = 'true');
-- 3e. Tables published to Realtime (expected: none)
select * from pg_publication_tables where pubname = 'supabase_realtime';
-- 3f. Installed extensions
select extname from pg_extension order by 1;
