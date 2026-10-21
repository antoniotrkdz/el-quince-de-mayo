import bcrypt from 'bcryptjs'
import { pool } from './pool'

async function seed() {
  try {
    // 1. Migrate schema first (idempotent)
    const fs = await import('fs')
    const path = await import('path')
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
    await pool.query(sql)
    console.log('✓ Schema OK')

    // 2. Create school (upsert by code)
    const schoolResult = await pool.query(`
      INSERT INTO schools (name, code)
      VALUES ($1, $2)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, ['Istituto di Test', 'TEST001'])
    const schoolId = schoolResult.rows[0].id
    console.log('✓ Scuola:', schoolId)

    // 3. Coordinator
    const coordHash = await bcrypt.hash('coordinatore123', 12)
    const coordResult = await pool.query(`
      INSERT INTO users (school_id, email, display_name, role, auth_provider, password_hash)
      VALUES ($1, $2, $3, 'coordinator', 'local', $4)
      ON CONFLICT (school_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id, email, display_name, role
    `, [schoolId, 'coordinatore@test.it', 'Mario Bianchi (Coordinatore)', coordHash])
    console.log('✓ Coordinatore:', coordResult.rows[0].email, '/ password: coordinatore123')

    // 4. Teacher
    const teacherHash = await bcrypt.hash('docente123', 12)
    const teacherResult = await pool.query(`
      INSERT INTO users (school_id, email, display_name, role, subject, auth_provider, password_hash)
      VALUES ($1, $2, $3, 'teacher', $4, 'local', $5)
      ON CONFLICT (school_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id, email, display_name, role, subject
    `, [schoolId, 'docente@test.it', 'Anna Rossi (Docente)', 'Matematica e Fisica', teacherHash])
    console.log('✓ Docente:', teacherResult.rows[0].email, '/ password: docente123')

    console.log('\nAccount pronti:')
    console.log('  Coordinatore → email: coordinatore@test.it  password: coordinatore123')
    console.log('  Docente      → email: docente@test.it       password: docente123')
  } catch (err) {
    console.error('Seed fallito:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

seed()
