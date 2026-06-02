import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Database,
  Download,
  FileDown,
  List,
  Minus,
  PackagePlus,
  Plus,
  Pencil,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react'
import { createWorker, OEM } from 'tesseract.js'
import { hasSupabaseConfig, supabase } from './lib/supabaseClient'
import { buildAirRegiCsv, getInventoryStatus, sortInventory, todayText } from './lib/inventory'
import {
  extractExpiryDateFromOcr,
  getExpiryDateCandidatesFromOcr,
  getProductNameCandidatesFromOcr,
  matchProductNameFromOcr,
} from './lib/ocr'

const TABLE_NAME = 'tea_inventory'
const OCR_PHOTO_MAX_SIDE = 2000
const OCR_PHOTO_TARGET_SIDE = 1800
const OCR_PHOTO_CONTRAST = 1.08
const OCR_PHOTO_BRIGHTNESS = 6

const views = [
  { id: 'register', label: '入荷登録', icon: PackagePlus },
  { id: 'list', label: '在庫一覧', icon: List },
  { id: 'csv', label: 'CSV出力', icon: FileDown },
]

const productNameOptions = [
  '味娘　100g袋',
  '味娘　200g袋',
  'かたらい　200g袋',
  'かたらい　500g袋',
  '伊勢深むし茶ティーバッグ30個入',
  '緑茶ティーバッグ50個入',
  'かりがねほうじ茶150ｇ袋',
  '深蒸しほうじ茶ティーバッグ20入',
]

const initialForm = () => ({
  product_name: '',
  product_code: '',
  arrival_date: todayText(),
  expiry_date: '',
  quantity: '',
  reorder_level: 5,
  memo: '',
})

