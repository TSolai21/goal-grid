'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronRight, Flame, Plus, RotateCcw, Target, Trophy, X, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type GoalRow = { id: string; title: string; start_date: string; end_date: string }
type DayRecord = { date: Date; completed: boolean; isWorkingDay: boolean }
type ViewState = 'home' | 'detail'

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

const initialStart = ''
const initialEnd = ''

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildDays(start: string, end: string, checkins: { checkin_date: string; completed: boolean }[] = []): DayRecord[] {
  if (!start || !end) return []
  const first = parseLocalDate(start)
  const last = parseLocalDate(end)
  const days: DayRecord[] = []
  
  const checkinMap = new Map(checkins.map(c => [c.checkin_date, c.completed]))
  
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const dKey = toDateKey(cursor)
    days.push({ 
      date: new Date(cursor), 
      completed: checkinMap.get(dKey) || false, 
      isWorkingDay: isWorkingDay(cursor) 
    })
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
  const [goalsList, setGoalsList] = useState<GoalRow[]>([])
  const [selectedGoal, setSelectedGoal] = useState<GoalRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [view, setView] = useState<ViewState>('home')

  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  
  const [days, setDays] = useState<DayRecord[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingGoals, setLoadingGoals] = useState(true)
  
  const supabase = createClient()

  useEffect(() => {
    async function fetchGoals() {
      setLoadingGoals(true)
      const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false })
      if (!error && data) {
        setGoalsList(data)
        if (data.length > 0 && !selectedGoal) {
          selectGoal(data[0]) // Auto select first goal for desktop
        }
      }
      setLoadingGoals(false)
    }
    fetchGoals()
  }, [])

  async function selectGoal(selected: GoalRow) {
    setSelectedGoal(selected)
    setView('detail')
    setDays([]) // clear while loading
    const { data, error } = await supabase.from('goal_day_checkins').select('checkin_date, completed').eq('goal_id', selected.id)
    if (!error) {
      setDays(buildDays(selected.start_date, selected.end_date, data || []))
    }
  }

  const completed = days.filter((day) => day.completed).length
  const total = days.length
  const remaining = total - completed
  const remainingWork = days.filter(d => !d.completed && d.isWorkingDay).length
  const remainingOff = days.filter(d => !d.completed && !d.isWorkingDay).length
  const progress = total ? Math.round((completed / total) * 100) : 0
  const { current, longest } = useMemo(() => getStreaks(days), [days])

  async function startGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!goal.trim()) return setError('Give your goal a name before starting.')
    if (!startDate || !endDate) return setError('Choose both a start date and an end date.')
    if (parseLocalDate(endDate) < parseLocalDate(startDate)) return setError('End date must be on or after the start date.')

    setSaving(true)
    setError('')
    const { data, error: saveError } = await supabase.from('goals').insert({ title: goal.trim(), start_date: startDate, end_date: endDate }).select('*').single<GoalRow>()
    if (saveError || !data) {
      setSaving(false)
      return setError('Could not save your goal. Please try again.')
    }

    const nextDays = buildDays(startDate, endDate)
    const { error: checkinError } = await supabase.from('goal_day_checkins').insert(nextDays.map((day) => ({ goal_id: data.id, checkin_date: toDateKey(day.date), completed: false })))
    if (checkinError) {
      setSaving(false)
      return setError('Goal saved, but its days could not be created.')
    }
    
    setGoalsList(prev => [data, ...prev])
    selectGoal(data)
    setSaving(false)
    setIsModalOpen(false)
    setGoal('')
    setStartDate('')
    setEndDate('')
  }

  async function toggleDay(index: number) {
    if (!selectedGoal) return
    const day = days[index]
    const completed = !day.completed
    setDays((currentDays) => currentDays.map((item, dayIndex) => dayIndex === index ? { ...item, completed } : item))
    await supabase.from('goal_day_checkins').upsert({ goal_id: selectedGoal.id, checkin_date: toDateKey(day.date), completed }, { onConflict: 'goal_id,checkin_date' })
  }

  async function resetCheckins() {
    if (!selectedGoal) return
    setDays((currentDays) => currentDays.map((day) => ({ ...day, completed: false })))
    await supabase.from('goal_day_checkins').update({ completed: false }).eq('goal_id', selectedGoal.id)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col">
        
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-border bg-background/80 px-5 py-4 backdrop-blur-md sticky top-0 z-10 sm:px-8 lg:px-12 lg:py-6">
          <div className="flex items-center gap-3">
            {view === 'detail' && (
              <button onClick={() => setView('home')} className="flex lg:hidden items-center gap-1 rounded-full p-2 pl-0 text-sm font-bold text-muted-foreground transition hover:text-foreground">
                <ArrowLeft size={18} strokeWidth={3} />
              </button>
            )}
            
            {/* Logo area - hidden on mobile detail view, visible on desktop or mobile home */}
            <div className={`items-center gap-3 ${view === 'detail' ? 'hidden lg:flex' : 'flex'}`}>
              <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Target size={20} strokeWidth={2.5} />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Daily practice</p>
                <h1 className="font-sans text-xl font-black tracking-tight sm:text-2xl">Goal Day Tracker</h1>
              </div>
            </div>
          </div>

          <button onClick={() => setIsModalOpen(true)} className={`flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 shadow-sm ${view === 'detail' ? 'hidden lg:flex' : 'flex'}`}>
            <Plus size={14} strokeWidth={3} /> New Goal
          </button>
        </header>

        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[280px_1fr] lg:gap-10 p-5 sm:px-8 lg:px-12 lg:py-10">
          
          {/* Left Sidebar: List of Goals */}
          <aside className={`flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300 ${view === 'home' ? 'flex' : 'hidden lg:flex'}`}>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">My Goals</p>
              
              {loadingGoals ? (
                <div className="flex flex-col gap-3">
                  {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/50 animate-pulse"></div>)}
                </div>
              ) : goalsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-12 text-center">
                  <Target size={40} className="text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-semibold text-muted-foreground">No goals yet.</p>
                  <button onClick={() => setIsModalOpen(true)} className="mt-4 rounded-full bg-primary/10 px-4 py-2 text-xs font-bold text-primary">Create one</button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {goalsList.map(g => (
                    <button 
                      key={g.id} 
                      onClick={() => selectGoal(g)}
                      className={`group flex flex-col text-left rounded-2xl border p-4 transition duration-200 active:scale-[0.98] ${selectedGoal?.id === g.id ? 'border-primary bg-accent shadow-sm ring-1 ring-primary/20' : 'border-border bg-card hover:border-primary/30'}`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <h4 className="font-bold text-base truncate pr-4">{g.title}</h4>
                        <ChevronRight size={16} className={`transition ${selectedGoal?.id === g.id ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-primary'}`} />
                      </div>
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {formatDate(parseLocalDate(g.start_date), { month: 'short', day: 'numeric' })} - {formatDate(parseLocalDate(g.end_date), { month: 'short', day: 'numeric' })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-auto rounded-3xl bg-accent p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-foreground/60">A small reminder</p>
              <p className="mt-3 text-sm font-semibold leading-6 text-accent-foreground">Consistency is not about never missing. It is about returning.</p>
            </div>
          </aside>

          {/* Right Section: Grid View */}
          <section className={`min-w-0 flex-col animate-in fade-in slide-in-from-right-4 duration-300 ${view === 'detail' ? 'flex' : 'hidden lg:flex'}`}>
            {selectedGoal ? (
              <>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground lg:hidden">Tracking</p>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hidden lg:block">Your current goal</p>
                    <h2 className="mt-1 text-balance text-3xl font-black tracking-tight sm:text-4xl">{selectedGoal.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDate(parseLocalDate(selectedGoal.start_date), { month: 'short', day: 'numeric', year: 'numeric' })} — {formatDate(parseLocalDate(selectedGoal.end_date), { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button type="button" onClick={resetCheckins} className="flex items-center gap-2 self-start rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:bg-secondary"><RotateCcw size={13} /> Reset check-ins</button>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Metric label="Total days" value={total} />
                  <Metric label="Completed" value={completed} accent />
                  <Metric label="Remaining" value={remaining} />
                  <Metric label="Work left" value={remainingWork} />
                  <Metric label="Off left" value={remainingOff} />
                  <Metric label="Progress" value={`${progress}%`} accent />
                </div>
                
                {total > 0 && (
                  <div className="mt-5 rounded-2xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Completion</span><span className="text-sm font-black">{completed} / {total}</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                  </div>
                )}

                <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div><h3 className="text-lg font-black">Every day counts</h3><p className="mt-1 text-sm text-muted-foreground">Tap a day to mark it complete.</p></div>
                  <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" /> Working day</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-secondary-foreground/30" /> Non-working day</span>
                    <span className="flex items-center gap-1.5"><Flame size={14} className="text-primary" /> {current} current</span>
                    <span className="flex items-center gap-1.5"><Trophy size={14} className="text-primary" /> {longest} best</span>
                  </div>
                </div>
                
                <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                  {days.map((day, index) => (
                    <button 
                      key={day.date.toISOString()} 
                      type="button" 
                      aria-pressed={day.completed} 
                      aria-label={`Day ${index + 1}, ${formatDate(day.date, { month: 'long', day: 'numeric' })}, ${getDayLabel(day)}, ${day.completed ? 'completed' : 'incomplete'}`} 
                      onClick={() => toggleDay(index)} 
                      className={`group relative flex min-h-24 lg:min-h-32 flex-col justify-between rounded-2xl border p-3 lg:p-4 text-left transition duration-200 active:scale-95 lg:hover:-translate-y-1 lg:hover:shadow-md ${day.completed ? 'border-primary bg-primary text-primary-foreground shadow-sm' : day.isWorkingDay ? 'border-border bg-card hover:border-primary/50' : 'border-dashed border-border/70 bg-secondary/30 lg:bg-secondary/45 text-muted-foreground'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-widest ${day.completed ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>Day {String(index + 1).padStart(2, '0')}</span>
                        <span className={`hidden lg:inline-block rounded-full px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide ${day.completed && day.isWorkingDay ? 'bg-primary-foreground/15 text-primary-foreground' : day.completed && !day.isWorkingDay ? 'bg-background/70 text-muted-foreground' : day.isWorkingDay ? 'bg-accent text-accent-foreground' : 'bg-background/70 text-muted-foreground'}`}>{day.isWorkingDay ? 'Work' : 'Off'}</span>
                      </div>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[10px] lg:text-xs font-black uppercase tracking-wide">{formatDate(day.date, { weekday: 'short' })}</span>
                        <span className="text-xs lg:text-sm font-bold">{formatDate(day.date, { month: 'short', day: 'numeric' })}</span>
                      </span>
                      <span className={`grid size-6 lg:size-8 place-items-center rounded-full border-2 ${day.completed ? 'border-primary-foreground/50 bg-primary-foreground text-primary' : 'border-border text-transparent lg:group-hover:border-primary/50'}`}>
                        <Check size={14} strokeWidth={3} className="lg:h-4 lg:w-4 w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              !loadingGoals && (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-3xl border border-dashed border-border p-10 text-center">
                  <Target size={48} className="text-muted-foreground/30 mb-4" strokeWidth={1} />
                  <h3 className="text-xl font-bold">No Goal Selected</h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-[300px]">Select a goal from the sidebar or create a new one to view your tracking grid.</p>
                  <button onClick={() => setIsModalOpen(true)} className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90">Create New Goal</button>
                </div>
              )
            )}
          </section>
        </div>
      </div>

      {/* Modal for Creating a Goal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Overlay backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)}></div>
          
          {/* Modal Content */}
          <div className="relative z-10 w-full sm:max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300 pb-10 sm:pb-6">
            <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-secondary sm:hidden"></div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black">Create New Goal</h3>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-secondary text-muted-foreground transition active:scale-95"><X size={20} /></button>
            </div>
            
            <form className="flex flex-col gap-4" onSubmit={startGoal}>
              <label className="grid gap-2">
                <span className="text-xs font-bold">Goal name</span>
                <input value={goal} onChange={(event) => setGoal(event.target.value)} className="h-12 lg:h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" placeholder="e.g. Read every day" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-bold">Start date</span>
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-12 lg:h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-bold">End date</span>
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-12 lg:h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
                </label>
              </div>
              {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}
              
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="hidden sm:flex h-11 flex-1 items-center justify-center rounded-xl border border-input bg-background font-bold text-foreground transition hover:bg-secondary">Cancel</button>
                <button disabled={saving} className="flex h-12 sm:h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground transition active:scale-[0.98] lg:hover:translate-y-[-1px] lg:hover:shadow-lg disabled:opacity-60 shadow-lg shadow-primary/20" type="submit">
                  {saving ? 'Saving…' : 'Start goal'} {!saving && <ChevronRight size={16} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

function Metric({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 lg:p-4 ${accent ? 'border-primary/30 bg-primary/5 lg:bg-accent' : 'border-border bg-card'}`}>
      <p className="font-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl lg:text-2xl font-black tracking-tight ${accent ? 'text-primary lg:text-foreground' : ''}`}>{value}</p>
    </div>
  )
}
