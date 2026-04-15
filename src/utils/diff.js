import DiffMatchPatch from 'diff-match-patch'

export function computeLineDiff(textA, textB) {
  const dmp = new DiffMatchPatch()
  const [chars1, chars2, lineArray] = dmp.diff_linesToChars_(textA, textB)
  const diffs = dmp.diff_main(chars1, chars2, false)
  dmp.diff_charsToLines_(diffs, lineArray)
  // Normalize: op 0=equal, 1=insert, -1=delete (matches DMP's DIFF_EQUAL/INSERT/DELETE)
  return diffs.map(([op, text]) => ({ op, text }))
}
