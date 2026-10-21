import { Router } from 'express'
import { pool } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import { z } from 'zod'

const router = Router({ mergeParams: true })

const COORDINATOR_SECTIONS = [
  'presentazione_classe', 'storia_classe', 'obiettivi_educativi',
  'percorso_clil', 'pcto', 'cittadinanza', 'orientamento',
  'testi_prima_prova', 'simulazioni', 'griglia_valutazione', 'allegati',
]

const CreateSectionSchema = z.object({
  section_type: z.string(),
  title: z.string().min(1),
  subject: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  sort_order: z.number().int().optional(),
  deadline: z.string().datetime().optional(),
})

const UpdateSectionSchema = z.object({
  content: z.string().optional(),
  status: z.enum(['draft', 'review', 'approved']).optional(),
  deadline: z.string().datetime().nullish(),
  title: z.string().min(1).optional(),
})

// GET /api/documents/:documentId/sections
router.get('/', requireAuth, async (req, res) => {
  const user = req.user as any
  const { documentId } = req.params
  const result = await pool.query(
    `SELECT s.*, u.display_name AS assigned_name
     FROM sections s
     LEFT JOIN users u ON u.id = s.assigned_to
     WHERE s.document_id = $1
       AND ($2 = 'coordinator' OR s.assigned_to = $3 OR s.assigned_to IS NULL)
     ORDER BY s.sort_order, s.created_at`,
    [documentId, user.role, user.id]
  )
  res.json(result.rows)
})

// POST /api/documents/:documentId/sections (coordinator only)
router.post('/', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { documentId } = req.params
  const body = CreateSectionSchema.parse(req.body)
  const result = await pool.query(
    `INSERT INTO sections (document_id, section_type, title, subject, assigned_to, sort_order, deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [documentId, body.section_type, body.title, body.subject ?? null,
     body.assigned_to ?? null, body.sort_order ?? 0, body.deadline ?? null]
  )
  res.status(201).json(result.rows[0])
})

// PATCH /api/documents/:documentId/sections/:sectionId
router.patch('/:sectionId', requireAuth, async (req, res) => {
  const user = req.user as any
  const { documentId, sectionId } = req.params

  // Verifica accesso: il docente può modificare solo le sezioni assegnate a lui
  const sectionResult = await pool.query(
    `SELECT * FROM sections WHERE id = $1 AND document_id = $2`,
    [sectionId, documentId]
  )
  const section = sectionResult.rows[0]
  if (!section) return res.status(404).json({ error: 'Sezione non trovata' })

  const isCoordinator = user.role === 'coordinator'
  const isAssigned = section.assigned_to === user.id

  if (!isCoordinator && !isAssigned) {
    return res.status(403).json({ error: 'Non hai i permessi per modificare questa sezione' })
  }

  // Solo il coordinator può approvare
  const body = UpdateSectionSchema.parse(req.body)
  if (body.status === 'approved' && !isCoordinator) {
    return res.status(403).json({ error: 'Solo il coordinatore può approvare le sezioni' })
  }

  // Salva versione se il content cambia
  if (body.content !== undefined && body.content !== section.content) {
    const lastVersion = await pool.query(
      `SELECT MAX(version_number) AS v FROM section_versions WHERE section_id = $1`,
      [sectionId]
    )
    const nextVersion = (lastVersion.rows[0]?.v ?? 0) + 1
    await pool.query(
      `INSERT INTO section_versions (section_id, content, version_number, saved_by)
       VALUES ($1, $2, $3, $4)`,
      [sectionId, section.content, nextVersion, user.id]
    )
  }

  const fields: string[] = []
  const values: any[] = []
  let idx = 1
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) { fields.push(`${k} = $${idx++}`); values.push(v) }
  }
  if (!fields.length) return res.json(section)

  values.push(sectionId)
  const updated = await pool.query(
    `UPDATE sections SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  )
  res.json(updated.rows[0])
})

// GET /api/documents/:documentId/sections/:sectionId/versions
router.get('/:sectionId/versions', requireAuth, async (req, res) => {
  const { sectionId } = req.params
  const result = await pool.query(
    `SELECT sv.*, u.display_name AS saved_by_name
     FROM section_versions sv
     JOIN users u ON u.id = sv.saved_by
     WHERE sv.section_id = $1
     ORDER BY sv.version_number DESC`,
    [sectionId]
  )
  res.json(result.rows)
})

// DELETE /api/documents/:documentId/sections/:sectionId (coordinator only)
router.delete('/:sectionId', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { documentId, sectionId } = req.params
  const existing = await pool.query(
    `SELECT 1 FROM sections WHERE id = $1 AND document_id = $2`,
    [sectionId, documentId]
  )
  if (!existing.rows[0]) return res.status(404).json({ error: 'Sezione non trovata' })
  await pool.query(`DELETE FROM sections WHERE id = $1`, [sectionId])
  res.json({ ok: true })
})

// POST /api/documents/:documentId/sections/:sectionId/comments
router.post('/:sectionId/comments', requireAuth, async (req, res) => {
  const user = req.user as any
  const { sectionId } = req.params
  const { body: commentBody } = z.object({ body: z.string().min(1) }).parse(req.body)
  const result = await pool.query(
    `INSERT INTO section_comments (section_id, author_id, body)
     VALUES ($1, $2, $3) RETURNING *`,
    [sectionId, user.id, commentBody]
  )
  res.status(201).json(result.rows[0])
})

export default router
