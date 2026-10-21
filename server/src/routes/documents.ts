import { Router } from 'express'
import { pool } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import { z } from 'zod'
import { generateOdt } from '../services/odtExporter'

const router = Router()

const CreateDocumentSchema = z.object({
  title: z.string().min(1),
  school_class: z.string().min(1),
  academic_year: z.string().regex(/^\d{4}\/\d{4}$/),
  diploma_type: z.string().optional(),
  force: z.boolean().optional(),
})

const UpdateDocumentSchema = z.object({
  diploma_type: z.string().optional(),
  pcto_weeks: z.number().int().optional(),
  pcto_start_date: z.string().optional(),
  pcto_end_date: z.string().optional(),
  uda_titles: z.array(z.string()).optional(),
})

const JoinDocumentSchema = z.object({
  section_type: z.enum(['programma_svolto', 'metodologie', 'criteri_valutazione', 'percorso_clil']),
  subject: z.string().optional(),
})

const TEACHER_SECTION_LABELS: Record<string, string> = {
  programma_svolto: 'Programma Svolto',
  metodologie: 'Metodologie e strumenti didattici',
  criteri_valutazione: 'Criteri di valutazione',
  percorso_clil: 'Percorso CLIL',
}

// GET /api/documents — tutti i documenti della scuola (coordinatori e docenti)
router.get('/', requireAuth, async (req, res) => {
  const user = req.user as any
  const result = await pool.query(
    `SELECT d.*, u.display_name AS coordinator_name
     FROM documents d
     JOIN users u ON u.id = d.coordinator_id
     WHERE d.school_id = $1
     ORDER BY d.created_at DESC`,
    [user.school_id]
  )
  res.json(result.rows)
})

const DEFAULT_SECTIONS = [
  { section_type: 'obiettivi_educativi',        title: 'Obiettivi educativi e formativi',                        sort_order: 0  },
  { section_type: 'valutazione_apprendimento',  title: 'Valutazione dell\'apprendimento',                        sort_order: 1  },
  { section_type: 'pcto',                       title: 'PCTO – Stage in azienda',                                sort_order: 2  },
  { section_type: 'attivita_curriculare',       title: 'Attività curricolari',                                   sort_order: 3  },
  { section_type: 'cittadinanza',               title: 'Educazione Civica',                                      sort_order: 4  },
  { section_type: 'orientamento',               title: 'Orientamento',                                           sort_order: 5  },
  { section_type: 'criteri_condotta',           title: "Criteri per l'attribuzione del voto di condotta",        sort_order: 6  },
  { section_type: 'griglia_valutazione',        title: 'Griglia di valutazione – Colloquio',                     sort_order: 7  },
  { section_type: 'griglia_prima_prova',        title: 'Griglia di valutazione – Prima prova scritta',           sort_order: 8  },
  { section_type: 'testi_prima_prova',          title: 'Griglia di valutazione – Seconda prova scritta',         sort_order: 9  },
  { section_type: 'simulazioni',                title: 'Simulazione prima prova scritta',                        sort_order: 10 },
  { section_type: 'simulazioni_seconda',        title: 'Simulazione seconda prova scritta',                      sort_order: 11 },
  { section_type: 'storia_classe',              title: 'Presentazione della classe',                             sort_order: 12 },
  { section_type: 'presentazione_classe',       title: 'Formazione del Consiglio di Classe',                     sort_order: 13 },
  { section_type: 'allegati',                   title: 'Allegati',                                               sort_order: 14 },
]

// POST /api/documents — crea documento (solo coordinator)
router.post('/', requireAuth, requireRole('coordinator'), async (req, res) => {
  const user = req.user as any
  const body = CreateDocumentSchema.parse(req.body)

  // Controlla se esiste già un documento per questa classe (qualsiasi anno)
  const existing = await pool.query(
    `SELECT id, title, school_class, academic_year FROM documents WHERE school_id = $1 AND school_class = $2 LIMIT 1`,
    [user.school_id, body.school_class]
  )
  if (existing.rows[0] && !body.force) {
    return res.status(409).json({ conflict: true, existing: existing.rows[0] })
  }
  if (existing.rows[0] && body.force) {
    await pool.query(`DELETE FROM documents WHERE id = $1`, [existing.rows[0].id])
  }

  const docResult = await pool.query(
    `INSERT INTO documents (school_id, coordinator_id, title, school_class, academic_year, diploma_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user.school_id, user.id, body.title, body.school_class, body.academic_year, body.diploma_type ?? null]
  )
  const doc = docResult.rows[0]

  for (const s of DEFAULT_SECTIONS) {
    await pool.query(
      `INSERT INTO sections (document_id, section_type, title, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [doc.id, s.section_type, s.title, s.sort_order]
    )
  }

  res.status(201).json(doc)
})

