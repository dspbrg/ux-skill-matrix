/**
 * Bouwt de werkbank tot één los bestand dat zonder server en zonder database
 * opent, met onderin een balk om tussen de drie schermen en de twee thema's te
 * wisselen. Zo kan iemand het bekijken zonder iets te installeren.
 *
 *   node scripts/bouw-voorbeeld.mjs [doelbestand]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const doel = process.argv[2] ?? '/tmp/skill-matrix-voorbeeld.html'
const uit = 'dist-voorbeeld'

execFileSync('npx', ['vite', 'build', '--config', 'vite.voorbeeld.config.ts'], { stdio: 'inherit' })

const activa = readdirSync(join(uit, 'assets'))
const lees = (ext) => readFileSync(join(uit, 'assets', activa.find((f) => f.endsWith(ext))), 'utf8')

let html = readFileSync(join(uit, 'voorbeeld.html'), 'utf8')
const css = lees('.css')
const js = lees('.js')

// De lettertypes van het eigen thema blijven een echte link: het COA-thema
// laadt de zijne pas als iemand erop klikt.
html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]*">/, () => `<style>${css}</style>`)
html = html.replace(/<script type="module" crossorigin src="[^"]*"><\/script>/, () => `<script type="module">${js}</script>`)

const SCHERMEN = [
  ['Invullen', '#/p/demo'],
  ['Ingediend', '#/p/t1'],
  ['Facilitator', '#/admin?s=DEMO'],
]

const balk = `
<style>
  .wb {
    position: fixed; right: 16px; bottom: 16px; z-index: 99;
    display: flex; align-items: center; gap: 12px;
    padding: 8px 12px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border);
    box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px -14px rgba(0,0,0,.35);
    font-family: var(--micro-family); font-size: var(--fs-1);
    letter-spacing: var(--micro-tracking); text-transform: var(--micro-transform);
  }
  .wb b { color: var(--text-3); font-weight: 400; }
  .wb span { width: 1px; height: 14px; background: var(--border); }
  .wb button {
    min-height: 0; padding: 4px 8px; border: none; background: none;
    color: var(--text-2); font: inherit; letter-spacing: inherit;
    text-transform: inherit; border-radius: 999px; cursor: pointer;
  }
  .wb button:hover { background: var(--surface-2); color: var(--text); }
  .wb button[aria-current] { background: var(--accent); color: var(--on-accent); }
  @media print { .wb { display: none; } }
</style>
<div class="wb" id="wb"></div>
<script>
(function () {
  var schermen = ${JSON.stringify(SCHERMEN)}
  var thema = new URLSearchParams(location.search).get('thema') || localStorage.getItem('skillmatrix:thema') || 'eigen'
  function ga(hash) { location.hash = hash }

  // Niet via de adresbalk en een reload: die twee vochten om dezelfde tik en
  // de reload won, zodat er niets gebeurde. Dit is wat thema.ts ook doet.
  var fontsGeladen = false
  function laadFonts() {
    if (fontsGeladen) return
    fontsGeladen = true
    var l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700' +
             '&family=JetBrains+Mono:wght@400;500&display=swap'
    document.head.appendChild(l)
  }
  function zetThema(naam) {
    thema = naam
    var w = document.documentElement
    if (naam === 'coa') { w.setAttribute('data-thema', 'coa'); laadFonts() }
    else { w.removeAttribute('data-thema') }
    try { localStorage.setItem('skillmatrix:thema', naam) } catch (e) {}
    // Staat het thema in de adresbalk, dan wint dat bij de volgende
    // routewissel van de knop die je net indrukte. Dus haalt hij hem eruit.
    try {
      var u = new URL(location.href)
      if (u.searchParams.has('thema')) {
        u.searchParams.delete('thema')
        history.replaceState(null, '', u.pathname + u.search + u.hash)
      }
    } catch (e) {}
    teken()
  }
  function teken() {
    var bar = document.getElementById('wb')
    bar.innerHTML = ''
    var label = document.createElement('b'); label.textContent = 'Voorbeeld'; bar.appendChild(label)
    var sep = function () { var s = document.createElement('span'); bar.appendChild(s) }
    sep()
    schermen.forEach(function (s) {
      var b = document.createElement('button')
      b.textContent = s[0]
      if (location.hash === s[1]) b.setAttribute('aria-current', 'true')
      b.onclick = function () { ga(s[1]) }
      bar.appendChild(b)
    })
    sep()
    ;[['dspbrg', 'eigen'], ['COA', 'coa']].forEach(function (t) {
      var b = document.createElement('button')
      b.textContent = t[0]
      if (thema === t[1]) b.setAttribute('aria-current', 'true')
      b.onclick = function () { zetThema(t[1]) }
      bar.appendChild(b)
    })
  }
  addEventListener('hashchange', teken)
  teken()
})()
</script>
`

html = html.replace('</body>', balk + '</body>')
writeFileSync(doel, html)
const kb = Math.round(statSync(doel).size / 1024)
console.log(`\nWerkbank: ${doel} · ${kb} KB · externe scripts: ${(html.match(/<script[^>]*src="http/g) || []).length}`)
