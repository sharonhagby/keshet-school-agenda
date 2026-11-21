const zone = 'Asia/Jerusalem'
const formatOptions = { timeZone: zone }
const schoolDate = new Intl.DateTimeFormat('en-CA', {
  ...formatOptions, year: 'numeric', month: '2-digit', day: '2-digit',
})
const longDate = new Intl.DateTimeFormat('he-IL', { ...formatOptions, weekday: 'long', day: 'numeric', month: 'long' })
const civilDate = new Intl.DateTimeFormat('he-IL', { ...formatOptions, day: 'numeric', month: 'long' })
const weekday = new Intl.DateTimeFormat('he-IL', { ...formatOptions, weekday: 'long' })
const monthYear = new Intl.DateTimeFormat('he-IL', { ...formatOptions, month: 'long', year: 'numeric' })
const hebrewCalendar = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { ...formatOptions, day: 'numeric', month: 'long' })
const updated = new Intl.DateTimeFormat('he-IL', { ...formatOptions, dateStyle: 'short', timeStyle: 'short' })

const dateFromKey = key => new Date(key + 'T12:00:00Z')

export function todayKey(now = new Date()) {
  const parts = Object.fromEntries(schoolDate.formatToParts(now).map(part => [part.type, part.value]))
  return [parts.year, parts.month, parts.day].join('-')
}

export function nextDays(key, days) {
  const date = dateFromKey(key)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function longDateLabel(key) { return longDate.format(dateFromKey(key)) }
export function civilDateLabel(key) { return civilDate.format(dateFromKey(key)) }
export function weekdayLabel(key) { return weekday.format(dateFromKey(key)) }
export function monthLabel(key) { return monthYear.format(dateFromKey(key)) }
export function updatedLabel(value) { return updated.format(new Date(value)) }

export function hebrewDateLabel(key) {
  const parts = hebrewCalendar.formatToParts(dateFromKey(key))
  return parts.map(part => {
    if (part.type !== 'day') return part.value
    const day = Number(part.value)
    const letters = day === 15 ? 'טו' : day === 16 ? 'טז' :
      (['', 'י', 'כ', 'ל'][Math.floor(day / 10)] + ' אבגדהוזחט'[day % 10].trim())
    return letters.length === 1 ? letters + '׳' : letters.slice(0, -1) + '״' + letters.at(-1)
  }).join('')
}
