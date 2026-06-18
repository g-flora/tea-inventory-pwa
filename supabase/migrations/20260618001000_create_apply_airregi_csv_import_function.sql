create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

alter table public.airregi_processed_sales enable row level security;

revoke insert, update, delete on table public.airregi_processed_sales from anon, authenticated;
grant select on table public.airregi_processed_sales to anon, authenticated;
grant all on table public.airregi_processed_sales to service_role;

drop policy if exists "Allow public read processed sales fingerprints"
  on public.airregi_processed_sales;

create policy "Allow public read processed sales fingerprints"
on public.airregi_processed_sales
for select
to anon, authenticated
using (true);

create or replace function private.apply_airregi_csv_import_impl(
  p_csv_fingerprint text,
  p_source_filename text,
  p_items jsonb,
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_stock record;
  v_remaining integer;
  v_reduce integer;
  v_available integer;
  v_item_count integer;
  v_total_quantity integer;
begin
  if nullif(trim(p_csv_fingerprint), '') is null then
    raise exception 'csv_fingerprint is required';
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items are required';
  end if;

  if exists (
    select 1
    from public.airregi_processed_sales
    where csv_fingerprint = p_csv_fingerprint
  ) then
    raise exception 'csv already processed';
  end if;

  drop table if exists pg_temp.airregi_import_raw;
  drop table if exists pg_temp.airregi_import_items;

  create temporary table airregi_import_raw (
    product_name text not null,
    quantity integer not null check (quantity > 0)
  ) on commit drop;

  insert into pg_temp.airregi_import_raw (product_name, quantity)
  select
    trim(item->>'productName') as product_name,
    (item->>'quantity')::integer as quantity
  from jsonb_array_elements(p_items) as item
  where
    jsonb_typeof(item) = 'object'
    and item @> '{"isMapped": true}'::jsonb
    and trim(coalesce(item->>'productName', '')) <> ''
    and coalesce(item->>'quantity', '') ~ '^[0-9]+$'
    and (item->>'quantity')::integer > 0;

  if (select count(*) from pg_temp.airregi_import_raw) <> jsonb_array_length(p_items) then
    raise exception 'invalid item or quantity';
  end if;

  create temporary table airregi_import_items (
    product_name text not null,
    quantity integer not null check (quantity > 0)
  ) on commit drop;

  insert into pg_temp.airregi_import_items (product_name, quantity)
  select product_name, sum(quantity)::integer
  from pg_temp.airregi_import_raw
  group by product_name;

  select count(*), coalesce(sum(quantity), 0)
  into v_item_count, v_total_quantity
  from pg_temp.airregi_import_items;

  for v_item in
    select product_name, quantity
    from pg_temp.airregi_import_items
  loop
    perform 1
    from public.tea_inventory
    where product_name = v_item.product_name
    order by expiry_date asc, arrival_date asc, id asc
    for update;

    select coalesce(sum(quantity), 0)
    into v_available
    from public.tea_inventory
    where product_name = v_item.product_name;

    if v_available < v_item.quantity then
      raise exception 'insufficient stock: %', v_item.product_name;
    end if;
  end loop;

  for v_item in
    select product_name, quantity
    from pg_temp.airregi_import_items
  loop
    v_remaining := v_item.quantity;

    for v_stock in
      select id, quantity
      from public.tea_inventory
      where product_name = v_item.product_name
        and quantity > 0
      order by expiry_date asc, arrival_date asc, id asc
      for update
    loop
      v_reduce := least(v_stock.quantity, v_remaining);

      update public.tea_inventory
      set quantity = quantity - v_reduce
      where id = v_stock.id;

      v_remaining := v_remaining - v_reduce;
      exit when v_remaining = 0;
    end loop;
  end loop;

  insert into public.airregi_processed_sales (
    csv_fingerprint,
    source_filename,
    item_count,
    total_quantity,
    status,
    memo
  )
  values (
    p_csv_fingerprint,
    nullif(trim(coalesce(p_source_filename, '')), ''),
    v_item_count,
    v_total_quantity,
    'processed',
    nullif(trim(coalesce(p_memo, '')), '')
  );

  return jsonb_build_object(
    'ok', true,
    'item_count', v_item_count,
    'total_quantity', v_total_quantity
  );
end;
$$;

revoke all on function private.apply_airregi_csv_import_impl(text, text, jsonb, text)
  from public;
grant execute on function private.apply_airregi_csv_import_impl(text, text, jsonb, text)
  to anon, authenticated;

create or replace function public.apply_airregi_csv_import(
  p_csv_fingerprint text,
  p_source_filename text,
  p_items jsonb,
  p_memo text default null
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select private.apply_airregi_csv_import_impl(
    p_csv_fingerprint,
    p_source_filename,
    p_items,
    p_memo
  );
$$;

revoke all on function public.apply_airregi_csv_import(text, text, jsonb, text)
  from public;
grant execute on function public.apply_airregi_csv_import(text, text, jsonb, text)
  to anon, authenticated;
