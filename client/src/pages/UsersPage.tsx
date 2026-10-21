import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { UserPlus, ToggleLeft, ToggleRight, GraduationCap } from 'lucide-react'
import { getUsers, createUser, toggleUserActive } from '../api/users'
import Layout from '../components/Layout'

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    subject: '',
    password: '',
  })
  const [formError, setFormError] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        display_name: form.display_name,
        email: form.email,
        role: 'teacher',
        subject: form.subject || undefined,
        password: form.password || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowAdd(false)
      setForm({ display_name: '', email: '', subject: '', password: '' })
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || 'Errore durante la creazione')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      toggleUserActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const teachers = users.filter((u) => u.role === 'teacher')
  const coordinators = users.filter((u) => u.role === 'coordinator')

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utenti della scuola</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestisci docenti e coordinatori</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          <UserPlus size={16} />
          Aggiungi docente
        </button>
      </div>

      {/* Add teacher modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuovo docente</h2>
            {formError && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200 mb-4">
                {formError}
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome e cognome</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Prof.ssa Rossi Maria"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email istituzionale</label>
                <input
                  type="email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="rossi.maria@scuola.edu.it"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Materia insegnata</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="es. Matematica e Fisica"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password temporanea <span className="text-gray-400 font-normal">(il docente potrà cambiarla)</span>
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="minimo 8 caratteri"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setFormError('') }}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creazione...' : 'Crea docente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-16">Caricamento...</div>
      ) : (
        <div className="space-y-6">
          {/* Teachers */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <GraduationCap size={16} className="text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700">Docenti ({teachers.length})</h2>
            </div>
            {teachers.length === 0 ? (
              <p className="text-sm text-gray-400 px-4 py-8 text-center">
                Nessun docente registrato.
                <button onClick={() => setShowAdd(true)} className="ml-1 text-blue-600 hover:underline">
                  Aggiungi il primo →
                </button>
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {teachers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{u.display_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {u.email}
                        {u.subject && <span className="ml-2 text-gray-500">· {u.subject}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate({ id: u.id, active: !u.active })}
                      disabled={toggleMutation.isPending}
                      title={u.active ? 'Disabilita accesso' : 'Abilita accesso'}
                      className="text-gray-400 hover:text-blue-600 disabled:opacity-40 ml-4"
                    >
                      {u.active
                        ? <ToggleRight size={22} className="text-green-500" />
                        : <ToggleLeft size={22} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Coordinators */}
          {coordinators.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Coordinatori ({coordinators.length})</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {coordinators.map((u) => (
                  <li key={u.id} className="flex items-center px-4 py-3 gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{u.display_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{u.email}</div>
                    </div>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">coordinatore</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
