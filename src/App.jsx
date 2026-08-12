import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setIsAdmin(null)
      return
    }
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setIsAdmin(!!data?.is_admin))
  }, [session])

  if (booting) return <div className="loading">Loading…</div>
  if (!session) return <Login />
  if (isAdmin === null) return <div className="loading">Checking access…</div>
  if (!isAdmin) return <NoAccess />
  return <Dashboard />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
  }
  return (
    <div className="login">
      <h1>Prove It <span>Admin</span></h1>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button>Log in</button>
      </form>
      {err && <p className="err">{err}</p>}
    </div>
  )
}

function NoAccess() {
  return (
    <div className="login">
      <h1>No access</h1>
      <p>This account isn't a reviewer.</p>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  )
}

function Dashboard() {
  const [tab, setTab] = useState('queue')
  return (
    <div className="dash">
      <header>
        <span className="brand">PROVE<b>IT</b> · Admin</span>
        <nav>
          <button className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>Review queue</button>
          <button className={tab === 'catalogue' ? 'on' : ''} onClick={() => setTab('catalogue')}>Challenges</button>
          <button className="logout" onClick={() => supabase.auth.signOut()}>Log out</button>
        </nav>
      </header>
      <main>{tab === 'queue' ? <Queue /> : <Catalogue />}</main>
    </div>
  )
}

/* ---------------- REVIEW QUEUE ---------------- */

function Queue() {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('submissions')
      .select('*, assignment:assignments(*, challenge:challenges(title, points)), reviewer:profiles!submissions_user_id_fkey(name)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
    setRows(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(row, decision) {
    setBusy(true)
    await supabase.rpc('review_submission', { p_submission: row.id, p_decision: decision })
    await load()
    setBusy(false)
  }

  if (rows.length === 0) return <p className="empty">Nothing waiting for review.</p>

  return (
    <div className="queue">
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="card-head">
            <span className="ctitle">{r.assignment?.challenge?.title}</span>
            <span className="cpts">{r.assignment?.challenge?.points} pts</span>
          </div>
          <p className="who">by {r.reviewer?.name || 'Unknown'}</p>
          {r.note && <p className="note">"{r.note}"</p>}
          {r.proof_url && <Proof url={r.proof_url} />}
          <div className="actions">
            <button className="approve" disabled={busy} onClick={() => decide(r, 'approved')}>Approve</button>
            <button className="reject" disabled={busy} onClick={() => decide(r, 'rejected')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Proof({ url }) {
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
  return isVideo ? (
    <video src={url} controls className="proof" />
  ) : (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="proof" className="proof" />
    </a>
  )
}

/* ---------------- CHALLENGE CRUD ---------------- */

// Reconstructed from an earlier conversation's summary of ~64 domains used for
// the 2000-challenge catalogue. Not verified verbatim against the real import —
// used only as datalist SUGGESTIONS, so it never blocks or overwrites whatever
// domain value a challenge actually already has.
const DOMAIN_SUGGESTIONS = [
  'World Cuisines', 'Iconic Dishes', 'Baking', 'Drinks & Brewing', 'Preservation & Butchery',
  'Instruments', 'Music Production', 'Dance', 'Martial Arts',
  'Team Sports', 'Racquet Sports', 'Water Sports', 'Winter Sports',
  'Aviation', 'Motorsport', 'Cycling', 'Running', 'Strength',
  'Gymnastics & Calisthenics', 'Yoga', 'Climbing', 'Mind Sports', 'Memory', 'Puzzles',
  'Languages', 'Writing', 'Visual Art', 'Photography & Film', 'Crafts', 'Trades',
  'Tech & Engineering', 'Science & Nature ID', 'Gardening', 'Animals',
  'Hunting, Fishing & Foraging', 'Survival & Bushcraft',
  'Social Courage', 'Kindness & Community', 'Teaching', 'Business', 'Career', 'Relationships',
  'Discipline Streaks', 'Wellbeing', 'Travel', 'Hiking & Camping', 'Bucket List', 'Thrill',
  'Home & Lifestyle', 'Culture & History', 'Performance & Theatre', 'Sensory',
  'Party Games', 'Absurd & Fun', 'Fitness Benchmarks', 'Diet', 'Adventurous Foods',
  'Civic', 'Collecting', 'Spectator', 'Specialist Skills', 'Digital & Media',
]

const fieldStyle = {
  width: '100%', padding: '0.7rem 0.9rem', background: '#0d1f17',
  border: '1px solid #1c3a2a', borderRadius: 8, color: '#eaf2ec',
  fontSize: '0.95rem', fontFamily: 'inherit',
}

const BLANK = { title: '', description: '', points: 1, track: 'short', resources: '', proof_requirements: '', domain: '', is_active: true }

function Catalogue() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const [domainFilter, setDomainFilter] = useState('')
  const [trackFilter, setTrackFilter] = useState('')

  const load = useCallback(async () => {
    // NOTE: pagination MUST order by a unique column. Ordering by `points` here caused a
    // real bug: points is heavily non-unique (hundreds of rows share a value), each .range()
    // call is a separate query, and Postgres doesn't guarantee a consistent tie-break between
    // them — so boundary rows came back on two pages at once (and others were skipped).
    // Duplicate ids => duplicate React keys => broken reconciliation => stale rows left in the
    // DOM when filtering. Order by id (unique) to page safely, then sort for display.
    const PAGE = 1000
    let all = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      all = all.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    // Defensive: guarantee unique ids even if the source ever returns overlaps again.
    const byId = new Map()
    for (const r of all) byId.set(r.id, r)
    const unique = Array.from(byId.values())
    unique.sort((a, b) => (a.points - b.points) || String(a.title || '').localeCompare(String(b.title || '')))
    setRows(unique)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save(form) {
    if (form.id) {
      await supabase.from('challenges').update(form).eq('id', form.id)
    } else {
      await supabase.from('challenges').insert(form)
    }
    setEditing(null)
    load()
  }

  async function remove(id) {
    if (!confirm('Delete this challenge?')) return
    await supabase.from('challenges').delete().eq('id', id)
    load()
  }

  // Filter options come from domains actually present in the data, not the
  // guessed suggestion list — so this is always accurate regardless.
  const domainsInUse = [...new Set(rows.map((r) => r.domain).filter(Boolean))].sort()
  const shortCount = rows.filter((r) => r.track === 'short').length
  const longCount = rows.filter((r) => r.track === 'long').length
  const visibleRows = rows
    .filter((r) => !domainFilter || r.domain === domainFilter)
    .filter((r) => !trackFilter || r.track === trackFilter)
  const filterActive = domainFilter || trackFilter

  return (
    <div className="catalogue">
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="add" onClick={() => setEditing(BLANK)}>+ New challenge</button>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          style={{ ...fieldStyle, width: 'auto', minWidth: 180 }}
        >
          <option value="">All domains ({rows.length})</option>
          {domainsInUse.map((d) => (
            <option key={d} value={d}>
              {d} ({rows.filter((r) => r.domain === d).length})
            </option>
          ))}
        </select>
        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
          style={{ ...fieldStyle, width: 'auto', minWidth: 150 }}
        >
          <option value="">All tracks ({rows.length})</option>
          <option value="short">Short Term ({shortCount})</option>
          <option value="long">Long Term ({longCount})</option>
        </select>
        {filterActive && (
          <span style={{ color: '#6f9a82', fontSize: '0.85rem' }}>
            {visibleRows.length} shown · <button
              style={{ background: 'none', border: 'none', color: '#1fe87b', cursor: 'pointer', padding: 0, font: 'inherit' }}
              onClick={() => { setDomainFilter(''); setTrackFilter('') }}
            >clear</button>
          </span>
        )}
      </div>
      <div className="clist">
        {visibleRows.map((c) => (
          <div className="crow" key={c.id}>
            <div>
              <span className="ctitle">{c.title}</span>
              <span className="cmeta">
                {c.domain ? `${c.domain} · ` : ''}{c.points} pts · {c.track === 'short' ? 'Short Term' : 'Long Term'} {c.is_active ? '' : '· hidden'}
              </span>
            </div>
            <div className="crow-actions">
              <button onClick={() => setEditing(c)}>Edit</button>
              <button className="del" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
        {visibleRows.length === 0 && <p className="empty">No challenges match this filter yet.</p>}
      </div>
      {editing && <Editor initial={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Editor({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h3>{f.id ? 'Edit' : 'New'} challenge</h3>
        <label>Title<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>
          Domain
          <input
            list="domain-suggestions"
            value={f.domain || ''}
            onChange={(e) => set('domain', e.target.value)}
            placeholder="e.g. World Cuisines"
            style={fieldStyle}
          />
          <datalist id="domain-suggestions">
            {DOMAIN_SUGGESTIONS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label>Description<textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label>Resources (steps / paths — shown under "Guides")<textarea rows={2} value={f.resources || ''} onChange={(e) => set('resources', e.target.value)} /></label>
        <label>Proof requirements (shown under "Proof requirements")<textarea rows={2} value={f.proof_requirements || ''} onChange={(e) => set('proof_requirements', e.target.value)} /></label>
        <div className="two">
          <label>Points<input type="number" value={f.points} onChange={(e) => set('points', Number(e.target.value))} /></label>
          <label>
            Track
            <select value={f.track || 'short'} onChange={(e) => set('track', e.target.value)} style={fieldStyle}>
              <option value="short">Short Term</option>
              <option value="long">Long Term</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Active (in the assignment pool)
        </label>
        <div className="modal-actions">
          <button className="save" onClick={() => onSave(f)}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
