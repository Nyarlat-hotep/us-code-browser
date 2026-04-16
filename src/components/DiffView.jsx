import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { computeLineDiff } from '../utils/diff'
import './DiffView.css'

const base = import.meta.env.BASE_URL

async function fetchVersion(titleNum, chapterSlug, year) {
  // 'current' means the HEAD version at public/data/title-{N}/chapter-{slug}.md
  // chapterSlug already includes the "chapter-" prefix (e.g. "chapter-001-general-provisions")
  const url = year === 'current'
    ? base + `data/title-${titleNum}/${chapterSlug}.md`
    : base + `data/versions/${year}/title-${titleNum}/${chapterSlug}.md`
  const text = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch ${url}`)
    return r.text()
  })
  // Strip YAML frontmatter
  return text.replace(/^---[\s\S]*?---\n/, '')
}

export default function DiffView() {
  const [searchParams] = useSearchParams()
  const titleNum = searchParams.get('title')
  const chapterSlug = searchParams.get('chapter')

  const [manifest, setManifest] = useState(null)
  const [yearA, setYearA] = useState('')
  const [yearB, setYearB] = useState('current')
  const [diffs, setDiffs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load manifest to get available years for this chapter
  useEffect(() => {
    if (!titleNum || !chapterSlug) return
    fetch(base + 'data/versions/manifest.json')
      .then(r => { if (!r.ok) throw new Error('manifest not found'); return r.json() })
      .then(m => {
        const key = `title-${titleNum}/${chapterSlug}`
        const years = m[key] || []
        setManifest(years)
        if (years.length > 0) setYearA(years[0])
      })
      .catch(() => setManifest([]))
  }, [titleNum, chapterSlug])

  // Run diff when both years selected
  useEffect(() => {
    if (!yearA || !yearB || !titleNum || !chapterSlug) return
    if (yearA === yearB) return

    setLoading(true)
    setDiffs(null)
    setError(null)

    Promise.all([
      fetchVersion(titleNum, chapterSlug, yearA),
      fetchVersion(titleNum, chapterSlug, yearB),
    ]).then(([textA, textB]) => {
      let result
      try {
        result = computeLineDiff(textA, textB)
      } catch {
        result = []
      }
      setDiffs(result)
      setLoading(false)
    }).catch(err => {
      setError(err.message)
      setLoading(false)
    })
  }, [yearA, yearB, titleNum, chapterSlug])

  if (!titleNum || !chapterSlug) {
    return <div className="dv-error">No chapter specified. <Link to="/">Go home</Link></div>
  }

  const allYears = manifest ? [...manifest, 'current'] : ['current']

  return (
    <div className="dv-container">
      <nav className="dv-breadcrumb">
        <Link to="/">US Code</Link>
        <span> › </span>
        <Link to={`/title/${titleNum}`}>Title {titleNum}</Link>
        <span> › </span>
        <Link to={`/title/${titleNum}/chapter/${chapterSlug}`}>
          {chapterSlug.replace(/-/g, ' ')}
        </Link>
        <span> › Compare versions</span>
      </nav>

      <h1 className="dv-heading">Compare Versions</h1>
      <p className="dv-sub">{chapterSlug.replace(/-/g, ' ')}</p>

      <div className="dv-controls">
        <label className="dv-label">
          From
          <select
            className="dv-select"
            value={yearA}
            onChange={e => setYearA(e.target.value)}
          >
            {allYears.filter(y => y !== yearB).map(y => (
              <option key={y} value={y}>{y === 'current' ? 'Current' : y}</option>
            ))}
          </select>
        </label>
        <span className="dv-arrow">→</span>
        <label className="dv-label">
          To
          <select
            className="dv-select"
            value={yearB}
            onChange={e => setYearB(e.target.value)}
          >
            {allYears.filter(y => y !== yearA).map(y => (
              <option key={y} value={y}>{y === 'current' ? 'Current' : y}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="dv-status">Computing diff…</p>}
      {error && <p className="dv-error">Error: {error}</p>}

      {diffs && diffs.length === 0 && (
        <p className="dv-status">No differences found between these versions.</p>
      )}

      {diffs && diffs.length > 0 && (() => {
        let lineCount = 0
        const MAX_LINES = 2000
        const rows = []
        for (let i = 0; i < diffs.length; i++) {
          if (lineCount >= MAX_LINES) {
            rows.push(<div key="cap" className="dv-sep">⋯ output capped at {MAX_LINES} lines — use year selectors to narrow the range</div>)
            break
          }
          const d = diffs[i]
          if (d.op === 0) {
            const nonEmpty = d.text.split('\n').filter(l => l.trim().length > 0)
            if (nonEmpty.length <= 6) {
              nonEmpty.forEach((line, j) => { rows.push(<div key={`${i}-${j}`} className="dv-line dv-eq">{line}</div>); lineCount++ })
            } else {
              nonEmpty.slice(0, 3).forEach((line, j) => { rows.push(<div key={`${i}-h${j}`} className="dv-line dv-eq">{line}</div>); lineCount++ })
              rows.push(<div key={`${i}-sep`} className="dv-sep">⋯ {nonEmpty.length - 6} unchanged lines</div>)
              nonEmpty.slice(-3).forEach((line, j) => { rows.push(<div key={`${i}-t${j}`} className="dv-line dv-eq">{line}</div>); lineCount++ })
            }
          } else if (d.op === 1) {
            d.text.split('\n').filter(l => l.trim().length > 0).forEach((line, j) => { rows.push(<div key={`${i}-${j}`} className="dv-line dv-add">+ {line}</div>); lineCount++ })
          } else if (d.op === -1) {
            d.text.split('\n').filter(l => l.trim().length > 0).forEach((line, j) => { rows.push(<div key={`${i}-${j}`} className="dv-line dv-del">- {line}</div>); lineCount++ })
          }
        }
        return <div className="dv-diff">{rows}</div>
      })()}
    </div>
  )
}
