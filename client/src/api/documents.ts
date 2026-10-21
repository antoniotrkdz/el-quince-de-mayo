import api from './client'
import type { Document, Section } from '../types'

export const getDocuments = () => api.get<Document[]>('/documents').then((r) => r.data)

export const getDocument = (id: string) =>
  api.get<Document & { sections: Section[] }>(`/documents/${id}`).then((r) => r.data)

export const createDocument = (data: {
  title: string
  school_class: string
  academic_year: string
  diploma_type?: string
  force?: boolean
}) => api.post<Document>('/documents', data).then((r) => r.data)

export const updateDocument = (
  id: string,
  data: Partial<{ diploma_type: string; pcto_weeks: number; pcto_start_date: string; pcto_end_date: string; uda_titles: string[] }>
) => api.patch<Document>(`/documents/${id}`, data).then((r) => r.data)

export const joinDocument = (
  documentId: string,
  data: { section_type: string; subject?: string }
) => api.post<{ exists: boolean; section: Section } | Section>(`/documents/${documentId}/join`, data).then((r) => r.data)

export const updateDocumentStatus = (id: string, status: string) =>
  api.patch<Document>(`/documents/${id}/status`, { status }).then((r) => r.data)

export const getSectionVersions = (documentId: string, sectionId: string) =>
  api.get(`/documents/${documentId}/sections/${sectionId}/versions`).then((r) => r.data)

export const updateSection = (
  documentId: string,
  sectionId: string,
  data: Partial<{ content: string; status: string; deadline: string | null; title: string }>
) => api.patch<Section>(`/documents/${documentId}/sections/${sectionId}`, data).then((r) => r.data)

export const createSection = (
  documentId: string,
  data: {
    section_type: string
    title: string
    subject?: string
    assigned_to?: string
    sort_order?: number
    deadline?: string
  }
) => api.post<Section>(`/documents/${documentId}/sections`, data).then((r) => r.data)

export const deleteSection = (documentId: string, sectionId: string) =>
  api.delete(`/documents/${documentId}/sections/${sectionId}`).then((r) => r.data)

export const exportDocumentOdt = async (id: string, filename: string): Promise<void> => {
  const response = await api.get(`/documents/${id}/export/odt`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const addComment = (documentId: string, sectionId: string, body: string) =>
  api.post(`/documents/${documentId}/sections/${sectionId}/comments`, { body }).then((r) => r.data)
