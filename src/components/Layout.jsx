import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useSearch } from '../hooks/useSearch'
import './Layout.css'

export default function Layout({ children }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  const { results, loading } = useSearch(query.length >= 2 ? query : '', null)
  const dropdownResults = results.slice(0, 8)

  useEffect(() => {
    setQuery(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) {
      setShowDropdown(false)
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  function handleResultClick(result) {
    setShowDropdown(false)
    navigate(`/title/${result.titleNum}/chapter/${result.chapterSlug}#section-${result.sectionId}`)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setShowDropdown(false)
  }

  const isOpen = showDropdown && query.length >= 2

  return (
    <div className="layout">
      <header className="layout-header">
        <Link to="/" className="layout-logo">
          <span className="layout-logo-title">US Code</span>
          <span className="layout-logo-sub">Browser</span>
        </Link>
        <form className="layout-search" onSubmit={handleSearch} ref={searchRef}>
          <div className="layout-search-wrap">
            <input
              type="text"
              placeholder="Search all laws…"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
              onFocus={() => { if (query.length >= 2) setShowDropdown(true) }}
              onKeyDown={handleKeyDown}
              className="layout-search-input"
            />
            {query && (
              <button
                type="button"
                className="layout-search-clear"
                onClick={() => { setQuery(''); setShowDropdown(false) }}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            {isOpen && (
              <div className="layout-typeahead">
                {loading && dropdownResults.length === 0 && (
                  <div className="layout-typeahead-status">Searching…</div>
                )}
                {!loading && dropdownResults.length === 0 && (
                  <div className="layout-typeahead-status">No results</div>
                )}
                {dropdownResults.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className="layout-typeahead-item"
                    onMouseDown={e => { e.preventDefault(); handleResultClick(r) }}
                  >
                    <span className="layout-typeahead-heading">{r.heading}</span>
                    <span className="layout-typeahead-meta">Title {r.titleNum}</span>
                  </button>
                ))}
                {results.length > 8 && (
                  <button
                    type="submit"
                    className="layout-typeahead-more"
                    onMouseDown={e => e.preventDefault()}
                  >
                    See all {results.length}+ results →
                  </button>
                )}
              </div>
            )}
          </div>
          <button type="submit" className="layout-search-btn">Search</button>
        </form>
      </header>
      <main className="layout-main">
        {children}
      </main>
    </div>
  )
}
