const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function filterInvoices(files, query) {
  const terms = normalize(query).split(/[,;\n]+/).map(term => term.trim()).filter(Boolean);
  if (!terms.length) return files;
  return files.filter(file => terms.some(term => {
    // Números são exatos: buscar 123 não inclui 1234 ou uma chave que contenha 123.
    if (/^\d+$/.test(term)) {
      const number = Number(term);
      if (file.isInutilizada && file.numeroIni != null && file.numeroFin != null) {
        return number >= Number(file.numeroIni) && number <= Number(file.numeroFin);
      }
      return file.numero != null && Number(file.numero) === number;
    }
    return [file.name, file.type, file.error, file.naturezaOperacao, file.chave]
      .some(value => normalize(value).includes(term));
  }));
}
