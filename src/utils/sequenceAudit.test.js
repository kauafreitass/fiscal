import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSequence, invoiceIdentity } from './sequenceAudit.js';

const invoice = (numero, overrides = {}) => ({
  numero, serie: '5', modelo: '55', emitente: '11111111000191',
  dataEmissao: '2026-08-01T00:00:00-03:00', type: 'NF-e/NFC-e', ...overrides,
});
const inut = (start, end, overrides = {}) => invoice(start, {
  isInutilizada: true, numeroIni: start, numeroFin: end,
  anoInutilizacao: '26', dataEmissao: null, ...overrides,
});

test('os três exemplos pertencem a julho e à série 5, inclusive no cache antigo', () => {
  const keys = [
    '35260730299857000115550050000233311243496270',
    '35260730299857000115550050000233321950161564',
    '35260730299857000115550050000233331984970365',
  ];
  const files = keys.map(chave => ({ chave, type: 'NF-e/NFC-e', serie: '4' }));
  assert.deepEqual(files.map(invoiceIdentity), [23331, 23332, 23333].map(numero => ({
    periodo: '2026-07', emitente: '30299857000115', modelo: '55', serie: '5', numero,
  })));
  assert.equal(auditSequence(files, '2026-08').gruposAuditados, 0);
  assert.deepEqual(auditSequence(files, '2026-07').gaps, []);
});

test('não cria uma lacuna entre julho e agosto', () => {
  const result = auditSequence([
    invoice(23330, { dataEmissao: '2026-07-31' }), invoice(26059), invoice(26060),
  ]);
  assert.equal(result.periodo, '2026-08');
  assert.deepEqual(result.gaps, []);
});

test('inutilização antiga não cria as 3971 faltas anteriores à primeira nota de agosto', () => {
  const result = auditSequence([
    inut(375450, 375452, { serie: '2', aamm: '2608' }),
    invoice(379424, { serie: '2' }), invoice(379425, { serie: '2' }),
  ]);
  assert.deepEqual(result.gaps, []);
});

test('inutilizações sem metadados no cache não ancoram a sequência', () => {
  const result = auditSequence([
    { isInutilizada: true, numero: 375452, numeroIni: 375452, numeroFin: 375452, serie: '2' },
    invoice(379424, { serie: '2' }), invoice(379425, { serie: '2' }),
  ]);
  assert.deepEqual(result.gaps, []);
  assert.equal(result.ignoradas, 1);
});

test('série 5 não preenche os mesmos números da série 4', () => {
  const result = auditSequence([
    invoice(23329, { serie: '4' }), invoice(23330, { serie: '4' }), invoice(23334, { serie: '4' }),
    ...[23331, 23332, 23333].map(n => invoice(n, { dataEmissao: '2026-07-06' })),
  ]);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].group, 'NF-e - Série 4');
  assert.equal(result.gaps[0].missing, '23331 a 23333');
  assert.equal(result.gaps[0].count, 3);
});

test('emissões conhecidas de outro mês explicam números dentro da mesma sequência', () => {
  assert.deepEqual(auditSequence([
    invoice(100), invoice(102), invoice(101, { dataEmissao: '2026-07-31' }),
  ]).gaps, []);
});

test('emitentes e modelos diferentes não ampliam nem preenchem a sequência', () => {
  const result = auditSequence([
    invoice(100), invoice(102),
    invoice(101, { emitente: '22222222000191' }),
    invoice(90000, { modelo: '65' }),
  ]);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].missing, '101');
});

test('data de emissão tem prioridade sem conversão de fuso na virada do mês', () => {
  const record = invoice(1, {
    chave: '35260730299857000115550050000233311243496270',
    dataEmissao: '2026-08-31T23:59:59-03:00',
  });
  assert.equal(invoiceIdentity(record).periodo, '2026-08');
});

test('seleção explícita e virada de ano não dependem da ordem dos arquivos', () => {
  const files = [invoice(10, { dataEmissao: '2025-12-31' }), invoice(11, { dataEmissao: '2026-01-01' })];
  assert.equal(auditSequence(files).periodo, '2026-01');
  assert.equal(auditSequence(files, '2025-12').periodo, '2025-12');
  assert.deepEqual(auditSequence(files, '2026-08').gaps, []);
});

test('canceladas, devoluções e remessas cobrem numeração; duplicadas não ampliam limites', () => {
  const result = auditSequence([
    invoice(1), invoice(2, { isCancelled: true }), invoice(3, { isDevolucao: true }),
    invoice(4, { isRemessa: true }), invoice(5), invoice(900, { isDuplicada: true }),
    invoice(800, { error: 'XML inválido' }),
  ]);
  assert.deepEqual(result.gaps, []);
});

test('inutilização cobre apenas a série, emitente, modelo e ano identificados', () => {
  const files = [invoice(10), invoice(15)];
  assert.deepEqual(auditSequence([...files, inut(11, 14)]).gaps, []);
  for (const override of [{ serie: '4' }, { emitente: '22222222000191' }, { modelo: '65' }, { anoInutilizacao: '25' }]) {
    assert.equal(auditSequence([...files, inut(11, 14, override)]).gaps[0].count, 4);
  }
});

test('inutilizações sozinhas não definem mês nem geram faltas', () => {
  const result = auditSequence([inut(1, 10, { aamm: '2609' }), inut(20, 30)]);
  assert.equal(result.periodo, null);
  assert.deepEqual(result.gaps, []);
});

test('intervalos extensos são contados sem enumerar cada número', () => {
  const result = auditSequence([invoice(1), invoice(999999999), inut(5, 999999995)]);
  assert.equal(result.gaps[0].missing, '2 a 4, 999999996 a 999999998');
  assert.equal(result.gaps[0].count, 6);
});

test('normaliza série e informa dados insuficientes sem misturar notas sem data', () => {
  const result = auditSequence([
    invoice(1, { serie: '005' }), invoice(2, { serie: ' 5 ' }),
    invoice(800, { dataEmissao: null }),
  ]);
  assert.deepEqual(result.gaps, []);
  assert.equal(result.ignoradas, 1);
  assert.equal(result.gruposAuditados, 1);
});
