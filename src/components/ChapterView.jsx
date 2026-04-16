import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import './ChapterView.css'

const base = import.meta.env.BASE_URL

export default function ChapterView() {
  const { num, slug } = useParams()
  const [html, setHtml] = useState(null)
  const [toc, setToc] = useState([])
  const [hasVersions, setHasVersions] = useState(false)
  const [error, setError] = useState(null)
  const contentRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Fetch chapter markdown, version manifest, and section history in parallel
    Promise.all([
      fetch(base + `data/title-${num}/${slug}.md`).then(r => {
        if (!r.ok) throw new Error('Chapter not found')
        return r.text()
      }),
      fetch(base + 'data/versions/manifest.json').then(r => r.json()).catch(() => ({})),
      fetch(base + `data/title-${num}/${slug}-history.json`).then(r => r.json()).catch(() => null),
    ]).then(([md, manifest, history]) => {
      // Strip YAML frontmatter
      const content = md.replace(/^---[\s\S]*?---\n/, '')
      let rendered = marked(content)

      // Inject section history stamps into rendered HTML
      if (history) {
        rendered = rendered.replace(
          /<a id="section-([^"]+)"><\/a>(\s*<h2[^>]*>[\s\S]*?<\/h2>)/g,
          (match, sectionId, h2) => {
            const year = history[sectionId]
            if (!year) return match
            const label = `Last amended: ${year}`
            return `<a id="section-${sectionId}"></a>${h2}<span class="cv-stamp">${label}</span>`
          }
        )
      }

      setHtml(rendered)

      // Extract TOC from ## § headings
      const tocItems = []
      const headingRe = /<a id="section-([^"]+)"><\/a>\n## §\s*([^\n]+)/g
      let m
      while ((m = headingRe.exec(content)) !== null) {
        tocItems.push({ id: `section-${m[1]}`, label: `§ ${m[2].trim()}` })
      }
      setToc(tocItems.slice(0, 80)) // cap TOC at 80 entries

      // Check if this chapter has historical versions
      const manifestKey = `title-${num}/${slug}`
      setHasVersions(!!(manifest[manifestKey]?.length))
    }).catch(() => setError('Failed to load chapter'))
  }, [num, slug])

  // Scroll to hash section after render
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
          {hasVersions && (
            <button
              className="cv-compare-btn"
              onClick={() => navigate(`/compare?title=${num}&chapter=${slug}`)}
            >
              Compare versions
            </button>
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
