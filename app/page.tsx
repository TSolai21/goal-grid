'use client'

import { FormEvent, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronRight, Flame, RotateCcw, Target, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type GoalRow = { id: string }

type DayRecord = { date: Date; completed: boolean; isWorkingDay: boolean }

function isWorkingDay(date: Date) {
  const weekday = date.getDay()
  if (weekday >= 1 && weekday <= 5) return true
  if (weekday !== 6) return false

  const saturdayNumber = Math.ceil(date.getDate() / 7)
  return saturdayNumber === 1 || saturdayNumber === 3
}

function getDayLabel(day: DayRecord) {
  return day.isWorkingDay ? 'Working day' : 'Non-working day'
}

const initialStart = '2026-09-07'
const initialEnd = '2026-10-06'

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

function buildDays(start: string, end: string): DayRecord[] {
  const first = parseLocalDate(start)
  const last = parseLocalDate(end)
  const days: DayRecord[] = []
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    days.push({ date: new Date(cursor), completed: false, isWorkingDay: isWorkingDay(cursor) })
  }
  return days
}

function getStreaks(days: DayRecord[]) {
  let longest = 0
  let running = 0
  for (const day of days) {
    running = day.completed ? running + 1 : 0
    longest = Math.max(longest, running)
  }
  let current = 0
  for (let index = days.length - 1; index >= 0 && days[index].completed; index -= 1) current += 1
  return { current, longest }
}

