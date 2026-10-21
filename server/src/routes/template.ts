import { Router } from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()
const execAsync = promisify(exec)

const TEMPLATE_PATH = path.join(__dirname, '../../src/Documento_15_Maggio_25_Parte_Generale_CORRETTO 2.odt')
const OUT_DIR = '/tmp/doc15maggio-preview'
const HTML_PATH = path.join(OUT_DIR, 'Documento_15_Maggio_25_Parte_Generale_CORRETTO 2.html')
const PERSISTENT_HTML_PATH = path.join(__dirname, '../../data/template-preview.html')

const SECTION_MARKERS: Record<string, string> = {
  obiettivi_educativi:        'Profilo professionale',
  valutazione_apprendimento:  "Valutazione dell'apprendimento",
  pcto:                       'Stage in azienda',
  attivita_curriculare:       'Attività curriculare',
  criteri_condotta:           "Criteri per l'attribuzione del voto di condotta",
  griglia_valutazione:        'Griglia di valutazione del colloquio',
  griglia_prima_prova:        'Griglia di valutazione per la prima prova scritta',
  testi_prima_prova:          'Griglia di valutazione per la seconda prova scritta',
  simulazioni:                'Simulazione prima prova scritta del',
  simulazioni_seconda:        'Simulazione seconda prova scritta del',
  storia_classe:              'PRESENTAZIONE DELLA CLASSE',
  presentazione_classe:       'FORMAZIONE DEL CONSIGLIO DI CLASSE',
}

async function buildPreviewHtml(): Promise<string> {
  await fs.mkdir(OUT_DIR, { recursive: true })
  await execAsync(`libreoffice --headless --convert-to html --outdir "${OUT_DIR}" "${TEMPLATE_PATH}"`)

  let html = await fs.readFile(HTML_PATH, 'utf-8')

  // Embed all local images as base64 so the HTML is self-contained
  for (const m of html.matchAll(/src="([^"]+)"/g)) {
    const src = m[1]
    if (src.startsWith('data:') || src.startsWith('http')) continue
    try {
      const data = await fs.readFile(path.join(OUT_DIR, src))
      const ext = path.extname(src).slice(1).toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
      html = html.replaceAll(m[0], `src="data:${mime};base64,${data.toString('base64')}"`)
    } catch { /* image not found, skip */ }
  }

  // Inject highlight script (external file keeps CSP script-src 'self' happy)
  html = html.replace('</body>', '<script src="/api/template/highlight.js"></script>\n</body>')

  return html
}

async function savePreviewHtml(): Promise<void> {
  const html = await buildPreviewHtml()
  await fs.mkdir(path.dirname(PERSISTENT_HTML_PATH), { recursive: true })
  await fs.writeFile(PERSISTENT_HTML_PATH, html, 'utf-8')
}

router.get('/preview', requireAuth, async (_req, res) => {
  let html: string
  try {
    html = await fs.readFile(PERSISTENT_HTML_PATH, 'utf-8')
  } catch {
    await savePreviewHtml()
    html = await fs.readFile(PERSISTENT_HTML_PATH, 'utf-8')
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'private, no-cache')
  res.send(html)
})

router.post('/build', requireAuth, requireRole('coordinator'), async (_req, res) => {
  await savePreviewHtml()
  res.json({ ok: true })
})

