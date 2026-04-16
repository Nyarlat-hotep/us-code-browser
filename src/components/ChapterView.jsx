import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import DiffMatchPatch from 'diff-match-patch'
import './ChapterView.css'

const base = import.meta.env.BASE_URL

// Parse { sectionId: bodyText } map from raw chapter markdown
function parseSectionMap(md) {
  const content = md.replace(/^---[\s\S]*?---\n/, '')
  const re = /<a id="section-([^"]+)"><\/a>\n## §\s*[^\n]+\n\n?([\s\S]*?)(?=<a id=|$)/g
  const map = {}
  let m
  while ((m = re.exec(content)) !== null) {
    map[m[1]] = m[2]
  }
  return map
}

// Diff two texts at paragraph level. Returns array of {type, text} where
// type is 'equal'|'add'|'del'. Only changed paragraphs (+ 1 context para) are included.
function paragraphDiff(oldText, newText) {
  const oldParas = oldText.split(/\n\n+/).filter(p => p.trim())
  const newParas = newText.split(/\n\n+/).filter(p => p.trim())

  const dmp = new DiffMatchPatch()
  // Use line-level diff treating each paragraph as a "line"
  const oldJoined = oldParas.map(p => p.replace(/\s+/g, ' ').trim()).join('\n')
  const newJoined = newParas.map(p => p.replace(/\s+/g, ' ').trim()).join('\n')
  const [c1, c2, arr] = dmp.diff_linesToChars_(oldJoined, newJoined)
  const diffs = dmp.diff_main(c1, c2, false)
  dmp.diff_charsToLines_(diffs, arr)

  // Collect changed lines and 1 context line on each side
  const lines = [] // {op, text}
  for (const [op, text] of diffs) {
    for (const line of text.split('\n').filter(l => l.trim())) {
      lines.push({ op, text: line })
    }
  }

  // Find which indices are changed
  const changedIdx = new Set()
  lines.forEach((l, i) => { if (l.op !== 0) changedIdx.add(i) })

  // Include changed lines + 1 context each side
  const included = new Set()
  for (const i of changedIdx) {
    if (i > 0) included.add(i - 1)
    included.add(i)
    if (i < lines.length - 1) included.add(i + 1)
  }

  const result = []
  let prevIdx = -1
  for (const i of [...included].sort((a, b) => a - b)) {
    if (prevIdx !== -1 && i > prevIdx + 1) result.push({ op: 'gap' })
    result.push(lines[i])
    prevIdx = i
  }
  return result
}

// Build the diff block HTML for a changed section
function buildDiffBlock(sectionId, oldText, newText, year) {
  if (!oldText) {
    return `<div class="cv-diff-block cv-diff-new"><span class="cv-diff-label cv-diff-label-new">New section added after ${year}</span></div>`
  }
  const paras = paragraphDiff(oldText, newText)
  if (paras.length === 0) return ''

  const rows = paras.map(p => {
    if (p.op === 'gap') return `<div class="cv-diff-gap">⋯</div>`
    if (p.op === 1)  return `<div class="cv-diff-add">${p.text.replace(/</g,'&lt;')}</div>`
    if (p.op === -1) return `<div class="cv-diff-del">${p.text.replace(/</g,'&lt;')}</div>`
    return `<div class="cv-diff-eq">${p.text.replace(/</g,'&lt;')}</div>`
  }).join('')

  return `<div class="cv-diff-block"><div class="cv-diff-label">Changes since ${year}</div><div class="cv-diff-body">${rows}</div></div>`
}