export default function Page() {
  const [goal, setGoal] = useState('Study 2 Hours Daily')
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [days, setDays] = useState<DayRecord[]>(() => buildDays(initialStart, initialEnd))
  const [goalId, setGoalId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const completed = days.filter((day) => day.completed).length
  const total = days.length
  const remaining = total - completed
  const progress = total ? Math.round((completed / total) * 100) : 0
  const { current, longest } = useMemo(() => getStreaks(days), [days])

  async function startGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!goal.trim()) return setError('Give your goal a name before starting.')
    if (!startDate || !endDate) return setError('Choose both a start date and an end date.')
    if (parseLocalDate(endDate) < parseLocalDate(startDate)) return setError('End date must be on or after the start date.')

    setSaving(true)
    setError('')
    const { data, error: saveError } = await createClient().from('goals').insert({ title: goal.trim(), start_date: startDate, end_date: endDate }).select('id').single<GoalRow>()
    if (saveError || !data) {
      setSaving(false)
      return setError('Could not save your goal. Please try again.')
    }

    const nextDays = buildDays(startDate, endDate)
    const { error: checkinError } = await createClient().from('goal_day_checkins').insert(nextDays.map((day) => ({ goal_id: data.id, checkin_date: toDateKey(day.date), completed: false })))
    if (checkinError) {
      setSaving(false)
      return setError('Goal saved, but its days could not be created.')
    }
    setGoalId(data.id)
    setDays(nextDays)
    setSaving(false)
  }

  async function toggleDay(index: number) {
    const day = days[index]
    const completed = !day.completed
    setDays((currentDays) => currentDays.map((item, dayIndex) => dayIndex === index ? { ...item, completed } : item))
    if (goalId) await createClient().from('goal_day_checkins').upsert({ goal_id: goalId, checkin_date: toDateKey(day.date), completed }, { onConflict: 'goal_id,checkin_date' })
  }

  async function resetCheckins() {
    setDays((currentDays) => currentDays.map((day) => ({ ...day, completed: false })))
    if (goalId) await createClient().from('goal_day_checkins').update({ completed: false }).eq('goal_id', goalId)
  }

  function toDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Target size={20} strokeWidth={2.5} /></div>
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Daily practice</p><h1 className="font-sans text-xl font-black tracking-tight sm:text-2xl">Goal Day Tracker</h1></div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:flex"><CalendarDays size={14} /> Manual mode</div>
        </header>

        <div className="mt-10 grid flex-1 gap-6 lg:grid-cols-[280px_1fr] lg:gap-10">
          <aside className="flex flex-col gap-6">
            <section className="rounded-3xl border border-border bg-card p-5 shadow-[0_12px_30px_color-mix(in_oklab,var(--primary)_8%,transparent)]">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Set your intention</p>
              <form className="mt-5 flex flex-col gap-4" onSubmit={startGoal}>
                <label className="grid gap-2"><span className="text-xs font-bold">Goal name</span><input value={goal} onChange={(event) => setGoal(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" placeholder="e.g. Read every day" /></label>
                <label className="grid gap-2"><span className="text-xs font-bold">Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" /></label>
                <label className="grid gap-2"><span className="text-xs font-bold">End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" /></label>
                {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}
                <button disabled={saving} className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:translate-y-[-1px] hover:shadow-lg disabled:cursor-wait disabled:opacity-60" type="submit">{saving ? 'Saving…' : 'Start new goal'} {!saving && <ChevronRight size={16} />}</button>
              </form>
            </section>
            <div className="rounded-3xl bg-accent p-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-foreground/60">A small reminder</p><p className="mt-3 text-sm font-semibold leading-6 text-accent-foreground">Consistency is not about never missing. It is about returning.</p></div>
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Your current goal</p><h2 className="mt-1 text-balance text-3xl font-black tracking-tight sm:text-4xl">{goal || 'Untitled goal'}</h2><p className="mt-2 text-sm text-muted-foreground">{startDate && endDate ? `${formatDate(parseLocalDate(startDate), { month: 'short', day: 'numeric', year: 'numeric' })} — ${formatDate(parseLocalDate(endDate), { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Choose a date range to begin'}</p></div><button type="button" onClick={resetCheckins} className="flex items-center gap-2 self-start rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:bg-secondary"><RotateCcw size={13} /> Reset check-ins</button></div>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Total days" value={total} /><Metric label="Completed" value={completed} accent /><Metric label="Remaining" value={remaining} /><Metric label="Progress" value={`${progress}%`} accent /></div>
            <div className="mt-5 rounded-2xl border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Completion</span><span className="text-sm font-black">{completed} / {total}</span></div><div className="h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} /></div></div>

            <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h3 className="text-lg font-black">Every day counts</h3><p className="mt-1 text-sm text-muted-foreground">Tap a day to mark it complete.</p></div><div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" /> Working day</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-secondary-foreground/30" /> Non-working day</span><span className="flex items-center gap-1.5"><Flame size={14} className="text-primary" /> {current} current</span><span className="hidden items-center gap-1.5 sm:flex"><Trophy size={14} className="text-primary" /> {longest} best</span></div></div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">{days.map((day, index) => <button key={day.date.toISOString()} type="button" aria-pressed={day.completed} aria-label={`Day ${index + 1}, ${formatDate(day.date, { month: 'long', day: 'numeric' })}, ${getDayLabel(day)}, ${day.completed ? 'completed' : 'incomplete'}`} onClick={() => toggleDay(index)} className={`group relative flex min-h-32 flex-col justify-between rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-1 hover:shadow-md ${day.completed ? 'border-primary bg-primary text-primary-foreground shadow-sm' : day.isWorkingDay ? 'border-border bg-card hover:border-primary/50' : 'border-dashed border-border/70 bg-secondary/45 text-muted-foreground'}`}><div className="flex items-center justify-between gap-2"><span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${day.completed ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>Day {String(index + 1).padStart(2, '0')}</span><span className={`rounded-full px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide ${day.completed && day.isWorkingDay ? 'bg-primary-foreground/15 text-primary-foreground' : day.completed && !day.isWorkingDay ? 'bg-background/70 text-muted-foreground' : day.isWorkingDay ? 'bg-accent text-accent-foreground' : 'bg-background/70 text-muted-foreground'}`}>{day.isWorkingDay ? 'Work' : 'Off'}</span></div><span className="flex flex-col gap-0.5"><span className="text-xs font-black uppercase tracking-wide">{formatDate(day.date, { weekday: 'short' })}</span><span className="text-sm font-bold">{formatDate(day.date, { month: 'short', day: 'numeric' })}</span></span><span className={`grid size-8 place-items-center rounded-full border-2 ${day.completed ? 'border-primary-foreground/50 bg-primary-foreground text-primary' : 'border-border text-transparent group-hover:border-primary/50'}`}><Check size={17} strokeWidth={3} /></span></button>)}</div>
          </section>
        </div>
        <footer className="mt-12 flex items-center justify-between border-t border-border pt-5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"><span>Built for the next small win</span><span>{total} day journey</span></footer>
      </div>
    </main>
  )
}

function Metric({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${accent ? 'border-primary/30 bg-accent' : 'border-border bg-card'}`}><p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p></div>
}