export default function App() {
  const [activeView, setActiveView] = useState('register')
  const [inventory, setInventory] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({
    product_name: '',
    expiry_date: '',
    quantity: 0,
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [ocrState, setOcrState] = useState({
    busy: false,
    progress: 0,
    text: '',
    notice: '',
    productCandidates: [],
    expiryDateCandidates: [],
  })

  const loadInventory = useCallback(async () => {
    if (!hasSupabaseConfig) return

    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('expiry_date', { ascending: true })
      .order('arrival_date', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setInventory(data ?? [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  const enrichedInventory = useMemo(
    () =>
      sortInventory(inventory).map((item) => ({
        ...item,
        status: getInventoryStatus(item),
      })),
    [inventory],
  )

  const alertItems = enrichedInventory.filter((item) => item.status.isAlert)
  const expiringCount = enrichedInventory.filter((item) =>
    item.status.labels.includes('賞味期限注意'),
  ).length
  const lowStockCount = enrichedInventory.filter((item) => item.status.labels.includes('在庫少')).length
  const totalQuantity = enrichedInventory.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!hasSupabaseConfig) {
      setError('.env.localにSupabaseの接続情報を設定してください。')
      return
    }

    if (!form.product_name.trim() || !form.expiry_date) {
      setError('\u5546\u54c1\u540d\u3001\u8cde\u5473\u671f\u9650\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002')
      return
    }

    const quantityText = String(form.quantity).trim()

    if (quantityText === '') {
      setError('在庫数を入力してください。')
      return
    }

    const quantityValue = Number(quantityText)

    if (Number.isNaN(quantityValue) || quantityValue < 0) {
      setError('在庫数には0以上の数字を入力してください。')
      return
    }

    setSaving(true)

    const payload = {
      product_name: form.product_name.trim(),
      product_code: form.product_code.trim(),
      arrival_date: form.arrival_date,
      expiry_date: form.expiry_date,
      quantity: quantityValue,
      reorder_level: Number(form.reorder_level || 5),
      memo: form.memo.trim(),
    }

    const { error: insertError } = await supabase.from(TABLE_NAME).insert(payload)

    if (insertError) {
      setError(insertError.message)
    } else {
      setMessage('入荷を登録しました。')
      setForm(initialForm())
      setOcrState({
        busy: false,
        progress: 0,
        text: '',
        notice: '',
        productCandidates: [],
        expiryDateCandidates: [],
      })
      await loadInventory()
      setActiveView('list')
    }

    setSaving(false)
  }

  async function handleOcrBlob(imageBlob) {
    if (!imageBlob) return

    setMessage('')
    setError('')
    setOcrState({
      busy: true,
      progress: 0,
      text: '',
      notice: 'OCR処理中です。画像は保存しません。',
      productCandidates: [],
      expiryDateCandidates: [],
    })

    let worker = null

    try {
      worker = await createWorker(['jpn', 'eng'], OEM.LSTM_ONLY, {
        logger: (log) => {
          if (log.status === 'recognizing text' && typeof log.progress === 'number') {
            setOcrState((current) => ({
              ...current,
              progress: Math.round(log.progress * 100),
            }))
          }
        },
      })

      const result = await worker.recognize(imageBlob)
      const text = result.data.text || ''
      const productCandidates = getProductNameCandidatesFromOcr(text, productNameOptions)
      const expiryDateCandidates = getExpiryDateCandidatesFromOcr(text)
      const matchedProductName = matchProductNameFromOcr(text, productNameOptions)
      const expiryDate = extractExpiryDateFromOcr(text)
      const applied = []
      const formUpdates = {}

      if (matchedProductName) {
        formUpdates.product_name = matchedProductName
        applied.push('商品名')
      }

      if (expiryDate) {
        formUpdates.expiry_date = expiryDate
        applied.push('賞味期限')
      }

      if (applied.length) {
        setForm((current) => ({ ...current, ...formUpdates }))
      }

      setOcrState({
        busy: false,
        progress: 100,
        text,
        productCandidates,
        expiryDateCandidates,
        notice: applied.length
          ? `${applied.join('・')}を仮入力しました。確認してから登録してください。`
          : '読み取りましたが自動入力できませんでした。手入力で修正してください。',
      })
    } catch (ocrError) {
      setOcrState({
        busy: false,
        progress: 0,
        text: '',
        notice: 'OCRに失敗しました。手入力で登録できます。',
        productCandidates: [],
        expiryDateCandidates: [],
      })
      setError(ocrError instanceof Error ? ocrError.message : 'OCRに失敗しました。')
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {})
      }
    }
  }

  async function updateQuantity(item, nextQuantity) {
    if (!hasSupabaseConfig || nextQuantity < 0) return

    setUpdatingId(item.id)
    setError('')
    setMessage('')

    const previousInventory = inventory
    setInventory((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, quantity: nextQuantity } : entry)),
    )

    const { error: updateError } = await supabase
      .from(TABLE_NAME)
      .update({ quantity: nextQuantity })
      .eq('id', item.id)

    if (updateError) {
      setInventory(previousInventory)
      setError(updateError.message)
    } else {
      setMessage('在庫数を更新しました。')
    }

    setUpdatingId(null)
  }


  function requestEditItem(item) {
    setMessage('')
    setError('')
    setEditTarget(item)
    setEditForm({
      product_name: item.product_name ?? '',
      expiry_date: item.expiry_date ?? '',
      quantity: Number(item.quantity ?? 0),
    })
  }

  function cancelEditItem() {
    if (editingId) return
    setEditTarget(null)
  }

  function updateEditForm(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  async function confirmEditItem(event) {
    event.preventDefault()
    if (!hasSupabaseConfig || !editTarget) return

    const nextQuantity = Number(editForm.quantity)

    if (!editForm.product_name || !editForm.expiry_date || Number.isNaN(nextQuantity) || nextQuantity < 0) {
      setError('\u5546\u54c1\u540d\u3001\u8cde\u5473\u671f\u9650\u3001\u5728\u5eab\u6570\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002')
      return
    }

    setEditingId(editTarget.id)
    setMessage('')
    setError('')

    const { error: updateError } = await supabase
      .from(TABLE_NAME)
      .update({
        product_name: editForm.product_name,
        expiry_date: editForm.expiry_date,
        quantity: nextQuantity,
      })
      .eq('id', editTarget.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('\u5728\u5eab\u30c7\u30fc\u30bf\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f\u3002')
      setEditTarget(null)
      await loadInventory()
    }

    setEditingId(null)
  }

  function requestDeleteItem(item) {
    setMessage('')
    setError('')
    setDeleteTarget(item)
  }

  function cancelDeleteItem() {
    if (deletingId) return
    setDeleteTarget(null)
  }

  async function confirmDeleteItem() {
    if (!hasSupabaseConfig || !deleteTarget) return

    setDeletingId(deleteTarget.id)
    setMessage('')
    setError('')

    const { error: deleteError } = await supabase.from(TABLE_NAME).delete().eq('id', deleteTarget.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setMessage('在庫データを削除しました。')
      setDeleteTarget(null)
      await loadInventory()
    }

    setDeletingId(null)
  }

  function downloadCsv() {
    const csv = buildAirRegiCsv(enrichedInventory)
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `tea-inventory-airregi-${todayText()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Tea Inventory</p>
          <h1>お茶在庫管理</h1>
        </div>
        <div className={`connection-chip ${hasSupabaseConfig ? 'is-connected' : 'is-missing'}`}>
          {hasSupabaseConfig ? <Database size={18} /> : <WifiOff size={18} />}
          {hasSupabaseConfig ? 'Supabase接続' : '未設定'}
        </div>
      </header>

      {!hasSupabaseConfig && (
        <section className="notice-panel danger">
          <WifiOff size={22} />
          <div>
            <strong>接続情報が未設定です</strong>
            <p>.env.localにVITE_SUPABASE_URLとVITE_SUPABASE_PUBLISHABLE_KEYを設定してください。</p>
          </div>
        </section>
      )}

      {(message || error) && (
        <div className={`toast ${error ? 'error' : 'success'}`}>{error || message}</div>
      )}

      <section className="summary-grid" aria-label="在庫サマリー">
        <SummaryTile label="登録商品" value={`${enrichedInventory.length} 件`} />
        <SummaryTile label="総在庫" value={`${totalQuantity} 個`} />
        <SummaryTile label="期限注意" value={`${expiringCount} 件`} tone={expiringCount ? 'warning' : ''} />
        <SummaryTile label="在庫少" value={`${lowStockCount} 件`} tone={lowStockCount ? 'danger' : ''} />
      </section>


      {editTarget && (
        <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-confirm-title">
          <form className="confirm-dialog edit-dialog" onSubmit={confirmEditItem}>
            <h2 id="edit-confirm-title">{'\u5728\u5eab\u30c7\u30fc\u30bf\u3092\u7de8\u96c6'}</h2>
            <label>
              <span>{'\u5546\u54c1\u540d'}</span>
              <select
                value={editForm.product_name}
                onChange={(event) => updateEditForm('product_name', event.target.value)}
                required
              >
                <option value="">{'\u5546\u54c1\u540d\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044'}</option>
                {productNameOptions.map((productName) => (
                  <option key={productName} value={productName}>
                    {productName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{'\u8cde\u5473\u671f\u9650'}</span>
              <input
                type="date"
                value={editForm.expiry_date}
                onChange={(event) => updateEditForm('expiry_date', event.target.value)}
                required
              />
            </label>
            <label>
              <span>{'\u5728\u5eab\u6570'}</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={editForm.quantity}
                onChange={(event) => updateEditForm('quantity', event.target.value)}
                required
              />
            </label>
            <div className="confirm-actions">
              <button className="primary-button" type="submit" disabled={Boolean(editingId)}>
                {editingId ? '\u66f4\u65b0\u4e2d...' : '\u66f4\u65b0\u3059\u308b'}
              </button>
              <button className="icon-text-button" type="button" onClick={cancelEditItem} disabled={Boolean(editingId)}>
                {'\u30ad\u30e3\u30f3\u30bb\u30eb'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div className="confirm-dialog">
            <h2 id="delete-confirm-title">この在庫データを削除しますか？</h2>
            <p>{deleteTarget.product_name}</p>
            <div className="confirm-actions">
              <button className="danger-button" type="button" onClick={confirmDeleteItem} disabled={Boolean(deletingId)}>
                {deletingId ? '削除中...' : '削除する'}
              </button>
              <button className="icon-text-button" type="button" onClick={cancelDeleteItem} disabled={Boolean(deletingId)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="main-content">
        {activeView === 'register' && (
          <RegisterView
            form={form}
            ocrState={ocrState}
            saving={saving}
            onChange={updateForm}
            onOcrBlob={handleOcrBlob}
            onSubmit={handleSubmit}
          />
        )}

        {activeView === 'list' && (
          <InventoryView
            alertItems={alertItems}
            items={enrichedInventory}
            loading={loading}
            updatingId={updatingId}
            deletingId={deletingId}
            editingId={editingId}
            onRefresh={loadInventory}
            onUpdateQuantity={updateQuantity}
            onRequestEdit={requestEditItem}
            onRequestDelete={requestDeleteItem}
          />
        )}

        {activeView === 'csv' && (
          <CsvView items={enrichedInventory} loading={loading} onRefresh={loadInventory} onDownload={downloadCsv} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="画面切り替え">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={activeView === id ? 'active' : ''}
            onClick={() => setActiveView(id)}
            aria-current={activeView === id ? 'page' : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function RegisterView({ form, ocrState, saving, onChange, onOcrBlob, onSubmit }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => () => stopCameraStream(), [])

  useEffect(() => {
    if (!cameraActive || !streamRef.current || !videoRef.current) {
      return undefined
    }

    let cancelled = false
    const video = videoRef.current

    async function startPreview() {
      try {
        setCameraReady(false)
        video.srcObject = streamRef.current
        video.muted = true
        video.playsInline = true
        await video.play()

        if (!cancelled) {
          setCameraReady(true)
        }
      } catch {
        if (!cancelled) {
          setCameraError('カメラ映像を表示できませんでした。閉じてもう一度試してください。')
          stopCameraStream()
        }
      }
    }

    startPreview()

    return () => {
      cancelled = true
    }
  }, [cameraActive])

  async function openCamera() {
    setCameraError('')
    setCameraReady(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('この端末ではカメラを起動できません。HTTPS公開後にもう一度試してください。')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      setCameraActive(true)
    } catch {
      setCameraError('カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。')
      stopCameraStream()
    }
  }

  async function captureLabel() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) return
    if (!cameraReady || !video.videoWidth || !video.videoHeight) {
      setCameraError('カメラ映像の準備中です。少し待ってから撮影してください。')
      return
    }

    setCameraError('')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    let temporaryBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88)
    })

    canvas.width = 0
    canvas.height = 0
    stopCameraStream()

    try {
      await onOcrBlob(temporaryBlob)
    } finally {
      temporaryBlob = null
    }
  }


  function openPhotoPicker() {
    fileInputRef.current?.click()
  }


  async function preparePhotoForOcr(imageFile) {
    const canvas = canvasRef.current
    if (!canvas || typeof createImageBitmap !== 'function') return imageFile

    let bitmap = null

    try {
      bitmap = await createImageBitmap(imageFile, { imageOrientation: 'from-image' })
    } catch {
      bitmap = await createImageBitmap(imageFile)
    }

    try {
      const longestSide = Math.max(bitmap.width, bitmap.height)
      const scale = longestSide > OCR_PHOTO_MAX_SIDE ? OCR_PHOTO_TARGET_SIDE / longestSide : 1
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')

      if (!context) return imageFile

      canvas.width = width
      canvas.height = height
      context.drawImage(bitmap, 0, 0, width, height)
      enhancePhotoForOcr(context, width, height)

      const preparedBlob = await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
      })

      return preparedBlob ?? imageFile
    } finally {
      canvas.width = 0
      canvas.height = 0
      bitmap?.close?.()
    }
  }

  function enhancePhotoForOcr(context, width, height) {
    try {
      const imageData = context.getImageData(0, 0, width, height)
      const data = imageData.data

      for (let index = 0; index < data.length; index += 4) {
        data[index] = clampOcrChannel((data[index] - 128) * OCR_PHOTO_CONTRAST + 128 + OCR_PHOTO_BRIGHTNESS)
        data[index + 1] = clampOcrChannel((data[index + 1] - 128) * OCR_PHOTO_CONTRAST + 128 + OCR_PHOTO_BRIGHTNESS)
        data[index + 2] = clampOcrChannel((data[index + 2] - 128) * OCR_PHOTO_CONTRAST + 128 + OCR_PHOTO_BRIGHTNESS)
      }

      context.putImageData(imageData, 0, 0)
    } catch {
      // Some browsers may block pixel access for unusual image sources; OCR can still use the drawn image.
    }
  }

  function clampOcrChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)))
  }

  async function handlePhotoFile(event) {
    let temporaryFile = event.target.files?.[0] ?? null
    event.target.value = ''

    if (!temporaryFile) return

    setCameraError('')
    stopCameraStream()

    let temporaryBlob = null

    try {
      temporaryBlob = await preparePhotoForOcr(temporaryFile)
      await onOcrBlob(temporaryBlob)
    } finally {
      temporaryBlob = null
      temporaryFile = null
    }
  }

  function stopCameraStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraActive(false)
    setCameraReady(false)
  }

  return (
    <section className="screen-panel">
      <div className="section-heading">
        <PackagePlus size={24} />
        <h2>入荷登録</h2>
      </div>

      <section className="ocr-panel" aria-label="ラベルOCR">
        <div>
          <h3>ラベル撮影</h3>
          <p>画像は保存せず、商品名と賞味期限の読み取りだけに使います。</p>
        </div>

        <input
          ref={fileInputRef}
          className="file-input-hidden"
          type="file"
          accept="image/*"
          onChange={handlePhotoFile}
        />

        {!cameraActive ? (
          <div className="ocr-action-grid">
            <button
              className="camera-button"
              type="button"
              disabled={ocrState.busy}
              onClick={openCamera}
            >
              <Camera size={22} />
              {ocrState.busy ? '\u8aad\u307f\u53d6\u308a\u4e2d...' : '\u30ab\u30e1\u30e9\u3092\u8d77\u52d5'}
            </button>
            <button
              className="photo-button"
              type="button"
              disabled={ocrState.busy}
              onClick={openPhotoPicker}
            >
              <Upload size={22} />
              {'\u5199\u771f\u304b\u3089\u8aad\u307f\u53d6\u308b'}
            </button>
          </div>
        ) : (
          <div className="camera-capture">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="camera-actions">
              <button className="primary-button" type="button" onClick={captureLabel} disabled={!cameraReady}>
                <Camera size={22} />
                {cameraReady ? '撮影して読み取り' : 'カメラ準備中'}
              </button>
              <button className="icon-text-button" type="button" onClick={stopCameraStream}>
                閉じる
              </button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="camera-canvas" aria-hidden="true" />

        {ocrState.busy && (
          <div className="ocr-progress" aria-label="OCR進行状況">
            <span style={{ width: `${ocrState.progress}%` }} />
          </div>
        )}

        {cameraError && <p className="ocr-notice error">{cameraError}</p>}
        {cameraActive && !cameraReady && !cameraError && <p className="ocr-notice">カメラ映像を準備中です。</p>}
        {ocrState.notice && <p className="ocr-notice">{ocrState.notice}</p>}

        {(ocrState.productCandidates?.length > 0 || ocrState.expiryDateCandidates?.length > 0) && (
          <div className="ocr-result">
            {ocrState.productCandidates?.length > 0 && (
              <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
                <p>{'商品名候補'}</p>
                {ocrState.productCandidates.map((candidate) => (
                  <button
                    className="icon-text-button"
                    type="button"
                    key={candidate.name}
                    onClick={() => onChange('product_name', candidate.name)}
                  >
                    {candidate.name}
                  </button>
                ))}
              </div>
            )}

            {ocrState.expiryDateCandidates?.length > 0 && (
              <div style={{ display: 'grid', gap: '8px' }}>
                <p>{'賞味期限候補'}</p>
                {ocrState.expiryDateCandidates.map((candidate) => (
                  <button
                    className="icon-text-button"
                    type="button"
                    key={candidate.value}
                    onClick={() => onChange('expiry_date', candidate.value)}
                  >
                    {candidate.value}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {ocrState.text && (
          <details className="ocr-result">
            <summary>読み取り文字を確認</summary>
            <pre>{ocrState.text}</pre>
          </details>
        )}
      </section>

      <form className="entry-form" onSubmit={onSubmit}>
        <label>
          <span>商品名</span>
          <select
            value={form.product_name}
            onChange={(event) => onChange('product_name', event.target.value)}
            autoComplete="off"
            required
          >
            <option value="">商品名を選択</option>
            {productNameOptions.map((productName) => (
              <option key={productName} value={productName}>
                {productName}
              </option>
            ))}
          </select>
        </label>


        <div className="form-row">
          <label>
            <span>入荷日</span>
            <input
              type="date"
              value={form.arrival_date}
              onChange={(event) => onChange('arrival_date', event.target.value)}
              required
            />
          </label>

          <label>
            <span>賞味期限</span>
            <input
              type="date"
              value={form.expiry_date}
              onChange={(event) => onChange('expiry_date', event.target.value)}
              required
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            <span>在庫数</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={form.quantity}
              onChange={(event) => onChange('quantity', event.target.value)}
            />
          </label>

          <label>
            <span>発注基準数</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={form.reorder_level}
              onChange={(event) => onChange('reorder_level', event.target.value)}
            />
          </label>
        </div>

        <label>
          <span>メモ</span>
          <textarea
            value={form.memo}
            onChange={(event) => onChange('memo', event.target.value)}
            placeholder="仕入先、棚番号、ロットなど"
            rows="4"
          />
        </label>

        <button className="primary-button" type="submit" disabled={saving}>
          <Save size={22} />
          {saving ? '登録中...' : '入荷を登録'}
        </button>
      </form>
    </section>
  )
}

function InventoryView({
  alertItems,
  items,
  loading,
  updatingId,
  deletingId,
  editingId,
  onRefresh,
  onUpdateQuantity,
  onRequestEdit,
  onRequestDelete,
}) {
  return (
    <section className="screen-panel">
      <div className="section-heading with-action">
        <div>
          <div className="heading-line">
            <AlertTriangle size={24} />
            <h2>警告一覧</h2>
          </div>
          <p>{alertItems.length ? `${alertItems.length}件の確認が必要です` : '警告はありません'}</p>
        </div>
        <button className="icon-text-button" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={20} />
          更新
        </button>
      </div>

      {alertItems.length > 0 && (
        <div className="inventory-list compact">
          {alertItems.map((item) => (
            <InventoryCard
              key={`alert-${item.id}`}
              item={item}
              updating={updatingId === item.id}
              deleting={deletingId === item.id}
              editing={editingId === item.id}
              onUpdateQuantity={onUpdateQuantity}
              onRequestEdit={onRequestEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      )}

      <div className="section-heading inventory-heading">
        <List size={24} />
        <h2>在庫一覧</h2>
      </div>

      {loading ? (
        <div className="empty-state">読み込み中...</div>
      ) : items.length ? (
        <div className="inventory-list">
          {items.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              updating={updatingId === item.id}
              deleting={deletingId === item.id}
              editing={editingId === item.id}
              onUpdateQuantity={onUpdateQuantity}
              onRequestEdit={onRequestEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">在庫データがありません</div>
      )}
    </section>
  )
}

function InventoryCard({ item, updating, deleting, editing, onUpdateQuantity, onRequestEdit, onRequestDelete }) {
  const status = item.status
  const nextMinus = Math.max(0, Number(item.quantity) - 1)
  const nextPlus = Number(item.quantity) + 1

  return (
    <article className={`inventory-card ${status.tone}`}>
      <div className="card-topline">
        <div>
          <h3>{item.product_name}</h3>
        </div>
        <div className="badge-row">
          {status.labels.map((label) => (
            <span key={label} className={`badge ${status.tone}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>入荷日</dt>
          <dd>{item.arrival_date}</dd>
        </div>
        <div>
          <dt>賞味期限</dt>
          <dd>{item.expiry_date}</dd>
        </div>
        <div>
          <dt>発注基準</dt>
          <dd>{item.reorder_level} 個</dd>
        </div>
        <div>
          <dt>状態</dt>
          <dd>{status.detail}</dd>
        </div>
      </dl>

      <div className="quantity-control">
        <button
          type="button"
          className="step-button"
          onClick={() => onUpdateQuantity(item, nextMinus)}
          disabled={updating || Number(item.quantity) <= 0}
          aria-label={`${item.product_name}の在庫を1個減らす`}
        >
          <Minus size={20} />
        </button>
        <div className="quantity-display">
          <span>{item.quantity}</span>
          <small>個</small>
        </div>
        <button
          type="button"
          className="step-button"
          onClick={() => onUpdateQuantity(item, nextPlus)}
          disabled={updating}
          aria-label={`${item.product_name}の在庫を1個増やす`}
        >
          <Plus size={20} />
        </button>
      </div>

      {item.memo && <p className="memo-text">{item.memo}</p>}

      <div className="card-actions">
        <button
          className="edit-item-button"
          type="button"
          onClick={() => onRequestEdit(item)}
          disabled={updating || deleting || editing}
        >
          <Pencil size={18} />
          {editing ? '\u7de8\u96c6\u4e2d...' : '\u7de8\u96c6'}
        </button>
        <button
          className="delete-item-button"
          type="button"
          onClick={() => onRequestDelete(item)}
          disabled={updating || deleting || editing}
        >
          <Trash2 size={18} />
          {deleting ? '\u524a\u9664\u4e2d...' : '\u524a\u9664'}
        </button>
      </div>
    </article>
  )
}

function CsvView({ items, loading, onRefresh, onDownload }) {
  const previewItems = items.slice(0, 6)

  return (
    <section className="screen-panel">
      <div className="section-heading with-action">
        <div>
          <div className="heading-line">
            <FileDown size={24} />
            <h2>CSV出力</h2>
          </div>
          <p>{items.length}件をAirレジ用の列で出力します</p>
        </div>
        <button className="icon-text-button" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={20} />
          更新
        </button>
      </div>

      <button className="primary-button" type="button" onClick={onDownload} disabled={!items.length}>
        <Download size={22} />
        CSVをダウンロード
      </button>

      <div className="csv-preview" aria-label="CSVプレビュー">
        <div className="csv-row head">
          <span>商品名</span>
          <span>現在在庫数</span>
          <span>更新在庫数</span>
        </div>
        {previewItems.length ? (
          previewItems.map((item) => (
            <div className="csv-row" key={`csv-${item.id}`}>
              <span>{item.product_name}</span>
              <span>{item.quantity}</span>
              <span>{item.quantity}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">出力できる在庫データがありません</div>
        )}
      </div>

      <p className="csv-note">更新種別は「棚卸し・在庫確認」、更新メモは登録メモを使用します。</p>
    </section>
  )
}

function SummaryTile({ label, value, tone = '' }) {
  return (
    <div className={`summary-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
