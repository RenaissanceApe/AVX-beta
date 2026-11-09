// Small MVR and GDTF files made from the standards (DIN SPEC 15800 / 15801), for the unit tests,
// the help screenshots and trying the import by hand (scripts/mvr-samples.mjs writes them to
// docs/samples/). Each MVR is written the way one program writes it (see the notes in mvr.js).
// Made-up fixture types; no real manufacturer's file is copied.
import { zipSync, strToU8 } from 'fflate'
import { esc } from './mvr'

// A GDTF file: modes with `channels` channels each; `pixels` instances of a cell geometry for
// a pixel mode (each cell's channels repeated at its own offset)
export function sampleGdtf({ manufacturer = 'Sample', name, id, weight = null, power = null, modes = [], pixels = 0 }) {
  const modeXml = modes.map(m => {
    const own = Array.from({ length: m.channels }, (_, i) => `<DMXChannel DMXBreak="1" Offset="${i + 1}" Geometry="Body"><LogicalChannel Attribute="Dimmer"/></DMXChannel>`)
    const cell = m.pixelChannels
      ? Array.from({ length: m.pixelChannels }, (_, i) => `<DMXChannel DMXBreak="1" Offset="${m.channels + i + 1}" Geometry="Cell"><LogicalChannel Attribute="ColorAdd_R"/></DMXChannel>`)
      : []
    return `<DMXMode Name="${esc(m.name)}" Geometry="Base"><DMXChannels>${own.join('')}${cell.join('')}</DMXChannels></DMXMode>`
  })
  // Each reference shifts the cell's channels by (cell n − 1) × channels per cell
  const refs = Array.from({ length: pixels }, (_, i) => {
    const pc = modes.find(m => m.pixelChannels)?.pixelChannels || 0
    return `<GeometryReference Name="Cell ${i + 1}" Geometry="Cell"><Break DMXBreak="1" DMXOffset="${1 + i * pc}"/></GeometryReference>`
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType Name="${esc(name)}" ShortName="${esc(name)}" LongName="${esc(name)}" Manufacturer="${esc(manufacturer)}" FixtureTypeID="${esc(id)}" Description="Sample fixture type for tests">
    <AttributeDefinitions/>
    <PhysicalDescriptions>
      <Properties>
        ${weight !== null ? `<Weight Value="${weight}"/>` : ''}
        ${power !== null ? `<PowerConsumption Value="${power}" PowerFactor="1" Connector="PowerIn"/>` : ''}
      </Properties>
    </PhysicalDescriptions>
    <Models/>
    <Geometries>
      <Geometry Name="Base"><Geometry Name="Body"/>${refs.join('')}</Geometry>
      <Geometry Name="Cell"/>
    </Geometries>
    <DMXModes>${modeXml.join('')}</DMXModes>
    <Revisions><Revision Text="Made for AVX tests" Date="2026-11-09T00:00:00"/></Revisions>
  </FixtureType>
</GDTF>`
  return zipSync({ 'description.xml': strToU8(xml) })
}

export const SAMPLE_TYPES = {
  spot: { manufacturer: 'Sample', name: 'Spot 300', id: '11111111-2222-4333-8444-555555555555', weight: 21.5, power: 450, modes: [{ name: 'Standard', channels: 18 }, { name: 'Basic', channels: 12 }] },
  wash: { manufacturer: 'Sample', name: 'Pixel Wash', id: '66666666-7777-4888-8999-aaaaaaaaaaaa', weight: 9.8, power: 320, pixels: 4, modes: [{ name: 'Simple', channels: 8 }, { name: 'Pixel', channels: 4, pixelChannels: 3 }] },
}

const fixture = ({ name, uuid, spec, mode, id, unit, address, matrix, position }) => [
  `<Fixture name="${esc(name)}" uuid="${uuid}">`,
  matrix ? `<Matrix>${matrix}</Matrix>` : '',
  `<GDTFSpec>${esc(spec)}</GDTFSpec><GDTFMode>${esc(mode)}</GDTFMode>`,
  position ? `<Position>${position}</Position>` : '',
  id !== undefined ? `<FixtureID>${id}</FixtureID>` : '<FixtureID></FixtureID>',
  unit !== undefined ? `<UnitNumber>${unit}</UnitNumber>` : '',
  address ? `<Addresses><Address break="0">${address}</Address></Addresses>` : '<Addresses/>',
  '</Fixture>',
].join('')
const scene = (provider, aux, layers) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<GeneralSceneDescription verMajor="1" verMinor="6" provider="${provider}" providerVersion="1">
<Scene><AUXData>${aux}</AUXData><Layers>${layers}</Layers></Scene>
</GeneralSceneDescription>`
const at = (x, y, z) => `{1,0,0}{0,1,0}{0,0,1}{${x},${y},${z}}`
const u = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const files = () => ({ 'Sample@Spot 300.gdtf': sampleGdtf(SAMPLE_TYPES.spot), 'Sample@Pixel Wash.gdtf': sampleGdtf(SAMPLE_TYPES.wash) })

// Vectorworks style: hanging positions in AUXData, GDTFSpec without ".gdtf", numbers only in
// UnitNumber, absolute addresses. Four spots on "LX1" at 7 m, two washes on "FOH" at 6 m.
export function sampleMvrVectorworks() {
  const pos = `<Position name="LX1" uuid="${u(901)}"/><Position name="FOH" uuid="${u(902)}"/>`
  const list = [
    ...[-3000, -1000, 1000, 3000].map((x, i) => fixture({ name: `Spot ${i + 1}`, uuid: u(i + 1), spec: 'Sample@Spot 300', mode: 'Standard', unit: 101 + i, address: 1 + i * 18, matrix: at(x, 4000, 7000), position: u(901) })),
    ...[-2000, 2000].map((x, i) => fixture({ name: `Wash ${i + 1}`, uuid: u(i + 11), spec: 'Sample@Pixel Wash', mode: 'Pixel', unit: 201 + i, address: 513 + i * 16, matrix: at(x, -5000, 6000), position: u(902) })),
  ]
  return zipSync({ 'GeneralSceneDescription.xml': strToU8(scene('Vectorworks', pos, `<Layer name="Lighting" uuid="${u(800)}"><ChildList>${list.join('')}</ChildList></Layer>`)), ...files() })
}

// grandMA3 style: fixtures grouped per position in GroupObjects with their own transform, a
// multi-instance fixture with parts inside it (parts without an address don't count),
// FixtureIDs, absolute addresses
export function sampleMvrGrandMA3() {
  const spots = [0, 2000].map((x, i) => fixture({ name: `Spot ${i + 1}`, uuid: u(21 + i), spec: 'Sample@Spot 300.gdtf', mode: 'Basic', id: 1 + i, address: 1 + i * 12, matrix: at(x, 0, 0) }))
  const wash = `<Fixture name="Wash 1" uuid="${u(31)}"><Matrix>${at(0, 0, 0)}</Matrix><GDTFSpec>Sample@Pixel Wash.gdtf</GDTFSpec><GDTFMode>Simple</GDTFMode><FixtureID>11</FixtureID><Addresses><Address break="0">1025</Address></Addresses><ChildList>${fixture({ name: 'Wash 1 cell', uuid: u(32), spec: 'Sample@Pixel Wash.gdtf', mode: 'Simple' })}</ChildList></Fixture>`
  const layers = `<Layer name="Layer 1" uuid="${u(810)}"><ChildList>`
    + `<GroupObject name="Back truss" uuid="${u(811)}"><Matrix>${at(-1000, 5000, 8000)}</Matrix><ChildList>${spots.join('')}</ChildList></GroupObject>`
    + `<GroupObject name="Floor" uuid="${u(812)}"><Matrix>${at(0, 1000, 0)}</Matrix><ChildList>${wash}</ChildList></GroupObject>`
    + '</ChildList></Layer>'
  return zipSync({ 'GeneralSceneDescription.xml': strToU8(scene('grandMA3', '', layers)), ...files() })
}

// Capture style: fixtures as children of the truss they hang on, a transform on the layer and
// the truss, addresses as "universe.address", no GDTF file for one fixture type
export function sampleMvrCapture() {
  const list = [-1500, 1500].map((x, i) => fixture({ name: `Spot ${i + 1}`, uuid: u(41 + i), spec: 'Sample@Spot 300.gdtf', mode: 'Standard', id: 1 + i, address: `1.${1 + i * 18}`, matrix: at(x, 0, -300) }))
  const other = fixture({ name: 'Strobe 1', uuid: u(51), spec: 'Other@Strobe X.gdtf', mode: '4ch', id: 9, address: '1.100', matrix: at(0, 0, -300) })
  const layers = `<Layer name="Rig" uuid="${u(820)}"><Matrix>${at(0, 1000, 0)}</Matrix><ChildList>`
    + `<Truss name="Truss A" uuid="${u(821)}"><Matrix>${at(0, 3000, 7300)}</Matrix><Geometries/><ChildList>${list.join('')}${other}</ChildList></Truss>`
    + '</ChildList></Layer>'
  return zipSync({ 'GeneralSceneDescription.xml': strToU8(scene('Capture', '', layers)), 'Sample@Spot 300.gdtf': sampleGdtf(SAMPLE_TYPES.spot) })
}
