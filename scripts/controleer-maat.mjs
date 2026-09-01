#!/usr/bin/env node
/**
 * Controleert dat ruimtewaarden uit de schaal komen en niet uit de losse pols.
 *
 * Een ruimtemaat die alleen in de stylesheet staat terwijl de componenten er
 * eigen getallen naast zetten, is geen systeem maar een suggestie. Deze
 * controle laat de build falen zodra dat weer gebeurt, zodat het niet
 * afhangt van of iemand er die dag op let.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RUIMTE = /\b(marginTop|marginBottom|marginLeft|marginRight|margin|gap|columnGap|rowGap|padding|paddingTop|paddingBottom|paddingLeft|paddingRight)\s*:\s*(\d+)\b/g
const MAP = 'src'

const klachten = []
for (const naam of readdirSync(MAP).filter((n) => n.endsWith('.tsx'))) {
  const pad = join(MAP, naam)
  readFileSync(pad, 'utf8').split('\n').forEach((regel, i) => {
    for (const m of regel.matchAll(RUIMTE)) {
      if (m[2] === '0') continue // nul is geen maat
      klachten.push(`${pad}:${i + 1}  ${m[1]}: ${m[2]}  →  gebruik var(--space-1…6)`)
    }
  })
}

if (klachten.length) {
  console.error(`\nRuimtewaarden buiten de schaal (${klachten.length}):\n`)
  klachten.forEach((k) => console.error('  ' + k))
  console.error('\nDe schaal staat bovenaan src/styles.css: 4 · 8 · 12 · 16 · 24 · 32.\n')
  process.exit(1)
}
console.log(`Maatcontrole: alle ruimtewaarden komen uit de schaal.`)
