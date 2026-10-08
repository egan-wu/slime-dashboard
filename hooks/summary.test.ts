import { expect, test } from 'claude-code/testing'

import { agoText, cleanSummary, recentFrom, wrapSummary, titleFrom } from './summary'

test('a summary leaves the model family out', async () => {
  expect(cleanSummary('Haiku test 1')).toBe('test 1')
  expect(cleanSummary('Sonnet: review mod for bugs')).toBe('review mod for bugs')
  expect(cleanSummary('Opus')).toBe('subagent')
})

test('a long summary wraps at words, every line within the width', async () => {
  const lines = wrapSummary('review the slime dashboard mod for bugs', 12)
  expect(lines).toEqual(['review the', 'slime', 'dashboard…'])
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(12)
})

test('a short summary stays one line', async () => {
  expect(wrapSummary('count scene lines', 26)).toEqual(['count scene lines'])
})

test('CJK text wraps by cells, two to a character', async () => {
  expect(wrapSummary('檢查史萊姆面板的錯誤', 8)).toEqual(['檢查史萊', '姆面板的', '錯誤'])
})

test('a word longer than a line is split', async () => {
  expect(wrapSummary('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
})

test('the session name: the last /rename wins over any made-up name', () => {
  expect(titleFrom('"aiTitle":"First"\n"aiTitle":"Slim-dashboard 動畫互動"\n')).toBe('Slim-dashboard 動畫互動')
  expect(titleFrom('"customTitle":"mine"\n"aiTitle":"later"\n')).toBe('mine')
  expect(titleFrom('')).toBeUndefined()
})

test('recent sessions: the others typed into, newest first, by name or else by time', () => {
  const found = [
    { id: 'me', at: 9, lines: '"type":"user"\n"aiTitle":"This one"' },
    { id: 'a', at: 1, lines: '"type":"user"\n"aiTitle":"Old"' },
    { id: 'b', at: 5, lines: '"type":"user"' },
    { id: 'c', at: 7, lines: '"aiTitle":"Empty"' },
  ]
  expect(recentFrom(found, 'me', 8, at => `t${at}`)).toEqual([
    { id: 'b', title: 't5', at: 5 },
    { id: 'a', title: 'Old', at: 1 },
  ])
  expect(recentFrom(found, 'me', 1, at => `t${at}`)).toHaveLength(1)
  expect([0, 59_000, 120_000, 3 * 3_600_000, 2 * 86_400_000].map(ms => agoText(0, ms))).toEqual(['now', 'now', '2m', '3h', '2d'])
})
