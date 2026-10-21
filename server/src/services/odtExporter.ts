import JSZip from 'jszip'
import * as fs from 'fs/promises'
import * as path from 'path'

interface DocRow {
  title: string
  school_class: string
  academic_year: string
  coordinator_id: string
  coordinator_name: string
  coordinator_prefix: string
  diploma_type: string | null
  pcto_weeks: number | null
  pcto_start_date: string | null
  pcto_end_date: string | null
  uda_titles: string[] | null
  finalized_at: string | null
}

interface SectionRow {
  section_type: string
  assigned_to: string | null
  subject: string | null
  assigned_name: string | null
  title: string
  content: string
  sort_order: number
}

const TEMPLATE_PATH = path.join(__dirname, '../../src/Documento_15_Maggio_25_Parte_Generale_CORRETTO 2.odt')

const SECTION_MARKERS: Record<string, string> = {
  storia_classe:              'PRESENTAZIONE DELLA CLASSE',
  presentazione_classe:       'FORMAZIONE DEL CONSIGLIO DI CLASSE',
  obiettivi_educativi:        'Profilo professionale',
  valutazione_apprendimento:  "Valutazione dell'apprendimento",
  pcto:                       'Stage in azienda',
  attivita_curriculare:       'Attività curriculare',
  griglia_valutazione:        'Griglia di valutazione del colloquio',
  griglia_prima_prova:        'Griglia di valutazione per la prima prova scritta',
  testi_prima_prova:          'Griglia di valutazione per la seconda prova scritta',
  simulazioni:                'Simulazione prima prova scritta del',
  simulazioni_seconda:        'Simulazione seconda prova scritta del',
}

