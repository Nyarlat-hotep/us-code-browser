import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { marked } from 'marked'
import { ArrowLeft } from 'lucide-react'
import { diffToHtml } from '../utils/diff'
import './ChapterView.css'

const base = import.meta.env.BASE_URL

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

export default function ChapterView() {
  const { num, slug } = useParams()

  const [rawMd, setRawMd] = useState(null)
  const [history, setHistory] = useState(null)
  const [availableYears, setAvailableYears] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [html, setHtml] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toc, setToc] = useState([])
  const [hasVersions, setHasVersions] = useState(false)
  const [changedCount, setChangedCount] = useState(0)
  const [error, setError] = useState(null)
  const contentRef = useRef(null)
  const snapshotCache = useRef({})

  // Fetch chapter data
  useEffect(() => {
    setLoading(true)
    setHtml(null)
    setRawMd(null)
    snapshotCache.current = {}

    Promise.all([
      fetch(base + `data/title-${num}/${slug}.md`).then(r => {
        if (!r.ok) throw new Error('Chapter not found')
        return r.text()
      }),
      fetch(base + 'data/versions/manifest.json').then(r => r.json()).catch(() => ({})),
      fetch(base + `data/title-${num}/${slug}-history.json`).then(r => r.json()).catch(() => null),
    ]).then(([md, manifest, hist]) => {
      const manifestKey = `title-${num}/${slug}`
      const years = manifest[manifestKey] || []
      setAvailableYears(years)
      setHasVersions(years.length > 0)
      setSelectedYear(years.length > 0 ? years[years.length - 1] : null)
      setRawMd(md)
      setHistory(hist)

      const content = md.replace(/^---[\s\S]*?---\n/, '')
      const tocItems = []
      const headingRe = /<a id="section-([^"]+)"><\/a>\n## §\s*([^\n]+)/g
      let m
      while ((m = headingRe.exec(content)) !== null) {
        tocItems.push({ id: `section-${m[1]}`, label: `§ ${m[2].trim()}` })
      }
      setToc(tocItems.slice(0, 80))
    }).catch(() => setError('Failed to load chapter'))
  }, [num, slug])

  // Render HTML when data or selected year changes
  useEffect(() => {
    if (!rawMd) return

    const render = async () => {
      setLoading(true)
      const content = rawMd.replace(/^---[\s\S]*?---\n/, '')
      let rendered = marked(content)

      if (history && selectedYear) {
        let snapshot = snapshotCache.current[selectedYear]
        if (!snapshot) {
          try {
            const res = await fetch(base + `data/versions/${selectedYear}/title-${num}/${slug}.md`)
            if (res.ok) {
              snapshot = parseSectionMap(await res.text())
              snapshotCache.current[selectedYear] = snapshot
            }
          } catch {}
        }

        const currentSections = parseSectionMap(rawMd)
        let count = 0
        let processedCount = 0
        const MAX_REDLINE_SECTIONS = 50

        for (const [sectionId, year] of Object.entries(history)) {
          if (year !== selectedYear) continue

          const anchor = `<a id="section-${sectionId}"></a>`
          const anchorIdx = rendered.indexOf(anchor)
          if (anchorIdx === -1) continue
          const h2End = rendered.indexOf('</h2>', anchorIdx)
          if (h2End === -1) continue

          let injection = `<span class="cv-stamp">Last amended: ${year}</span>`

          if (snapshot && processedCount < MAX_REDLINE_SECTIONS) {
            const oldText = stripMd(snapshot[sectionId] || '')
            const newText = stripMd(currentSections[sectionId] || '')
            if (oldText && oldText !== newText) {
              try {
                const wordDiff = diffToHtml(oldText, newText)
                injection += `<div class="cv-redline"><span class="cv-redline-label">Redline vs ${year}</span><div class="cv-redline-text">${wordDiff}</div></div>`
              } catch {}
            }
            processedCount++
          }

          rendered = rendered.slice(0, h2End + 5) + injection + rendered.slice(h2End + 5)
          count++
          if (processedCount % 10 === 0) await new Promise(r => setTimeout(r, 0))
        }
        setChangedCount(count)
      } else {
        setChangedCount(0)
      }

      setHtml(rendered)
      setLoading(false)
    }

    render()
  }, [rawMd, history, selectedYear, num, slug])

  useEffect(() => {
    if (html && window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [html])

  if (error) return <div className="cv-error">{error}</div>

  return (
    <div className="cv-layout">
      <aside className="cv-toc">
        <div className="cv-toc-inner">
          <Link to={`/title/${num}`} className="cv-back">
            <ArrowLeft size={16} /> Back to Title {num}
          </Link>

          {hasVersions && (
            <div className="cv-year-selector">
              <label className="cv-year-label">Show changes from</label>
              <select
                className="cv-year-select"
                value={selectedYear || ''}
                onChange={e => setSelectedYear(e.target.value || null)}
              >
                <option value="">None</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {!loading && changedCount > 0 && selectedYear && (
                <div className="cv-diff-count">
                  {changedCount} section{changedCount !== 1 ? 's' : ''} changed in {selectedYear}
                </div>
              )}
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
