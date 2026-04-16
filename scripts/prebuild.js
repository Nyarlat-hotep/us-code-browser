#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import matter from 'gray-matter'
import { globSync } from 'glob'
import MiniSearch from 'minisearch'

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const usCodePath = process.argv[2] || join(__dirname, '..', '..', 'us-code')

if (!existsSync(usCodePath)) {
  console.error(`Error: us-code path not found: ${usCodePath}`)
  process.exit(1)
}

const outDir = join(__dirname, '..', 'public', 'data')

mkdirSync(outDir, { recursive: true })

// 1. Read all title dirs
const titleDirs = globSync('uscode/title-*', { cwd: usCodePath })
  .filter(d => !d.includes('.'))
  .sort()

const titles = []

for (const titleDir of titleDirs) {
  const titlePath = join(usCodePath, titleDir)
  const slug = basename(titleDir)

  // Read _title.md
  const titleMdPath = join(titlePath, '_title.md')
  let titleData
  try {
    const raw = readFileSync(titleMdPath, 'utf8')
    titleData = matter(raw).data
  } catch {
    console.warn(`  Warning: no _title.md in ${slug}`)
    continue
  }

  const num = titleData.title
  console.log(`Processing title ${num}: ${titleData.heading}`)

  titles.push({
    num,
    slug,
    heading: titleData.heading,
    positive_law: titleData.positive_law || false,
    sections: titleData.sections || 0,
    chapters: titleData.chapters || 0,
  })

  // Create output dir for this title
  const titleOutDir = join(outDir, `title-${num}`)
  mkdirSync(titleOutDir, { recursive: true })

  // Read chapter files
  const chapterFiles = readdirSync(titlePath)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .sort()

  const chapters = []
  for (const chapterFile of chapterFiles) {
    const chapterPath = join(titlePath, chapterFile)
    const raw = readFileSync(chapterPath, 'utf8')
    const { data } = matter(raw)
    const chapterSlug = chapterFile.replace(/\.md$/, '')

    chapters.push({
      slug: chapterSlug,
      heading: data.heading || '',
      section_count: data.section_count || 0,
    })

    // Copy markdown file to public/data
    const destPath = join(titleOutDir, chapterFile)
    copyFileSync(chapterPath, destPath)
  }

  // Sort chapters by their chapter number (from slug)
  chapters.sort((a, b) => {
    const numA = parseInt(a.slug.match(/^chapter-0*(\d+)/)?.[1] || '0')
    const numB = parseInt(b.slug.match(/^chapter-0*(\d+)/)?.[1] || '0')
    return numA - numB
  })

  writeFileSync(join(titleOutDir, 'chapters.json'), JSON.stringify(chapters, null, 2))

  // Build search index for this title
  const ms = new MiniSearch({
    fields: ['heading', 'body'],
    storeFields: ['id', 'sectionId', 'titleNum', 'chapterSlug', 'heading'],
    idField: 'id',
  })

  const sectionRegex = /<a id="section-([^"]+)"><\/a>\n## §\s*([^\n]+)\n\n?([\s\S]*?)(?=<a id=|$)/g

  for (const chapterFile of chapterFiles) {
    const raw = readFileSync(join(titlePath, chapterFile), 'utf8')
    const { content } = matter(raw)
    const chapterSlug = chapterFile.replace(/\.md$/, '')

    sectionRegex.lastIndex = 0
    let match
    while ((match = sectionRegex.exec(content)) !== null) {
      const [, sectionId, heading, bodyRaw] = match
      const body = stripMarkdown(bodyRaw).slice(0, 500)
      const docId = `${num}-${chapterSlug}-${sectionId}`
      try {
        ms.add({
          id: docId,
          sectionId,
          titleNum: num,
          chapterSlug,
          heading: heading.trim(),
          body,
        })
      } catch (e) {
        console.warn(`  Warning: duplicate section ID skipped: ${docId}`)
      }
    }
  }

  const searchDir = join(outDir, 'search')
  mkdirSync(searchDir, { recursive: true })
  writeFileSync(
    join(searchDir, `title-${num}.json`),
    JSON.stringify(ms.toJSON())
  )
  console.log(`  Indexed ${ms.documentCount} sections for title ${num}`)
}

titles.sort((a, b) => a.num - b.num)
writeFileSync(join(outDir, 'index.json'), JSON.stringify(titles, null, 2))

console.log(`Done. ${titles.length} titles, ${titles.reduce((s, t) => s + t.chapters, 0)} chapters processed.`)

// Phase 2: Build version history
const ANNUAL_TAGS = ['annual/2013','annual/2014','annual/2015','annual/2017',
                     'annual/2019','annual/2021','annual/2022','annual/2024']
const YEAR_LABELS = {
  'annual/2013': '2013', 'annual/2014': '2014', 'annual/2015': '2015',
  'annual/2017': '2017', 'annual/2019': '2019', 'annual/2021': '2021',
  'annual/2022': '2022', 'annual/2024': '2024',
}

console.log('\nBuilding version history...')
const versionStartTime = Date.now()
const manifest = {}

