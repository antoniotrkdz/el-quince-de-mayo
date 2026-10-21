import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getMe } from '../api/auth'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  setUser: (u: User | null) => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
