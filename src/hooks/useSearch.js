import { useState, useEffect, useMemo } from 'react'
import MiniSearch from 'minisearch'

const base = import.meta.env.BASE_URL

const MS_OPTIONS = {
  fields: ['heading', 'body'],
  storeFields: ['id', 'sectionId', 'titleNum', 'chapterSlug', 'heading'],
}

// Cache loaded indexes so we don't re-fetch on every keystroke
const indexCache = {}

async function loadIndex(titleNum, signal) {
  if (indexCache[titleNum]) return indexCache[titleNum]
  const text = await fetch(base + `data/search/title-${titleNum}.json`, { signal }).then(r => r.text())
  const ms = MiniSearch.loadJSON(text, MS_OPTIONS)
  indexCache[titleNum] = ms
  return ms
}

export function useSearch(query, titleNums) {
  // titleNums: array of title numbers to search. If null, search all (loaded from index.json)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const titleKey = useMemo(() => JSON.stringify(titleNums), [titleNums])

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setResults([])
    setLoading(true)

    async function runSearch() {
      let nums = titleNums
      if (!nums) {
        // Fetch title list to get all title numbers
        const titles = await fetch(base + 'data/index.json', { signal: controller.signal }).then(r => r.json())
        nums = titles.map(t => t.num)
      }

      for (const n of nums) {
        if (controller.signal.aborted) break
        try {
          const ms = await loadIndex(n, controller.signal)
          if (controller.signal.aborted) break
          const hits = ms.search(query.trim(), { fuzzy: 0.2, prefix: true })
          if (hits.length > 0) {
            setResults(prev => {
              // Merge and sort by score descending, cap at 200 total
              const merged = [...prev, ...hits].sort((a, b) => b.score - a.score).slice(0, 200)
              return merged
            })
          }
        } catch (err) {
          if (err.name === 'AbortError') break
          // skip other failed titles silently
        }
      }
      if (!controller.signal.aborted) setLoading(false)
    }

    runSearch()
    return () => { controller.abort() }
  }, [query, titleKey])

  return { results, loading }
}
