import { mergeInvoiceImports } from './invoiceImports.js';

const normalizeSerie = value => {
  const serie = String(value ?? '').trim();
  return /^\d+$/.test(serie) ? String(Number(serie)) : serie;
};

const monthFromDate = value => String(value ?? '').match(/^(\d{4}-(?:0[1-9]|1[0-2]))(?:-|$|T)/)?.[1] || null;

// Também atende os registros antigos do localStorage, sem exigir nova importação.
export function invoiceIdentity(file) {
  const chave = String(file.chave ?? '').trim();
  const hasKey = /^\d{44}$/.test(chave);
  const keyMonth = hasKey ? monthFromDate(`20${chave.slice(2, 4)}-${chave.slice(4, 6)}`) : null;
  return {
    periodo: monthFromDate(file.dataEmissao) || keyMonth ||
      (/^\d{2}(0[1-9]|1[0-2])$/.test(file.aamm ?? '') ? `20${file.aamm.slice(0, 2)}-${file.aamm.slice(2)}` : null),
    emitente: hasKey ? chave.slice(6, 20) : String(file.emitente ?? '').trim(),
    modelo: hasKey ? chave.slice(20, 22) : String(file.modelo ?? (file.type === 'NFS-e' ? 'NFS-e' : '')).trim(),
    serie: normalizeSerie(hasKey ? chave.slice(22, 25) : file.serie),
    numero: hasKey ? Number(chave.slice(25, 34)) : Number(file.numero),
  };
}

const groupKey = identity => JSON.stringify([identity.emitente, identity.modelo, identity.serie]);
const validNumber = value => Number.isSafeInteger(value) && value > 0;

export function auditSequence(files, referencePeriod = '') {
  const records = mergeInvoiceImports(files).filter(f => !f.error && !f.isDuplicada).map(file => ({ file, ...invoiceIdentity(file) }));
  const invoices = records.filter(r => !r.file.isInutilizada);
  const periodo = referencePeriod || invoices.map(r => r.periodo).filter(Boolean).sort().at(-1) || null;
  const groups = new Map();
  let ignoradas = 0;

  for (const record of records) {
    const { file, emitente, modelo, serie, numero } = record;
    if (!emitente || !modelo || !serie || (!file.isInutilizada && (!record.periodo || !validNumber(numero)))) {
      ignoradas++;
      continue;
    }
    const key = groupKey(record);
    if (!groups.has(key)) groups.set(key, { ...record, anchors: [], coverage: [] });
    const group = groups.get(key);
    if (file.isInutilizada) {
      // Inutilização cobre números, mas a data do protocolo não é emissão de nota.
      // Nunca pode criar os limites da sequência de um mês.
      const ano = String(file.anoInutilizacao ?? '').replace(/^(\d{2})$/, '20$1');
      const start = Number(file.numeroIni);
      const end = Number(file.numeroFin);
      if (!ano || !validNumber(start) || !validNumber(end) || end < start) {
        ignoradas++;
      } else if (ano === periodo?.slice(0, 4)) {
        group.coverage.push([start, end]);
      }
      continue;
    }
    // Notas conhecidas de outro mês podem explicar um número intermediário,
    // mas somente as emissões do mês auditado delimitam a busca.
    group.coverage.push([numero, numero]);
    if (record.periodo === periodo) group.anchors.push(record);
  }

  const gaps = [];
  let gruposAuditados = 0;
  for (const group of groups.values()) {
    group.anchors.sort((a, b) => a.numero - b.numero);
    const first = group.anchors[0];
    const last = group.anchors.at(-1);
    if (!first || first.numero === last.numero) continue;
    gruposAuditados++;
    const ranges = [];
    let cursor = first.numero;
    // Trabalha com intervalos, sem expandir milhares/milhões de números.
    for (const [start, end] of group.coverage.sort((a, b) => a[0] - b[0])) {
      if (end < cursor) continue;
      if (start > last.numero) break;
      if (start > cursor) ranges.push([cursor, start - 1]);
      cursor = Math.max(cursor, end + 1);
      if (cursor > last.numero) break;
    }
    if (ranges.length) {
      const label = group.modelo === '55' ? 'NF-e' : group.modelo === '65' ? 'NFC-e' : group.modelo;
      gaps.push({
        group: `${label} - Série ${group.serie}`,
        serie: group.serie,
        emitente: group.emitente,
        periodo,
        missing: ranges.map(([start, end]) => start === end ? `${start}` : `${start} a ${end}`).join(', '),
        count: ranges.reduce((sum, [start, end]) => sum + end - start + 1, 0),
        primeira: first.numero,
        ultima: last.numero,
        outrasSeries: records.filter(r => !r.file.isInutilizada && r.emitente === group.emitente &&
          r.modelo === group.modelo && r.serie !== group.serie &&
          ranges.some(([start, end]) => r.numero >= start && r.numero <= end))
          .map(r => ({ numero: r.numero, serie: r.serie, periodo: r.periodo })),
      });
    }
  }
  return { gaps, periodo, ignoradas, gruposAuditados };
}
