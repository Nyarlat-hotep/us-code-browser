import DiffMatchPatch from 'diff-match-patch'

// Returns an HTML string showing word-level diff with <ins>/<del> spans
export function diffToHtml(textA, textB) {
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(textA, textB)
  dmp.diff_cleanupSemantic(diffs)
  return diffs.map(([op, text]) => {
    const safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    if (op === 1) return `<ins class="cv-ins">${safe}</ins>`
    if (op === -1) return `<del class="cv-del">${safe}</del>`
    return safe
  }).join('')
}

export function computeLineDiff(textA, textB) {
  const dmp = new DiffMatchPatch()
  const [chars1, chars2, lineArray] = dmp.diff_linesToChars_(textA, textB)
  const diffs = dmp.diff_main(chars1, chars2, false)
  dmp.diff_charsToLines_(diffs, lineArray)
  // Normalize: op 0=equal, 1=insert, -1=delete (matches DMP's DIFF_EQUAL/INSERT/DELETE)
  return diffs.map(([op, text]) => ({ op, text }))
}
