// Speaker presets (A1, docs/TOOLS_PLAN.md §6): values typed from each manufacturer's own documents,
// opened on the date given, with the document and its version. Never derived or estimated: a value
// the document doesn't give is left out. `quotes` holds the document's own wording for each value;
// `conditions` how it was measured (maximum SPL is measured differently by each brand, so compare
// it with care).
// Rigging data is safety-relevant: it needs a second person's check before use (the rule in
// docs/TRUSS_DATA.md), so `rigging.checked` stays false until RG3's sign-off. None of these
// documents prints a centre of gravity; the manufacturers send you to their own software for it.
const LA = 'https://prdstglaxxwe001.blob.core.windows.net/webapp-lacoustics/documentation/LOUDSPEAKERS'
const DB = 'https://www.dbaudio.com/assets/products/downloads/manuals-documentation'
const OPENED = '2026-11-09'
const DB_VRIG = 'd&b V-Series Rigging manual, Version 1.12 en, 10/2023 (D2702.EN .01) · ' + `${DB}/accessories/dbaudio-rigging-manual-v-series-1.12-en.pdf`
const DB_PICKUP = 'Single pick point operation: the position of the V Load adapter defines the vertical aiming of the entire array. Dual pick point operation: the vertical aiming of the array is set by trimming the hoist motors after the array has been fully assembled and lifted to its operating position.'

