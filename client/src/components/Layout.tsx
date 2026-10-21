import { Link, useNavigate } from 'react-router-dom'
import { LogOut, FileText, Users, LayoutDashboard, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { logout } from '../api/auth'
import { updateProfile } from '../api/users'

export default function Layout({ children, fullWidth }: { children: React.ReactNode; fullWidth?: boolean }) {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [showProfile, setShowProfile] = useState(false)
  const [selectedPrefix, setSelectedPrefix] = useState<'Prof.' | 'Prof.ssa'>('Prof.')
  const [saving, setSaving] = useState(false)

  const handleLogout = async () => {
    await logout()
    setUser(null)
    navigate('/login')
  }

  const openProfile = () => {
    setSelectedPrefix((user?.prefix as 'Prof.' | 'Prof.ssa') ?? 'Prof.')
    setShowProfile(true)
  }

  const handleSavePrefix = async () => {
    setSaving(true)
    try {
      await updateProfile({ prefix: selectedPrefix })
      setUser(user ? { ...user, prefix: selectedPrefix } : null)
      setShowProfile(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Profile modal */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs mx-4">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Il mio profilo</h2>
            <p className="text-sm text-gray-700 mb-1 font-medium">Titolo</p>
            <div className="flex gap-3 mb-5">
              {(['Prof.', 'Prof.ssa'] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="prefix"
                    value={p}
                    checked={selectedPrefix === p}
                    onChange={() => setSelectedPrefix(p)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">{p}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowProfile(false)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={handleSavePrefix}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <Link to="/dashboard" className="flex items-center gap-2 text-blue-700 font-semibold text-lg">
          <FileText size={20} />
          <span>Documento 15 Maggio</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600">
            <LayoutDashboard size={16} />
            Dashboard
          </Link>
          {user?.role === 'coordinator' && (
            <Link to="/users" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600">
              <Users size={16} />
              Utenti
            </Link>
          )}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-200">
            <button
              onClick={openProfile}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition"
            >
              {user?.display_name}
              <ChevronDown size={13} className="opacity-50" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
              title="Esci"
            >
              <LogOut size={16} />
            </button>
          </div>
        </nav>
      </header>
      <main className={fullWidth ? 'flex-1 flex overflow-hidden' : 'flex-1 container mx-auto px-4 py-6 max-w-6xl'}>
        {children}
      </main>
    </div>
  )
}
