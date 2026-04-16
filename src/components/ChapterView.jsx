import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import { diffToHtml } from '../utils/diff'
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
      if (changesYear && snapshotMd && history) {
        const currentSections = parseSectionMap(md)
        const oldSections = parseSectionMap(snapshotMd)

        for (const [sectionId, changedAt] of Object.entries(history)) {
          if (changedAt !== changesYear) continue

          const oldText = (oldSections[sectionId] || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
          const newText = (currentSections[sectionId] || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
          if (oldText === newText) continue

          const isNew = !oldSections[sectionId]
          const block = isNew
            ? `<div class="cv-diff-block cv-diff-new"><span class="cv-diff-label">Added after ${changesYear}</span></div>`
            : `<div class="cv-diff-block"><span class="cv-diff-label">Changes since ${changesYear}</span><div class="cv-diff-content">${diffToHtml(oldText, newText)}</div></div>`

          // Insert after the closing </h2> for this section
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
      if (history && !changesYear) {
        rendered = rendered.replace(
          /<a id="section-([^"]+)"><\/a>(\s*<h2[^>]*>[\s\S]*?<\/h2>)/g,
          (match, sectionId, h2) => {
            const year = history[sectionId]
            if (!year) return match
            return `<a id="section-${sectionId}"></a>${h2}<span class="cv-stamp">Last amended: ${year}</span>`
          }
        )
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
                  : `No section changes found for ${changesYear}`}
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
