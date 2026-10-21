import passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
// @ts-ignore — no @types for passport-microsoft
import MicrosoftStrategy from 'passport-microsoft'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool'

export type AppUser = {
  id: string
  school_id: string
  email: string
  display_name: string
  role: string
  auth_provider: string
  subject: string | null
}

async function findOrCreateOAuthUser(
  provider: 'google' | 'microsoft',
  providerId: string,
  email: string,
  displayName: string
): Promise<AppUser> {
  const existing = await pool.query<AppUser>(
    `SELECT id, school_id, email, display_name, role, auth_provider, subject
     FROM users WHERE provider_id = $1 AND auth_provider = $2`,
    [providerId, provider]
  )
  if (existing.rows[0]) return existing.rows[0]

  // Cerca per email (stesso utente che prima usava local)
  const byEmail = await pool.query<AppUser>(
    `SELECT id, school_id, email, display_name, role, auth_provider, subject
     FROM users WHERE email = $1`,
    [email]
  )
  if (byEmail.rows[0]) {
    await pool.query(
      `UPDATE users SET provider_id = $1, auth_provider = $2 WHERE id = $3`,
      [providerId, provider, byEmail.rows[0].id]
    )
    return byEmail.rows[0]
  }

  // Primo accesso OAuth: assegna automaticamente la scuola di default e ruolo teacher
  const schoolResult = await pool.query(`SELECT id FROM schools ORDER BY created_at LIMIT 1`)
  const schoolId = schoolResult.rows[0]?.id ?? null

  const result = await pool.query<AppUser>(
    `INSERT INTO users (school_id, email, display_name, role, auth_provider, provider_id)
     VALUES ($1, $2, $3, 'teacher', $4, $5)
     RETURNING id, school_id, email, display_name, role, auth_provider, subject`,
    [schoolId, email, displayName, provider, providerId]
  )
  return result.rows[0]
}

passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const result = await pool.query<AppUser & { password_hash: string }>(
        `SELECT id, school_id, email, display_name, role, auth_provider, subject, password_hash
         FROM users WHERE email = $1 AND auth_provider = 'local' AND active = TRUE`,
        [email]
      )
      const user = result.rows[0]
      if (!user) return done(null, false, { message: 'Credenziali non valide' })

      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) return done(null, false, { message: 'Credenziali non valide' })

      const { password_hash: _ph, ...safeUser } = user
      return done(null, safeUser)
    } catch (err) {
      return done(err)
    }
  })
)

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        scope: ['profile', 'email'],
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value
          if (!email) return done(new Error('Email non disponibile'))
          const user = await findOrCreateOAuthUser('google', profile.id, email, profile.displayName)
          return done(null, user)
        } catch (err) {
          return done(err)
        }
      }
    )
  )
}

if (process.env.MICROSOFT_CLIENT_ID) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL,
        scope: ['user.read'],
        tenant: 'organizations',
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName
          if (!email) return done(new Error('Email non disponibile'))
          const user = await findOrCreateOAuthUser('microsoft', profile.id, email, profile.displayName)
          return done(null, user)
        } catch (err) {
          return done(err)
        }
      }
    )
  )
}

passport.serializeUser((user: any, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id: string, done) => {
  try {
    const result = await pool.query<AppUser>(
      `SELECT id, school_id, email, display_name, role, auth_provider, subject
       FROM users WHERE id = $1 AND active = TRUE`,
      [id]
    )
    done(null, result.rows[0] || false)
  } catch (err) {
    done(err)
  }
})

export default passport
