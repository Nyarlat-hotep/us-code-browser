import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './TitleGrid.css'

const base = import.meta.env.BASE_URL

export default function TitleGrid() {
  const [titles, setTitles] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetch(base + 'data/index.json')
      .then(r => r.json())
      .then(setTitles)
      .catch(() => setError('Failed to load titles'))
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
            className="tg-card"
            onClick={() => navigate(`/title/${t.num}`)}
          >
            <span className="tg-card-num">Title {t.num}</span>
            <span className="tg-card-heading">{t.heading}</span>
            <span className="tg-card-meta">{t.chapters} ch · {t.sections.toLocaleString()} §§</span>
          </button>
        ))}
      </div>
    </div>
  )
}
