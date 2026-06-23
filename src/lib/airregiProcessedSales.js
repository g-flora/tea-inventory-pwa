import { hasSupabaseConfig, supabase } from './supabaseClient'

const TABLE_NAME = 'airregi_processed_sales'

export async function checkAirRegiProcessedCsv(csvFingerprint) {
  if (!csvFingerprint) {
    return {
      checked: false,
      exists: false,
      record: null,
      message: 'csv_fingerprint is missing.',
    }
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      checked: false,
      exists: false,
      record: null,
      message: 'Supabase connection is not configured.',
    }
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('csv_fingerprint, processed_at, status')
    .eq('csv_fingerprint', csvFingerprint)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const exists = Boolean(data)

  return {
    checked: true,
    exists,
    record: data ?? null,
    message: exists ? '反映済みCSVです' : '未反映CSVです',
  }
}

export async function applyAirRegiCsvImport({ csvFingerprint, sourceFilename, items, memo = '' }) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase connection is not configured.')
  }

  if (!csvFingerprint) {
    throw new Error('csv_fingerprint is required')
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items are required')
  }

  const payloadItems = items.map((item) => ({
    productName: item.productName,
    quantity: Number(item.quantity),
    isMapped: true,
  }))

  const { data, error } = await supabase.rpc('apply_airregi_csv_import', {
    p_csv_fingerprint: csvFingerprint,
    p_source_filename: sourceFilename ?? '',
    p_items: payloadItems,
    p_memo: memo,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}