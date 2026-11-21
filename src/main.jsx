import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  civilDateLabel, hebrewDateLabel, longDateLabel, monthLabel, nextDays, todayKey, updatedLabel, weekdayLabel,
} from './dates.js'
import './styles.css'

const symbols = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18m-12 5 2 2 4-4"/></>,
  today: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/><circle cx="12" cy="15.5" r="1"/></>,
  week: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18m-14 6h2m2 0h2m2 0h2"/></>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
  history: <><path d="M3 4v5h5m-5 0a9 9 0 1 1 1.5 8.5M12 7v5l3 2"/></>,
  exam: <><path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="8" y="2.5" width="8" height="4" rx="1.5"/><path d="M8 11h8m-8 4h5"/></>,
  activity: <><path d="M12 2.5 14.3 9l6.7 2.5-6.7 2.5-2.3 7-2.3-7L3 11.5 9.7 9 12 2.5Z"/></>,
  time: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
}

const categories = [
  { key: 'all', label: 'הכל' },
  { key: 'exam', label: 'מבחנים ובגרויות', eventLabel: 'מבחן' },
  { key: 'activity', label: 'סיורים ואירועים', eventLabel: 'פעילות' },
]
const normalize = value => value.normalize('NFKC').replace(/[\u0591-\u05c7"'“”׳״‘’]/gu, char => (
  char === '־' ? ' ' : ''
)).toLowerCase().trim().replace(/\s+/gu, ' ')
const eventsLabel = count => count === 1 ? 'אירוע אחד' : count + ' אירועים'

function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{symbols[name]}</svg>
}

