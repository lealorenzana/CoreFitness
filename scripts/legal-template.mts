// The gym documents as a template (0262): the site's current wording, with the four things Settings decides
// written as placeholders — {business}, {contact}, {grace}, {reminders} — so the platform's editor starts from the
// text in effect and the site fills the numbers in when it shows a version edited there.
// Run: node --experimental-strip-types scripts/legal-template.mts  (writes corefitness-platform/src/data/legalTemplate.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildDocs, contactLine, gracePhrase, reminderPhrase, DOC_ORDER, VERSION, type Facts } from '../corefitness-site/src/legalText.ts';

const S: Facts = { businessName: 'BIZ\u0001', address: null, email: 'mail\u0001', phone: null, graceDays: 991, reminderDays: [993, 992], published: null };
const swaps: [string, string][] = [[contactLine(S), '{contact}'], [gracePhrase(S), '{grace}'], [reminderPhrase(S), '{reminders}'], [S.businessName, '{business}']];
const t = (s: string) => swaps.reduce((acc, [a, b]) => acc.split(a).join(b), s);

const docs = buildDocs(S);
const out = Object.fromEntries(DOC_ORDER.map((k) => {
  const d = docs[k];
  return [k, { short: t(d.short), title: t(d.title), lede: t(d.lede), law: d.law,
    sections: d.sections.map((s) => ({ id: s.id, title: t(s.title), body: (Array.isArray(s.body) ? s.body : [s.body]).map(t) })) }];
}));
const left = JSON.stringify(out).match(/\u0001|991|992|993/g);
if (left) throw new Error(`a fact was not turned into a placeholder: ${left.join(', ')}`);
mkdirSync('corefitness-platform/src/data', { recursive: true });
writeFileSync('corefitness-platform/src/data/legalTemplate.json', JSON.stringify({ from: VERSION, docs: out }, null, 1));
console.log('written, from version', VERSION, Object.keys(out).map((k) => `${k}: ${out[k].sections.length} sections`).join(', '));
