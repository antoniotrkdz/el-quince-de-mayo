export type UserRole = 'coordinator' | 'teacher'
export type AuthProvider = 'local' | 'google' | 'microsoft'
export type SectionStatus = 'draft' | 'review' | 'approved'
export type DocumentStatus = 'draft' | 'in_progress' | 'finalized'

export interface User {
  id: string
  school_id: string | null
  email: string
  display_name: string
  role: UserRole
  auth_provider: AuthProvider
  subject: string | null
  prefix: string
}

export interface Document {
  id: string
  school_id: string
  coordinator_id: string
  coordinator_name: string
  coordinator_prefix: string
  title: string
  school_class: string
  academic_year: string
  status: DocumentStatus
  finalized_at: string | null
  created_at: string
  updated_at: string
  diploma_type: string | null
  pcto_weeks: number | null
  pcto_start_date: string | null
  pcto_end_date: string | null
  uda_titles: string[]
  sections?: Section[]
}

export type SectionType =
  | 'presentazione_classe'
  | 'storia_classe'
  | 'obiettivi_educativi'
  | 'percorso_clil'
  | 'pcto'
  | 'valutazione_apprendimento'
  | 'attivita_curriculare'
  | 'cittadinanza'
  | 'orientamento'
  | 'programma_svolto'
  | 'metodologie'
  | 'criteri_valutazione'
  | 'griglia_valutazione'
  | 'griglia_prima_prova'
  | 'testi_prima_prova'
  | 'simulazioni'
  | 'simulazioni_seconda'
  | 'criteri_condotta'
  | 'allegati'

export interface Section {
  id: string
  document_id: string
  assigned_to: string | null
  assigned_name: string | null
  section_type: SectionType
  subject: string | null
  title: string
  content: string
  status: SectionStatus
  sort_order: number
  deadline: string | null
  created_at: string
  updated_at: string
}

export interface SectionVersion {
  id: string
  section_id: string
  content: string
  version_number: number
  saved_by: string
  saved_by_name: string
  created_at: string
}
