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

const BLANK = { title: '', description: '', points: 1, time_limit_hours: 168, resources: '', is_active: true }

function Catalogue() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenges').select('*').order('points', { ascending: true })
    setRows(data || [])
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

  return (
    <div className="catalogue">
      <button className="add" onClick={() => setEditing(BLANK)}>+ New challenge</button>
      <div className="clist">
        {rows.map((c) => (
          <div className="crow" key={c.id}>
            <div>
              <span className="ctitle">{c.title}</span>
              <span className="cmeta">{c.points} pts · {c.time_limit_hours}h {c.is_active ? '' : '· hidden'}</span>
            </div>
            <div className="crow-actions">
              <button onClick={() => setEditing(c)}>Edit</button>
              <button className="del" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
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
        <label>Description<textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label>Resources (steps / paths)<textarea rows={2} value={f.resources || ''} onChange={(e) => set('resources', e.target.value)} /></label>
        <div className="two">
          <label>Points<input type="number" value={f.points} onChange={(e) => set('points', Number(e.target.value))} /></label>
          <label>Time limit (hours)<input type="number" value={f.time_limit_hours} onChange={(e) => set('time_limit_hours', Number(e.target.value))} /></label>
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
