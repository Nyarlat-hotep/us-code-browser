import { useState, useEffect, useRef } from 'react'
import MiniSearch from 'minisearch'

const base = import.meta.env.BASE_URL

const MS_OPTIONS = {
  fields: ['heading', 'body'],
  storeFields: ['id', 'sectionId', 'titleNum', 'chapterSlug', 'heading'],
}

// Cache loaded indexes so we don't re-fetch on every keystroke
const indexCache = {}

async function loadIndex(titleNum) {
  if (indexCache[titleNum]) return indexCache[titleNum]
  const json = await fetch(base + `data/search/title-${titleNum}.json`).then(r => r.json())
  const ms = MiniSearch.loadJSON(JSON.stringify(json), MS_OPTIONS)
  indexCache[titleNum] = ms
  return ms
}

export function useSearch(query, titleNums) {
  // titleNums: array of title numbers to search. If null, search all (loaded from index.json)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(false)

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    abortRef.current = false
    setResults([])
    setLoading(true)

    async function runSearch() {
      let nums = titleNums
      if (!nums) {
        // Fetch title list to get all title numbers
        const titles = await fetch(base + 'data/index.json').then(r => r.json())
        nums = titles.map(t => t.num)
      }

      for (const n of nums) {
        if (abortRef.current) break
        try {
          const ms = await loadIndex(n)
          if (abortRef.current) break
          const hits = ms.search(query.trim(), { fuzzy: 0.2, prefix: true })
          if (hits.length > 0) {
            setResults(prev => {
              // Merge and sort by score descending, cap at 200 total
              const merged = [...prev, ...hits].sort((a, b) => b.score - a.score).slice(0, 200)
              return merged
            })
          }
        } catch { /* skip failed title */ }
      }
      if (!abortRef.current) setLoading(false)
    }

    runSearch()
    return () => { abortRef.current = true }
  }, [query, JSON.stringify(titleNums)])

  return { results, loading }
}
