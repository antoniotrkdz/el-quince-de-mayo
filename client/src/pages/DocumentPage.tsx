import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getDocument, updateDocumentStatus, updateDocument, createSection,
  deleteSection, exportDocumentOdt, joinDocument, updateSection,
  getSectionVersions,
} from '../api/documents'
import { getUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { DocumentStatusBadge, SectionStatusBadge } from '../components/StatusBadge'
import RichEditor from '../components/RichEditor'
import {
  ChevronRight, CheckCircle2, Clock, AlertCircle, Plus, Trash2, X,
  Download, UserPlus, Save, History, CheckCheck, Send, Wand2, ChevronLeft,
} from 'lucide-react'
import type { Document, Section } from '../types'

// ─── constants ────────────────────────────────────────────────────────────────

const TEACHER_JOIN_SECTION_TYPES = [
  { value: 'programma_svolto', label: 'Programma Svolto' },
  { value: 'metodologie', label: 'Metodologie e strumenti didattici' },
  { value: 'criteri_valutazione', label: 'Criteri di valutazione' },
  { value: 'percorso_clil', label: 'Percorso CLIL' },
]

const COORDINATOR_SECTION_TYPES = [
  { value: 'percorso_clil', label: 'Percorso CLIL' },
  { value: 'allegati', label: 'Allegati aggiuntivi' },
]

const SECTION_TYPE_LABEL: Record<string, string> = {
  percorso_clil: 'Percorso CLIL',
  allegati: 'Allegati aggiuntivi',
}

// ─── types ────────────────────────────────────────────────────────────────────

interface AddSectionForm {
  type: 'teacher' | 'coordinator'
  subject: string
  teacherId: string
  deadline: string
  customTitle: string
  section_type: string
}

// ─── DocumentPage ─────────────────────────────────────────────────────────────

export default function DocumentPage() {
  const { id: documentId, sectionId: initialSectionId } = useParams<{ id: string; sectionId?: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── sidebar state ──
  const [activeSectionId, setActiveSectionId] = useState<string | null>(initialSectionId ?? null)
  const [iframeReady, setIframeReady] = useState(false)

  // ── editor state ──
  const [content, setContent] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editorKey, setEditorKey] = useState(0)
  const [showVersions, setShowVersions] = useState(false)
  const [pctoForm, setPctoForm] = useState({ pcto_weeks: '', pcto_start_date: '', pcto_end_date: '' })
  const [pctoSaved, setPctoSaved] = useState(false)

  // ── overview state ──
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddSectionForm>({
    type: 'teacher', subject: '', teacherId: '', deadline: '', customTitle: '', section_type: 'programma_svolto',
  })
  const [showJoin, setShowJoin] = useState(false)
  const [joinForm, setJoinForm] = useState({ section_type: 'programma_svolto', subject: user?.subject ?? '' })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [udaTitles, setUdaTitles] = useState<string[]>([])
  const [udaSaved, setUdaSaved] = useState(false)

  // ── refs ──
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const activeSectionIdRef = useRef<string | null>(activeSectionId)
  const sectionTypeRef = useRef<string | undefined>(undefined)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<(Document & { sections: Section[] }) | undefined>(undefined)

  // ── queries ──
  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => getDocument(documentId!),
    enabled: !!documentId,
  })

  const { data: schoolUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: user?.role === 'coordinator',
  })

  const teachers = schoolUsers.filter((u) => u.role === 'teacher' && u.active)

  const activeSection = doc?.sections?.find((s) => s.id === activeSectionId) ?? null

  const { data: versions = [] } = useQuery({
    queryKey: ['section-versions', activeSectionId],
    queryFn: () => getSectionVersions(documentId!, activeSectionId!),
    enabled: showVersions && !!activeSectionId,
  })

  // ── keep refs in sync ──
  useEffect(() => { docRef.current = doc }, [doc])
  useEffect(() => { activeSectionIdRef.current = activeSectionId }, [activeSectionId])
  useEffect(() => { sectionTypeRef.current = activeSection?.section_type }, [activeSection?.section_type])

  // ── sync udaTitles ──
  useEffect(() => {
    if (doc?.uda_titles) setUdaTitles(doc.uda_titles)
  }, [doc?.uda_titles])

  // ── sync pctoForm ──
  useEffect(() => {
    if (!doc) return
    setPctoForm({
      pcto_weeks: doc.pcto_weeks != null ? String(doc.pcto_weeks) : '',
      pcto_start_date: doc.pcto_start_date?.slice(0, 10) ?? '',
      pcto_end_date: doc.pcto_end_date?.slice(0, 10) ?? '',
    })
  }, [doc?.pcto_weeks, doc?.pcto_start_date, doc?.pcto_end_date])

  // ── reset editor when switching sections ──
  useEffect(() => {
    setContent(null)
    setSaveStatus('idle')
    setShowVersions(false)
    setEditorKey((k) => k + 1)
  }, [activeSectionId])

  // ── iframe message handler ──
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return
      if (e.data.type === 'preview-ready') {
        setIframeReady(true)
        // inject-all is handled by the [doc, iframeReady] effect below
      }
      if (e.data.type === 'section-clicked') {
        const currentDoc = docRef.current
        if (!currentDoc) return
        const sec = currentDoc.sections?.find((s) => s.section_type === e.data.section)
        if (sec) selectSection(sec.id)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, []) // stable — uses refs

  // ── inject-all whenever iframe is ready AND doc is loaded (handles race condition) ──
  // Also re-fires on every doc refetch (post-save), keeping the template in sync
  useEffect(() => {
    if (!iframeReady || !doc) return
    const sections = (doc.sections ?? [])
      .filter((s) => s.content?.trim())
      .map((s) => ({ section: s.section_type, html: s.content }))
    const activeSec = activeSectionIdRef.current
      ? doc.sections?.find((s) => s.id === activeSectionIdRef.current)?.section_type ?? null
      : null
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'inject-all',
        sections,
        active: activeSec,
        metadata: {
          academic_year: doc.academic_year,
          school_class: doc.school_class,
          diploma_type: doc.diploma_type ?? undefined,
          coordinator_name: doc.coordinator_name,
          coordinator_prefix: doc.coordinator_prefix,
          pcto_weeks: doc.pcto_weeks ?? undefined,
          pcto_start_date: doc.pcto_start_date ?? undefined,
          pcto_end_date: doc.pcto_end_date ?? undefined,
        },
      },
      '*'
    )
  }, [doc, iframeReady])

  // ─── mutations ────────────────────────────────────────────────────────────

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateDocumentStatus(documentId!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document', documentId] }),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateSection>[2]) =>
      updateSection(documentId!, activeSectionId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      // push saved content to iframe
      if (content !== null && sectionTypeRef.current) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'update-section', section: sectionTypeRef.current, html: content },
          '*'
        )
      }
    },
  })

  const updateDocMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateDocument>[1]) => updateDocument(documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] })
      setPctoSaved(true)
      setTimeout(() => setPctoSaved(false), 2000)
    },
  })

  const addSectionMutation = useMutation({
    mutationFn: () => {
      const isTeacher = addForm.type === 'teacher'
      const subject = isTeacher ? addForm.subject : undefined
      const title = addForm.customTitle.trim() ||
        (isTeacher
          ? `Programma svolto – ${addForm.subject}`
          : SECTION_TYPE_LABEL[addForm.section_type] ?? addForm.section_type)
      return createSection(documentId!, {
        section_type: isTeacher ? 'programma_svolto' : addForm.section_type,
        title,
        subject,
        assigned_to: isTeacher && addForm.teacherId ? addForm.teacherId : undefined,
        deadline: addForm.deadline ? new Date(addForm.deadline).toISOString() : undefined,
        sort_order: (doc?.sections?.length ?? 0) + 1,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] })
      setShowAdd(false)
      setAddForm({ type: 'teacher', subject: '', teacherId: '', deadline: '', customTitle: '', section_type: 'programma_svolto' })
    },
  })

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) => deleteSection(documentId!, sectionId),
    onSuccess: (_, sectionId) => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] })
      setDeleteConfirm(null)
      if (activeSectionId === sectionId) clearSection()
    },
  })

  const joinMutation = useMutation({
    mutationFn: () => joinDocument(documentId!, { section_type: joinForm.section_type, subject: joinForm.subject || undefined }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] })
      setShowJoin(false)
      const section = 'section' in data ? data.section : data
      selectSection(section.id)
    },
  })

  const udaMutation = useMutation({
    mutationFn: () => updateDocument(documentId!, { uda_titles: udaTitles }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] })
      setUdaSaved(true)
      setTimeout(() => setUdaSaved(false), 2000)
    },
  })

  // ─── handlers ─────────────────────────────────────────────────────────────

  function selectSection(id: string) {
    setActiveSectionId(id)
    navigate(`/documents/${documentId}/sections/${id}`, { replace: true })
    const sec = docRef.current?.sections?.find((s) => s.id === id)
    if (sec?.section_type) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'highlight-section', section: sec.section_type },
        '*'
      )
    }
  }

  function clearSection() {
    setActiveSectionId(null)
    navigate(`/documents/${documentId}`, { replace: true })
  }

  const handleSave = () => {
    if (content === null || !activeSectionId) return
    setSaveStatus('saving')
    saveMutation.mutate({ content })
  }

  const handleStatusChange = (status: 'draft' | 'review' | 'approved') => {
    saveMutation.mutate({ status })
  }

  const handleContentChange = useCallback((html: string) => {
    setContent(html)
    setSaveStatus('idle')
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      if (!sectionTypeRef.current) return
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'update-section', section: sectionTypeRef.current, html },
        '*'
      )
    }, 300)
  }, [])

  const handleGenerateClassCouncil = useCallback(() => {
    const currentDoc = docRef.current
    if (!currentDoc) return
    const seen = new Set<string>()
    const teachers: { name: string; subject: string; isCoord: boolean }[] = []
    for (const s of currentDoc.sections ?? []) {
      if (!s.assigned_to || seen.has(s.assigned_to)) continue
      seen.add(s.assigned_to)
      teachers.push({ name: s.assigned_name ?? '', subject: s.subject ?? '', isCoord: s.assigned_to === currentDoc.coordinator_id })
    }
    teachers.sort((a, b) => (b.isCoord ? 1 : 0) - (a.isCoord ? 1 : 0))
    if (teachers.length === 0) return
    const rows = teachers.map((t) => `<tr><td><strong>${t.name}</strong></td><td>${t.subject}</td></tr>`).join('')
    const html = `<table><thead><tr><th>Docente</th><th>Materia</th></tr></thead><tbody>${rows}</tbody></table>`
    handleContentChange(html)
    setEditorKey((k) => k + 1)
  }, [handleContentChange])

  const handleExportOdt = async () => {
    if (!doc) return
    setIsExporting(true)
    try {
      const safeClass = doc.school_class.replace(/[^a-zA-Z0-9]/g, '-')
      const safeYear = doc.academic_year.replace(/\//g, '-')
      await exportDocumentOdt(doc.id, `documento-15-maggio-${safeClass}-${safeYear}.odt`)
    } catch (err) {
      console.error('Errore esportazione ODT', err)
    } finally {
      setIsExporting(false)
    }
  }

  // ─── cleanup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current) }
  }, [])

  // ─── derived ──────────────────────────────────────────────────────────────

  if (isLoading || !doc) {
    return (
      <Layout>
        <div className="text-center text-gray-400 py-16">Caricamento...</div>
      </Layout>
    )
  }

  const isCoordinator = user?.role === 'coordinator'
  const hasOwnSection = doc.sections?.some((s) => s.assigned_to === user?.id) ?? false
  const totalSections = doc.sections?.length ?? 0
  const approvedCount = doc.sections?.filter((s) => s.status === 'approved').length ?? 0
  const progress = totalSections > 0 ? Math.round((approvedCount / totalSections) * 100) : 0

  const coordinatorSections = doc.sections?.filter((s) => s.assigned_to === null) ?? []
  const teacherSections = doc.sections?.filter((s) => s.assigned_to !== null) ?? []
  const groupedTeacher = teacherSections.reduce<Record<string, Section[]>>((acc, s) => {
    const key = s.subject ?? s.assigned_name ?? 'Senza materia'
    ;(acc[key] ??= []).push(s)
    return acc
  }, {})

  const isAssigned = activeSection?.assigned_to === user?.id
  const canEdit = isCoordinator || isAssigned

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <Layout fullWidth>
      {/* ── modals ── */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Aggiungi la tua sezione</h2>
              <button onClick={() => setShowJoin(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); joinMutation.mutate() }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Materia</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="es. Matematica e Fisica"
                  value={joinForm.subject}
                  onChange={(e) => setJoinForm({ ...joinForm, subject: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo di sezione</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={joinForm.section_type}
                  onChange={(e) => setJoinForm({ ...joinForm, section_type: e.target.value })}
                >
                  {TEACHER_JOIN_SECTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowJoin(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Annulla</button>
                <button type="submit" disabled={joinMutation.isPending} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
                  {joinMutation.isPending ? 'Aggiunta...' : 'Aggiungi sezione'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Eliminare la sezione?</h3>
            <p className="text-sm text-gray-500 mb-5">L'operazione è irreversibile e cancellerà anche lo storico delle versioni.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Annulla</button>
              <button
                onClick={() => deleteSectionMutation.mutate(deleteConfirm)}
                disabled={deleteSectionMutation.isPending}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Aggiungi sezione</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
              <button type="button" onClick={() => setAddForm({ ...addForm, type: 'teacher' })} className={`flex-1 py-2 text-sm font-medium transition ${addForm.type === 'teacher' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Sezione docente</button>
              <button type="button" onClick={() => setAddForm({ ...addForm, type: 'coordinator' })} className={`flex-1 py-2 text-sm font-medium transition ${addForm.type === 'coordinator' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Sezione generale</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addSectionMutation.mutate() }} className="space-y-4">
              {addForm.type === 'teacher' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Materia</label>
                    <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="es. Matematica e Fisica" value={addForm.subject} onChange={(e) => setAddForm({ ...addForm, subject: e.target.value })} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assegna a docente</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={addForm.teacherId} onChange={(e) => setAddForm({ ...addForm, teacherId: e.target.value })}>
                      <option value="">— Non assegnata —</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.display_name}{t.subject ? ` (${t.subject})` : ''}</option>)}
                    </select>
                    {teachers.length === 0 && <p className="text-xs text-orange-500 mt-1">Nessun docente registrato. <Link to="/users" className="underline">Aggiungi docenti →</Link></p>}
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo di sezione</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={addForm.section_type} onChange={(e) => setAddForm({ ...addForm, section_type: e.target.value })}>
                    {COORDINATOR_SECTION_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titolo personalizzato <span className="text-gray-400 font-normal">(opzionale)</span></label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Lascia vuoto per usare il titolo predefinito" value={addForm.customTitle} onChange={(e) => setAddForm({ ...addForm, customTitle: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scadenza <span className="text-gray-400 font-normal">(opzionale)</span></label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={addForm.deadline} onChange={(e) => setAddForm({ ...addForm, deadline: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Annulla</button>
                <button type="submit" disabled={addSectionMutation.isPending} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">{addSectionMutation.isPending ? 'Aggiunta...' : 'Aggiungi'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── main 2-col layout ── */}
      <div className="flex w-full overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>

        {/* ── LEFT: iframe ── */}
        <iframe
          ref={iframeRef}
          src="/api/template/preview"
          title="Anteprima documento"
          style={{ flex: '63', border: 'none', minWidth: 0 }}
        />

        {/* ── RIGHT: sidebar ── */}
        <div
          className="flex flex-col overflow-y-auto border-l border-gray-200 bg-white"
          style={{ flex: '37', minWidth: 0 }}
        >
          {activeSectionId && activeSection ? (
            /* ── EDITOR PANEL ── */
            <div className="flex flex-col h-full">
              {/* editor header */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
                <button
                  onClick={clearSection}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 mb-3"
                >
                  <ChevronLeft size={13} />
                  Tutte le sezioni
                </button>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-gray-900 leading-tight">{activeSection.title}</h2>
                      <SectionStatusBadge status={activeSection.status} />
                    </div>
                    {activeSection.subject && (
                      <p className="text-xs text-gray-500 mt-0.5">{activeSection.subject} · {activeSection.assigned_name ?? 'Non assegnata'}</p>
                    )}
                    {activeSection.deadline && (
                      <p className="text-xs text-gray-400 mt-0.5">Scadenza: {new Date(activeSection.deadline).toLocaleDateString('it-IT')}</p>
                    )}
                  </div>
                </div>
                {/* action buttons */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setShowVersions((v) => !v)}
                    className={`flex items-center gap-1 border px-2.5 py-1.5 rounded-lg text-xs transition ${showVersions ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <History size={13} />
                    Versioni
                  </button>
                  {canEdit && activeSection.status === 'draft' && (
                    <button
                      onClick={() => handleStatusChange('review')}
                      disabled={saveMutation.isPending}
                      className="flex items-center gap-1 border border-yellow-400 text-yellow-700 bg-yellow-50 px-2.5 py-1.5 rounded-lg text-xs hover:bg-yellow-100 disabled:opacity-50"
                    >
                      <Send size={13} />
                      Invia in revisione
                    </button>
                  )}
                  {isCoordinator && activeSection.status === 'review' && (
                    <button
                      onClick={() => handleStatusChange('approved')}
                      disabled={saveMutation.isPending}
                      className="flex items-center gap-1 bg-green-600 text-white px-2.5 py-1.5 rounded-lg text-xs hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCheck size={13} />
                      Approva
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={handleSave}
                      disabled={saveMutation.isPending || content === null}
                      className="flex items-center gap-1 bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save size={13} />
                      {saveStatus === 'saving' ? 'Salvataggio...' : saveStatus === 'saved' ? 'Salvato ✓' : 'Salva'}
                    </button>
                  )}
                </div>
              </div>

              {/* scrollable editor body */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {/* PCTO panel */}
                {activeSection.section_type === 'pcto' && canEdit && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <h3 className="text-xs font-semibold text-amber-800 mb-2">Dati stage PCTO</h3>
                    <div className="grid grid-cols-1 gap-2 mb-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Settimane</label>
                        <input type="number" min={0} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="es. 4" value={pctoForm.pcto_weeks} onChange={(e) => setPctoForm({ ...pctoForm, pcto_weeks: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Data inizio</label>
                          <input type="date" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" value={pctoForm.pcto_start_date} onChange={(e) => setPctoForm({ ...pctoForm, pcto_start_date: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Data fine</label>
                          <input type="date" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" value={pctoForm.pcto_end_date} onChange={(e) => setPctoForm({ ...pctoForm, pcto_end_date: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => updateDocMutation.mutate({
                        pcto_weeks: pctoForm.pcto_weeks ? Number(pctoForm.pcto_weeks) : undefined,
                        pcto_start_date: pctoForm.pcto_start_date || undefined,
                        pcto_end_date: pctoForm.pcto_end_date || undefined,
                      })}
                      disabled={updateDocMutation.isPending}
                      className="flex items-center gap-1 bg-amber-600 text-white px-2.5 py-1.5 rounded-lg text-xs hover:bg-amber-700 disabled:opacity-50"
                    >
                      <Save size={12} />
                      {pctoSaved ? 'Salvato ✓' : updateDocMutation.isPending ? 'Salvataggio...' : 'Salva dati stage'}
                    </button>
                  </div>
                )}

                {/* Genera CdC banner */}
                {activeSection.section_type === 'presentazione_classe' && canEdit && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                    <p className="text-xs text-blue-700">Genera la lista dei docenti del consiglio di classe.</p>
                    <button
                      onClick={handleGenerateClassCouncil}
                      className="flex items-center gap-1 bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-xs hover:bg-blue-700 shrink-0"
                    >
                      <Wand2 size={12} />
                      Genera
                    </button>
                  </div>
                )}

                {/* Rich editor */}
                <RichEditor
                  key={editorKey}
                  content={content ?? activeSection.content}
                  onChange={handleContentChange}
                  editable={canEdit}
                  placeholder={`Inserisci il contenuto per "${activeSection.title}"...`}
                />

                {/* Versions panel */}
                {showVersions && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                      <h3 className="text-xs font-semibold text-gray-700">Storico versioni</h3>
                    </div>
                    {versions.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-3">Nessuna versione precedente.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {(versions as any[]).map((v) => (
                          <li key={v.id} className="px-3 py-2">
                            <div className="text-xs font-medium text-gray-700">v{v.version_number}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{v.saved_by_name} · {new Date(v.created_at).toLocaleString('it-IT')}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── OVERVIEW PANEL ── */
            <div className="px-4 py-4 space-y-4">
              {/* doc header */}
              <div>
                <Link to="/dashboard" className="text-xs text-gray-400 hover:text-blue-600 mb-2 inline-block">← Dashboard</Link>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-base font-bold text-gray-900">{doc.title}</h1>
                      <DocumentStatusBadge status={doc.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Classe {doc.school_class} · A.S. {doc.academic_year}</p>
                    <p className="text-xs text-gray-400">Coordinatore: {doc.coordinator_name}</p>
                  </div>
                </div>
                {/* doc action buttons */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {isCoordinator && (
                    <button onClick={handleExportOdt} disabled={isExporting} className="flex items-center gap-1 border border-gray-300 text-gray-700 px-2.5 py-1.5 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50">
                      <Download size={13} />
                      {isExporting ? 'Esportazione...' : 'Esporta ODT'}
                    </button>
                  )}
                  {isCoordinator && (
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 border border-gray-300 text-gray-700 px-2.5 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                      <Plus size={13} />
                      Sezione
                    </button>
                  )}
                  {isCoordinator && doc.status !== 'finalized' && (
                    <button onClick={() => statusMutation.mutate('finalized')} disabled={statusMutation.isPending} className="flex items-center gap-1 bg-green-600 text-white px-2.5 py-1.5 rounded-lg text-xs hover:bg-green-700 disabled:opacity-50">
                      Finalizza
                    </button>
                  )}
                  {isCoordinator && doc.status === 'finalized' && (
                    <button onClick={() => statusMutation.mutate('in_progress')} disabled={statusMutation.isPending} className="border border-gray-300 text-gray-700 px-2.5 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                      Riapri
                    </button>
                  )}
                </div>
              </div>

              {/* progress */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 px-3 py-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-600 font-medium">Avanzamento</span>
                  <span className="text-gray-500">{approvedCount}/{totalSections} approvate</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* UDA panel (coordinator only) */}
              {isCoordinator && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <h3 className="text-xs font-semibold text-purple-800 mb-2">Titoli UDA</h3>
                  <div className="space-y-1.5 mb-2">
                    {udaTitles.map((title, idx) => (
                      <div key={idx} className="flex gap-1.5">
                        <input
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                          placeholder={`Titolo UDA ${idx + 1}`}
                          value={title}
                          onChange={(e) => { const next = [...udaTitles]; next[idx] = e.target.value; setUdaTitles(next) }}
                        />
                        <button onClick={() => setUdaTitles(udaTitles.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 px-1" title="Rimuovi"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setUdaTitles([...udaTitles, ''])} className="flex items-center gap-1 text-purple-700 border border-purple-300 px-2.5 py-1.5 rounded-lg text-xs hover:bg-purple-100">
                      <Plus size={11} />
                      Aggiungi
                    </button>
                    <button onClick={() => udaMutation.mutate()} disabled={udaMutation.isPending} className="flex items-center gap-1 bg-purple-600 text-white px-2.5 py-1.5 rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50">
                      <Save size={11} />
                      {udaSaved ? 'Salvato ✓' : udaMutation.isPending ? '...' : 'Salva'}
                    </button>
                  </div>
                </div>
              )}

              {/* join banner */}
              {!hasOwnSection && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-blue-800">Non hai ancora aggiunto la tua sezione</p>
                    <p className="text-xs text-blue-600 mt-0.5">Scegli la materia e il tipo di sezione per contribuire.</p>
                  </div>
                  <button onClick={() => setShowJoin(true)} className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 shrink-0">
                    <UserPlus size={13} />
                    Aggiungi
                  </button>
                </div>
              )}

              {/* coordinator sections */}
              {coordinatorSections.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-700">Sezioni generali</h2>
                  </div>
                  {coordinatorSections.map((s) => (
                    <SectionRowItem
                      key={s.id}
                      section={s}
                      isActive={s.id === activeSectionId}
                      canDelete={isCoordinator}
                      onSelect={() => selectSection(s.id)}
                      onDelete={() => setDeleteConfirm(s.id)}
                    />
                  ))}
                </div>
              )}

              {/* teacher sections */}
              {Object.entries(groupedTeacher).map(([subject, sections]) => (
                <div key={subject} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-700">{subject}</h2>
                  </div>
                  {sections.map((s) => (
                    <SectionRowItem
                      key={s.id}
                      section={s}
                      isActive={s.id === activeSectionId}
                      canDelete={isCoordinator}
                      onSelect={() => selectSection(s.id)}
                      onDelete={() => setDeleteConfirm(s.id)}
                    />
                  ))}
                </div>
              ))}

              {totalSections === 0 && (
                <div className="text-center text-gray-400 py-10">
                  <p className="text-sm mb-2">Nessuna sezione nel documento.</p>
                  {isCoordinator && (
                    <button onClick={() => setShowAdd(true)} className="text-blue-600 text-xs hover:underline">Aggiungi la prima sezione →</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

// ─── SectionRowItem ───────────────────────────────────────────────────────────

function SectionRowItem({
  section,
  isActive,
  canDelete,
  onSelect,
  onDelete,
}: {
  section: Section
  isActive: boolean
  canDelete: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const icon =
    section.status === 'approved' ? <CheckCircle2 size={14} className="text-green-500" />
    : section.status === 'review' ? <Clock size={14} className="text-yellow-500" />
    : <AlertCircle size={14} className="text-gray-300" />

  return (
    <div className={`flex items-center gap-1.5 border-b border-gray-100 last:border-0 group ${isActive ? 'bg-blue-50' : ''}`}>
      <button
        onClick={onSelect}
        className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0 hover:bg-blue-50 transition text-left"
      >
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>{section.title}</div>
          {section.subject && (
            <div className="text-xs text-gray-400 truncate">{section.subject}</div>
          )}
        </div>
        <div className="shrink-0">
          <SectionStatusBadge status={section.status} />
        </div>
        <ChevronRight size={13} className="text-gray-300 shrink-0" />
      </button>
      {canDelete && (
        <button
          onClick={onDelete}
          className="mr-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition rounded"
          title="Elimina sezione"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}
