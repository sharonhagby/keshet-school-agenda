const months = 'ינואר פברואר מרץ אפריל מאי יוני יולי אוגוסט ספטמבר אוקטובר נובמבר דצמבר'.split(' ')
const weekdayNames = 'ראשון שני שלישי רביעי חמישי שישי שבת'.split(' ')
const aliases = {
  10: ['י'],
  11: ['יא'],
  12: ['יב'],
  external: ['ארועיםחיצונייםמשפיעים', 'אירועיםחיצונייםמשפיעים'],
  date: ['תאריךלועזי', 'תאריך'],
  month: ['חודש'],
  weekday: ['יוםבשבוע', 'יום'],
  hebrewDay: ['תאריךעברי'],
}
export const grades = [10, 11, 12]
const requiredColumns = [...grades, 'external', 'date']
const examStart = /^(?:(?:יום|השלמת|השלמות|הכנה ל)\s*)?(?:מבחן|בוחן|בחנים|מבחנ(?:ים|י)|בחינ(?:ה|ות|ת)|בגרו(?:ת|יות)|מתכונ(?:ת|ות)|מועד(?:י)?\s*ב['׳״"’]?)(?![א-ת])/
const examMention = /(?:^|[^א-ת])(?:מבחן|מבחנים|בחינה|בחינות|בגרות|בגרויות|מתכונת|מתכונות|מועד(?:י)?\s*ב)(?![א-ת])/
const activityStart = /^(?:סיור|טיול|סמינר|הרצאה|סדנה|סדנא|יום עם|מפגש|הצג(?:ה|ת)|טקס|פעילות|יציאה)(?![א-ת])/
const admin = /^(?:פורום\s+(?:מנהלי|צוותי\s+הנהלה)|מפקחת\s+ומנהלי|(?:מפגש|ישיבת|זום|כנס|סיכום\s+(?:שנה|חציון))\s+מנהלים|יום\s+(?:היערכות|רכזי|רכזים|\d+\s+רכזי)|ועד(?:ה|ת|ות)\s+(?:התמדה|פדגוגית)|(?:הערכת האפקטיביות|אישור תכניות|הנפקת אישורי בטיחות|מיצוי תהליכים|חינוך למול רווחה|זום סיכום שבוע החינוך|אורבך מקיימים יום הורים|מסיבת סיום קשת יסודי|ערב הוקרה לצוותי החינוך)|מיני מסע ישראלי מנהלי|מפגש פתיחת שנה בראשות ראש המועצה|סיור פתיחת שנה \(רשות מקומית\)|יועצות\s+למול)/
const clock = '(?:[01]?\\d|2[0-3]):[0-5]\\d'
const timeRange = `(?:שע(?:ה|ות)\\s*\\d{1,2}(?:\\s*[-–־]\\s*\\d{1,2})?|(?:החל\\s+מ[־-]?\\s*|בשעה\\s*)?${clock}(?:\\s*[-–־]\\s*${clock})?)`
const timeExpression = new RegExp(`\\(\\s*${timeRange}\\s*\\)|(?<!\\d)${timeRange}(?!\\d)`, 'gu')

function clean(value) {
  return String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim()
}

function valueOf(cell) {
  return clean(cell?.formattedValue ?? cell?.effectiveValue?.stringValue ?? cell?.effectiveValue?.numberValue)
}

function headerKey(value) {
  return value.normalize('NFKC').replace(/[^א-ת]/gu, '')
}

function getColumns(cells) {
  const keys = cells.map(cell => headerKey(valueOf(cell)))
  return Object.fromEntries(Object.entries(aliases).map(([name, keysForName]) => [
    name, keys.findIndex(key => keysForName.includes(key)),
  ]))
}

function isCyan(cell) {
  const format = cell?.effectiveFormat ?? cell?.userEnteredFormat
  const rgb = format?.backgroundColorStyle?.rgbColor ?? format?.backgroundColor
  return Boolean(rgb && (rgb.red ?? 0) < 0.005 && rgb.green > 0.995 && rgb.blue > 0.995)
}

function splitEvents(value) {
  let depth = 0
  let start = 0
  const parts = []
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (char === '(') depth++
    if (char === ')') depth = Math.max(0, depth - 1)
    // A trailing + after a number (e.g. 18+) is part of the text.
    if (!depth && (char === '\n' || (char === '+' && !(/\d/.test(value[i - 1] ?? '') && !value.slice(i + 1).trim())))) {
      parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  parts.push(value.slice(start))
  return parts.map(part => part.replace(/\s+/gu, ' ').trim()).filter(part => part && !/^[-–—?]+$/u.test(part))
}

function eventType(title) {
  if (examStart.test(title)) return 'exam'
  if (activityStart.test(title)) return 'activity'
  return examMention.test(title.replace(/\([^)]*\)/gu, '')) ? 'exam' : null
}

function expandExamDetails(parts) {
  const events = []
  for (const part of parts) {
    const previous = events.at(-1)
    if (previous && /^מבחן מגמות .*במקצועות/u.test(previous) &&
        /^אמנות(?: עיונית)?(?:\s*\(שעות?[^)]*\))?$/u.test(part)) {
      events[events.length - 1] += ', ' + part
    } else if (previous && eventType(previous) === 'exam' && /^\d+\s*יח["״]ל/u.test(part)) {
      const exam = previous.split(/\s+[-–]\s+/u)[0].replace(/\s+דוברים$/u, '')
      events.push(exam + ' – ' + part)
    } else {
      events.push(part)
    }
  }
  return events
}

function parseEvents(cell, external = false) {
  const parts = expandExamDetails(splitEvents(valueOf(cell)))
  const containsExam = parts.some(part => eventType(part) === 'exam')
  const cyan = isCyan(cell)
  return parts.filter(part => !external || !admin.test(part)).map(part => {
    const times = []
    const type = eventType(part) ?? (cyan && !containsExam ? 'exam' : 'activity')
    const withPeriods = type === 'exam' && !/שע(?:ה|ות)\s*\d/u.test(part)
      ? part.replace(/\s+([1-9]\s*[-–־]\s*[1-9])$/u, ' שעות $1')
      : part
    const title = withPeriods.replace(timeExpression, match => {
      times.push(match.replace(/[()]/gu, '').trim().replace(/\s*[-–־]\s*/gu, '–'))
      return ' '
    }).replace(/ +#(?=\s|$)/gu, ' ').replace(/\(\s*\)/gu, '').replace(/\s+\)/gu, ')').replace(/\(\s+/gu, '(')
      .replace(/\s+/gu, ' ').replace(/\s*[-–:]\s*$/u, '').trim()
    return {
      title: title || part,
      type,
      times: title ? [...new Set(times)] : [],
      ...(external ? { external: true } : {}),
    }
  })
}

function isoDate(year, month, day, row) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid Gregorian date in row ${row}.`)
  }
  return date.toISOString().slice(0, 10)
}

function fullDate(cell, row) {
  const value = valueOf(cell)
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u)
  if (iso) return isoDate(...iso.slice(1).map(Number), row)
  const local = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/u)
  if (local) return isoDate(Number(local[3]), Number(local[2]), Number(local[1]), row)
  const serial = cell?.effectiveValue?.numberValue
  if (cell?.effectiveFormat?.numberFormat?.type === 'DATE' && Number.isFinite(serial)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10)
  }
  return null
}

export function parseSheet(sheet, { schoolYear, updatedAt = new Date().toISOString() }) {
  const rows = []
  for (const block of sheet.data ?? []) {
    block.rowData?.forEach(({ values }, index) => {
      const row = rows[(block.startRow ?? 0) + index] ??= []
      values?.forEach((cell, column) => { row[(block.startColumn ?? 0) + column] = cell })
    })
  }

  let columns
  const header = rows.findIndex(row => {
    if (!row) return false
    columns = getColumns(row)
    return requiredColumns.every(key => columns[key] >= 0)
  })
  if (header < 0) throw new Error('Missing headers. Expected תאריך לועזי, י, יא, יב and ארועים חיצוניים משפיעים on the same row.')

  const days = new Map(grades.map(grade => [grade, new Map()]))
  let year = schoolYear
  let month = 0
  let previousDate = ''
  let continuation = false
  for (let index = header + 1; index < rows.length; index++) {
    const row = rows[index] ?? []
    const rowNumber = index + 1
    const monthLabel = valueOf(row[columns.month])
    const namedMonth = months.indexOf(monthLabel.split(/[\s/–-]/u)[0]) + 1
    if (namedMonth) {
      if (month && namedMonth < month) year++
      month = namedMonth
    }
    const dateCell = row[columns.date]
    const rawDate = valueOf(dateCell)
    const weekday = valueOf(row[columns.weekday]).replace(/^יום\s+/u, '')
    const hasEvents = [...grades, 'external'].some(key => valueOf(row[columns[key]]))
    let date = fullDate(dateCell, rowNumber)
    if (!date && /^\d{1,2}$/u.test(rawDate)) {
      if (!month || !Number.isInteger(year)) throw new Error(`Missing Gregorian month or school start year in row ${rowNumber}.`)
      date = isoDate(year, month, Number(rawDate), rowNumber)
    }
    if (date) {
      const [dateYear, dateMonth] = date.split('-').map(Number)
      year = dateYear
      month = dateMonth
      if (date < previousDate) throw new Error(`Gregorian dates are out of order in row ${rowNumber}.`)
      if (weekdayNames.includes(weekday) && weekdayNames[new Date(date).getUTCDay()] !== weekday) {
        throw new Error(`Gregorian date and weekday disagree in row ${rowNumber}. Check SCHOOL_YEAR_START and the sheet date.`)
      }
      previousDate = date
      continuation = true
    } else if (hasEvents && continuation && !rawDate && !monthLabel && !weekday && !valueOf(row[columns.hebrewDay])) {
      date = previousDate
    } else {
      if (hasEvents) throw new Error(`Schedule entries have no usable date in row ${rowNumber}.`)
      continuation = false
      continue
    }

    if (!hasEvents) continue
    const shared = parseEvents(row[columns.external], true)
    for (const grade of grades) {
      const events = [...parseEvents(row[columns[grade]]), ...shared]
      if (!events.length) continue
      const gradeDays = days.get(grade)
      const existing = gradeDays.get(date) ?? new Map()
      for (const event of events) {
        const key = JSON.stringify([event.title, event.times])
        if (!existing.has(key) || (existing.get(key).external && !event.external)) existing.set(key, event)
      }
      gradeDays.set(date, existing)
    }
  }

  if (!previousDate || [...days.values()].every(calendar => !calendar.size)) {
    throw new Error('The sheet has no publishable schedule events. Existing schedules were preserved.')
  }
  return grades.map(grade => ({
    grade,
    updatedAt,
    days: [...days.get(grade)].map(([date, events]) => ({ date, events: [...events.values()] })),
  }))
}
