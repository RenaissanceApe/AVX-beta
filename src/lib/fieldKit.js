import { useEffect, useState } from 'react'

// Field kit (docs/HELP.md, H5): sounds, vibration and the phone's own voice, for the warehouse
// in the dark, a noisy loading bay or hands full of cable. Settings stay on this device.

const KEY = 'avx.fieldkit'
export const FIELD_DEFAULTS = { sound: true, speak: false }

export function readFieldKit() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { sound: saved.sound !== false, speak: saved.speak === true }
  } catch {
    return { ...FIELD_DEFAULTS }
  }
}

export function useFieldKit() {
  const [kit, setKit] = useState(readFieldKit)
  const set = next => setKit(prev => {
    const merged = { ...prev, ...next }
    try { localStorage.setItem(KEY, JSON.stringify(merged)) } catch { /* private mode */ }
    return merged
  })
  return [kit, set]
}

// ── Sound ─────────────────────────────────────────────────────────────────────
// ok: one high beep · warn: two middle beeps · error: one long low buzz. Different in pitch and
// rhythm, so they're told apart without looking (and by people who don't hear high notes well).
export const TONES = {
  ok: [{ hz: 1320, ms: 90 }],
  warn: [{ hz: 740, ms: 110 }, { gap: 70 }, { hz: 740, ms: 110 }],
  error: [{ hz: 196, ms: 420, wave: 'square' }],
}
let audio = null
export function beep(tone) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audio ||= new Ctx()
    if (audio.state === 'suspended') audio.resume()
    let at = audio.currentTime + 0.01
    for (const step of TONES[tone] || TONES.ok) {
      if (step.gap) { at += step.gap / 1000; continue }
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = step.wave || 'sine'
      osc.frequency.value = step.hz
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + step.ms / 1000)
      osc.connect(gain).connect(audio.destination)
      osc.start(at)
      osc.stop(at + step.ms / 1000 + 0.02)
      at += step.ms / 1000
    }
  } catch { /* no sound on this device */ }
}

export const VIBRATION = { ok: 40, warn: [60, 60, 60], error: [200, 80, 200] }
export function buzz(tone) {
  try { navigator.vibrate?.(VIBRATION[tone] || VIBRATION.ok) } catch { /* not supported */ }
}

// ── Read aloud ────────────────────────────────────────────────────────────────
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
export const speechLang = lang => (lang === 'pt' ? 'pt-PT' : 'en-GB')

// The best voice for a language: an exact match (pt-PT, not pt-BR) first, then the same language
export function pickVoice(voices, lang) {
  const want = speechLang(lang).toLowerCase()
  const base = want.slice(0, 2)
  const list = voices || []
  return list.find(v => v.lang?.toLowerCase().replace('_', '-') === want)
    || list.find(v => v.lang?.toLowerCase().startsWith(base))
    || null
}

const listeners = new Set()
let speakingNow = false
const tell = on => { speakingNow = on; listeners.forEach(fn => fn(on)) }

export function speak(text, lang) {
  if (!canSpeak() || !text) return
  const synth = window.speechSynthesis
  synth.cancel()
  const say = new window.SpeechSynthesisUtterance(text)
  say.lang = speechLang(lang)
  const voice = pickVoice(synth.getVoices(), lang)
  if (voice) say.voice = voice
  say.rate = 0.95
  say.onend = () => tell(false)
  say.onerror = () => tell(false)
  tell(true)
  synth.speak(say)
}
export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
  tell(false)
}

// { speaking } for a Read aloud button; stops talking when the page goes away
export function useSpeaking() {
  const [speaking, setSpeaking] = useState(speakingNow)
  useEffect(() => {
    listeners.add(setSpeaking)
    return () => { listeners.delete(setSpeaking); if (speakingNow) stopSpeaking() }
  }, [])
  return speaking
}
