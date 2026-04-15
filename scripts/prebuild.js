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
      f.endsWith('.md') && !f.includes('_title') && !f.startsWith('_') && f.length > 0
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
