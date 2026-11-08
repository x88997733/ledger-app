create table if not exists public.ledger_docs(
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,id));
alter table public.ledger_docs enable row level security;
create policy "own rows select" on public.ledger_docs for select using (auth.uid()=user_id);
create policy "own rows insert" on public.ledger_docs for insert with check (auth.uid()=user_id);
create policy "own rows update" on public.ledger_docs for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own rows delete" on public.ledger_docs for delete using (auth.uid()=user_id);
