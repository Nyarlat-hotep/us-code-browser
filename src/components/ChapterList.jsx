import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import './ChapterList.css'

const base = import.meta.env.BASE_URL
const RECENT_YEAR = '2024'

export default function ChapterList() {
  const { num } = useParams()
  const [chapters, setChapters] = useState(null)
  const [titleInfo, setTitleInfo] = useState(null)
  const [updatedSlugs, setUpdatedSlugs] = useState(new Set())
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      fetch(base + 'data/index.json').then(r => r.json()),
      fetch(base + `data/title-${num}/chapters.json`).then(r => r.json()),
      fetch(base + 'data/versions/manifest.json').then(r => r.json()).catch(() => ({})),
    ]).then(([titles, chs, manifest]) => {
      setTitleInfo(titles.find(t => t.num === parseInt(num)))
      setChapters(chs)
      const updated = new Set(
        Object.entries(manifest)
          .filter(([key, years]) => key.startsWith(`title-${num}/`) && years.includes(RECENT_YEAR))
          .map(([key]) => key.split('/')[1])
      )
      setUpdatedSlugs(updated)
    }).catch(() => setError('Failed to load chapters'))
  }, [num])

  if (error) return <div className="cl-error">{error}</div>
  if (!chapters) return <div className="cl-loading">Loading…</div>

  return (
    <div>
      <nav className="cl-breadcrumb">
        <Link to="/">US Code</Link>
        <span> › </span>
        <span>{titleInfo ? `Title ${titleInfo.num}: ${titleInfo.heading}` : `Title ${num}`}</span>
      </nav>
      <h1 className="cl-heading">
        Title {num}{titleInfo ? ` — ${titleInfo.heading}` : ''}
      </h1>
      <div className="cl-list">
        {chapters.map(ch => (
          <button
            key={ch.slug}
            className={`cl-item${updatedSlugs.has(ch.slug) ? ' cl-item--updated' : ''}`}
            onClick={() => navigate(`/title/${num}/chapter/${ch.slug}`)}
          >
            <span className="cl-item-heading">{ch.heading}</span>
            <span className="cl-item-right">
              <span className="cl-item-meta">{ch.section_count} sections</span>
              {updatedSlugs.has(ch.slug) && (
                <span className="cl-item-badge">
                  Updated {RECENT_YEAR} <ArrowRight size={14} />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