// POST /api/documents/:id/join — docente aggiunge la propria sezione
router.post('/:id/join', requireAuth, async (req, res) => {
  const user = req.user as any
  const { id } = req.params
  const body = JoinDocumentSchema.parse(req.body)

  const docResult = await pool.query(`SELECT school_id FROM documents WHERE id = $1`, [id])
  if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento non trovato' })
  if (docResult.rows[0].school_id !== user.school_id) return res.status(403).json({ error: 'Accesso non autorizzato' })

  // Se esiste già una sezione di quel tipo assegnata a questo docente, restituirla
  const existing = await pool.query(
    `SELECT s.*, u.display_name AS assigned_name FROM sections s LEFT JOIN users u ON u.id = s.assigned_to
     WHERE s.document_id = $1 AND s.assigned_to = $2 AND s.section_type = $3`,
    [id, user.id, body.section_type]
  )
  if (existing.rows[0]) {
    return res.status(200).json({ exists: true, section: existing.rows[0] })
  }

  const subject = body.subject ?? user.subject
  const label = TEACHER_SECTION_LABELS[body.section_type]
  const title = subject ? `${label} – ${subject}` : label

  // Aggiorna materia sull'utente se non l'aveva
  if (body.subject && !user.subject) {
    await pool.query(`UPDATE users SET subject = $1 WHERE id = $2`, [body.subject, user.id])
  }

  const result = await pool.query(
    `INSERT INTO sections (document_id, section_type, title, assigned_to, subject)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, body.section_type, title, user.id, subject]
  )
  res.status(201).json(result.rows[0])
})

// GET /api/documents/:id/export/odt — esporta documento in formato ODT (coordinator only)
router.get('/:id/export/odt', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { id } = req.params

  const docResult = await pool.query(
    `SELECT d.*, u.display_name AS coordinator_name, COALESCE(u.prefix, 'Prof.') AS coordinator_prefix
     FROM documents d
     JOIN users u ON u.id = d.coordinator_id
     WHERE d.id = $1`,
    [id]
  )
  if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento non trovato' })
  const doc = docResult.rows[0]

  const sectionsResult = await pool.query(
    `SELECT s.*, u.display_name AS assigned_name
     FROM sections s
     LEFT JOIN users u ON u.id = s.assigned_to
     WHERE s.document_id = $1
     ORDER BY s.sort_order, s.created_at`,
    [id]
  )

  const buffer = await generateOdt(doc, sectionsResult.rows)

  const safeClass = doc.school_class.replace(/[^a-zA-Z0-9]/g, '-')
  const safeYear = doc.academic_year.replace(/\//g, '-')
  const filename = `documento-15-maggio-${safeClass}-${safeYear}.odt`

  res.setHeader('Content-Type', 'application/vnd.oasis.opendocument.text')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buffer.byteLength)
  res.end(buffer)
})

// GET /api/documents/:id
router.get('/:id', requireAuth, async (req, res) => {
  const user = req.user as any
  const { id } = req.params

  const docResult = await pool.query(
    `SELECT d.*, u.display_name AS coordinator_name, COALESCE(u.prefix, 'Prof.') AS coordinator_prefix
     FROM documents d
     JOIN users u ON u.id = d.coordinator_id
     WHERE d.id = $1`,
    [id]
  )
  if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento non trovato' })

  const doc = docResult.rows[0]

  if (user.role === 'teacher' && doc.school_id !== user.school_id) {
    return res.status(403).json({ error: 'Accesso non autorizzato' })
  }

  // Sezioni: docenti vedono solo le proprie + quelle generali
  const sectionsResult = await pool.query(
    `SELECT s.*, u.display_name AS assigned_name
     FROM sections s
     LEFT JOIN users u ON u.id = s.assigned_to
     WHERE s.document_id = $1
       AND ($2 = 'coordinator' OR s.assigned_to = $3 OR s.assigned_to IS NULL)
     ORDER BY s.sort_order, s.created_at`,
    [id, user.role, user.id]
  )

  res.json({ ...doc, sections: sectionsResult.rows })
})

// PATCH /api/documents/:id — aggiorna campi documento (diploma, pcto dates)
router.patch('/:id', requireAuth, async (req, res) => {
  const user = req.user as any
  const { id } = req.params
  const body = UpdateDocumentSchema.parse(req.body)

  const docResult = await pool.query(`SELECT school_id FROM documents WHERE id = $1`, [id])
  if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento non trovato' })
  if (docResult.rows[0].school_id !== user.school_id) return res.status(403).json({ error: 'Accesso non autorizzato' })

  const fields: string[] = []
  const values: any[] = []
  let i = 1

  if (body.diploma_type !== undefined) { fields.push(`diploma_type = $${i++}`); values.push(body.diploma_type || null) }
  if (body.pcto_weeks !== undefined) { fields.push(`pcto_weeks = $${i++}`); values.push(body.pcto_weeks) }
  if (body.pcto_start_date !== undefined) { fields.push(`pcto_start_date = $${i++}`); values.push(body.pcto_start_date || null) }
  if (body.pcto_end_date !== undefined) { fields.push(`pcto_end_date = $${i++}`); values.push(body.pcto_end_date || null) }
  if (body.uda_titles !== undefined) { fields.push(`uda_titles = $${i++}`); values.push(body.uda_titles) }

  if (fields.length === 0) return res.json(docResult.rows[0])

  values.push(id)
  const result = await pool.query(
    `UPDATE documents SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  )
  res.json(result.rows[0])
})

// PATCH /api/documents/:id/status — finalizza/riapri (coordinator only)
router.patch('/:id/status', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { id } = req.params
  const { status } = z.object({ status: z.enum(['draft', 'in_progress', 'finalized']) }).parse(req.body)
  const result = await pool.query(
    `UPDATE documents SET status = $1, finalized_at = $2 WHERE id = $3 RETURNING *`,
    [status, status === 'finalized' ? new Date() : null, id]
  )
  res.json(result.rows[0])
})

export default router
