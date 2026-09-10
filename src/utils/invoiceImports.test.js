import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseInvoiceXml } from './xmlParser.js';
import { mergeInvoiceImports } from './invoiceImports.js';
import { auditSequence } from './sequenceAudit.js';

globalThis.DOMParser = DOMParser;
const issuer = '11111111000191';
const invoice = (numero, extra = {}) => ({
  id: String(numero), numero, serie: '2', emitente: issuer, modelo: '55',
  dataEmissao: '2026-08-01', type: 'NF-e/NFC-e', value: 10, ...extra,
});
const inutXml = numero => `<?xml version="1.0"?><procInutNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <inutNFe><infInut><ano>26</ano><CNPJ>${issuer}</CNPJ><mod>55</mod><serie>2</serie>
  <nNFIni>${numero}</nNFIni><nNFFin>${numero}</nNFFin></infInut></inutNFe>
  <retInutNFe><nfeResultMsg><retInutNFe><infInut><cStat>102</cStat>
  <dhRecbto>2026-08-27T15:10:35-03:00</dhRecbto></infInut></retInutNFe></nfeResultMsg></retInutNFe>
</procInutNFe>`;
const oldInut = numero => ({ id: `old-${numero}`, name: `2-${numero}-inutNFe.xml`,
  type: 'Inutilizada', isInutilizada: true, numero, numeroIni: numero, numeroFin: numero,
  serie: '2', aamm: null, value: 0, isDuplicada: false, error: null,
});
const importedInut = numero => ({ ...parseInvoiceXml(inutXml(numero)), id: `new-${numero}`, name: `2-${numero}-inutNFe.xml` });
const legacyDuplicate = record => ({ ...record, isDuplicada: true,
  type: 'Nota Duplicada', error: 'Esta nota já foi processada.' });

test('reimportar inutilizações atualiza o cache e elimina as duas lacunas', () => {
  const numbers = [379713, 382917];
  const surrounding = numbers.flatMap(n => [invoice(n - 1), invoice(n + 1)]);
  // Cobre o restante do intervalo para isolar exatamente os dois números.
  const bridge = { ...importedInut(379715), numeroFin: 382915 };
  const previous = [...surrounding, bridge, ...numbers.map(oldInut)];
  assert.equal(auditSequence(previous).gaps[0].count, 2);
  const merged = mergeInvoiceImports(previous, numbers.map(importedInut));
  assert.equal(merged.length, previous.length);
  assert.deepEqual(auditSequence(merged).gaps, []);
  assert.equal(auditSequence(merged).ignoradas, 0);
  assert.equal(merged.find(f => f.id === 'old-379713').anoInutilizacao, '26');
  assert.equal(previous.find(f => f.id === 'old-379713').anoInutilizacao, undefined);
});

test('recupera reimportações que já foram salvas como duplicadas sem importar novamente', () => {
  const saved = [invoice(379712), oldInut(379713), invoice(379714), legacyDuplicate(importedInut(379713))];
  const restored = mergeInvoiceImports(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.length, 3);
  assert.equal(restored[1].type, 'Inutilizada');
  assert.equal(restored[1].isDuplicada, false);
  assert.equal(restored[1].error, null);
  assert.deepEqual(auditSequence(saved).gaps, []);
});

test('reimportar a mesma chave atualiza metadados sem duplicar faturamento', () => {
  const chave = '35260811111111000191550020003797131123456789';
  const previous = invoice(379713, { chave, name: 'old.xml', dataEmissao: null });
  const imported = invoice(379713, { chave, name: 'renamed.xml', id: 'new', dataEmissao: '2026-08-02' });
  const result = mergeInvoiceImports([previous], [imported, imported]);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 10);
  assert.equal(result[0].id, previous.id);
  assert.equal(result[0].dataEmissao, '2026-08-02');
});

test('deduplica inutilizações com outro nome usando a identidade fiscal', () => {
  const original = importedInut(100);
  const renamed = { ...original, name: 'outro-nome.xml' };
  assert.equal(mergeInvoiceImports([original], [renamed]).length, 1);
});

test('arquivos homônimos de emitentes, séries ou anos diferentes continuam separados', () => {
  const original = importedInut(100);
  for (const extra of [{ emitente: '22222222000191' }, { serie: '4' }, { modelo: '65' }, { anoInutilizacao: '25' }]) {
    assert.equal(mergeInvoiceImports([original], [{ ...original, ...extra }]).length, 2);
  }
});

test('não combina chaves diferentes mesmo quando o nome é igual', () => {
  const one = invoice(10, { name: 'nota.xml', chave: 'chave-a' });
  const two = invoice(10, { name: 'nota.xml', chave: 'chave-b' });
  assert.equal(mergeInvoiceImports([one], [two]).length, 2);
});

test('duplicata antiga não apaga metadados nem valores de uma importação completa', () => {
  const full = importedInut(100);
  const old = legacyDuplicate(oldInut(100));
  const result = mergeInvoiceImports([full, old]);
  assert.equal(result[0].emitente, issuer);
  assert.equal(result[0].anoInutilizacao, '26');
});

test('documento com erro de leitura não é usado para preencher lacunas', () => {
  const invalid = { ...importedInut(100), error: 'XML inválido' };
  assert.equal(auditSequence([invoice(99), invalid, invoice(101)]).gaps[0].count, 1);
});

test('o alerta explica a presença dos mesmos números em outra série', () => {
  const notes = [invoice(23330, { serie: '4' }), invoice(23334, { serie: '4' }),
    ...[23331, 23332, 23333].map(n => invoice(n, { serie: '5', dataEmissao: '2026-07-06' }))];
  const gap = auditSequence(notes).gaps[0];
  assert.equal(gap.count, 3);
  assert.deepEqual(gap.outrasSeries.map(n => [n.numero, n.serie, n.periodo]),
    [[23331, '5', '2026-07'], [23332, '5', '2026-07'], [23333, '5', '2026-07']]);
});