function formatDateIT(d: string): string {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTimeIT(d: string): string {
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export async function generateOdt(doc: DocRow, sections: SectionRow[]): Promise<Buffer> {
  const templateBuffer = await fs.readFile(TEMPLATE_PATH)
  const zip = await JSZip.loadAsync(templateBuffer)

  let contentXml = await zip.file('content.xml')!.async('string')

  // ── 1. Sostituzioni header ──────────────────────────────────────────────
  contentXml = contentXml.replace('Anno Scolastico 2025/2026', escXml(doc.academic_year))

  // Estrae la lettera di sezione da "5A" → "A", "VA" → "A", "A" → "A"
  const sectionLetter = doc.school_class.replace(/^[\dVv]+\s*/i, '').trim() || doc.school_class
  contentXml = contentXml.replace('Classe V – Sezione ……', `Classe V – Sezione ${escXml(sectionLetter)}`)

  if (doc.diploma_type) {
    contentXml = contentXml.replace(/Diploma di Istruzione [….]+/, `Diploma di Istruzione ${escXml(doc.diploma_type)}`)
  }

  contentXml = contentXml.replace(
    'Coordinatore: prof. / prof.ssa ……………………',
    `Coordinatore: ${escXml(doc.coordinator_prefix ?? 'Prof.')} ${escXml(doc.coordinator_name)}`
  )

  if (doc.pcto_weeks != null) {
    contentXml = contentXml.replace(/effettuato … settimane/, `effettuato ${doc.pcto_weeks} settimane`)
  }
  if (doc.pcto_start_date) {
    contentXml = contentXml.replace('dal __/__/____', `dal ${formatDateIT(doc.pcto_start_date)}`)
  }
  if (doc.pcto_end_date) {
    contentXml = contentXml.replace('al __/__/____', `al ${formatDateIT(doc.pcto_end_date)}`)
  }

  // Intestazione UDA: "Nella classe V sez. X nel corso dell'A.S."
  contentXml = contentXml.replace(
    "Nella classe ….. nel corso dell'A.S.",
    `Nella classe V sez. ${escXml(sectionLetter)} nel corso dell'A.S.`
  )

  // Approvazione: data e ora da finalized_at
  if (doc.finalized_at) {
    contentXml = contentXml.replace('in data ………….,', `in data ${formatDateIT(doc.finalized_at)},`)
    contentXml = contentXml.replace('alle ore ………...,', `alle ore ${formatTimeIT(doc.finalized_at)},`)
  }

  // ── 2. Inietta stili carattere aggiuntivi (bold/italic) ─────────────────
  contentXml = injectCharStyles(contentXml)

  // ── 3. Inietta sezioni coordinatore nei placeholder ……  ─────────────────
  const coordinatorSections = sections.filter((s) => s.assigned_to === null)
  const teacherSections = sections.filter((s) => s.assigned_to !== null)

  for (const s of coordinatorSections) {
    const marker = SECTION_MARKERS[s.section_type]
    if (!marker) continue

    if (s.section_type === 'presentazione_classe') {
      const hasContent = s.content && s.content.replace(/<[^>]*>/g, '').trim()
      const odf = hasContent
        ? htmlToOdf(s.content)
        : buildClassCouncilOdf(sections, doc.coordinator_id)
      contentXml = injectAtMarkerOdf(contentXml, marker, odf)
    } else if (s.content && s.content.replace(/<[^>]*>/g, '').trim()) {
      contentXml = injectAtMarker(contentXml, marker, s.content)
    }
  }

  // ── 4. Continuità docenti (Table5) ───────────────────────────────────────
  if (teacherSections.length > 0) {
    contentXml = injectContinuityTable(contentXml, teacherSections, doc.coordinator_id)
  }

  // ── 4b. Titoli UDA ────────────────────────────────────────────────────────
  if (doc.uda_titles?.length) {
    contentXml = injectUdaTitles(contentXml, doc.uda_titles)
  }

  // ── 4c. Discipline coinvolte ──────────────────────────────────────────────
  contentXml = injectDisciplines(contentXml, sections)

  // ── 5. Costruisci e inietta pagine docenti ──────────────────────────────
  if (teacherSections.length > 0) {
    const teacherXml = buildTeacherPages(teacherSections)
    const injectionMarker = 'ALLEGATI AL DOCUMENTO DEL CONSIGLIO DI CLASSE RELATIVI ALLE U.d.A.'
    const injIdx = contentXml.lastIndexOf(injectionMarker)
    if (injIdx !== -1) {
      const paraStart = contentXml.lastIndexOf('<text:p', injIdx)
      contentXml = contentXml.slice(0, paraStart) + teacherXml + contentXml.slice(paraStart)
    } else {
      // fallback: prima della chiusura office:text
      contentXml = contentXml.replace('</office:text>', teacherXml + '</office:text>')
    }
  }

  zip.file('content.xml', contentXml)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>
}

// ─── Sostituzione placeholder ………… ─────────────────────────────────────────

function injectAtMarker(xml: string, marker: string, htmlContent: string): string {
  return injectAtMarkerOdf(xml, marker, htmlToOdf(htmlContent))
}

function injectAtMarkerOdf(xml: string, marker: string, odf: string): string {
  // lastIndexOf: trova l'occorrenza nel corpo, non nel sommario iniziale
  const markerIdx = xml.lastIndexOf(marker)
  if (markerIdx === -1) return xml

  // Cerca il primo paragrafo che contiene SOLO puntini (placeholder di contenuto).
  // Salta i puntini inline nei paragrafi di intestazione (es. "ai sensi ……" o "del ……").
  let pos = markerIdx
  while (true) {
    const paraOpen = xml.indexOf('<text:p', pos)
    if (paraOpen === -1) return xml
    const paraClose = xml.indexOf('</text:p>', paraOpen)
    if (paraClose === -1) return xml

    const paraText = xml.slice(paraOpen, paraClose).replace(/<[^>]*>/g, '')
    if (/^[\s…\.]+$/.test(paraText) && paraText.includes('…')) {
      // Trovato paragrafo solo-puntini: è il placeholder da sostituire
      let paraEnd = paraClose + '</text:p>'.length

      // Consuma anche i paragrafi consecutivi di soli puntini
      while (true) {
        const nextOpen = xml.indexOf('<text:p', paraEnd)
        if (nextOpen === -1) break
        const nextClose = xml.indexOf('</text:p>', nextOpen)
        if (nextClose === -1) break
        const nextText = xml.slice(nextOpen, nextClose).replace(/<[^>]*>/g, '')
        if (/^[\s…\.]+$/.test(nextText) && nextText.includes('…')) {
          paraEnd = nextClose + '</text:p>'.length
        } else {
          break
        }
      }

      return xml.slice(0, paraOpen) + odf + xml.slice(paraEnd)
    }

    pos = paraClose + 1
  }
}

// ─── Pagine disciplina ───────────────────────────────────────────────────────

function buildTeacherPages(sections: SectionRow[]): string {
  // Raggruppa per docente/materia
  const grouped = sections.reduce<Record<string, SectionRow[]>>((acc, s) => {
    const key = s.subject ?? s.assigned_name ?? 'Senza materia'
    ;(acc[key] ??= []).push(s)
    return acc
  }, {})

  const parts: string[] = []

  for (const [subject, secs] of Object.entries(grouped)) {
    // Interruzione di pagina prima di ogni disciplina
    parts.push(`<text:p text:style-name="P30"><text:soft-page-break/></text:p>`)
    parts.push(`<text:p text:style-name="P104">DISCIPLINA: ${escXml(subject)}</text:p>`)

    const teacher = secs[0]?.assigned_name
    if (teacher) {
      parts.push(`<text:p text:style-name="P102">Docente: ${escXml(teacher)}</text:p>`)
    }
    parts.push(`<text:p text:style-name="P30"/>`)

    for (const s of secs) {
      parts.push(`<text:p text:style-name="P102">${escXml(s.title)}</text:p>`)
      parts.push(htmlToOdf(s.content))
    }
  }

  return parts.join('\n')
}

// ─── Formazione del Consiglio di Classe: auto-generazione ODF ───────────────

function buildClassCouncilOdf(sections: SectionRow[], coordinatorId: string): string {
  const seen = new Set<string>()
  const teachers: { name: string; subject: string; isCoord: boolean }[] = []

  for (const s of sections) {
    if (!s.assigned_to) continue
    if (seen.has(s.assigned_to)) continue
    seen.add(s.assigned_to)
    teachers.push({
      name: s.assigned_name ?? '',
      subject: s.subject ?? '',
      isCoord: s.assigned_to === coordinatorId,
    })
  }

  teachers.sort((a, b) => (b.isCoord ? 1 : 0) - (a.isCoord ? 1 : 0))

  if (teachers.length === 0) return '<text:p text:style-name="P30"/>'

  return teachers
    .map(
      (t) =>
        `<text:p text:style-name="P30"><text:span text:style-name="T_inj_b">${escXml(t.name)}</text:span> — ${escXml(t.subject)}</text:p>`
    )
    .join('\n')
}

// ─── Continuità docenti: Table5 ──────────────────────────────────────────────

function injectContinuityTable(xml: string, teacherSections: SectionRow[], coordinatorId: string): string {
  const nameIdx = xml.indexOf('table:name="Table5"')
  if (nameIdx === -1) return xml

  const tableStart = xml.lastIndexOf('<table:table', nameIdx)
  const tableEnd = xml.indexOf('</table:table>', tableStart) + '</table:table>'.length
  const tableXml = xml.slice(tableStart, tableEnd)

  // Keep header row (first table-row), replace everything else
  const firstRowStart = tableXml.indexOf('<table:table-row')
  const firstRowEnd = tableXml.indexOf('</table:table-row>', firstRowStart) + '</table:table-row>'.length
  const headerRow = tableXml.slice(firstRowStart, firstRowEnd)

  // Unique teachers, coordinator first
  const seen = new Set<string>()
  const teachers: { name: string; subject: string; isCoord: boolean }[] = []
  for (const s of teacherSections) {
    if (!s.assigned_to || seen.has(s.assigned_to)) continue
    seen.add(s.assigned_to)
    teachers.push({
      name: s.assigned_name ?? '',
      subject: s.subject ?? '',
      isCoord: s.assigned_to === coordinatorId,
    })
  }
  teachers.sort((a, b) => (b.isCoord ? 1 : 0) - (a.isCoord ? 1 : 0))

  const newRows = teachers
    .map(
      (t) => `<table:table-row table:style-name="Table5.1">
<table:table-cell table:style-name="Table5.A2" office:value-type="string"><text:p text:style-name="P111">${escXml(t.subject)}</text:p></table:table-cell>
<table:table-cell table:style-name="Table5.B2" office:value-type="string"><text:p text:style-name="P112">…</text:p></table:table-cell>
<table:table-cell table:style-name="Table5.C2" office:value-type="string"><text:p text:style-name="P113">…</text:p></table:table-cell>
<table:table-cell table:style-name="Table5.C2" office:value-type="string"><text:p text:style-name="P113">${escXml(t.name)}</text:p></table:table-cell>
</table:table-row>`
    )
    .join('\n')

  const beforeRows = tableXml.slice(0, firstRowStart)
  const newTableXml = beforeRows + headerRow + '\n' + newRows + '\n</table:table>'

  return xml.slice(0, tableStart) + newTableXml + xml.slice(tableEnd)
}

// ─── Titoli UDA: sostituisce i placeholder nella lista WW8Num27 ──────────────

function injectUdaTitles(xml: string, titles: string[]): string {
  const listStart = xml.indexOf('<text:list text:style-name="WW8Num27">')
  if (listStart === -1) return xml
  const listEnd = xml.indexOf('</text:list>', listStart) + '</text:list>'.length
  const items = titles.map((t, i) => {
    const style = i === 0 ? 'P46' : 'P47'
    return `<text:list-item><text:p text:style-name="${style}">${escXml(t)}</text:p></text:list-item>`
  }).join('')
  return xml.slice(0, listStart) + `<text:list text:style-name="WW8Num27">${items}</text:list>` + xml.slice(listEnd)
}

// ─── Discipline coinvolte: sostituisce i placeholder nella lista WW8Num53 ────

function injectDisciplines(xml: string, sections: SectionRow[]): string {
  const subjects = [...new Set(sections.filter((s) => s.subject).map((s) => s.subject!))]
  if (!subjects.length) return xml
  const listStart = xml.indexOf('<text:list text:style-name="WW8Num53">')
  if (listStart === -1) return xml
  const listEnd = xml.indexOf('</text:list>', listStart) + '</text:list>'.length
  const items = subjects.map((subj, i) => {
    const style = i === 0 ? 'P100' : 'P101'
    return `<text:list-item><text:p text:style-name="${style}">${escXml(subj)}; </text:p></text:list-item>`
  }).join('')
  return xml.slice(0, listStart) + `<text:list text:style-name="WW8Num53">${items}</text:list>` + xml.slice(listEnd)
}

// ─── Inietta stili carattere per bold/italic negli automatic-styles ──────────

function injectCharStyles(xml: string): string {
  const styles = `
    <style:style style:name="T_inj_b" style:family="text">
      <style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/>
    </style:style>
    <style:style style:name="T_inj_i" style:family="text">
      <style:text-properties fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"/>
    </style:style>
    <style:style style:name="T_inj_bi" style:family="text">
      <style:text-properties fo:font-weight="bold" fo:font-style="italic" style:font-weight-asian="bold" style:font-style-asian="italic"/>
    </style:style>
    <style:style style:name="T_inj_code" style:family="text">
      <style:text-properties fo:font-family="Liberation Mono" fo:font-size="10pt"/>
    </style:style>
    <text:list-style style:name="List_Bullet">
      <text:list-level-style-bullet text:level="1" text:bullet-char="•">
        <style:list-level-properties text:list-level-position-and-space-mode="label-alignment">
          <style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.25in" fo:margin-left="0.5in"/>
        </style:list-level-properties>
        <style:text-properties fo:font-family="OpenSymbol"/>
      </text:list-level-style-bullet>
    </text:list-style>
    <text:list-style style:name="List_Number">
      <text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">
        <style:list-level-properties text:list-level-position-and-space-mode="label-alignment">
          <style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.25in" fo:margin-left="0.5in"/>
        </style:list-level-properties>
      </text:list-level-style-number>
    </text:list-style>`

  return xml.replace('</office:automatic-styles>', styles + '</office:automatic-styles>')
}

// ─── HTML → ODF converter ────────────────────────────────────────────────────

type Token =
  | { kind: 'open'; tag: string; selfClose: boolean }
  | { kind: 'close'; tag: string }
  | { kind: 'text'; value: string }

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end === -1) { tokens.push({ kind: 'text', value: html.slice(i) }); break }
      const raw = html.slice(i + 1, end).trim()
      if (raw.startsWith('/')) {
        tokens.push({ kind: 'close', tag: raw.slice(1).trim().toLowerCase().split(/\s/)[0] })
      } else {
        const selfClose = raw.endsWith('/')
        const tag = (selfClose ? raw.slice(0, -1) : raw).trim().toLowerCase().split(/[\s/]/)[0]
        tokens.push({ kind: 'open', tag, selfClose })
      }
      i = end + 1
    } else {
      const next = html.indexOf('<', i)
      const slice = next === -1 ? html.slice(i) : html.slice(i, next)
      if (slice) tokens.push({ kind: 'text', value: slice })
      i = next === -1 ? html.length : next
    }
  }
  return tokens
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface ConvertState {
  listStyle: string
  listDepth: number
  insideLi: boolean
  inPre: boolean
}

