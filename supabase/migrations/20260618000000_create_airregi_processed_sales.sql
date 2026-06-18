create table public.airregi_processed_sales (
  id uuid primary key default gen_random_uuid(),
  csv_fingerprint text not null unique,
  source_filename text,
  processed_at timestamptz not null default now(),
  item_count integer not null default 0,
  total_quantity integer not null default 0,
  status text not null default 'processed',
  memo text,
  created_at timestamptz not null default now()
);

comment on table public.airregi_processed_sales is
  'AirRegi processed CSV import guard. Stores only minimum duplicate-check metadata, not CSV files or full sales data.';

comment on column public.airregi_processed_sales.id is
  'Unique row id.';

comment on column public.airregi_processed_sales.csv_fingerprint is
  'Unique fingerprint generated from normalized CSV sales summary to prevent duplicate imports.';

comment on column public.airregi_processed_sales.source_filename is
  'Original CSV file name for human confirmation. The CSV file itself is not stored.';

comment on column public.airregi_processed_sales.processed_at is
  'Time when the CSV was applied to inventory.';

comment on column public.airregi_processed_sales.item_count is
  'Number of product rows included in the processed CSV summary.';

comment on column public.airregi_processed_sales.total_quantity is
  'Total sold quantity included in the processed CSV summary.';

comment on column public.airregi_processed_sales.status is
  'Processing status. Default is processed.';

comment on column public.airregi_processed_sales.memo is
  'Optional operator note.';

comment on column public.airregi_processed_sales.created_at is
  'Time when this duplicate-check record was created.';
