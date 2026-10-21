import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, Calendar, Users } from 'lucide-react'
import { useState } from 'react'
import { getDocuments, createDocument } from '../api/documents'
import { useAuth } from '../context/AuthContext'
import { DocumentStatusBadge } from '../components/StatusBadge'
import Layout from '../components/Layout'
import type { Document } from '../types'

type ConflictInfo = {
  existing: { id: string; title: string; school_class: string; academic_year: string }
  pendingForm: { title: string; school_class: string; academic_year: string }
}

export default function DashboardPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', school_class: '', academic_year: '', diploma_type: '' })
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null)

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: getDocuments,
  })

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setShowCreate(false)
      setConflictInfo(null)
      setForm({ title: '', school_class: '', academic_year: '', diploma_type: '' })
    },
    onError: (err: any) => {
      if (err.response?.status === 409 && err.response.data?.conflict) {
        setConflictInfo({ existing: err.response.data.existing, pendingForm: form })
        setShowCreate(false)
      }
    },
  })

  if (user?.role === 'teacher') {
    return (
      <Layout>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Documenti disponibili</h1>
          <p className="text-gray-500 text-sm mt-0.5">Seleziona il documento del tuo consiglio di classe</p>
        </div>

        {isLoading ? (
          <div className="text-center text-gray-400 py-16">Caricamento...</div>
        ) : documents.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nessun documento disponibile.</p>
            <p className="text-sm mt-1">Il coordinatore deve ancora creare il documento per la tua classe.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc: Document) => (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-md transition group flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl font-bold text-gray-900">Classe {doc.school_class}</span>
                  <DocumentStatusBadge status={doc.status} />
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="shrink-0" />
                    A.S. {doc.academic_year}
                  </div>
                  <div>Coord. {doc.coordinator_name}</div>
                  {doc.title && <div className="text-gray-400 truncate">{doc.title}</div>}
                </div>
                <div className="flex items-center justify-end text-blue-500 text-sm font-medium group-hover:text-blue-600 mt-auto">
                  Entra <ChevronRight size={16} className="ml-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Layout>
    )
  }

  // ── Vista Coordinatore ────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Modal sovrascrittura */}
      {conflictInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Documento già esistente</h2>
            <p className="text-sm text-gray-600 mb-5">
              Esiste già il documento <span className="font-medium">«{conflictInfo.existing.title}»</span> per la
              classe <span className="font-medium">{conflictInfo.existing.school_class}</span> (A.S.{' '}
              {conflictInfo.existing.academic_year}). Vuoi sovrascriverlo con l'anno{' '}
              <span className="font-medium">{conflictInfo.pendingForm.academic_year}</span>?
            </p>
            <p className="text-xs text-red-500 mb-5">
              Attenzione: il vecchio documento e tutte le sue sezioni verranno eliminati in modo irreversibile.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConflictInfo(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={() => createMutation.mutate({ ...conflictInfo.pendingForm, force: true })}
                disabled={createMutation.isPending}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Sovrascrittura...' : 'Sovrascrivi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal creazione */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuovo documento</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createMutation.mutate(form)
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titolo</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="es. Documento 15 maggio - 5A Liceo"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sezione (lettera)</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="es. A"
                    value={form.school_class}
                    onChange={(e) => setForm({ ...form, school_class: e.target.value })}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Le classi sono sempre quinte — inserire solo la lettera</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Anno scolastico</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="2024/2025"
                    pattern="\d{4}/\d{4}"
                    value={form.academic_year}
                    onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Indirizzo di studio / Diploma <span className="text-gray-400 font-normal">(opzionale)</span>
                </label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="es. Liceo delle Scienze Umane"
                  value={form.diploma_type}
                  onChange={(e) => setForm({ ...form, diploma_type: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
                  Annulla
                </button>
                <button type="submit" disabled={createMutation.isPending} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
                  {createMutation.isPending ? 'Creazione...' : 'Crea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestisci i documenti della tua scuola</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          Nuovo documento
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-16">Caricamento...</div>
      ) : documents.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <p>Nessun documento presente.</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-blue-600 text-sm hover:underline">
            Crea il primo documento →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc: Document) => (
            <Link
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-blue-300 hover:shadow-sm transition group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-gray-900 truncate">{doc.title}</span>
                  <DocumentStatusBadge status={doc.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Classe {doc.school_class}</span>
                  <span>A.S. {doc.academic_year}</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {new Date(doc.created_at).toLocaleDateString('it-IT')}
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-400 ml-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
