import { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Non autenticato' })
  }
  next()
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as { role: string } | undefined
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Accesso non autorizzato' })
    }
    next()
  }
}
