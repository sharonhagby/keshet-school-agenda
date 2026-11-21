import { strFromU8, unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: false })
const list = value => value == null ? [] : Array.isArray(value) ? value : [value]
const valueOf = value => typeof value === 'object' && value !== null ? value['#text'] ?? '' : value ?? ''

function richText(entry) {
  if (entry?.t != null) return valueOf(entry.t)
  return list(entry?.r).map(run => valueOf(run.t)).join('')
}

function columnIndex(cellRef) {
  let column = 0
  for (const char of cellRef) {
    if (char < 'A' || char > 'Z') break
    column = column * 26 + char.charCodeAt(0) - 64
  }
  return column - 1
}

export function parseGoogleExport(bytes, tabName) {
  const archive = unzipSync(bytes, {
    filter: entry => entry.originalSize <= 8_000_000 && /^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/u.test(entry.name),
  })
  const read = name => archive[name] ? parser.parse(strFromU8(archive[name])) : null
  const workbook = read('xl/workbook.xml')?.workbook
  const tab = list(workbook?.sheets?.sheet).find(item => item['@_name'] === tabName)
  if (!tab) throw new Error('The configured spreadsheet tab was not found.')

  const relationships = read('xl/_rels/workbook.xml.rels')?.Relationships
  const relation = list(relationships?.Relationship).find(item => item['@_Id'] === tab['@_id'])
  const target = relation?.['@_Target']
  const sheetPath = target?.startsWith('/') ? target.slice(1) : 'xl/' + target
  const worksheet = read(sheetPath)?.worksheet
  if (!worksheet?.sheetData) throw new Error('The configured spreadsheet tab has no data.')

  const strings = list(read('xl/sharedStrings.xml')?.sst?.si).map(richText)
  const styles = read('xl/styles.xml')?.styleSheet
  const cyanFills = list(styles?.fills?.fill).map(({ patternFill }) =>
    patternFill?.fgColor?.['@_rgb']?.toUpperCase().slice(-6) === '00FFFF')
  const customDates = new Set(list(styles?.numFmts?.numFmt).filter(format =>
    /[dy]/iu.test((format['@_formatCode'] ?? '').replace(/"[^"]*"|\\./gu, ''))).map(format => Number(format['@_numFmtId'])))
  const cellStyles = list(styles?.cellXfs?.xf).map(style => {
    const dateFormat = Number(style['@_numFmtId'])
    return {
      ...(cyanFills[Number(style['@_fillId'])] && { backgroundColor: { green: 1, blue: 1 } }),
      ...((dateFormat >= 14 && dateFormat <= 17 || dateFormat === 22 || customDates.has(dateFormat)) &&
        { numberFormat: { type: 'DATE' } }),
    }
  })

  const rowData = []
  for (const row of list(worksheet.sheetData.row)) {
    const rowIndex = Number(row['@_r']) - 1
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= 10_000) continue
    const values = []
    for (const cell of list(row.c)) {
      const type = cell['@_t']
      if (cell.v == null && type !== 'inlineStr' || type === 'e') continue
      const column = columnIndex(cell['@_r'] ?? '')
      if (column < 0 || column >= 256) continue
      const entry = valueOf(cell.v)
      const number = Number(entry)
      const style = cellStyles[Number(cell['@_s'] ?? 0)]
      const numeric = (!type || type === 'n') && entry !== '' && Number.isFinite(number)
      const display = type === 's' ? strings[number] : type === 'inlineStr' ? richText(cell.is) : numeric ? String(number) : entry
      values[column] = {
        formattedValue: display,
        effectiveFormat: style,
        ...(numeric && { effectiveValue: { numberValue: number } }),
      }
    }
    rowData[rowIndex] = { values }
  }
  return { data: [{ rowData }] }
}