router.get('/highlight.js', requireAuth, (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.send(`(function(){
var M=${JSON.stringify(SECTION_MARKERS)};
var hl=null;
var injected={};
var clickableSetup=false;

function findMarkerEl(s){
  var mt=M[s];if(!mt)return null;
  var els=document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,td');
  var t=null;
  for(var i=0;i<els.length;i++){
    if(els[i].textContent.replace(/\\s+/g,' ').trim().indexOf(mt)!==-1)t=els[i];
  }
  return t;
}

function highlight(s){
  if(hl){hl.style.backgroundColor='';hl.style.outline='';hl.style.cursor='';hl=null;}
  var t=findMarkerEl(s);
  if(t){
    t.style.backgroundColor='#fef08a';t.style.outline='3px solid #eab308';hl=t;
    t.scrollIntoView({behavior:'smooth',block:'center'});
  }
}

function updateContent(s,html){
  if(injected[s]){injected[s].innerHTML=html||'<em style="color:#aaa">nessun contenuto</em>';return;}
  var marker=findMarkerEl(s);if(!marker)return;
  var allP=Array.from(document.querySelectorAll('p'));
  var base=marker.tagName==='P'?marker:(marker.closest?marker.closest('p'):null)||marker;
  var idx=allP.indexOf(base);
  var phs=[];
  if(idx!==-1){
    for(var i=idx+1;i<Math.min(allP.length,idx+50);i++){
      var txt=allP[i].textContent;
      if(/^[\\s\\u00a0\\u2026\\.]*$/.test(txt)&&txt.indexOf('\\u2026')!==-1){phs.push(allP[i]);break;}
    }
  }
  var div=document.createElement('div');
  div.style.cssText='border-left:3px solid #3b82f6;margin:2px 0 2px 16px;padding:6px 10px;background:#eff6ff;font-family:inherit;font-size:inherit;line-height:1.5';
  div.innerHTML=html||'<em style="color:#aaa">nessun contenuto</em>';
  if(phs.length>0){
    phs[0].parentNode.insertBefore(div,phs[0]);
    phs[0].style.display='none';
  } else {
    marker.parentNode.insertBefore(div,marker.nextSibling);
  }
  injected[s]=div;
}

function setupClickable(){
  if(clickableSetup)return;clickableSetup=true;
  Object.keys(M).forEach(function(s){
    var el=findMarkerEl(s);
    if(!el)return;
    el.style.cursor='pointer';
    el.title='Clicca per modificare questa sezione';
    el.addEventListener('mouseenter',function(){
      if(el!==hl)el.style.backgroundColor='#fef9c3';
    });
    el.addEventListener('mouseleave',function(){
      if(el!==hl)el.style.backgroundColor='';
    });
    el.addEventListener('click',function(e){
      e.stopPropagation();
      window.parent.postMessage({type:'section-clicked',section:s},'*');
    });
  });
}

function formatIsoDate(iso){
  var d=iso.slice(0,10).split('-');
  return d[2]+'/'+d[1]+'/'+d[0];
}

function updateMetadata(fields){
  if(!fields)return;
  var els=Array.from(document.querySelectorAll('p'));
  els.forEach(function(el){
    var txt=el.textContent.replace(/\\s+/g,' ').trim();
    if(fields.academic_year&&/Anno\\s+Scolastico\\s+\\d{4}\\/\\d{4}/.test(txt)){
      el.innerHTML=el.innerHTML.replace(/\\d{4}\\/\\d{4}/,fields.academic_year);
    }
    if(fields.school_class&&txt.indexOf('Sezione')!==-1&&/[\\u2026]{2,}/.test(txt)){
      el.innerHTML=el.innerHTML.replace(/[\\u2026]+/,fields.school_class);
    }
    if(fields.diploma_type&&txt.indexOf('Diploma di Istruzione')!==-1){
      el.innerHTML=el.innerHTML.replace(/[\\u2026\\.]+/,fields.diploma_type);
    }
    if(fields.diploma_type&&/^[\\u201c"][\\u2026\\u00a0\\.]+[\\u201d"]$/.test(txt)){
      el.textContent='\\u201c'+fields.diploma_type+'\\u201d';
    }
    if(fields.coordinator_name&&txt.indexOf('Coordinatore')!==-1&&txt.indexOf('prof.')!==-1){
      var prefix=fields.coordinator_prefix||'Prof.';
      var b=el.querySelector('b');
      if(b)b.textContent='Coordinatore: '+prefix+'\\u00a0'+fields.coordinator_name;
    }
    if(txt.indexOf('settimane di stage in azienda')!==-1){
      var inner=el.innerHTML;
      if(fields.pcto_weeks!=null)inner=inner.replace('\\u2026 settimane',fields.pcto_weeks+' settimane');
      if(fields.pcto_start_date)inner=inner.replace('__/__/____',formatIsoDate(fields.pcto_start_date));
      if(fields.pcto_end_date)inner=inner.replace('__/__/____',formatIsoDate(fields.pcto_end_date));
      el.innerHTML=inner;
    }
  });
}

window.addEventListener('message',function(e){
  if(!e||!e.data)return;
  if(e.data.type==='highlight-section')highlight(e.data.section);
  if(e.data.type==='update-section')updateContent(e.data.section,e.data.html);
  if(e.data.type==='inject-all'){
    var sections=e.data.sections||[];
    for(var i=0;i<sections.length;i++)updateContent(sections[i].section,sections[i].html);
    if(e.data.metadata)updateMetadata(e.data.metadata);
    setupClickable();
    if(e.data.active)highlight(e.data.active);
  }
});
window.addEventListener('load',function(){
  window.parent.postMessage({type:'preview-ready'},'*');
});
})();`)
})

export default router
