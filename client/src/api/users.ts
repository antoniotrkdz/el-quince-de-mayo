import api from './client'

export interface SchoolUser {
  id: string
  email: string
  display_name: string
  role: 'coordinator' | 'teacher'
  auth_provider: string
  subject: string | null
  active: boolean
  created_at: string
}

export const getUsers = () =>
  api.get<SchoolUser[]>('/users').then((r) => r.data)

export const createUser = (data: {
  email: string
  display_name: string
  role: 'coordinator' | 'teacher'
  subject?: string
  password?: string
}) => api.post<SchoolUser>('/users', data).then((r) => r.data)

export const toggleUserActive = (id: string, active: boolean) =>
  api.patch<SchoolUser>(`/users/${id}/active`, { active }).then((r) => r.data)

export const updateProfile = (data: { prefix: 'Prof.' | 'Prof.ssa' }) =>
  api.patch<{ id: string; prefix: string }>('/users/me', data).then((r) => r.data)
