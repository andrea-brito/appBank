-- appBank: exchange-rate e-mail alert. Run once in Supabase > SQL Editor
-- (after schema.sql). One alert per user.
--
-- Unlike `vaults`, this row is NOT end-to-end encrypted: the scheduled Edge
-- Function (functions/rate-alert) must read the pair and target to compare
-- them with the market. It holds no financial data of the user, only "which
-- quote" and "at what price to warn".

create table if not exists public.rate_alerts (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pair text not null default 'EUR-BRL' check (pair in ('EUR-BRL', 'EUR-BRLT', 'USD-BRL', 'USD-BRLT')),
  target_cents integer not null check (target_cents between 1 and 100000), -- R$ 6,00 = 600
  enabled boolean not null default true,
  -- Written only by the Edge Function (service role):
  was_below boolean not null default false,    -- avoids one e-mail per check while below target
  last_rate numeric(12, 4),
  last_checked_at timestamptz,
  last_notified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.rate_alerts enable row level security;

drop policy if exists "own alert" on public.rate_alerts;
create policy "own alert" on public.rate_alerts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The app may only set what the user chooses; the bookkeeping columns stay
-- server-side (column-level grants).
revoke all on public.rate_alerts from anon, authenticated;
grant select on public.rate_alerts to authenticated;
grant insert (pair, target_cents, enabled, updated_at) on public.rate_alerts to authenticated;
grant update (pair, target_cents, enabled, updated_at, was_below) on public.rate_alerts to authenticated;
