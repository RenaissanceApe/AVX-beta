import { useEffect, useRef, useState } from 'react'
import { Upload, Eye, Trash2, Loader2, CheckCircle, DownloadCloud, CloudOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { MAX_UPLOAD_BYTES, storagePath, findAssetToSupersede, formatBytes } from '../../lib/files'
import { useI18n } from '../../i18n'
import { signedUrl } from '../../lib/storage'
import { saveFileOffline, removeFileOffline, offlineFileIds } from '../../lib/offline'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors } from '../ui'
import { ASSET_TYPES, assetType, TabHeader } from './parts'

const EMPTY_FORM = { type: 'patch_list', name: '', file: null }

export default function AssetsTab({ gigId, assets, canUpload, offline = false, onOpen, onChanged, showUpload, setShowUpload }) {
  const { t, ago } = useI18n()
  const { notify } = useToast()
  const [savedIds, setSavedIds] = useState(new Set())
  const [savingId, setSavingId] = useState(null)
  const [bulk, setBulk] = useState(null) // { done, total } while saving all

  useEffect(() => { offlineFileIds().then(setSavedIds) }, [assets])

  async function toggleOffline(asset) {
    setSavingId(asset.id)
    try {
      if (savedIds.has(asset.id)) {
        await removeFileOffline(asset.id)
      } else {
        await saveFileOffline(asset, await signedUrl(asset.file_url))
      }
      setSavedIds(await offlineFileIds())
    } catch (err) {
      logger.error('offline', err, { step: 'saveFile', assetId: asset.id })
      notify(t('offline.saveFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function saveAll() {
    const todo = assets.filter(a => a.file_url && !savedIds.has(a.id))
    setBulk({ done: 0, total: todo.length })
    let saved = 0
    for (const a of todo) {
      try {
        await saveFileOffline(a, await signedUrl(a.file_url))
        saved++
      } catch (err) {
        logger.error('offline', err, { step: 'saveAll', assetId: a.id })
      }
      setBulk({ done: saved, total: todo.length })
    }
    setSavedIds(await offlineFileIds())
    setBulk(null)
    notify(t('offline.savedAll', { count: saved }), saved === todo.length ? 'success' : 'error')
  }

  async function deleteAsset(asset) {
    if (!window.confirm(t('assets.confirmDelete', { name: asset.name, version: asset.version }))) return
    const { error } = await supabase.from('assets').delete().eq('id', asset.id)
    if (error) {
      logger.error('assets', error, { step: 'delete', assetId: asset.id })
      return notify(t('assets.deleteFailed', { reason: userMessage(error) }), 'error')
    }
    if (asset.file_url) {
      const { error: storageError } = await supabase.storage.from('gig-assets').remove([asset.file_url])
      if (storageError) logger.warn('assets', 'File left in storage after delete', { assetId: asset.id })
    }
    notify(t('assets.deleted', { name: asset.name }), 'success')
    onChanged()
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.assets')} subtitle={t('assets.subtitle')}
        action={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!offline && assets.length > 0 && assets.some(a => !savedIds.has(a.id)) && (
              <button onClick={saveAll} disabled={!!bulk} style={btn}>
                {bulk ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <DownloadCloud size={14} />}
                {bulk ? t('offline.savingAll', bulk) : t('offline.saveAll')}
              </button>
            )}
            {canUpload && !offline && <button onClick={() => setShowUpload(true)} style={btnPrimary}><Upload size={14} /> {t('assets.upload')}</button>}
          </div>
        } />

      {assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '70px 20px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px',
            background: 'rgba(30,200,120,0.08)', border: '1px solid rgba(30,200,120,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Upload size={24} color={colors.accent} /></div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{t('assets.emptyTitle')}</h3>
          <p style={{ color: colors.muted, fontSize: '13px', maxWidth: '300px', margin: '0 auto 20px' }}>{t('assets.emptyBody')}</p>
          {canUpload && <button onClick={() => setShowUpload(true)} style={btnPrimary}><Upload size={14} /> {t('assets.uploadFirst')}</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {assets.map(a => {
            const cfg = assetType(a.type)
            const Icon = cfg.icon
            return (
              <div key={a.id} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}`, borderRadius: '14px',
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px', animation: 'fadeIn 0.3s ease',
              }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                  background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon size={20} color={cfg.color} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <span style={{ color: cfg.color, fontWeight: 600 }}>{t(`assetType.${a.type}`)}</span>
                    <span style={{ color: colors.muted }}>{t('assets.version', { version: a.version })}</span>
                    {a.file_size ? <span style={{ color: colors.muted }}>{formatBytes(a.file_size)}</span> : null}
                    <span style={{ color: '#2A3A48' }}>{ago(a.created_at)}</span>
                  </div>
                </div>
                <button onClick={() => onOpen(a)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}>
                  <Eye size={13} /> {a.version > 1 ? t('assets.openHistory') : t('common.open')}
                </button>
                {!offline && (
                  <button onClick={() => toggleOffline(a)} disabled={savingId === a.id} style={{ ...iconBtn, color: savedIds.has(a.id) ? colors.accent : colors.muted }}
                    aria-pressed={savedIds.has(a.id)} title={savedIds.has(a.id) ? t('offline.remove') : t('offline.keep')}
                    aria-label={savedIds.has(a.id) ? t('offline.remove') : t('offline.keep')}>
                    {savingId === a.id ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      : savedIds.has(a.id) ? <CloudOff size={15} /> : <DownloadCloud size={15} />}
                  </button>
                )}
                {offline && savedIds.has(a.id) && <span title={t('offline.kept')} style={{ color: colors.accent, display: 'flex' }}><CheckCircle size={15} /></span>}
                {canUpload && !offline && (
                  <button onClick={() => deleteAsset(a)} aria-label={t('assets.deleteNamed', { name: a.name })} title={t('common.delete')} style={iconBtn}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showUpload && <UploadModal gigId={gigId} assets={assets} onClose={() => setShowUpload(false)} onUploaded={onChanged} />}
    </div>
  )
}

function UploadModal({ gigId, assets, onClose, onUploaded }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef()

  const pickFile = file => file && setForm(f => ({ ...f, file, name: f.name || file.name.replace(/\.[^.]+$/, '') }))
  const existing = findAssetToSupersede(assets, form.type, form.name)

  async function upload() {
    if (!form.file || !form.name.trim()) return
    if (form.file.size > MAX_UPLOAD_BYTES) {
      return notify(t('assets.tooLarge', { size: formatBytes(form.file.size), max: formatBytes(MAX_UPLOAD_BYTES) }), 'error')
    }
    setUploading(true)
    try {
      const path = storagePath(gigId, form.name, form.file.name)
      const { error: storageError } = await supabase.storage.from('gig-assets').upload(path, form.file, { contentType: form.file.type })
      if (storageError) throw storageError

      // Same type + same name = a new version of that document. Looked up again now: the list on
      // screen may not have caught up yet with an upload made a moment ago
      const { data: latest } = await supabase.from('assets').select('id, type, name, version, superseded_by')
        .eq('gig_id', gigId).is('superseded_by', null)
      const current = findAssetToSupersede(latest || assets, form.type, form.name)
      const version = current ? (current.version || 1) + 1 : 1
      const { data: newAsset, error: dbError } = await supabase.from('assets').insert({
        gig_id: gigId, type: form.type, name: form.name.trim(), file_url: path,
        file_size: form.file.size, version, created_by: user.id,
      }).select().single()
      if (dbError) {
        // Don't leave an orphaned file in storage
        await supabase.storage.from('gig-assets').remove([path])
        throw dbError
      }
      if (current) {
        const { error: supersedeError } = await supabase.from('assets').update({ superseded_by: newAsset.id }).eq('id', current.id)
        if (supersedeError) logger.error('assets', supersedeError, { step: 'supersede', assetId: current.id })
      }
      notify(current ? t('assets.uploadedVersion', { version, name: newAsset.name }) : t('assets.uploaded', { name: newAsset.name }), 'success')
      onUploaded()
      onClose()
    } catch (err) {
      logger.error('assets', err, { step: 'upload', gigId })
      notify(t('assets.uploadFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal title={t('assets.upload')} onClose={onClose} maxWidth={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <span style={label}>{t('assets.type')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {ASSET_TYPES.map(at => {
              const Icon = at.icon
              const sel = form.type === at.value
              return (
                <button key={at.value} type="button" aria-pressed={sel} onClick={() => setForm(f => ({ ...f, type: at.value }))} style={{
                  padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  background: sel ? `${at.color}18` : 'rgba(255,255,255,0.04)',
                  border: sel ? `1px solid ${at.color}50` : `1px solid ${colors.border}`,
                  color: sel ? at.color : colors.muted,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                }}><Icon size={16} />{t(`assetType.${at.value}`)}</button>
              )
            })}
          </div>
        </div>

        <div>
          <label style={label} htmlFor="asset-name">{t('assets.name')} *</label>
          <input id="asset-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('assets.namePlaceholder')} maxLength={200} style={input} autoFocus />
          <p style={{ fontSize: '12px', color: existing ? colors.accent : colors.muted, marginTop: '6px', lineHeight: 1.5 }}>
            {existing ? t('assets.willBeVersion', { version: (existing.version || 1) + 1, name: existing.name }) : t('assets.versionTip')}
          </p>
        </div>

        <div>
          <span style={label}>{t('assets.file')} *</span>
          <div role="button" tabIndex={0}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]) }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? colors.accent : form.file ? 'rgba(30,200,120,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(30,200,120,0.05)' : form.file ? 'rgba(30,200,120,0.04)' : 'rgba(0,0,0,0.2)',
            }}>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => pickFile(e.target.files[0])} />
            {form.file ? (
              <div>
                <CheckCircle size={24} color={colors.accent} style={{ marginBottom: '6px' }} />
                <div style={{ color: colors.accent, fontWeight: 600, fontSize: '13px', wordBreak: 'break-all' }}>{form.file.name}</div>
                <div style={{ color: colors.muted, fontSize: '12px', marginTop: '2px' }}>{formatBytes(form.file.size)}</div>
              </div>
            ) : (
              <div>
                <Upload size={24} color="#2A3A48" style={{ marginBottom: '8px' }} />
                <div style={{ color: colors.muted, fontSize: '13px' }}>{t('assets.drop')}</div>
                <div style={{ color: '#2A3A48', fontSize: '12px', marginTop: '4px' }}>{t('assets.dropHint')}</div>
              </div>
            )}
          </div>
        </div>

        <button onClick={upload} disabled={uploading || !form.file || !form.name.trim()}
          style={{ ...btnPrimary, justifyContent: 'center', padding: '13px', opacity: (!form.file || !form.name.trim()) ? 0.5 : 1 }}>
          {uploading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
          {uploading ? t('assets.uploading') : t('assets.upload')}
        </button>
      </div>
    </Modal>
  )
}
