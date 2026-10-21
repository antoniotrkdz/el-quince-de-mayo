import api from './client'
import type { User } from '../types'

export const getMe = () => api.get<{ user: User }>('/auth/me').then((r) => r.data.user)

export const login = (email: string, password: string) =>
  api.post<{ user: User }>('/auth/login', { email, password }).then((r) => r.data.user)

export const logout = () => api.post('/auth/logout')
