import { useParams, Navigate } from 'react-router-dom'

export default function SectionPage() {
  const { id, sectionId } = useParams()
  return <Navigate to={`/documents/${id}/sections/${sectionId}`} replace />
}
