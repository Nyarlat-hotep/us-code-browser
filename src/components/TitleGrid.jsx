import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './TitleGrid.css'

const base = import.meta.env.BASE_URL
const RECENT_YEAR = '2024'

export default function TitleGrid() {
  const [titles, setTitles] = useState(null)
  const [updatedCounts, setUpdatedCounts] = useState({})
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      fetch(base + 'data/index.json').then(r => r.json()),
      fetch(base + 'data/versions/manifest.json').then(r => r.json()).catch(() => ({})),
    ]).then(([titlesData, manifest]) => {
      // Count how many chapters per title changed in the most recent year
      const counts = {}
      for (const [key, years] of Object.entries(manifest)) {
        if (years.includes(RECENT_YEAR)) {
          const titleNum = parseInt(key.split('/')[0].replace('title-', ''))
          counts[titleNum] = (counts[titleNum] || 0) + 1
        }
      }
      setTitles(titlesData)
      setUpdatedCounts(counts)
    }).catch(() => setError('Failed to load titles'))
  }, [])

  if (error) return <div className="tg-error">{error}</div>
  if (!titles) return <div className="tg-loading">Loading…</div>

  return (
    <div>
      <h1 className="tg-heading">United States Code</h1>
      <p className="tg-subheading">Browse all {titles.length} titles of federal law</p>
      <div className="tg-grid">
        {titles.map(t => (
          <button
            key={t.num}
            className={`tg-card${updatedCounts[t.num] ? ' tg-card--updated' : ''}`}
            onClick={() => navigate(`/title/${t.num}`)}
          >
            <span className="tg-card-num">Title {t.num}</span>
            <span className="tg-card-heading">{t.heading}</span>
            <span className="tg-card-meta">{t.chapters} ch · {t.sections.toLocaleString()} §§</span>
            {updatedCounts[t.num] && (
              <span className="tg-card-updated">
                {updatedCounts[t.num]} chapter{updatedCounts[t.num] !== 1 ? 's' : ''} updated
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
