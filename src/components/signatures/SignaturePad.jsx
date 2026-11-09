import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { useI18n, translate } from '../../i18n'
import { btn, colors } from '../ui'

// A signature pad for a finger, a pen or a mouse (step 16). Draws in dark ink on white whatever the
// app's theme, because the drawing goes into printed and PDF documents: those two are the paper's
// colours, not screen colours. 3:1, saved as a PNG.
//   ref.current.png() → Promise<Blob | null> (null when nothing was drawn)
//   ref.current.clear()
//   onChange(hasInk)
//   paper: on a printed-look page (the client's quote page), use the paper's greys, not the theme's
const PAPER = '#ffffff'
const INK = '#111111'
const RATIO = 3
const PAPER_MUTED = '#555555'
const PAPER_EDGE = '#999999'

const SignaturePad = forwardRef(function SignaturePad({ label, onChange, lang, paper = false }, ref) {
  const { t } = useI18n()
  const tr = lang ? key => translate(lang, key) : t
  const canvasRef = useRef(null)
  const drawing = useRef(null) // last point while the pointer is down
  const [hasInk, setHasInk] = useState(false)

  // Size the drawing surface to the element at the device's pixel density
  useEffect(() => {
    const canvas = canvasRef.current
    const fit = () => {
      const w = canvas.clientWidth
      if (!w || canvas.width === Math.round(w * 2)) return
      canvas.width = Math.round(w * 2)
      canvas.height = Math.round((w / RATIO) * 2)
      paint(canvas)
      setHasInk(false)
      onChange?.(false)
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(canvas)
    return () => ro?.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function paint(canvas) {
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = INK
    ctx.lineWidth = Math.max(3, canvas.width / 220)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const point = e => {
    const r = canvasRef.current.getBoundingClientRect()
    return [(e.clientX - r.left) * (canvasRef.current.width / r.width), (e.clientY - r.top) * (canvasRef.current.height / r.height)]
  }

  function down(e) {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    drawing.current = point(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(drawing.current[0], drawing.current[1], ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = INK
    ctx.fill()
  }
  function move(e) {
    if (!drawing.current) return
    e.preventDefault()
    const p = point(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...drawing.current)
    ctx.lineTo(...p)
    ctx.stroke()
    drawing.current = p
    if (!hasInk) { setHasInk(true); onChange?.(true) }
  }
  function up() { drawing.current = null }

  function clear() {
    paint(canvasRef.current)
    setHasInk(false)
    onChange?.(false)
  }

  useImperativeHandle(ref, () => ({
    clear,
    png: () => new Promise(resolve => {
      if (!hasInk) return resolve(null)
      canvasRef.current.toBlob(b => resolve(b), 'image/png')
    }),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{label || tr('signature.pad')}</span>
        <button type="button" onClick={clear} disabled={!hasInk} style={{ ...btn, padding: '4px 12px', opacity: hasInk ? 1 : 0.5, ...(paper ? { color: INK, borderColor: PAPER_EDGE, background: PAPER } : {}) }}>
          <Eraser size={14} aria-hidden="true" /> {tr('signature.clear')}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={hasInk ? tr('signature.padSigned') : tr('signature.padEmpty')}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        style={{ width: '100%', aspectRatio: `${RATIO} / 1`, background: PAPER, border: `1px solid ${paper ? PAPER_EDGE : colors.lineStrong}`, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      />
      <span style={{ fontSize: '11px', color: paper ? PAPER_MUTED : colors.muted }}>{hasInk ? tr('signature.padSigned') : tr('signature.padHint')}</span>
    </div>
  )
})

export default SignaturePad
