// Writes the sample MVR and GDTF files (made from the standards, src/lib/mvrSamples.js) to
// docs/samples/mvr/, for trying the MVR import by hand and for the help screenshots.
// Run: npx vite-node scripts/mvr-samples.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { sampleGdtf, SAMPLE_TYPES, sampleMvrVectorworks, sampleMvrGrandMA3, sampleMvrCapture } from '../src/lib/mvrSamples.js'

const dir = new URL('../docs/samples/mvr/', import.meta.url)
mkdirSync(dir, { recursive: true })
const out = {
  'vectorworks-style.mvr': sampleMvrVectorworks(),
  'grandma3-style.mvr': sampleMvrGrandMA3(),
  'capture-style.mvr': sampleMvrCapture(),
  'Sample@Spot 300.gdtf': sampleGdtf(SAMPLE_TYPES.spot),
  'Sample@Pixel Wash.gdtf': sampleGdtf(SAMPLE_TYPES.wash),
}
for (const [name, bytes] of Object.entries(out)) writeFileSync(new URL(name, dir), bytes)
process.stdout.write(`Wrote ${Object.keys(out).length} files to docs/samples/mvr/\n`)
