import { describe, it, expect } from 'vitest'
import { slugify, fileExtension, storagePath, findAssetToSupersede, formatBytes, MAX_UPLOAD_BYTES } from './files'

describe('slugify', () => {
  it('strips accents and symbols', () => {
    expect(slugify('Patch Lista — Coliseu Ação #2')).toBe('Patch-Lista-Coliseu-Acao-2')
  })
  it('falls back when nothing is left', () => {
    expect(slugify('***')).toBe('file')
    expect(slugify('')).toBe('file')
  })
  it('limits length', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(60)
  })
})

describe('fileExtension', () => {
  it('lowercases the last extension', () => {
    expect(fileExtension('Stage.Plot.PDF')).toBe('pdf')
  })
  it('handles names without an extension', () => {
    expect(fileExtension('README')).toBe('bin')
  })
})

describe('storagePath', () => {
  it('puts files in the gig folder (required by storage policies)', () => {
    const gig = '5a70284e-a233-4896-b10f-f082213c55c4'
    expect(storagePath(gig, 'Stage Plot', 'plot.pdf', 123)).toBe(`${gig}/123-Stage-Plot.pdf`)
  })
})

describe('findAssetToSupersede', () => {
  const assets = [
    { id: '1', type: 'document', name: 'Rider', version: 1 },
    { id: '2', type: 'document', name: 'Contract', version: 2 },
    { id: '3', type: 'plot', name: 'Rider', version: 1 },
  ]
  it('matches same type and name, ignoring case and spaces', () => {
    expect(findAssetToSupersede(assets, 'document', '  contract ')?.id).toBe('2')
  })
  it('does not replace a different document of the same type', () => {
    expect(findAssetToSupersede(assets, 'document', 'Schedule')).toBeNull()
  })
  it('does not match across types', () => {
    expect(findAssetToSupersede(assets, 'plot', 'Contract')).toBeNull()
  })
})

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe('50.0 MB')
  })
})
