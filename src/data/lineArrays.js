// Bumper and frame limits for line arrays (RG3, docs/TOOLS_PLAN.md §5), keyed by the speaker
// preset id (src/data/speakers.js). Typed from each manufacturer's own manual, opened on the date
// given; `quote` is the document's wording and `page` the PDF page. Never derived or estimated: a
// value the document doesn't give is null.
// - safe: the most elements the manufacturer allows whatever the angles ("safe limit")
// - max: the most it allows at all; above safe and up to max, only the manufacturer's software
//   can say whether this array passes ("maximum limit")
// - swl_kg: the frame's safe working load for the whole system, when the manual prints one
// - safe_kg: a weight that goes with `safe` (d&b: 10 cabinets and 340 kg, cabinets only)
// - pullback: the frame is used with a pullback (the lever rule doesn't apply)
// Safety-relevant: shown with "needs a second person's check" until someone checks the item's
// rigging data (mark_speaker_rigging_checked). No manual prints a centre of gravity (PENDING D74):
// the point loads, pick position and tilt come from the manufacturer's software.
const OPENED = '2026-11-09'
const LA = 'https://prdstglaxxwe001.blob.core.windows.net/webapp-lacoustics/documentation/LOUDSPEAKERS'
const K2_OM = { document: "K2 owner's manual (EN)", version: 'version 4.0, May 21, 2026', url: `${LA}/K2/EN/Owner's%20Manual/K2_OM_EN.pdf`, opened: OPENED }
const KARA_OM = { document: "Kara II owner's manual (EN)", version: 'version 5.0, September 25, 2024', url: `${LA}/KARA%20II/EN/Owner's%20Manual/Kara_II_OM_EN.pdf`, opened: OPENED }
const KS28_OM = { document: "KS28 owner's manual (EN)", version: 'version 1.0, September 13, 2022', url: `${LA}/KS28/EN/Owner's%20Manual/KS28_OM_EN.pdf`, opened: OPENED }
const DB_VRIG = { document: 'd&b V-Series Rigging manual', version: 'Version 1.12 en, 10/2023 (D2702.EN .01)', url: 'https://www.dbaudio.com/assets/products/downloads/manuals-documentation/accessories/dbaudio-rigging-manual-v-series-1.12-en.pdf', opened: OPENED }
const NEXO_SM = { document: 'NEXO GEO M12 – MSUB18 System manual', version: 'DP3941-03A-CM', url: 'https://www.nexo-sa.com/wp-content/uploads/GEOM12_MSUB18-System-Manual-Rev03a.pdf', opened: OPENED }
const MEYER_DS = { document: 'Meyer Sound LEOPARD datasheet', version: '04.243.004.02 E2 (2021)', url: 'https://docs.meyersound.com/pdf/leopard_ds_e2.pdf', opened: OPENED }

// The manufacturer's own software, which decides (named in each manual)
export const SOFTWARE = {
  'L-Acoustics': 'Soundvision',
  'd&b audiotechnik': 'ArrayCalc',
  NEXO: 'NS-1',
  'Meyer Sound': 'MAPP',
  RCF: 'RCF Easy Shape Designer',
}

const K2_TABLE = 'K2 / configuration / rigging accessory / safe limit / maximum limit (Mechanical safety, flown configurations)'

