import path from 'node:path'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { comparisonMarkdown, metrics } from '../lib/english-evaluation.mjs'
import { evidenceFingerprint } from '../lib/report.mjs'
const root=path.resolve(import.meta.dirname,'../../..')
const source=path.resolve(process.argv[2]??'')
if(!process.argv[2]) throw new Error('Provide an English experiment run directory')
const report=JSON.parse(await readFile(path.join(source,'report.json'),'utf8'))
const output=path.join(root,'validation-runs/jev',new Date().toISOString().replace(/[-:.TZ]/g,'')+'-english-replay')
await mkdir(output,{recursive:true})
// Never mutate historical predictions, labels, or comparison results. This
// command renders an existing run and adds an analysis fingerprint, no API use.
const predictions=JSON.parse(await readFile(path.join(source,'predictions.json'),'utf8'))
const replay={source,sourceEvidence:report.evidence,analysisEvidence:await evidenceFingerprint(root),modelCalls:0,heldOutOpened:!!report.heldOut.length,diagnosticAt075:Object.fromEntries([...new Set(predictions.map(row=>row.candidate))].map(candidate=>[candidate,metrics(predictions.filter(row=>row.candidate===candidate&&row.split==='development'),.75)]))}
const rendered={...report,
  reason:report.selection?report.reason:'No development configuration passes all gates. Holdout inference remains blocked. The source run is preserved; rescue results below were already recorded in it.',
  recommendation:report.selection?'Validate the frozen candidate before promotion.':'Continue development with reviewed target meanings: grounding reduced false rejections substantially, but its remaining 3.45% rate in this run exceeds the 2% gate. The tested alias overlay and rescue did not close that gap; keep experimental gameplay unpromoted.',
}
await writeFile(path.join(output,'comparison.md'),comparisonMarkdown(rendered))
await writeFile(path.join(output,'replay.json'),JSON.stringify(replay,null,2))
process.stdout.write(output+'\n')
