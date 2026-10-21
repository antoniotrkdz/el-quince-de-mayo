import type { SectionStatus, DocumentStatus } from '../types'

const sectionLabels: Record<SectionStatus, string> = {
  draft: 'Bozza',
  review: 'In revisione',
  approved: 'Approvata',
}
const sectionColors: Record<SectionStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
}

const docLabels: Record<DocumentStatus, string> = {
  draft: 'Bozza',
  in_progress: 'In lavorazione',
  finalized: 'Finalizzato',
}
const docColors: Record<DocumentStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  finalized: 'bg-green-100 text-green-700',
}

export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sectionColors[status]}`}>
      {sectionLabels[status]}
    </span>
  )
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${docColors[status]}`}>
      {docLabels[status]}
    </span>
  )
}
