import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createInvoiceArchive, identifyXml } from './invoiceArchive.js';
import { mergeInvoiceImports } from './invoiceImports.js';

const document = async (text, name = 'nota.xml') => identifyXml(new Blob([text]), name);
const invoice = (key, documents, extra = {}) => ({
  id: key, chave: key, type: 'NF-e/NFC-e', value: 100,
  xmlDocuments: documents.map(({ key, name }) => ({ key, name })), ...extra,
});
const reader = documents => async keys => new Map(documents.filter(doc => keys.includes(doc.key)).map(doc => [doc.key, doc.blob]));

test('exporta XMLs originais sem perda de bytes e sem sobrescrever nomes iguais de ZIPs diferentes', async () => {
  const documents = [await document('<NFe>primeira</NFe>'), await document('<NFe>segunda</NFe>')];
  const files = documents.map((doc, index) => invoice(`chave-${index}`, [doc]));
  const archive = await JSZip.loadAsync(await createInvoiceArchive(files, reader(documents)));
  assert.deepEqual(Object.keys(archive.files), ['nota.xml', 'nota-2.xml']);
  for (const [index, entry] of Object.values(archive.files).entries()) {
    assert.deepEqual(await entry.async('uint8array'), new Uint8Array(await documents[index].blob.arrayBuffer()));
  }
});

test('reimportação mantém nota e evento de cancelamento, exportando cada XML uma só vez após restaurar o cache', async () => {
  const documents = [await document('<NFe/>'), await document('<cancelamento/>', 'evento.xml')];
  const key = '35260811111111000191550020003797131123456789';
  const sale = invoice(key, [documents[0]]);
  const cancelled = invoice(key, [documents[1]], { isCancelled: true });
  const merged = mergeInvoiceImports([sale], [cancelled, sale]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].isCancelled, true);
  assert.equal(merged[0].xmlDocuments.length, 2);
  const restored = JSON.parse(JSON.stringify(merged));
  const archive = await JSZip.loadAsync(await createInvoiceArchive(restored, reader(documents)));
  assert.equal(Object.keys(archive.files).length, 2);
});

test('exporta apenas as notas selecionadas e inclui inutilização', async () => {
  const documents = [await document('<NFe/>'), await document('<inutNFe/>', 'inutilizacao.xml')];
  const selected = invoice('inut', [documents[1]], { isInutilizada: true });
  const archive = await JSZip.loadAsync(await createInvoiceArchive([selected], reader(documents)));
  assert.deepEqual(Object.keys(archive.files), ['inutilizacao.xml']);
});

test('impede ZIP incompleto quando há cache antigo ou XML removido do armazenamento', async () => {
  const doc = await document('<NFe/>');
  const complete = invoice('nova', [doc]);
  await assert.rejects(createInvoiceArchive([complete, { id: 'antiga' }], reader([doc])), /Reimporte/);
  await assert.rejects(createInvoiceArchive([complete], reader([])), /Reimporte/);
  await assert.rejects(createInvoiceArchive([{ error: 'XML inválido' }], reader([])), /Não há notas/);
});

test('mantém XML em codificação original e evita nomes de caminho dentro do ZIP', async () => {
  const blob = new Blob([new Uint8Array([0x3c, 0x61, 0x3e, 0xe7, 0x3c, 0x2f, 0x61, 0x3e])]);
  const doc = await identifyXml(blob, '../../nota.xml');
  const archive = await JSZip.loadAsync(await createInvoiceArchive([invoice('a', [doc])], reader([doc])));
  assert.deepEqual(Object.keys(archive.files), ['nota.xml']);
  assert.deepEqual(await archive.file('nota.xml').async('uint8array'), new Uint8Array(await blob.arrayBuffer()));
});