function useSchoolDate() {
  const [today, setToday] = useState(todayKey)
  useEffect(() => {
    const refresh = () => setToday(todayKey())
    const timer = setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return today
}

function useSchedule(grade) {
  const [state, setState] = useState({ status: 'loading', days: [] })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    let timer
    async function refresh() {
      if (pending) return
      clearTimeout(timer)
      pending = true
      let wait = 60_000
      try {
        const response = await fetch(import.meta.env.BASE_URL + 'data/grade-' + grade + '.json', {
          signal: controller.signal, cache: 'no-cache',
        })
        if (response.status === 404) {
          setState(current => current.status === 'ready' ? current : { status: 'missing', days: [] })
          return
        }
        if (!response.ok) throw new Error('Failed to load schedule')
        const schedule = await response.json()
        if (schedule.grade !== grade || !Array.isArray(schedule.days) || !Number.isFinite(Date.parse(schedule.updatedAt))) {
          throw new Error('Invalid schedule')
        }
        if (Number.isFinite(schedule.refreshAfterSeconds)) wait = Math.max(10, schedule.refreshAfterSeconds) * 1000
        setState({ ...schedule, status: 'ready' })
      } catch (error) {
        if (error.name !== 'AbortError') {
          setState(current => current.status === 'ready' ? current : { status: 'error', days: [] })
        }
      } finally {
        pending = false
        if (!controller.signal.aborted) timer = setTimeout(refresh, wait)
      }
    }
    const refreshWhenVisible = () => { if (!document.hidden) refresh() }
    refresh()
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [grade, attempt])
  function retry() {
    setState({ status: 'loading', days: [] })
    setAttempt(current => current + 1)
  }
  return [state, retry]
}

function Summary({ icon, label, date, count, selected, onClick, ready }) {
  return (
    <button className="summary" type="button" aria-pressed={selected} aria-controls="schedule-list" onClick={onClick} disabled={!ready}>
      <span className="summary-icon"><Icon name={icon} size={23} /></span>
      <span className="summary-text"><strong>{label}</strong><span>{date}</span></span>
      {ready && <span className="summary-count">{eventsLabel(count)}</span>}
    </button>
  )
}

function Event({ item }) {
  const category = categories.find(({ key }) => key === item.type)
  return (
    <li className={'event event-' + item.type}>
      <span className="event-icon"><Icon name={item.type} size={18} /></span>
      <div className="min-w-0">
        <p className="event-title">{item.title}</p>
        <div className="event-meta">
          <span className="badge event-kind">{category.eventLabel}</span>
          {item.external && <span className="badge event-shared">כללי / בית ספרי</span>}
          {item.times.map(time => (
            <span key={time} className="badge event-time"><Icon name="time" size={14} /><bdi dir={/^\d/u.test(time) ? 'ltr' : 'rtl'}>{time}</bdi></span>
          ))}
        </div>
      </div>
    </li>
  )
}

function Day({ day, today }) {
  return (
    <article className={'day-card' + (day.date === today ? ' current-day' : '')}>
      <header className="day-header">
        <time dateTime={day.date}>
          <span className="day-weekday">{weekdayLabel(day.date)}</span>
          <span className="day-date">{hebrewDateLabel(day.date)}</span>
          <span className="day-civil">{civilDateLabel(day.date)}</span>
        </time>
        {day.date === today && <span className="badge today-label">היום</span>}
      </header>
      <ul className="events">
        {day.events.map(item => <Event key={JSON.stringify([item.title, item.times])} item={item} />)}
      </ul>
    </article>
  )
}

function DayList({ days, today }) {
  return (
    <div className="timeline">
      {days.map((day, index) => {
        const startOfMonth = index === 0 || days[index - 1].date.slice(0, 7) !== day.date.slice(0, 7)
        return (
          <Fragment key={day.date}>
            {startOfMonth && <h3 className="month-heading">{monthLabel(day.date)}</h3>}
            <Day day={day} today={today} />
          </Fragment>
        )
      })}
    </div>
  )
}

function Schedule({ grade, label }) {
  const today = useSchoolDate()
  const lastOfWeek = nextDays(today, 6)
  const [data, retry] = useSchedule(grade)
  const [scope, setScope] = useState('upcoming')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const ready = data.status === 'ready'
  const todayCount = data.days.find(day => day.date === today)?.events.length ?? 0
  const weekCount = data.days.reduce((total, day) => (
    day.date >= today && day.date <= lastOfWeek ? total + day.events.length : total
  ), 0)
  const keywords = normalize(query).split(' ').filter(Boolean)
  const visibleDays = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean)
    return data.days.filter(({ date }) => {
      if (scope === 'today') return date === today
      if (scope === 'week') return date >= today && date <= lastOfWeek
      if (scope === 'past') return date < today
      return date >= today
    }).flatMap(day => {
      const events = day.events.filter(item => {
        if (category !== 'all' && category !== item.type) return false
        if (!words.length) return true
        const haystack = normalize([item.title, ...item.times, item.external ? 'כללי בית ספרי' : '',
          categories.find(({ key }) => key === item.type).label, hebrewDateLabel(day.date), civilDateLabel(day.date),
        ].join(' '))
        return words.every(word => haystack.includes(word))
      })
      return events.length ? [{ ...day, events }] : []
    })
  }, [data.days, scope, today, lastOfWeek, category, query])
  const visibleCount = visibleDays.reduce((sum, day) => sum + day.events.length, 0)
  const title = {
    upcoming: 'האירועים הקרובים', today: 'היום', week: 'השבוע הקרוב', past: 'תאריכים קודמים',
  }[scope]
  function toggleScope(next) { setScope(current => current === next ? 'upcoming' : next) }

  return (
    <>
      <header className="masthead">
        <div className="shell masthead-inner">
          <div className="brand"><span><Icon name="calendar" size={22} /></span>לוח שכבה</div>
          <time className="masthead-date" dateTime={today}>{longDateLabel(today)}</time>
        </div>
      </header>
      <main className="shell content">
        <section className="hero">
          <h1>תיכון קשת - לוח מבחנים ואירועים<span className="hero-grade"><span className="sr-only"> - </span>שכבת {label}</span></h1>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-calendar">
              <i /><i /><div className="hero-calendar-grid"><b /><b /><b /><b /><b /><b /><b /><b /><em><Icon name="calendar" size={18} /></em></div>
            </div>
          </div>
        </section>

        <div className="summary-grid">
          <Summary icon="today" label="היום" date={longDateLabel(today)} count={todayCount} ready={ready}
            selected={scope === 'today'} onClick={() => toggleScope('today')} />
          <Summary icon="week" label="השבוע הקרוב" date={civilDateLabel(today) + ' – ' + civilDateLabel(lastOfWeek)}
            count={weekCount} ready={ready} selected={scope === 'week'} onClick={() => toggleScope('week')} />
        </div>

        <div className="controls">
          <div className="search-box" role="search">
            <Icon name="search" size={22} />
            <label className="sr-only" htmlFor="schedule-search">חיפוש בלוח השכבה</label>
            <input id="schedule-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="חיפוש בלוח השכבה..." autoComplete="off" />
            {query && <button className="clear-search" type="button" aria-label="ניקוי חיפוש"
              onClick={() => { setQuery(''); document.getElementById('schedule-search').focus() }}><Icon name="close" size={18} /></button>}
          </div>
          <div className="filter-row">
            <div className="filters" role="group" aria-label="סינון לפי סוג אירוע">
              {categories.map(({ key, label: categoryLabel }) => (
                <button type="button" className="filter" key={key} aria-pressed={category === key}
                  onClick={() => setCategory(key)}>
                  {key !== 'all' && <Icon name={key} size={16} />}{categoryLabel}
                </button>
              ))}
            </div>
            <button className="history-button" type="button" aria-pressed={scope === 'past'} aria-controls="schedule-list"
              onClick={() => toggleScope('past')}><Icon name="history" size={18} />
              {scope === 'past' ? 'הסתר תאריכים קודמים' : 'הצג תאריכים קודמים'}
            </button>
          </div>
        </div>

        <section id="schedule-list" aria-labelledby="schedule-title" aria-busy={data.status === 'loading'}>
          <div className="section-heading">
            <h2 id="schedule-title">{title}</h2>
            <span role="status">{ready ? eventsLabel(visibleCount) : ''}</span>
          </div>
          {ready && visibleDays.length > 0 && <DayList days={visibleDays} today={today} />}
          {ready && visibleDays.length === 0 && <div className="empty-state">
            <Icon name={keywords.length ? 'search' : 'calendar'} size={26} />
            <p>{keywords.length || category !== 'all' ? 'לא נמצאו אירועים שמתאימים לסינון.' :
              scope === 'today' ? 'אין אירועים מתוכננים להיום.' :
                scope === 'week' ? 'אין אירועים מתוכננים לשבוע הקרוב.' :
                  scope === 'past' ? 'אין אירועים בתאריכים קודמים.' : 'אין אירועים קרובים בלוח.'}</p>
            {(keywords.length > 0 || category !== 'all') && <button type="button" className="text-button"
              onClick={() => { setQuery(''); setCategory('all') }}>ניקוי סינון</button>}
            {scope !== 'upcoming' && <button type="button" className="text-button" onClick={() => setScope('upcoming')}>לכל האירועים הקרובים</button>}
          </div>}
          {data.status === 'loading' && <p className="empty-state" role="status">הלוח נטען…</p>}
          {(data.status === 'error' || data.status === 'missing') && <div className="empty-state" role="alert">
            <Icon name="calendar" size={26} />
            <p>{data.status === 'missing' ? 'הלוח עדיין לא סונכרן.' : 'טעינת הלוח נכשלה.'}</p>
            <button type="button" className="text-button" onClick={retry}>טעינה מחדש</button>
          </div>}
        </section>
        {ready && <footer className="footer"><Icon name="time" size={16} />
          <span>עודכן לאחרונה: <time dateTime={data.updatedAt}>{updatedLabel(data.updatedAt)}</time></span>
        </footer>}
      </main>
    </>
  )
}

const root = document.getElementById('root')
createRoot(root).render(<Schedule grade={Number(root.dataset.grade)} label={root.dataset.gradeLabel} />)