export const ARRAY_DATA = {
  'l-acoustics-k2': {
    source: K2_OM,
    frames: [
      {
        id: 'k2-bump', name: 'K2-BUMP', parts: [{ name: 'K2-BUMP', kg: 42.3, page: 173, quote: 'K2-BUMP specifications … Weight (net) 42.3 kg / 93.3 lb' }],
        safe: 16, max: 24, swl_kg: null, safe_kg: null, pullback: false,
        page: 30, quote: `${K2_TABLE}: flown, K2-BUMP, 16, 24`,
      },
      {
        id: 'k2-bump-bar', name: 'K2-BUMP + K2-BAR',
        parts: [{ name: 'K2-BUMP', kg: 42.3, page: 173, quote: 'Weight (net) 42.3 kg / 93.3 lb' }, { name: 'K2-BAR', kg: 17, page: 175, quote: 'K2-BAR specifications … Weight (net) 17 kg / 37.5 lb' }],
        safe: 14, max: 24, swl_kg: null, safe_kg: null, pullback: false,
        page: 30, quote: `${K2_TABLE}: flown, K2-BUMP + K2-BAR, 14 K2 + 2 LA-RAK II AVB / LA-RAK III, 24 K2 + 2 LA-RAK II AVB / LA-RAK III`,
        note: 'The manual gives this row with two amplifier racks on the bumper; without them, use K2-BUMP or check in Soundvision.',
      },
      {
        id: 'k2-rigbar', name: 'K2-RIGBAR', parts: [{ name: 'K2-RIGBAR', kg: 15.5, page: 181, quote: 'K2-RIGBAR specifications … Weight (net) 15.5 kg / 34.2 lb' }],
        safe: 12, max: 12, swl_kg: null, safe_kg: null, pullback: false,
        page: 30, quote: `${K2_TABLE}: flown, K2-RIGBAR, 12, 12`,
      },
      {
        id: 'k2-pullback', name: 'K2-BUMP + K2-BAR + K2-RIGBAR (pullback)',
        parts: [{ name: 'K2-BUMP', kg: 42.3, page: 173, quote: 'Weight (net) 42.3 kg / 93.3 lb' }, { name: 'K2-BAR', kg: 17, page: 175, quote: 'Weight (net) 17 kg / 37.5 lb' }, { name: 'K2-RIGBAR', kg: 15.5, page: 181, quote: 'Weight (net) 15.5 kg / 34.2 lb' }],
        safe: 12, max: 16, swl_kg: null, safe_kg: null, pullback: true,
        page: 30, quote: `${K2_TABLE}: flown with a pullback, K2-BUMP + K2-BAR or K2-RIGBAR + K2-RIGBAR, 12, 16`,
      },
    ],
  },
  'l-acoustics-kara-ii': {
    source: KARA_OM,
    frames: [
      {
        id: 'm-bump', name: 'M-BUMP', parts: [{ name: 'M-BUMP', kg: 25, page: 174, quote: 'M-BUMP specifications … Weight (net) 25 kg / 55 lb' }],
        safe: 16, max: 24, swl_kg: null, safe_kg: null, pullback: false,
        page: 31, quote: 'Kara II / flown / M-BUMP + M-BAR (optional) / safe limit 16 / maximum limit 24',
      },
      {
        id: 'm-bump-bar', name: 'M-BUMP + M-BAR',
        parts: [{ name: 'M-BUMP', kg: 25, page: 174, quote: 'Weight (net) 25 kg / 55 lb' }, { name: 'M-BAR', kg: 5, page: 175, quote: 'M-BAR specifications … Weight (net) 5 kg / 11 lb' }],
        safe: 16, max: 24, swl_kg: null, safe_kg: null, pullback: false,
        page: 31, quote: 'Kara II / flown / M-BUMP + M-BAR (optional) / safe limit 16 / maximum limit 24',
      },
      {
        id: 'kara-minibu', name: 'KARA-MINIBU', parts: [{ name: 'KARA-MINIBU', kg: 7.6, page: 176, quote: 'KARA-MINIBU specifications … Weight (net) 7.6 kg / 17 lb' }],
        safe: 6, max: 6, swl_kg: null, safe_kg: null, pullback: false,
        page: 31, quote: 'Kara II / flown / KARA-MINIBU / 6',
      },
      {
        id: 'm-bump-pullback', name: 'M-BUMP + KARA-PULLBACK',
        parts: [{ name: 'M-BUMP', kg: 25, page: 174, quote: 'Weight (net) 25 kg / 55 lb' }, { name: 'KARA-PULLBACK', kg: 6, page: 177, quote: 'KARA-PULLBACK specifications … Weight (net) 6 kg / 13 lb' }],
        safe: 16, max: 16, swl_kg: null, safe_kg: null, pullback: true,
        page: 31, quote: 'Kara II / pullback / M-BUMP + KARA-PULLBACK / 16',
      },
    ],
  },
  'l-acoustics-ks28': {
    source: KS28_OM,
    frames: [
      {
        id: 'ks28-bump', name: 'KS28-BUMP', parts: [{ name: 'KS28-BUMP', kg: 15.5, page: 56, quote: 'KS28-BUMP specifications … Weight (net) 15.5 kg / 34.2 lb' }],
        safe: 16, max: 16, swl_kg: null, safe_kg: null, pullback: false,
        page: 17, quote: 'KS28 / configuration / rigging accessory / maximum / safe limit: Flown, KS28-BUMP, 16',
      },
    ],
  },
  'db-v8': {
    source: DB_VRIG,
    frames: [
      {
        id: 'z5380', name: 'Z5380 V Flying frame', parts: [{ name: 'Z5380 V Flying frame', kg: 25.4, page: 7, quote: 'The weight of the V Flying frame including all rigging components is 25.4 kg (56 lb).' }],
        safe: 10, max: 24, swl_kg: 860, safe_kg: 340, pullback: false,
        page: 4, quote: 'The Z5380 V Flying frame is designed to support a total system weight of 860 kg (1896 lb) – SWL. This allows the suspension of a maximum of 24 x V-TOP cabinets … The rigging components allow arrays of up to 10 x V-TOP cabinets with a total system weight of 340 kg (750 lb) to be flown in any vertical splay angle configuration between the cabinets. For any other array configuration the load conditions within the array have to be checked using the d&b ArrayCalc simulation software.',
        note: '340 kg is 10 × 34 kg V8: the cabinets alone. AVX compares it with the cabinets and extra loads, without the frame; the 860 kg SWL with everything.',
      },
    ],
  },
  'db-v-sub': {
    source: DB_VRIG,
    frames: [
      {
        id: 'z5380-sub', name: 'Z5380 V Flying frame (SUB column)', parts: [{ name: 'Z5380 V Flying frame', kg: 25.4, page: 7, quote: 'The weight of the V Flying frame including all rigging components is 25.4 kg (56 lb).' }],
        safe: null, max: 13, swl_kg: 860, safe_kg: null, pullback: false,
        page: 4, quote: 'The Z5380 V Flying frame is designed to support a total system weight of 860 kg (1896 lb) – SWL. This allows the suspension … of a SUB column consisting of a maximum of 13 x V-SUB cabinets.',
      },
    ],
  },
  'nexo-geo-m1220': {
    source: NEXO_SM,
    frames: [
      {
        id: 'vnt-bumpm12', name: 'VNT-BUMPM12', parts: [{ name: 'VNT-BUMPM12', kg: 22, page: 81, quote: '8.3.1 VNT-BUMPM12 … Weight: 22 kg / 48.5 lb' }],
        safe: null, max: 12, swl_kg: null, safe_kg: null, pullback: false,
        page: 52, quote: 'Maximum GEO M12 quantity for flown vertical cluster with VNT-BUMPM12 is 12 (and eventually less).',
      },
      {
        id: 'vnt-bumpm12-exbar', name: 'VNT-BUMPM12 + VNT-EXBARM12',
        parts: [{ name: 'VNT-BUMPM12', kg: 22, page: 81, quote: 'Weight: 22 kg / 48.5 lb' }, { name: 'VNT-EXBARM12', kg: 11, page: 83, quote: '8.3.3 VNT-EXBARM12 … Weight: 11 kg / 25.4 lb' }],
        safe: null, max: 12, swl_kg: null, safe_kg: null, pullback: false,
        page: 52, quote: 'Maximum GEO M12 quantity for flown vertical cluster with VNT-BUMPM12 is 12 (and eventually less).',
      },
    ],
  },
  'meyer-leopard': {
    source: MEYER_DS,
    frames: [
      {
        id: 'mg-leopard-900', name: 'MG-LEOPARD/900 Multipurpose Grid', parts: [{ name: 'MG-LEOPARD/900', kg: null, page: 2, quote: 'Not printed in the datasheet' }],
        safe: null, max: 23, swl_kg: null, safe_kg: null, pullback: false,
        page: 2, quote: 'MG-LEOPARD/900 Multipurpose Grid: Flies up to 23 LEOPARD cabinets with a 5:1 safety factor and BGV C1 with some angle restrictions',
        note: 'The datasheet prints no grid weight: type it from the grid\'s own documents.',
      },
    ],
  },
  // RCF HDL 30-A: the owner's manual (10307836 RevA) couldn't be opened in the RG3 session, so no
  // structured limits; type the fly bar from the manual (A1's note: a maximum of 20 modules).
  'rcf-hdl-30-a': { source: null, frames: [] },
}
