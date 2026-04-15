import { useSearchParams, Link } from 'react-router-dom'
import { useSearch } from '../hooks/useSearch'
import './SearchResults.css'

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const { results, loading } = useSearch(query, null)

  return (
    <div className="sr-container">
      <h1 className="sr-heading">
        {query ? `Results for "${query}"` : 'Search'}
      </h1>
      {loading && results.length === 0 && (
        <p className="sr-status">Searching…</p>
      )}
      {!loading && results.length === 0 && query && (
        <p className="sr-status">No results found for "{query}"</p>
      )}
      {results.length > 0 && (
        <p className="sr-count">{results.length} result{results.length !== 1 ? 's' : ''}{loading ? ' (searching…)' : ''}</p>
      )}
      <ul className="sr-list">
        {results.map(r => (
          <li key={r.id} className="sr-item">
            <Link
              to={`/title/${r.titleNum}/chapter/${r.chapterSlug}#section-${r.sectionId}`}
              className="sr-link"
            >
              <span className="sr-section">§ {r.sectionId}</span>
              <span className="sr-item-heading">{r.heading}</span>
            </Link>
            <span className="sr-meta">
              Title {r.titleNum} · {r.chapterSlug.replace(/-/g, ' ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
