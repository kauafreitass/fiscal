import JSZip from 'jszip';

const databaseName = 'simplifica-das-xmls';

function openArchive() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('xmls');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível acessar os XMLs salvos neste navegador.'));
  });
}

export async function identifyXml(blob, name) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  return { key, name, blob };
}

export async function saveXmlDocuments(documents) {
  if (!documents.length) return;
  const db = await openArchive();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('xmls', 'readwrite');
      for (const { key, blob } of documents) transaction.objectStore('xmls').put(blob, key);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(new Error('Não foi possível salvar os XMLs. Verifique o espaço disponível no navegador e importe novamente.'));
      transaction.onerror = () => {}; // O aborto informa o erro da transação.
    });
  } finally {
    db.close();
  }
}

export async function readXmlDocuments(keys) {
  const db = await openArchive();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('xmls', 'readonly');
      const documents = new Map();
      for (const key of keys) {
        const request = transaction.objectStore('xmls').get(key);
        request.onsuccess = () => documents.set(key, request.result);
      }
      transaction.oncomplete = () => resolve(documents);
      transaction.onabort = () => reject(new Error('Não foi possível ler os XMLs salvos. Tente novamente.'));
    });
  } finally {
    db.close();
  }
}

export async function createInvoiceArchive(files, readDocuments = readXmlDocuments) {
  const invoices = files.filter(file => !file.error);
  if (!invoices.length) throw new Error('Não há notas disponíveis para exportar.');
  if (invoices.some(file => !file.xmlDocuments?.length)) {
    throw new Error('Algumas notas foram importadas antes da exportação estar disponível. Reimporte os XMLs ou ZIPs originais para exportar todas as notas.');
  }
  const references = new Map();
  for (const file of invoices) {
    for (const document of file.xmlDocuments) references.set(document.key, document);
  }
  const documents = await readDocuments([...references.keys()]);
  const zip = new JSZip();
  const names = new Set();
  for (const [key, reference] of references) {
    const blob = documents.get(key);
    if (!blob) throw new Error('Um XML original não está mais disponível neste navegador. Reimporte os ZIPs originais e tente novamente.');
    const originalName = (reference.name || 'nota.xml').split(/[\\/]/).pop().replace(/[^\p{L}\p{N}._ -]/gu, '_');
    const stem = originalName.replace(/\.xml$/i, '') || 'nota';
    let name = `${stem}.xml`;
    let suffix = 2;
    while (names.has(name.toLowerCase())) name = `${stem}-${suffix++}.xml`;
    names.add(name.toLowerCase());
    zip.file(name, await blob.arrayBuffer());
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
