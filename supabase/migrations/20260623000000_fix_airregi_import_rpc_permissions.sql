-- Fix AirRegi CSV import RPC wrapper permissions.
-- The public wrapper must run with its owner privileges so it can call the
-- private implementation while anon/authenticated cannot call the private
-- implementation directly.

create or replace function public.apply_airregi_csv_import(
  p_csv_fingerprint text,
  p_source_filename text,
  p_items jsonb,
  p_memo text default null
)
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.apply_airregi_csv_import_impl(
    p_csv_fingerprint,
    p_source_filename,
    p_items,
    p_memo
  );
$$;

revoke all
on function private.apply_airregi_csv_import_impl(text, text, jsonb, text)
from public, anon, authenticated;

revoke all
on function public.apply_airregi_csv_import(text, text, jsonb, text)
from public;

grant execute
on function public.apply_airregi_csv_import(text, text, jsonb, text)
to anon, authenticated;