import { expect, test } from 'claude-code/testing'

import { cleanSummary, wrapSummary, titleFrom } from './summary'

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
