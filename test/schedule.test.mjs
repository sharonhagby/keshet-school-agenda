import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSheet } from '../scripts/parse-sheet.mjs'
import { hebrewDateLabel, nextDays, todayKey } from '../src/dates.js'

const cell = (formattedValue, cyan = false) => ({
  formattedValue,
  ...(cyan ? { effectiveFormat: { backgroundColorStyle: { rgbColor: { green: 1, blue: 1 } } },
  } : {}),
})

const sheet = (dates, events) => ({
  data: [
    { startRow: 1, startColumn: 1, rowData: [
      { values: ['חודש', 'תאריך לועזי', 'תאריך עברי', 'יום בשבוע'].map(value => cell(value)) },
      ...dates.map(row => ({ values: row.map(value => cell(value)) })),
    ] },
    { startRow: 1, startColumn: 8, rowData: [
      { values: ['ט', "י'", 'י״א', 'יב', 'ארועים חיצוניים משפיעים'].map(value => cell(value)) },
      ...events.map(values => ({ values })),
    ] },
  ],
})

test('imports grade columns, student-facing external events, rollover and continuation rows', () => {
  const source = sheet([
    ['דצמבר', '31', 'כא', 'חמישי'], [],
    ['ינואר', '1', 'כב', 'שישי'], [],
    ['שבט', '9', 'א', 'שבת'],
  ], [
    [cell('לכיתה ט בלבד'), cell('מבחן במתמטיקה (שעות 1-2) + סיור (אחרי המבחן)', true),
      cell('הערכה בכימיה', true), cell('סדנה 9:00-10:30'), cell('פורום מנהלי על-יסודי + ועדת התמדה + טקס יישובי')],
    [null, null, null, cell('בגרות בספרות')],
    [null, cell('מועדי ב׳ באנגלית')],
    [],
    [null, null, cell('סיור')],
  ])
  const [ten, eleven, twelve] = parseSheet(source, { schoolYear: 2026, updatedAt: '2026-11-19T00:00:00Z' })
  assert.deepEqual([ten.grade, eleven.grade, twelve.grade], [10, 11, 12])
  assert.deepEqual(ten.days.map(day => day.date), ['2026-12-31', '2027-01-01'])
  assert.equal(eleven.days[1].date, '2027-01-09')
  assert.deepEqual(ten.days[0].events, [
    { title: 'מבחן במתמטיקה', type: 'exam', times: ['שעות 1–2'] },
    { title: 'סיור (אחרי המבחן)', type: 'activity', times: [] },
    { title: 'טקס יישובי', type: 'activity', times: [], external: true },
  ])
  assert.equal(eleven.days[0].events[0].type, 'exam')
  assert.equal(twelve.days[0].events[0].times[0], '9:00–10:30')
  assert.equal(twelve.days[0].events.at(-1).title, 'בגרות בספרות')
  assert.equal(ten.days[1].events[0].type, 'exam')
  assert.doesNotMatch(JSON.stringify([ten, eleven, twelve]), /לכיתה ט בלבד|פורום מנהלי|ועדת התמדה/u)
  assert.doesNotMatch(JSON.stringify(eleven), /מבחן במתמטיקה|בגרות בספרות/u)
})

test('preserves exam subjects and unit shorthand while splitting independent events', () => {
  const [ten, eleven] = parseSheet(sheet([['נובמבר', '25']], [[
    null,
    cell('מבחן מגמות גוש ב במקצועות: ערבית + אמנות (שעות 3-5) + סיור בבית הספר'),
    cell('בגרות בע"פ באנגלית - דוברים + 3 יח"ל 9:00-10:30'),
  ]]), { schoolYear: 2026 })

  assert.deepEqual(ten.days[0].events, [
    { title: 'מבחן מגמות גוש ב במקצועות: ערבית, אמנות', type: 'exam', times: ['שעות 3–5'] },
    { title: 'סיור בבית הספר', type: 'activity', times: [] },
  ])
  assert.deepEqual(eleven.days[0].events[1],
    { title: 'בגרות בע"פ באנגלית – 3 יח"ל', type: 'exam', times: ['9:00–10:30'] })
})

test('rejects shifted school years and separate undated events', () => {
  const badYear = sheet([['נובמבר', '19', 'ט', 'חמישי']], [[null, cell('סיור')]])
  assert.throws(() => parseSheet(badYear, { schoolYear: 2025 }), /weekday disagree/)
  const undated = sheet([['נובמבר', '19'], [], []], [[null, cell('סיור')], [], [null, cell('מבחן')]])
  assert.throws(() => parseSheet(undated, { schoolYear: 2026 }), /no usable date/)
})

test('today and the seven-day window use the Jerusalem calendar year-round', () => {
  assert.equal(todayKey(new Date('2026-11-18T22:00:00Z')), '2026-11-19')
  assert.equal(todayKey(new Date('2027-06-01T21:00:00Z')), '2027-06-02')
  assert.equal(nextDays('2026-12-29', 6), '2027-01-04')
  assert.match(hebrewDateLabel('2026-11-19'), /כסלו/u)
})
