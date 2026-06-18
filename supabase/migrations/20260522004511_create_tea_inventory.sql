create table if not exists public.tea_inventory (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  product_code text not null,
  arrival_date date not null,
  expiry_date date not null,
  quantity integer not null default 0 check (quantity >= 0),
  reorder_level integer not null default 5 check (reorder_level >= 0),
  memo text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists tea_inventory_product_code_idx on public.tea_inventory (product_code);
create index if not exists tea_inventory_expiry_date_idx on public.tea_inventory (expiry_date);
create index if not exists tea_inventory_quantity_idx on public.tea_inventory (quantity);

create or replace function public.set_tea_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tea_inventory_updated_at on public.tea_inventory;
create trigger set_tea_inventory_updated_at
before update on public.tea_inventory
for each row
execute function public.set_tea_inventory_updated_at();

alter table public.tea_inventory enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tea_inventory'
      and policyname = 'Allow public read tea inventory'
  ) then
    create policy "Allow public read tea inventory"
      on public.tea_inventory
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tea_inventory'
      and policyname = 'Allow public insert tea inventory'
  ) then
    create policy "Allow public insert tea inventory"
      on public.tea_inventory
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tea_inventory'
      and policyname = 'Allow public update tea inventory'
  ) then
    create policy "Allow public update tea inventory"
      on public.tea_inventory
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tea_inventory'
      and policyname = 'Allow public delete tea inventory'
  ) then
    create policy "Allow public delete tea inventory"
      on public.tea_inventory
      for delete
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select, insert, update, delete on table public.tea_inventory to anon, authenticated;
grant all on table public.tea_inventory to service_role;;
