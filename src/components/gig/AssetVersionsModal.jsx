import { useEffect, useRef, useState } from 'react'
import { Loader2, Eye, Download, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { formatBytes } from '../../lib/files'
import { versionChain, previewKind } from '../../lib/versions'
import { useI18n } from '../../i18n'
import { Modal, btn, card, colors } from '../ui'

import { signedUrl } from '../../lib/storage'
import { offlineFileUrl } from '../../lib/offline'

// Version history for one document, with an in-app preview for PDFs and images.
export default function AssetVersionsModal({ asset, nameOf, onClose }) {
  const { notify } = useToast()
  const { t, fmt } = useI18n()
  const [versions, setVersions] = useState([asset])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null) // { kind, url, version }
  const [busy, setBusy] = useState(null)
  const objectUrls = useRef([])

  // Free memory used by offline copies when the dialog closes
  useEffect(() => () => objectUrls.current.forEach(u => URL.revokeObjectURL(u)), [])

  // Prefer the copy saved on this device (works offline and is instant), else a signed link
  async function fileUrl(v, downloadName) {
    const local = await offlineFileUrl(v.id)
    if (local) {
      objectUrls.current.push(local)
      return { url: local, local: true }
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(t('offline.fileUnavailable'))
    return { url: await signedUrl(v.file_url, downloadName), local: false }
  }

  useEffect(() => {
    supabase.from('assets').select('*').eq('gig_id', asset.gig_id).eq('type', asset.type)
      .then(({ data, error }) => {
        if (error) logger.error('assets', error, { step: 'versions', assetId: asset.id })
        setVersions(versionChain(data || [asset], asset.id))
        setLoading(false)
      })
  }, [asset])

  useEffect(() => {
    const kind = previewKind(asset.file_url)
    if (kind) showPreview(asset)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function showPreview(v) {
    const kind = previewKind(v.file_url)
    if (!kind) return
    setBusy(v.id)
    try {
      const { url } = await fileUrl(v)
      setPreview({ kind, url, version: v.version })
    } catch (err) {
      logger.error('assets', err, { step: 'preview', assetId: v.id })
      notify(t('versions.previewFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function download(v) {
    setBusy(v.id)
    try {
      const ext = v.file_url.split('.').pop()
      const filename = `${v.name} v${v.version}.${ext}`
      const { url, local } = await fileUrl(v, filename)
      if (local) {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
      } else {
        window.location.href = url
      }
    } catch (err) {
      logger.error('assets', err, { step: 'download', assetId: v.id })
      notify(t('versions.downloadFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title={asset.name} onClose={onClose} maxWidth={preview ? 920 : 520}>
      {preview && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: colors.muted }}>{t('versions.previewing', { version: preview.version })}</span>
            <a href={preview.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>
              <ExternalLink size={13} /> {t('versions.newTab')}
            </a>
          </div>
          {preview.kind === 'image' ? (
            <img src={preview.url} alt={t('versions.alt', { name: asset.name, version: preview.version })}
              style={{ maxWidth: '100%', maxHeight: '65vh', display: 'block', margin: '0 auto', borderRadius: '10px', background: '#fff' }} />
          ) : (
            <iframe src={preview.url} title={t('versions.alt', { name: asset.name, version: preview.version })}
              style={{ width: '100%', height: '65vh', border: 'none', borderRadius: '10px', background: '#fff' }} />
          )}
        </div>
      )}

      <h3 style={{ fontSize: '13px', fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        {t('versions.title')} {loading && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {versions.map((v, i) => (
          <div key={v.id} style={{ ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                {t('assets.version', { version: v.version })} {i === 0 && <span style={{ color: colors.accent, fontSize: '12px' }}>· {t('versions.current')}</span>}
              </div>
              <div style={{ fontSize: '12px', color: colors.muted }}>
                {fmt(v.created_at, 'd MMM yyyy, HH:mm')}
                {v.created_by && ` · ${nameOf(v.created_by)}`}
                {v.file_size ? ` · ${formatBytes(v.file_size)}` : ''}
              </div>
            </div>
            {previewKind(v.file_url) && (
              <button onClick={() => showPreview(v)} disabled={busy === v.id} style={btn}><Eye size={13} /> {t('common.preview')}</button>
            )}
            <button onClick={() => download(v)} disabled={busy === v.id} style={btn}>
              {busy === v.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />} {t('common.download')}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