export const PRESETS = [
  {
    id: 'l-acoustics-k2', brand: 'L-Acoustics', model: 'K2', type: 'line_array',
    values: { max_spl_db: 147, freq_low_hz: 35, freq_high_hz: 20000, weight_kg: 56 },
    quotes: {
      max_spl_db: 'Maximum SPL 147 dB ([K2_70])',
      freq_low_hz: 'Usable bandwidth (-10 dB) 35 Hz - 20 kHz ([K2_70])',
      freq_high_hz: 'Usable bandwidth (-10 dB) 35 Hz - 20 kHz ([K2_70])',
      weight_kg: 'Weight (net) 56 kg/123.2 lb',
    },
    conditions: { max_spl_db: 'Peak level at 1 m, free field, pink noise with crest factor 4, preset [K2_70]', freq_low_hz: '-10 dB' },
    notes: 'Horizontal directivity is selectable (70°/110° symmetric or 90° asymmetric), so it is left empty; vertical depends on the array. Impedance per section: LF/MF/HF 2 × 8 Ω / 8 Ω / 16 Ω. The spec sheet carries a "preliminary" mark; the owner\'s manual v4.0 gives the same values.',
    rigging: {
      pickup_points: 'A K2 system can be lifted using one or two motors: one or two motors with K2-BUMP alone; two motors with K2-BUMP and one K2-BAR; two with K2-BUMP and two K2-BAR.',
      frame_limits: 'Safety factor of 4 or more (2006/42/EC). Configuration / rigging accessory / safe limit / maximum limit: flown, K2-BUMP: 16 / 24; K2-BUMP + K2-BAR: 14 K2 + 2 LA-RAK II AVB / LA-RAK III, 24 K2 + 2 LA-RAK II AVB / LA-RAK III; K2-LINK under K1-BUMP: 16 / 24; K2-RIGBAR: 12 / 12; flown with a pullback, K2-BUMP + K2-BAR or K2-RIGBAR + K2-RIGBAR: 12 / 16; flown with downfill, KARADOWNK2: 6 Kara II; ground-stacked, K2-BUMP: 4 / 6.',
      source: `K2 owner's manual (EN) version 4.0, May 21, 2026, pp. 30-31 · ${LA}/K2/EN/Owner's%20Manual/K2_OM_EN.pdf`,
      checked: false,
    },
    source: { url: `${LA}/K2/EN/Product%20Spec%20Sheet/K2_SP_EN_3.1.pdf`, document: 'K2 product spec sheet', version: 'K2_SPS_EN_3.1/07-24', opened: OPENED },
  },
  {
    id: 'l-acoustics-kara-ii', brand: 'L-Acoustics', model: 'Kara II', type: 'line_array',
    values: { max_spl_db: 142, freq_low_hz: 55, freq_high_hz: 20000, weight_kg: 26 },
    quotes: {
      max_spl_db: 'Maximum SPL 142 dB ([KARA II 70])',
      freq_low_hz: 'Usable bandwidth (-10 dB) 55 Hz - 20 kHz ([KARA II 70])',
      freq_high_hz: 'Usable bandwidth (-10 dB) 55 Hz - 20 kHz ([KARA II 70])',
      weight_kg: 'Weight (net) 26 kg / 57 lb',
    },
    conditions: { max_spl_db: 'Peak level at 1 m, free field, pink noise with crest factor 4, preset [KARA II 70]', freq_low_hz: '-10 dB' },
    notes: 'Horizontal directivity is selectable (70°/110° symmetric or 90° asymmetric), so it is left empty; vertical depends on the array. Impedance per section: LF 8 Ω, HF 8 Ω.',
    rigging: {
      frame_limits: 'Safety factor of 4 or more (2006/42/EC). Flown, M-BUMP + M-BAR (optional): safe limit 16, maximum limit 24. For KARA-MINIBU, pullback, platform-stacked and ground-stacked limits, read the table in the owner\'s manual, pp. 30-31.',
      source: `Kara II owner's manual (EN) version 5.0, September 25, 2024, pp. 30-31 · ${LA}/KARA%20II/EN/Owner's%20Manual/Kara_II_OM_EN.pdf`,
      checked: false,
    },
    source: { url: `${LA}/KARA%20II/EN/Product%20Spec%20Sheet/KARA_II_SP_EN_1.1.pdf`, document: 'Kara II product spec sheet', version: 'not printed (file KARA_II_SP_EN_1.1)', opened: OPENED },
  },
  {
    id: 'l-acoustics-x12', brand: 'L-Acoustics', model: 'X12', type: 'point_source',
    values: { max_spl_db: 136, dispersion_h: 60, dispersion_v: 90, freq_low_hz: 59, freq_high_hz: 20000, impedance_ohm: 8, weight_kg: 20 },
    quotes: {
      max_spl_db: 'Maximum SPL 136 dB ([X12] preset)',
      dispersion_h: 'Nominal directivity (horizontal enclosure) Vertical: 90° Horizontal: 60°',
      dispersion_v: 'Nominal directivity (horizontal enclosure) Vertical: 90° Horizontal: 60°',
      freq_low_hz: 'Usable bandwidth (-10 dB) 59 Hz - 20 kHz ([X12] preset)',
      freq_high_hz: 'Usable bandwidth (-10 dB) 59 Hz - 20 kHz ([X12] preset)',
      impedance_ohm: 'Nominal impedance 8Ω',
      weight_kg: 'Weight (net) 20 kg / 44.1 lb',
    },
    conditions: { max_spl_db: 'Peak level at 1 m, free field, pink noise with crest factor 4, preset [X12]', dispersion_h: 'For the enclosure lying horizontally; standing upright the angles swap (90° × 60°)', freq_low_hz: '-10 dB' },
    notes: 'Passive 2-way coaxial; also used as a wedge (monitoring angle 35° or 55° with risers).',
    rigging: null,
    source: { url: `${LA}/X12/EN/System%20Spec%20Sheet/X12_SPS_EN_3.1.pdf`, document: 'X12 system spec sheet', version: 'X12_SPS_EN_3.0/03-17', opened: OPENED },
  },
  {
    id: 'l-acoustics-ks28', brand: 'L-Acoustics', model: 'KS28', type: 'subwoofer',
    values: { max_spl_db: 143, freq_low_hz: 25, impedance_ohm: 4, weight_kg: 79 },
    quotes: {
      max_spl_db: 'Maximum SPL 143 dB ([KS28_100])',
      freq_low_hz: 'Low frequency limit (-10 dB) 25 Hz ([KS28_100])',
      impedance_ohm: 'Nominal impedance 4Ω',
      weight_kg: 'Weight (net) 79 kg / 174 lbs',
    },
    conditions: { max_spl_db: 'Peak level at 1 m, half space, pink noise with crest factor 4, preset [KS28_100]', freq_low_hz: '-10 dB' },
    notes: 'No upper frequency limit printed. Standard or cardioid.',
    rigging: {
      pickup_points: 'KS28-BUMP provides two sets of pickup points to choose from depending on the position of the lifting points. Lifting with two motors (two chains): pickup points 1200 mm / 47.2 in, or 650 mm / 25.6 in. Lifting with one motor (one LA-SLING2T or an adapted bridle).',
      frame_limits: 'Safety factor of 5 or more for the flown deployments (2006/42/EC requires 4). Flown, KS28-BUMP: 16. Ground-stacked: 4; stacked upright: 2; stacked on KS28-CHARIOT: 4.',
      source: `KS28 owner's manual (EN) version 1.0, September 13, 2022 · ${LA}/KS28/EN/Owner's%20Manual/KS28_OM_EN.pdf`,
      checked: false,
    },
    source: { url: `${LA}/KS28/EN/Product%20Spec%20Sheet/KS28_SP_EN_3.0.pdf`, document: 'KS28 product spec sheet', version: 'KS28_SPS_EN_3.0/05-21', opened: OPENED },
  },
  {
    id: 'db-v8', brand: 'd&b audiotechnik', model: 'V8', type: 'line_array',
    values: { max_spl_db: 142, dispersion_h: 80, freq_low_hz: 67, freq_high_hz: 18000, impedance_ohm: 8, weight_kg: 34 },
    quotes: {
      max_spl_db: 'Max. sound pressure (1 m, free field) with D20/D12 139 dB with D80/D40 142 dB (SPLmax peak, pink noise test signal with crest factor of 4)',
      dispersion_h: 'Nominal dispersion angle (horizontal) V8 80°',
      freq_low_hz: 'Frequency response (–5 dB standard) 67 Hz - 18 kHz',
      freq_high_hz: 'Frequency response (–5 dB standard) 67 Hz - 18 kHz',
      impedance_ohm: 'Nominal impedance 8 ohms',
      weight_kg: 'Weight 34 kg (75 lb)',
    },
    conditions: { max_spl_db: 'Peak, pink noise crest factor 4, 1 m free field, with D80/D40 (139 dB with D20/D12)', freq_low_hz: '–5 dB, standard mode' },
    notes: 'Passive 3-way. Vertical splay 0° to 14° in 1° steps. Cabinets per amplifier channel (not channels per cabinet): V8 Line/Arc 2, V8 AP 1.',
    rigging: {
      pickup_points: DB_PICKUP,
      frame_limits: 'The Z5380 V Flying frame is designed to support a total system weight of 860 kg (1896 lb) – SWL. This allows the suspension of a maximum of 24 x V-TOP cabinets or a SUB column consisting of a maximum of 13 x V-SUB cabinets. The rigging components allow arrays of up to 10 x V-TOP cabinets with a total system weight of 340 kg (750 lb) to be flown in any vertical splay angle configuration between the cabinets. For any other array configuration the load conditions within the array have to be checked using the d&b ArrayCalc simulation software.',
      source: DB_VRIG,
      checked: false,
    },
    source: { url: `${DB}/v-series/dbaudio-manual-v8-v12-1.8-en.pdf`, document: 'd&b V8/V12 Manual', version: 'Version 1.8 en, 09/2022 (D2700.EN .01)', opened: OPENED },
  },
  {
    id: 'db-y10p', brand: 'd&b audiotechnik', model: 'Y10P', type: 'point_source',
    values: { max_spl_db: 136, dispersion_h: 110, dispersion_v: 40, freq_low_hz: 59, freq_high_hz: 18000, impedance_ohm: 8, weight_kg: 18 },
    quotes: {
      max_spl_db: 'Max. sound pressure (1 m, free field) Y10P with D6 131 dB Y10P with D12/D20 134 dB Y10P with D80/D40 136 dB (SPLmax peak, pink noise test signal with crest factor of 4)',
      dispersion_h: 'Nominal dispersion angle (horizontal) Y10P 110°',
      dispersion_v: 'Nominal dispersion angle (vertical) 40°',
      freq_low_hz: 'Frequency response (–5 dB standard) 59 Hz - 18 kHz',
      freq_high_hz: 'Frequency response (–5 dB standard) 59 Hz - 18 kHz',
      impedance_ohm: 'Nominal impedance 8 ohms',
      weight_kg: 'Weight 18 kg (40 lb)',
    },
    conditions: { max_spl_db: 'Peak, pink noise crest factor 4, 1 m free field, with D80/D40 (131 dB D6, 134 dB D12/D20)', freq_low_hz: '–5 dB, standard mode' },
    notes: 'Passive 2-way with a rotatable CD horn.',
    rigging: null,
    source: { url: `${DB}/y-series/dbaudio-manual-y7p-y10p-1.3-en.pdf`, document: 'd&b Y7P/Y10P Manual', version: 'Version 1.3 en, 03/2023 (D2710.EN .01)', opened: OPENED },
  },
  {
    id: 'db-v-sub', brand: 'd&b audiotechnik', model: 'V-SUB', type: 'subwoofer',
    values: { max_spl_db: 137, freq_low_hz: 37, freq_high_hz: 115, impedance_ohm: 8, weight_kg: 64, amp_channels: 1 },
    quotes: {
      max_spl_db: 'Max. sound pressure (1 m, free field) with D20/D12 133 dB with D80/D40 137 dB (SPLmax peak, pink noise test signal with crest factor of 4)',
      freq_low_hz: 'Frequency response (–5 dB standard) 37 Hz - 115 Hz',
      freq_high_hz: 'Frequency response (–5 dB standard) 37 Hz - 115 Hz',
      impedance_ohm: 'Nominal impedance 8 ohms',
      weight_kg: 'Weight 64 kg (141 lb)',
      amp_channels: 'The arrangement and tuning provide a cardioid dispersion pattern using a single amplifier channel.',
    },
    conditions: { max_spl_db: 'Peak, pink noise crest factor 4, 1 m free field, with D80/D40 (133 dB with D20/D12)', freq_low_hz: '–5 dB, standard mode (100 Hz mode: 37 Hz - 95 Hz)' },
    notes: 'Cardioid. Two V-SUBs per amplifier channel, one with D40/40D at maximum output.',
    rigging: {
      pickup_points: DB_PICKUP,
      frame_limits: 'The Z5380 V Flying frame is designed to support a total system weight of 860 kg (1896 lb) – SWL. This allows the suspension of a maximum of 24 x V-TOP cabinets or a SUB column consisting of a maximum of 13 x V-SUB cabinets.',
      source: DB_VRIG,
      checked: false,
    },
    source: { url: `${DB}/v-series/dbaudio-manual-v-sub-1.5-en.pdf`, document: 'd&b V-SUB Manual', version: 'Version 1.5 en, 09/2022 (D2701.EN .01)', opened: OPENED },
  },
  {
    id: 'rcf-hdl-30-a', brand: 'RCF', model: 'HDL 30-A', type: 'line_array',
    values: { max_spl_db: 137, dispersion_h: 100, dispersion_v: 15, freq_low_hz: 50, freq_high_hz: 20000, weight_kg: 25 },
    quotes: {
      max_spl_db: 'Max SPL @ 1m 137 dB',
      dispersion_h: 'Horizontal coverage angle 100°',
      dispersion_v: 'Vertical coverage angle 15°',
      freq_low_hz: 'Frequency Response 50 Hz - 20000 Hz',
      freq_high_hz: 'Frequency Response 50 Hz - 20000 Hz',
      weight_kg: 'Weight 25 kg / 55.12 lbs',
    },
    conditions: { max_spl_db: 'At 1 m; peak or continuous and test signal not printed', freq_low_hz: 'Tolerance not printed', dispersion_v: 'Per element, as printed' },
    notes: 'Self-powered (2200 W peak amplifier output); no power consumption printed, so power draw is left empty.',
    rigging: {
      pickup_points: 'In case the fly bar is picked up from 2 motors make sure that the fly bar angle is correct. Hanging point for the shackle with A or B position indicated if a single pickup point is selected, rear and front load if two pickup points are selected.',
      frame_limits: 'FLYBAR HDL 30-A: suspension bar to fly a maximum of 20 modules (13360380). The suspension system is designed to have a proper safety factor (configuration dependent): green, safety factor > 7 suggested; yellow, 4 to 7; orange, 1.5 to 4; red, never admitted.',
      source: 'RCF Owner manual HDL 30-A / HDL 38-AS, 10307836 RevA (rcf.it product page, "User manual - ENG")',
      checked: false,
    },
    source: { url: 'https://www.rcf.it/en/products/product-detail/hdl-30-a', document: 'RCF HDL 30-A Technical Specifications (spec sheet, rcf.it product page downloads)', version: 'not printed (listed on the product page as 03-11-2026)', opened: OPENED },
  },
  {
    id: 'meyer-leopard', brand: 'Meyer Sound', model: 'LEOPARD', type: 'line_array',
    values: { max_spl_db: 142, dispersion_h: 110, freq_low_hz: 55, freq_high_hz: 18000, weight_kg: 34 },
    quotes: {
      max_spl_db: 'Maximum SPL 142 dB',
      dispersion_h: 'Horizontal Coverage 110°',
      freq_low_hz: 'Operating Frequency Range 55 Hz – 18 kHz',
      freq_high_hz: 'Operating Frequency Range 55 Hz – 18 kHz',
      weight_kg: 'Weight 75 lb (34.0 kg)',
    },
    conditions: { max_spl_db: 'Peak measured in free field at 4 m referred to 1 m using noise', freq_low_hz: 'Recommended maximum operating frequency range' },
    notes: 'Self-powered with a 3-channel built-in amplifier; the datasheet gives current draw in amps, not watts, so power draw is left empty (max long-term continuous 1.5 A rms at 230 V). Vertical coverage varies with the array.',
    rigging: {
      pickup_points: 'The grid offers multiple and single-center pickup points and supports mixed arrays of LEOPARD and 900-LFC cabinets flown or ground-stacked without any transition hardware.',
      frame_limits: 'MG-LEOPARD/900 Multipurpose Grid: flies up to 23 LEOPARD cabinets with a 5:1 safety factor and BGV C1 with some angle restrictions. Always use MAPP to verify rigging load ratings. MTF-LYON/LEOPARD Transition Frame: with some restrictions, flies up to 10 LEOPARD cabinets at a 5:1 safety factor and BGV C1 for downfill below LYON arrays.',
      source: 'Same datasheet, Accessories',
      checked: false,
    },
    source: { url: 'https://docs.meyersound.com/pdf/leopard_ds_e2.pdf', document: 'Meyer Sound LEOPARD datasheet', version: '04.243.004.02 E2 (2021)', opened: OPENED },
  },
  {
    id: 'nexo-geo-m1220', brand: 'NEXO', model: 'GEO M1220', type: 'line_array',
    values: { sensitivity_db: 105, max_spl_db: 140, dispersion_h: 80, dispersion_v: 20, freq_low_hz: 50, freq_high_hz: 20000, impedance_ohm: 8, weight_kg: 34 },
    quotes: {
      sensitivity_db: 'Sensitivity 1W@1m 105 dB SPL Nominal',
      max_spl_db: 'Peak SPL@1m 140 dB',
      dispersion_h: 'Horizontal Dispersion 80° 120° 80° 120° (GEO M1210 without/with CDD, GEO M1220 without/with CDD)',
      dispersion_v: 'Vertical Dispersion 10° 20° (GEO M1210 / GEO M1220)',
      freq_low_hz: 'Frequency Response @-6 dB 50 Hz to 20 kHz',
      freq_high_hz: 'Frequency Response @-6 dB 50 Hz to 20 kHz',
      impedance_ohm: 'Nominal Impedance Active mode: (8 Ω LF + 16 Ω HF) / Passive mode: 8 Ω',
      weight_kg: 'Weight: Net 34 kg (75 lbs)',
    },
    conditions: { sensitivity_db: 'With NEXO processing', max_spl_db: 'Peak at 1 m; test signal not printed', dispersion_h: 'Without the optional CDD (120° with it)', freq_low_hz: '-6 dB', impedance_ohm: 'Passive mode' },
    notes: 'One datasheet for GEO M1210 and M1220; these are the M1220 values. Cabinets per amplifier channel depend on the NXAMP model.',
    rigging: {
      pickup_points: '1 or 2 hoists (not provided); 1 x VNT-BUMPM12; 1 x VNT-EXBARM12 for extended positive and negative bumper angles.',
      frame_limits: 'Maximum GEO M12 quantity for flown vertical cluster with VNT-BUMPM12 is 12 (and eventually less). Please check NS-1 for mechanical Safety Working Load and acoustic computations. Maximum GEO M12 quantity for flown vertical cluster with GMT-LBUMPM12 is 12 (and eventually less). GMT-LBUMPM12 is rated for a maximum of 3 stacked GEO M12 in any inter cabinet angle configuration.',
      source: 'NEXO GEO M12 – MSUB18 System manual, DP3941-03A-CM · https://www.nexo-sa.com/wp-content/uploads/GEOM12_MSUB18-System-Manual-Rev03a.pdf',
      checked: false,
    },
    source: { url: 'https://www.nexo-sa.com/wp-content/uploads/GeoM12_datasheet_v1.2.pdf', document: 'NEXO GEO M12 Line Array Element Data Sheet', version: 'not printed (file GeoM12_datasheet_v1.2)', opened: OPENED },
  },
]
