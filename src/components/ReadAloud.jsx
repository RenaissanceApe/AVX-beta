import { Volume2, Square } from 'lucide-react'
import { canSpeak, speak, stopSpeaking, useSpeaking } from '../lib/fieldKit'
import { useI18n } from '../i18n'

// Read aloud (docs/HELP.md, H5) with the phone's or computer's own voice: nothing is sent
// anywhere. text is a string or a function that makes one when pressed. Hidden where the
// browser has no voice.
export default function ReadAloud({ text, style, label }) {
  const { t, lang } = useI18n()
  const speaking = useSpeaking()
  if (!canSpeak()) return null
  const toggle = () => (speaking ? stopSpeaking() : speak(typeof text === 'function' ? text() : text, lang))
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking} style={style}>
      {speaking ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />} {speaking ? t('speak.stop') : (label || t('speak.read'))}
    </button>
  )
}
