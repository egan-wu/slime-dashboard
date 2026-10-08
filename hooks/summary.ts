// A subagent's task summary laid out for the Party: wrapped to
// the pane's width so every line after the first hangs under the first's text.

// The model has its own line above, so a family name in the task's words
// (`Haiku test 1`, `Sonnet: review`) is left out of the summary.
export function cleanSummary(text: string): string {
  return text.replace(/\b(fable|opus|sonnet|haiku)\b:?/gi, '').replace(/\s+/g, ' ').trim() || 'subagent'
}

// Terminal cells a character takes: CJK and full-width forms take two.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
const cells = (text: string) => [...text].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0)

// Words break at spaces; a wide character is a word of its own, so CJK text
// wraps anywhere; a word longer than a line is split where the line ends.
function units(text: string): string[] {
  return text.match(/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[^\sᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]+|\s+/g) ?? []
}

export function wrapSummary(text: string, width: number, maxLines = 3): string[] {
  const lines: string[] = []
  let line = ''
  const push = () => {
    lines.push(line.trimEnd())
    line = ''
  }
  for (const unit of units(text)) {
    if (/^\s+$/.test(unit)) {
      if (line !== '') line += ' '
      continue
    }
    let rest = unit
    while (rest !== '') {
      const room = width - cells(line)
      if (cells(rest) <= room) {
        line += rest
        rest = ''
      } else if (line.trim() !== '' && cells(rest) <= width) {
        push()
      } else {
        // Split what does not fit even on a line of its own.
        let head = ''
        for (const ch of rest) {
          if (cells(head + ch) > room) break
          head += ch
        }
        if (head === '') {
          push()
          continue
        }
        line += head
        rest = rest.slice(head.length)
        push()
      }
    }
  }
  if (line.trim() !== '') push()

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]!
  while (last !== '' && cells(last) + 1 > width) last = [...last].slice(0, -1).join('')
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

// The session's name from `grep -o` over its transcript, one
// `"customTitle":"…"` or `"aiTitle":"…"` a line, oldest first: the last name
// /rename gave wins over any Claude Code made up.
export function titleFrom(lines: string): string | undefined {
  let custom: string | undefined
  let made: string | undefined
  for (const line of lines.split('\n')) {
    const m = line.match(/^"(customTitle|aiTitle)":(".*")$/)
    if (!m) continue
    let value: string
    try {
      value = JSON.parse(m[2]!) as string
    } catch {
      continue
    }
    if (m[1] === 'customTitle') custom = value
    else made = value
  }
  return custom ?? made
}
