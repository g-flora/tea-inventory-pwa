revoke insert, update, delete, truncate, references, trigger
on table public.airregi_processed_sales
from anon, authenticated;

grant select
on table public.airregi_processed_sales
to anon, authenticated;

revoke all
on function private.apply_airregi_csv_import_impl(text, text, jsonb, text)
from public, anon, authenticated;

revoke all
on function public.apply_airregi_csv_import(text, text, jsonb, text)
from public;

grant execute
on function public.apply_airregi_csv_import(text, text, jsonb, text)
to anon, authenticated;