export default function ChapterView() {
  const { num, slug } = useParams()
  const [searchParams] = useSearchParams()
  const changesYear = searchParams.get('changes')

  const [html, setHtml] = useState(null)
  const [toc, setToc] = useState([])
  const [hasVersions, setHasVersions] = useState(false)
  const [changedCount, setChangedCount] = useState(0)
  const [error, setError] = useState(null)
  const contentRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fetches = [
      fetch(base + `data/title-${num}/${slug}.md`).then(r => {
        if (!r.ok) throw new Error('Chapter not found')
        return r.text()
      }),
      fetch(base + 'data/versions/manifest.json').then(r => r.json()).catch(() => ({})),
      fetch(base + `data/title-${num}/${slug}-history.json`).then(r => r.json()).catch(() => null),
    ]

    if (changesYear) {
      fetches.push(
        fetch(base + `data/versions/${changesYear}/title-${num}/${slug}.md`)
          .then(r => r.ok ? r.text() : null)
          .catch(() => null)
      )
    }

    Promise.all(fetches).then(([md, manifest, history, snapshotMd]) => {
      const content = md.replace(/^---[\s\S]*?---\n/, '')
      let rendered = marked(content)

      // ── Inline diff injection (changes mode) ──────────────────────────
      let diffCount = 0
      if (changesYear && history) {
        const currentSections = parseSectionMap(md)
        const oldSections = snapshotMd ? parseSectionMap(snapshotMd) : {}

        for (const [sectionId, changedAt] of Object.entries(history)) {
          if (changedAt !== changesYear) continue

          const oldText = (oldSections[sectionId] || '').replace(/\s+/g, ' ').trim()
          const newText = (currentSections[sectionId] || '').replace(/\s+/g, ' ').trim()
          if (oldText === newText) continue

          const block = buildDiffBlock(sectionId, oldText || null, newText, changesYear)
          if (!block) continue

          // Insert after the </h2> that follows this section's anchor
          const anchor = `<a id="section-${sectionId}"></a>`
          const anchorIdx = rendered.indexOf(anchor)
          if (anchorIdx === -1) continue
          const h2End = rendered.indexOf('</h2>', anchorIdx)
          if (h2End === -1) continue
          const insertAt = h2End + 5
          rendered = rendered.slice(0, insertAt) + block + rendered.slice(insertAt)
          diffCount++
        }
      }
      setChangedCount(diffCount)

      // ── Section amendment stamps (reading mode only) ───────────────────
      // marked wraps <a> in <p>, so we use indexOf rather than regex
      if (history && !changesYear) {
        for (const [sectionId, year] of Object.entries(history)) {
          const anchor = `<a id="section-${sectionId}"></a>`
          const anchorIdx = rendered.indexOf(anchor)
          if (anchorIdx === -1) continue
          const h2End = rendered.indexOf('</h2>', anchorIdx)
          if (h2End === -1) continue
          const stamp = `<span class="cv-stamp">Last amended: ${year}</span>`
          const insertAt = h2End + 5
          rendered = rendered.slice(0, insertAt) + stamp + rendered.slice(insertAt)
        }
      }

      setHtml(rendered)

      // TOC
      const tocItems = []
      const headingRe = /<a id="section-([^"]+)"><\/a>\n## §\s*([^\n]+)/g
      let m
      while ((m = headingRe.exec(content)) !== null) {
        tocItems.push({ id: `section-${m[1]}`, label: `§ ${m[2].trim()}` })
      }
      setToc(tocItems.slice(0, 80))

      const manifestKey = `title-${num}/${slug}`
      setHasVersions(!!(manifest[manifestKey]?.length))
    }).catch(() => setError('Failed to load chapter'))
  }, [num, slug, changesYear])

  // Scroll to hash after render
  useEffect(() => {
    if (html && window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [html])

  if (error) return <div className="cv-error">{error}</div>
  if (!html) return <div className="cv-loading">Loading…</div>

  return (
    <div className="cv-layout">
      <aside className="cv-toc">
        <div className="cv-toc-inner">
          <Link to={`/title/${num}`} className="cv-back">← Back to Title {num}</Link>

          {changesYear ? (
            <div className="cv-changes-mode">
              <div className="cv-changes-badge">
                {changedCount > 0
                  ? `${changedCount} section${changedCount !== 1 ? 's' : ''} changed since ${changesYear}`
                  : `No section-level changes found for ${changesYear}`}
              </div>
              <Link
                to={`/title/${num}/chapter/${slug}`}
                className="cv-changes-exit"
              >
                ← Reading mode
              </Link>
            </div>
          ) : (
            hasVersions && (
              <button
                className="cv-compare-btn"
                onClick={() => navigate(`/compare?title=${num}&chapter=${slug}`)}
              >
                Compare versions
              </button>
            )
          )}

          {toc.length > 0 && (
            <>
              <p className="cv-toc-label">Sections</p>
              <ul className="cv-toc-list">
                {toc.map(item => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="cv-toc-link">{item.label}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
      <article
        className="cv-content"
        ref={contentRef}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
