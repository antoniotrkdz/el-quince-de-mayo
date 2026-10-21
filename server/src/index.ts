import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import dotenv from 'dotenv'
import { pool } from './db/pool'
import passport from './services/passport'
import authRouter from './routes/auth'
import documentsRouter from './routes/documents'
import sectionsRouter from './routes/sections'
import usersRouter from './routes/users'
import templateRouter from './routes/template'

dotenv.config()

const app = express()
const PgSession = connectPgSimple(session)

app.use(helmet())
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}))

app.use(passport.initialize())
app.use(passport.session())

// Routes
app.use('/api/auth', authRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/documents/:documentId/sections', sectionsRouter)
app.use('/api/users', usersRouter)
app.use('/api/template', templateRouter)

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Dati non validi', details: err.errors })
  }
  console.error(err)
  res.status(500).json({ error: 'Errore interno del server' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`)
})
