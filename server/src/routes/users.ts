import { Router } from 'express'
import { pool } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const router = Router()

const CreateUserSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1),
  role: z.enum(['coordinator', 'teacher']),
  subject: z.string().optional(),
  password: z.string().min(8).optional(),
})

// GET /api/users — lista utenti della scuola (coordinator only)
router.get('/', requireAuth, requireRole('coordinator'), async (req, res) => {
  const user = req.user as any
  const result = await pool.query(
    `SELECT id, email, display_name, role, auth_provider, subject, active, created_at
     FROM users WHERE school_id = $1 ORDER BY display_name`,
    [user.school_id]
  )
  res.json(result.rows)
})

// POST /api/users — crea utente locale (coordinator only)
router.post('/', requireAuth, requireRole('coordinator'), async (req, res) => {
  const user = req.user as any
  const body = CreateUserSchema.parse(req.body)
  const password_hash = body.password ? await bcrypt.hash(body.password, 12) : null
  const result = await pool.query(
    `INSERT INTO users (school_id, email, display_name, role, subject, auth_provider, password_hash)
     VALUES ($1, $2, $3, $4, $5, 'local', $6)
     RETURNING id, email, display_name, role, subject, active, created_at`,
    [user.school_id, body.email, body.display_name, body.role, body.subject ?? null, password_hash]
  )
  res.status(201).json(result.rows[0])
})

// PATCH /api/users/me — aggiorna il proprio profilo (prefix)
router.patch('/me', requireAuth, async (req, res) => {
  const user = req.user as any
  const { prefix } = z.object({ prefix: z.enum(['Prof.', 'Prof.ssa']) }).parse(req.body)
  const result = await pool.query(
    `UPDATE users SET prefix = $1 WHERE id = $2 RETURNING id, prefix`,
    [prefix, user.id]
  )
  res.json(result.rows[0])
})

// PATCH /api/users/:id/active — abilita/disabilita utente
router.patch('/:id/active', requireAuth, requireRole('coordinator'), async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body)
  const result = await pool.query(
    `UPDATE users SET active = $1 WHERE id = $2 RETURNING id, email, display_name, active`,
    [active, req.params.id]
  )
  res.json(result.rows[0])
})

export default router
