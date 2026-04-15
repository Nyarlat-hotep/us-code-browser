import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import './Layout.css'

export default function Layout({ children }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <div className="layout">
      <header className="layout-header">
        <Link to="/" className="layout-logo">
          <span className="layout-logo-title">US Code</span>
          <span className="layout-logo-sub">Browser</span>
        </Link>
        <form className="layout-search" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Search all laws…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="layout-search-input"
          />
          <button type="submit" className="layout-search-btn">Search</button>
        </form>
      </header>
      <main className="layout-main">
        {children}
      </main>
    </div>
  )
}
