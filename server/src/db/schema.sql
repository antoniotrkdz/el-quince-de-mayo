-- ============================================================
-- Schema: documento del 15 maggio
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Scuole (multi-tenant light)
CREATE TABLE IF NOT EXISTS schools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT UNIQUE NOT NULL,  -- codice meccanografico
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Utenti
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES schools(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('coordinator', 'teacher')),
  auth_provider   TEXT NOT NULL CHECK (auth_provider IN ('local', 'google', 'microsoft')),
  provider_id     TEXT,                   -- id esterno OAuth
  password_hash   TEXT,                   -- solo per auth_provider = 'local'
  subject         TEXT,                   -- materia insegnata (per i docenti)
  prefix          VARCHAR(10) DEFAULT 'Prof.',  -- titolo (Prof. / Prof.ssa)
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, email)
);

-- Documenti del 15 maggio (uno per classe per anno)
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  coordinator_id  UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,           -- es. "Documento 15 maggio - 5A Liceo Scientifico 2024/25"
  school_class    TEXT NOT NULL,           -- es. "5A"
  academic_year   TEXT NOT NULL,           -- es. "2024/2025"
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'finalized')),
  finalized_at    TIMESTAMPTZ,
  diploma_type    TEXT,                    -- es. "Liceo delle Scienze Umane"
  pcto_weeks      INTEGER,
  pcto_start_date DATE,
  pcto_end_date   DATE,
  uda_titles      TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, school_class, academic_year)
);

-- Tipi di sezione predefiniti
-- Ogni documento ha sezioni generali (gestite dal coordinatore)
-- e sezioni per materia (una per docente)
CREATE TABLE IF NOT EXISTS sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = sezione del coordinatore
  section_type    TEXT NOT NULL CHECK (section_type IN (
    'presentazione_classe',
    'storia_classe',
    'obiettivi_educativi',
    'percorso_clil',
    'pcto',
    'valutazione_apprendimento',
    'attivita_curriculare',
    'cittadinanza',
    'orientamento',
    'criteri_condotta',
    'griglia_valutazione',
    'griglia_prima_prova',
    'testi_prima_prova',
    'simulazioni',
    'simulazioni_seconda',
    'programma_svolto',
    'metodologie',
    'criteri_valutazione',
    'allegati'
  )),
  subject         TEXT,                    -- materia (solo per sezioni per-docente)
  title           TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',  -- HTML da TipTap
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  deadline        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versioning delle sezioni
CREATE TABLE IF NOT EXISTS section_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  version_number  INTEGER NOT NULL,
  saved_by        UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, version_number)
);

-- Commenti / note di revisione su una sezione
CREATE TABLE IF NOT EXISTS section_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessioni (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid     VARCHAR NOT NULL COLLATE "default",
  sess    JSON NOT NULL,
  expire  TIMESTAMPTZ NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

-- Trigger: aggiorna updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_documents_updated
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_sections_updated
  BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
