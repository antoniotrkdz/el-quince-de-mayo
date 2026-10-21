import { Router } from 'express'
import passport from '../services/passport'
import { requireAuth } from '../middleware/auth'

const router = Router()

// ── Local ──────────────────────────────────────────────────────────────────
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err: any, user: any, info: any) => {
    if (err) return next(err)
    if (!user) return res.status(401).json({ error: info?.message || 'Credenziali non valide' })
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr)
      return res.json({ user })
    })
  })(req, res, next)
})

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err)
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ ok: true })
    })
  })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// ── Google ─────────────────────────────────────────────────────────────────
router.get('/google', passport.authenticate('google'))

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth` }),
  (_req, res) => {
    res.redirect(`${process.env.CLIENT_URL}/dashboard`)
  }
)

// ── Microsoft ──────────────────────────────────────────────────────────────
router.get('/microsoft', passport.authenticate('microsoft'))

router.get(
  '/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth` }),
  (_req, res) => {
    res.redirect(`${process.env.CLIENT_URL}/dashboard`)
  }
)

export default router