for (const tag of ANNUAL_TAGS) {
  const year = YEAR_LABELS[tag]
  console.log(`  Processing ${year}...`)

  let changedFiles
  try {
    const output = execSync(
      `git -C "${usCodePath}" diff --name-only ${tag} HEAD -- uscode/`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    )
    changedFiles = output.trim().split('\n').filter(f =>
      f.endsWith('.md') && !f.includes('_title') && f.length > 0
    )
  } catch (e) {
    console.warn(`  Warning: could not diff tag ${tag}: ${e.message}`)
    continue
  }

  console.log(`    ${changedFiles.length} changed chapter files`)

  for (const filePath of changedFiles) {
    // filePath looks like: uscode/title-18-crimes.../chapter-001-....md
    const parts = filePath.split('/')
    if (parts.length < 3) continue
    const titleDirName = parts[1]  // e.g. "title-18-crimes-and-criminal-procedure"
    const chapterFile = parts[2]   // e.g. "chapter-001-general-provisions.md"
    if (!chapterFile.startsWith('chapter-')) continue

    // Derive title num from slug
    const titleNumMatch = titleDirName.match(/^title-0*(\d+)/)
    if (!titleNumMatch) continue
    const titleNum = parseInt(titleNumMatch[1])
    const chapterSlug = chapterFile.replace(/\.md$/, '')

    const manifestKey = `title-${titleNum}/${chapterSlug}`
    if (!manifest[manifestKey]) manifest[manifestKey] = []
    if (!manifest[manifestKey].includes(year)) manifest[manifestKey].push(year)

    // Extract and store content at this tag
    const versionOutDir = join(outDir, 'versions', year, `title-${titleNum}`)
    mkdirSync(versionOutDir, { recursive: true })

    try {
      const content = execSync(
        `git -C "${usCodePath}" show ${tag}:${filePath}`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      )
      writeFileSync(join(versionOutDir, chapterFile), content)
    } catch (e) {
      // File may not exist at this tag (newly added chapter)
      console.warn(`  Warning: could not extract ${filePath} at ${tag}`)
    }
  }
}

// Write manifest
const versionsDir = join(outDir, 'versions')
mkdirSync(versionsDir, { recursive: true })
writeFileSync(join(versionsDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

const manifestEntries = Object.keys(manifest).length
const versionElapsed = ((Date.now() - versionStartTime) / 1000).toFixed(1)
console.log(`Version history done. ${manifestEntries} chapters have historical versions. (${versionElapsed}s)`)

// Phase 3: Section-level history ("blame")
// For each chapter in the manifest, determine when each § was last changed
// by comparing HEAD sections against annual snapshots newest → oldest.
// Output: public/data/title-{N}/{slug}-history.json
// Format: { "sectionId": "2024" } — the most recent snapshot year where
// this section differed from its current state.
console.log('\nBuilding section history (blame)...')
const historyStart = Date.now()

const YEARS_DESC = ['2024', '2022', '2021', '2019', '2017', '2015', '2014', '2013']

const sectionBodyRegex = /<a id="section-([^"]+)"><\/a>\n## §\s*[^\n]+\n\n?([\s\S]*?)(?=<a id=|$)/g

function parseSectionBodies(markdown) {
  // Returns { sectionId: normalizedBodyText }
  const content = markdown.replace(/^---[\s\S]*?---\n/, '')
  const sections = {}
  sectionBodyRegex.lastIndex = 0
  let m
  while ((m = sectionBodyRegex.exec(content)) !== null) {
    // Normalize whitespace for stable comparison
    sections[m[1]] = m[2].replace(/\s+/g, ' ').trim()
  }
  return sections
}

let historyChapters = 0
for (const [chapterKey, years] of Object.entries(manifest)) {
  const [titlePart, chapterSlug] = chapterKey.split('/')
  const titleNum = parseInt(titlePart.replace('title-', ''))

  // Read HEAD version from already-copied public/data file
  const headPath = join(outDir, `title-${titleNum}`, `${chapterSlug}.md`)
  let headSections
  try {
    headSections = parseSectionBodies(readFileSync(headPath, 'utf8'))
  } catch { continue }
  if (Object.keys(headSections).length === 0) continue

  // Load historical section bodies for years this chapter appears in
  const versionsByYear = {}
  for (const year of YEARS_DESC) {
    if (!years.includes(year)) continue
    const vPath = join(outDir, 'versions', year, `title-${titleNum}`, `${chapterSlug}.md`)
    try {
      versionsByYear[year] = parseSectionBodies(readFileSync(vPath, 'utf8'))
    } catch { /* not available for this year */ }
  }

  if (Object.keys(versionsByYear).length === 0) continue

  // For each HEAD section, find the most recent year it was in a different state
  const history = {}
  for (const [sectionId, headText] of Object.entries(headSections)) {
    for (const year of YEARS_DESC) {
      if (!versionsByYear[year]) continue
      const yearSections = versionsByYear[year]

      if (!(sectionId in yearSections) || yearSections[sectionId] !== headText) {
        // Section was absent or different at this year → changed after this snapshot
        history[sectionId] = year
        break
      }
      // Same as HEAD at this year → keep looking at older snapshots
    }
    // If loop completes with no break → section unchanged across all available years → omit from history
  }

  if (Object.keys(history).length > 0) {
    writeFileSync(
      join(outDir, `title-${titleNum}`, `${chapterSlug}-history.json`),
      JSON.stringify(history)
    )
    historyChapters++
  }
}

const historyElapsed = ((Date.now() - historyStart) / 1000).toFixed(1)
console.log(`Section history done. ${historyChapters} chapters written. (${historyElapsed}s)`)
