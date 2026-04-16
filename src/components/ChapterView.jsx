import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import DiffMatchPatch from 'diff-match-patch'
import { ArrowLeft } from 'lucide-react'
import { diffToHtml } from '../utils/diff'
import './ChapterView.css'

const base = import.meta.env.BASE_URL
const RECENT_YEAR = '2024'

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

function stripMd(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function paragraphDiff(oldText, newText) {
  const oldParas = oldText.split(/\n\n+/).filter(p => p.trim())
  const newParas = newText.split(/\n\n+/).filter(p => p.trim())
  const dmp = new DiffMatchPatch()
  const oldJoined = oldParas.map(p => p.replace(/\s+/g, ' ').trim()).join('\n')
  const newJoined = newParas.map(p => p.replace(/\s+/g, ' ').trim()).join('\n')
  const { chars1: c1, chars2: c2, lineArray: arr } = dmp.diff_linesToChars_(oldJoined, newJoined)
  const diffs = dmp.diff_main(c1, c2, false)
  dmp.diff_charsToLines_(diffs, arr)
  const lines = []
  for (const [op, text] of diffs) {
    for (const line of text.split('\n').filter(l => l.trim())) {
      lines.push({ op, text: line })
    }
  }
  const changedIdx = new Set()
  lines.forEach((l, i) => { if (l.op !== 0) changedIdx.add(i) })
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
  const navigate = useNavigate()

  const [html, setHtml] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toc, setToc] = useState([])
  const [hasVersions, setHasVersions] = useState(false)
  const [changedCount, setChangedCount] = useState(0)
  const [error, setError] = useState(null)
  const contentRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    setHtml(null)

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

    Promise.all(fetches).then(async ([md, manifest, history, snapshotMd]) => {
      const content = md.replace(/^---[\s\S]*?---\n/, '')
      let rendered = marked(content)

      // ── Diff mode ─────────────────────────────────────────────────────
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
          const anchor = `<a id="section-${sectionId}"></a>`
          const anchorIdx = rendered.indexOf(anchor)
          if (anchorIdx === -1) continue
          const h2End = rendered.indexOf('</h2>', anchorIdx)
          if (h2End === -1) continue
          rendered = rendered.slice(0, h2End + 5) + block + rendered.slice(h2End + 5)
          diffCount++
        }
      }
      setChangedCount(diffCount)

      // ── Reading mode — stamps + word-level redlines ────────────────────
      if (history && !changesYear) {
        const uniqueYears = [...new Set(Object.values(history))]
        // Limit concurrent fetches to prevent overwhelming the browser
        const MAX_CONCURRENT_FETCHES = 5
        const snapshots = {}

        // Fetch snapshots in batches
        for (let i = 0; i < uniqueYears.length; i += MAX_CONCURRENT_FETCHES) {
          const batch = uniqueYears.slice(i, i + MAX_CONCURRENT_FETCHES)
          await Promise.all(batch.map(async year => {
            try {
              const res = await fetch(base + `data/versions/${year}/title-${num}/${slug}.md`)
              if (res.ok) snapshots[year] = parseSectionMap(await res.text())
            } catch {}
          }))
          // Yield to prevent blocking the main thread
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        const currentSections = parseSectionMap(md)
        let processedCount = 0
        const MAX_REDLINE_SECTIONS = 50 // Limit redlines to prevent crashes on huge chapters

        for (const [sectionId, year] of Object.entries(history)) {
          const anchor = `<a id="section-${sectionId}"></a>`
          const anchorIdx = rendered.indexOf(anchor)
          if (anchorIdx === -1) continue
          const h2End = rendered.indexOf('</h2>', anchorIdx)
          if (h2End === -1) continue
          let injection = `<span class="cv-stamp">Last amended: ${year}</span>`

          // Only compute redlines for first N sections to prevent crashes
          const oldSections = snapshots[year]
          if (oldSections && processedCount < MAX_REDLINE_SECTIONS) {
            const oldText = stripMd(oldSections[sectionId] || '')
            const newText = stripMd(currentSections[sectionId] || '')
            if (oldText && oldText !== newText) {
              try {
                const wordDiff = diffToHtml(oldText, newText)
                injection += `<div class="cv-redline"><span class="cv-redline-label">Redline vs ${year}</span><div class="cv-redline-text">${wordDiff}</div></div>`
              } catch {
                // Skip redline if diff computation fails
              }
            }
            processedCount++
          }
          rendered = rendered.slice(0, h2End + 5) + injection + rendered.slice(h2End + 5)
        }
      }

      setHtml(rendered)
      setLoading(false)

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

  useEffect(() => {
    if (html && window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [html])

  if (error) return <div className="cv-error">{error}</div>

  const isDiff = !!changesYear

  return (
    <div className="cv-layout">
      <aside className="cv-toc">
        <div className="cv-toc-inner">
          <Link to={`/title/${num}`} className="cv-back">
            <ArrowLeft size={16} /> Back to Title {num}
          </Link>

          {hasVersions && (
            <div className="cv-mode-toggle">
              <button
                className={`cv-mode-btn${!isDiff ? ' cv-mode-btn--active' : ''}`}
                onClick={() => navigate(`/title/${num}/chapter/${slug}`)}
              >Read</button>
              <button
                className={`cv-mode-btn${isDiff ? ' cv-mode-btn--active' : ''}`}
                onClick={() => navigate(`/title/${num}/chapter/${slug}?changes=${RECENT_YEAR}`)}
              >Diff</button>
            </div>
          )}

          {isDiff && !loading && (
            <div className="cv-diff-count">
              {changedCount > 0
                ? `${changedCount} section${changedCount !== 1 ? 's' : ''} changed since ${changesYear}`
                : `No changes found for ${changesYear}`}
            </div>
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

      <article className="cv-content" ref={contentRef}>
        {loading
          ? <div className="cv-spinner" />
          : <div dangerouslySetInnerHTML={{ __html: html }} />
        }
      </article>
    </div>
  )
}
