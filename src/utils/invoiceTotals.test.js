import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseInvoiceXml } from './xmlParser.js';
import { mergeInvoiceImports } from './invoiceImports.js';
import { summarizeInvoices } from './invoiceTotals.js';
import { auditSequence } from './sequenceAudit.js';
import { calcularDasComST } from './simplesNacional.js';

globalThis.DOMParser = DOMParser;
const key = (number = 23326, serie = 4) => `3526081111111100019155${String(serie).padStart(3, '0')}${String(number).padStart(9, '0')}1123456789`;
const xml = ({ numero = 23326, tpNF = '1', finalidade = '4', natureza = 'Devolucao de Mercadorias para fornecedor (Saida)', value = 14878.10 } = {}) =>
  `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key(numero)}"><ide><nNF>${numero}</nNF><serie>4</serie><mod>55</mod><dhEmi>2026-08-03T12:23:57-03:00</dhEmi><tpNF>${tpNF}</tpNF><finNFe>${finalidade}</finNFe><natOp>${natureza}</natOp></ide><emit><CNPJ>11111111000191</CNPJ></emit><det><prod><vProd>${value}</vProd></prod><imposto><ICMS><ICMSSN500><CSOSN>500</CSOSN></ICMSSN500></ICMS></imposto></det><total><ICMSTot><vNF>${value}</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${key(numero)}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const event = ({ chave = key(), status = '135', tipo = '110111', description = 'Cancelamento', batch = false } = {}) => {
  const body = `<procEventoNFe><evento><infEvento><chNFe>${chave}</chNFe><tpEvento>${tipo}</tpEvento><detEvento><descEvento>${description}</descEvento></detEvento></infEvento></evento><retEvento><infEvento><chNFe>${chave}</chNFe><tpEvento>${tipo}</tpEvento><cStat>${status}</cStat></infEvento></retEvento></procEventoNFe>`;
  return batch ? `<retEnvEvento><cStat>128</cStat>${body}</retEnvEvento>` : body;
};
const parse = source => ({ ...parseInvoiceXml(source), id: crypto.randomUUID() });
const sale = () => parse(xml({ numero: 23325, finalidade: '1', natureza: 'Venda', value: 20000 }));
const customerReturn = () => parse(xml({ tpNF: '0', natureza: 'Devolucao de venda', value: 1000 }));

test('devolução ao fornecedor de saída não abate receita nem parcela de ST', () => {
  const supplierReturn = parse(xml());
  assert.equal(supplierReturn.isDevolucaoFornecedor, true);
  assert.equal(supplierReturn.value, 14878.10);
  const totals = summarizeInvoices([sale(), supplierReturn]);
  assert.equal(totals.totalProdutosNormal, 20000);
  assert.equal(totals.totalProdutosDevolucao, 0);
  assert.equal(totals.devolucoesComST, 0);
  assert.equal(totals.nfesValidas.length, 1);
  assert.match(totals.classifiedFiles[1].type, /sem abatimento/);
});

test('nota 023326 e seu cancelamento têm efeito zero em qualquer ordem e reimportação', () => {
  const note = parse(xml());
  const cancellation = parse(event());
  for (const records of [[note, cancellation], [cancellation, note], [note, cancellation, note]]) {
    const merged = mergeInvoiceImports(records);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].isCancelled, true);
    assert.equal(merged[0].value, 0);
    assert.equal(merged[0].isDevolucao, false);
    const totals = summarizeInvoices([sale(), ...records]);
    assert.equal(totals.totalProdutosDevolucao, 0);
    assert.equal(totals.devolucoesComST, 0);
    assert.equal(totals.totalProdutosNormal, 20000);
    const das = calcularDasComST(100000, 'anexo1', totals.totalProdutosNormal - totals.totalProdutosDevolucao,
      totals.nfesValidas.reduce((sum, f) => sum + f.valorComST, 0) - totals.devolucoesComST);
    assert.equal(das.valorDas, 528);
  }
});

test('cancelamento salvo como duplicata cancela também a nota original no cache', () => {
  const legacy = { ...customerReturn(), tpNF: undefined, naturezaOperacao: undefined, finNFe: undefined };
  const cancellation = { ...parse(event()), type: 'Nota Duplicada', isDuplicada: true, error: 'Esta nota já foi processada.' };
  const totals = summarizeInvoices(JSON.parse(JSON.stringify([legacy, cancellation])));
  assert.equal(totals.classifiedFiles.length, 1);
  assert.equal(totals.classifiedFiles[0].type, 'Cancelada');
  assert.equal(totals.totalProdutosDevolucao, 0);
  assert.equal(totals.devolucoesPendentes.length, 0);
});

test('devolução de venda de entrada autorizada continua sendo abatida', () => {
  const totals = summarizeInvoices([sale(), customerReturn()]);
  assert.equal(totals.totalProdutosNormal, 20000);
  assert.equal(totals.totalProdutosDevolucao, 1000);
  assert.equal(totals.devolucoesComST, 1000);
});

test('cancelamento de devolução de venda também remove o abatimento', () => {
  const totals = summarizeInvoices([sale(), customerReturn(), parse(event())]);
  assert.equal(totals.totalProdutosDevolucao, 0);
  assert.equal(totals.devolucoesComST, 0);
});

test('cancelamento usa o status do evento mesmo com status 128 do lote antes dele', () => {
  assert.equal(parse(event({ batch: true })).isCancelled, true);
  assert.equal(parse(event({ status: '155' })).isCancelled, true);
});

test('evento rejeitado ou carta de correção não cancela a nota', () => {
  const rejected = xml().replace('</nfeProc>', `${event({ status: '420' })}</nfeProc>`);
  const correction = xml().replace('</nfeProc>', `${event({ tipo: '110110', description: 'Carta de Correcao' })}</nfeProc>`);
  assert.equal(parse(rejected).isCancelled, false);
  assert.equal(parse(correction).isCancelled, false);
  const mixed = xml().replace('</nfeProc>', `${event({ status: '420' })}${event({ tipo: '110110', description: 'Carta de Correcao' })}</nfeProc>`);
  assert.equal(parse(mixed).isCancelled, false);
});

test('mesmo número em outra série não é cancelado por engano', () => {
  const totals = summarizeInvoices([customerReturn(), parse(event({ chave: key(23326, 5) }))]);
  assert.equal(totals.totalProdutosDevolucao, 1000);
});

test('nota cancelada continua cobrindo o número na auditoria', () => {
  const notes = [sale(), parse(xml()), parse(event()), parse(xml({ numero: 23327 }))];
  assert.deepEqual(auditSequence(notes).gaps, []);
});

test('cache sem tipo de devolução não é abatido até a reimportação esclarecer entrada/saída', () => {
  const legacy = { id: 'legacy', chave: key(), numero: 23326, type: 'Devolução (NF-e)', isDevolucao: true, value: 1000 };
  assert.equal(summarizeInvoices([legacy]).totalProdutosDevolucao, 0);
  assert.equal(summarizeInvoices([legacy]).devolucoesPendentes.length, 1);
  const updated = mergeInvoiceImports([legacy], [customerReturn()]);
  assert.equal(summarizeInvoices(updated).totalProdutosDevolucao, 1000);
  assert.equal(summarizeInvoices(updated).devolucoesPendentes.length, 0);
});
