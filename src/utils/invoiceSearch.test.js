import test from 'node:test';
import assert from 'node:assert/strict';
import { filterInvoices } from './invoiceSearch.js';

const files = [
  { id: 'a', numero: 123, serie: '1', name: 'nota.xml', type: 'NF-e' },
  { id: 'b', numero: 456, name: 'outra.xml', naturezaOperacao: 'Devolução de venda' },
  { id: 'c', numero: 1234, name: '1234.xml', chave: '123456789' },
  { id: 'd', numero: 123, serie: '2', name: 'outra-serie.xml' },
];
const ids = query => filterInvoices(files, query).map(file => file.id);

test('busca números separados por vírgula com correspondência exata e todas as séries', () => {
  assert.deepEqual(ids('000123, 456'), ['a', 'b', 'd']);
  assert.deepEqual(ids('123'), ['a', 'd']);
  assert.deepEqual(ids('999'), []);
});

test('aceita ponto e vírgula e linhas, ignora vazios e não duplica resultados', () => {
  assert.deepEqual(ids('123;\n456,123, ;'), ['a', 'b', 'd']);
  assert.deepEqual(ids(' , ;\n '), ['a', 'b', 'c', 'd']);
});

test('preserva busca textual sem acentos e permite combinar números com texto', () => {
  assert.deepEqual(ids('devolucao'), ['b']);
  assert.deepEqual(ids('123, devolucao'), ['a', 'b', 'd']);
  assert.deepEqual(ids('NF-e'), ['a']);
});

test('encontra inutilização que cobre o número procurado', () => {
  const inut = { numero: 10, isInutilizada: true, numeroIni: 10, numeroFin: 20 };
  assert.deepEqual(filterInvoices([inut, { name: '15.xml' }], '15'), [inut]);
});
