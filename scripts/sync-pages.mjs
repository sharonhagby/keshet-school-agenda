import { createHash } from 'node:crypto'
import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseGoogleExport } from '../worker/google-export.mjs'
import { parseSheet } from './parse-sheet.mjs'
import { outputDirectory, writeDatasets } from './write-datasets.mjs'

function exportUrl(sheetLink) {
  if (!URL.canParse(sheetLink)) throw new Error('Set GOOGLE_SHEET_URL to a Google Sheets link.')
  const source = new URL(sheetLink)
  const id = source.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/u)?.[1]
  const gid = source.searchParams.get('gid') ?? new URLSearchParams(source.hash.slice(1)).get('gid') ?? '0'
  if (source.origin !== 'https://docs.google.com' || !id || !/^\d+$/u.test(gid)) {
    throw new Error('GOOGLE_SHEET_URL must be a Google Sheets link with a valid tab ID.')
  }
  const url = new URL('https://docs.google.com/spreadsheets/d/' + id + '/export')
  url.search = new URLSearchParams({ format: 'xlsx', gid, run: String(Date.now()) })
  return url
}

async function publishedRevision(siteUrl) {
  if (!siteUrl) return null
  try {
    const url = new URL('data/revision.json', siteUrl.replace(/\/?$/u, '/'))
    url.searchParams.set('check', String(Date.now()))
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    return response.ok ? (await response.json()).revision : null
  } catch {
    return null
  }
}

async function main() {
  const schoolYear = Number(process.env.SCHOOL_YEAR_START || 2026)
  if (!Number.isInteger(schoolYear) || schoolYear < 1900 || schoolYear > 9998) {
    throw new Error('SCHOOL_YEAR_START must be the Gregorian year when the school calendar begins.')
  }
  const response = await fetch(exportUrl(process.env.GOOGLE_SHEET_URL), {
    signal: AbortSignal.timeout(25_000), cache: 'no-store',
  })
  if (!response.ok) throw new Error('Google export failed (HTTP ' + response.status + ').')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > 5_000_000) throw new Error('Spreadsheet export exceeds the size limit.')
  const sheet = parseGoogleExport(bytes, process.env.GOOGLE_SHEET_TAB || 'גיליון1')
  const datasets = parseSheet(sheet, { schoolYear })
  const revision = createHash('sha256').update(JSON.stringify({
    code: process.env.GITHUB_SHA ?? null,
    grades: datasets.map(({ grade, days }) => ({ grade, days })),
  })).digest('hex')
  const publish = revision !== await publishedRevision(process.env.PAGES_URL)
  if (publish) {
    await writeDatasets(datasets)
    await writeFile(join(outputDirectory, 'revision.json'), JSON.stringify({ revision }) + '\n')
    for (const { grade, days } of datasets) console.log('Grade ' + grade + ': ' + days.length + ' dates.')
  } else {
    console.log('The published schedules and website code are current.')
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'publish=' + publish + '\n')
}

main().catch(error => {
  console.error(error.cause?.code ?? error.message)
  process.exitCode = 1
})
