import { describe, it, expect } from 'vitest'
import { TOOLS, ALL_TOOL_IDS, toolsToAdd, nextChannel, channelGaps, inputsToEquipment, inputCounts } from './tools'

describe('field tools', () => {
  it('only knows tools the database allows', () => {
    expect(TOOLS.every(t => ALL_TOOL_IDS.includes(t.id))).toBe(true)
  })

  it('offers ready tools the organisation uses and the gig doesn\'t have', () => {
    expect(toolsToAdd(['input_list', 'stage_plot'], [])).toEqual(['input_list', 'stage_plot'])
    expect(toolsToAdd(['patch', 'dmx_patch'], ['patch'])).toEqual(['dmx_patch'])
    expect(toolsToAdd(['input_list'], ['input_list'])).toEqual([])
    expect(toolsToAdd(['stage_plot'], ['stage_plot'])).toEqual([])
    expect(toolsToAdd(null, ['input_list', 'patch'])).toEqual(['stage_plot', 'dmx_patch'])
  })

  it('numbers new channels after the last one and spots gaps', () => {
    expect(nextChannel([])).toBe(1)
    expect(nextChannel([{ channel: 1 }, { channel: 7 }])).toBe(8)
    expect(channelGaps([{ channel: 1 }, { channel: 4 }])).toEqual([2, 3])
    expect(channelGaps([])).toEqual([])
  })

  it('turns linked mics into equipment still to plan', () => {
    const inputs = [{ item_id: 'sm58' }, { item_id: 'sm58' }, { item_id: 'di' }, { item_id: null }]
    expect(inputsToEquipment(inputs, [{ item_id: 'sm58', quantity: 1 }])).toEqual([
      { item_id: 'sm58', needed: 2, planned: 1, add: 1 },
      { item_id: 'di', needed: 1, planned: 0, add: 1 },
    ])
  })

  it('counts inputs, 48V and lines checked', () => {
    expect(inputCounts([{ phantom: true, checked: true }, { phantom: false }])).toEqual({ total: 2, phantom: 1, checked: 1 })
  })
})