function htmlToOdf(html: string): string {
  if (!html || html.replace(/<[^>]*>/g, '').trim() === '') {
    return '<text:p text:style-name="P30"/>'
  }

  const tokens = tokenize(html)
  const out: string[] = []
  const state: ConvertState = { listStyle: 'BulletList', listDepth: 0, insideLi: false, inPre: false }
  const stack: string[] = []

  const openPara = (style: string) => { out.push(`<text:p text:style-name="${style}">`); stack.push('p') }
  const closePara = () => { if (stack[stack.length - 1] === 'p') { out.push('</text:p>'); stack.pop() } }
  const openSpan = (style: string) => { out.push(`<text:span text:style-name="${style}">`); stack.push('span') }
  const closeSpan = () => { if (stack[stack.length - 1] === 'span') { out.push('</text:span>'); stack.pop() } }

  for (const tok of tokens) {
    if (tok.kind === 'text') {
      out.push(escXml(decodeEntities(tok.value)))
      continue
    }

    if (tok.kind === 'open') {
      const { tag } = tok
      switch (tag) {
        case 'p':
          openPara(state.insideLi ? 'P30' : 'P30')
          break
        case 'h1': openPara('P104'); break
        case 'h2': openPara('P102'); break
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': openPara('P107'); break
        case 'strong':
        case 'b': openSpan('T_inj_b'); break
        case 'em':
        case 'i': openSpan('T_inj_i'); break
        case 'code':
          if (!state.inPre) openSpan('T_inj_code')
          break
        case 'pre':
          state.inPre = true
          openPara('P30')
          break
        case 'blockquote': openPara('P30'); break
        case 'ul':
          state.listDepth++
          state.listStyle = 'BulletList'
          out.push(`<text:list text:style-name="List_Bullet">`)
          stack.push('list')
          break
        case 'ol':
          state.listDepth++
          state.listStyle = 'NumberList'
          out.push(`<text:list text:style-name="List_Number">`)
          stack.push('list')
          break
        case 'li':
          state.insideLi = true
          out.push('<text:list-item>')
          stack.push('li')
          break
        case 'br':
          out.push('<text:line-break/>')
          break
      }
      continue
    }

    if (tok.kind === 'close') {
      const { tag } = tok
      switch (tag) {
        case 'p':
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        case 'blockquote':
          closePara(); break
        case 'pre':
          state.inPre = false
          closePara(); break
        case 'strong': case 'b':
        case 'em': case 'i':
          closeSpan(); break
        case 'code':
          if (!state.inPre) closeSpan(); break
        case 'li':
          state.insideLi = false
          if (stack[stack.length - 1] === 'p') closePara()
          if (stack[stack.length - 1] === 'li') { out.push('</text:list-item>'); stack.pop() }
          break
        case 'ul': case 'ol':
          state.listDepth = Math.max(0, state.listDepth - 1)
          if (state.listDepth === 0) state.listStyle = 'BulletList'
          if (stack[stack.length - 1] === 'list') { out.push('</text:list>'); stack.pop() }
          break
      }
    }
  }

  // Chiudi elementi aperti rimasti
  while (stack.length > 0) {
    const top = stack.pop()!
    if (top === 'p') out.push('</text:p>')
    else if (top === 'span') out.push('</text:span>')
    else if (top === 'li') out.push('</text:list-item>')
    else if (top === 'list') out.push('</text:list>')
  }

  return out.join('') || '<text:p text:style-name="P30"/>'
}
