
-- Master data tables for Alvasco ERP reference lists.
-- No auth yet → public read/write policies.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  industry text,
  contact_name text,
  phone text,
  email text,
  default_shipping_mode text check (default_shipping_mode in ('Air','Ocean','Local')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text,
  default_shipping_mode text check (default_shipping_mode in ('Air','Ocean','Local')),
  notes text,
  -- legacy id from in-memory seed (e.g. 'sup-freedom') so existing project
  -- records can reference suppliers by their legacy id during this transition
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  initials text not null unique,
  full_name text not null,
  role text check (role in ('Sales','Production','Finance','Admin','Mixed')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated-at triggers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_suppliers_updated on public.suppliers;
create trigger trg_suppliers_updated before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_team_updated on public.team_members;
create trigger trg_team_updated before update on public.team_members
  for each row execute function public.set_updated_at();
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- RLS: open to everyone (no auth yet, single shared workspace)
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.team_members enable row level security;
alter table public.products enable row level security;

create policy "Public read customers"   on public.customers   for select using (true);
create policy "Public write customers"  on public.customers   for insert with check (true);
create policy "Public update customers" on public.customers   for update using (true);
create policy "Public delete customers" on public.customers   for delete using (true);

create policy "Public read suppliers"   on public.suppliers   for select using (true);
create policy "Public write suppliers"  on public.suppliers   for insert with check (true);
create policy "Public update suppliers" on public.suppliers   for update using (true);
create policy "Public delete suppliers" on public.suppliers   for delete using (true);

create policy "Public read team"   on public.team_members for select using (true);
create policy "Public write team"  on public.team_members for insert with check (true);
create policy "Public update team" on public.team_members for update using (true);
create policy "Public delete team" on public.team_members for delete using (true);

create policy "Public read products"   on public.products  for select using (true);
create policy "Public write products"  on public.products  for insert with check (true);
create policy "Public update products" on public.products  for update using (true);
create policy "Public delete products" on public.products  for delete using (true);
