import { hasSupabaseConfig, supabase } from './supabaseClient'

const TABLE_NAME = 'airregi_processed_sales'

export async function checkAirRegiProcessedCsv(csvFingerprint) {
  if (!csvFingerprint) {
    return {
      checked: false,
      exists: false,
      record: null,
      message: 'CSVの識別情報を作成できませんでした。',
    }
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      checked: false,
      exists: false,
      record: null,
      message: 'Supabase接続情報が未設定のため、二重取り込み確認は未実行です。',
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
