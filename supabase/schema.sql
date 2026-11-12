-- appBank web: one encrypted row per user. Run once in Supabase > SQL Editor.
-- Everything is ciphertext sealed on the device (src/domain/vault.ts):
--   data          the database, sealed with a random data key
--   wrap_pass     the data key, sealed with a key derived from the passphrase
--   wrap_recovery the data key, sealed with the recovery key
-- The server cannot read any of it. RLS makes each row reachable only by its owner.

create table if not exists public.vaults (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  version bigint not null check (version > 0),
  data text not null check (length(data) < 20000000),
  wrap_pass text not null,
  wrap_recovery text not null,
  updated_at timestamptz not null default now()
);

alter table public.vaults enable row level security;

drop policy if exists "own vault" on public.vaults;
create policy "own vault" on public.vaults
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Explicit: newer projects do not auto-grant Data API access on new tables.
grant select, insert, update on public.vaults to authenticated;

-- Clients may never delete; anonymous visitors get nothing.
revoke delete on public.vaults from anon, authenticated;
revoke all on public.vaults from anon;
