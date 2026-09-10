const duplicateError = 'Esta nota já foi processada.';
const usable = file => !file.error || (file.isDuplicada && file.error === duplicateError);
const normalized = value => String(value ?? '').trim();
const numeric = value => /^\d+$/.test(normalized(value)) ? String(Number(value)) : normalized(value);
const year = value => normalized(value).replace(/^(\d{2})$/, '20$1');
const kind = file => file.isInutilizada ? 'inut' : file.isCancelled ? 'cancelamento' : 'nota';

function documentKey(file) {
  if (file.isInutilizada) {
    const fields = [normalized(file.emitente), normalized(file.modelo), numeric(file.serie),
      year(file.anoInutilizacao), numeric(file.numeroIni), numeric(file.numeroFin)];
    return fields.every(Boolean) ? JSON.stringify(['inut', ...fields]) : null;
  }
  const chave = normalized(file.chave);
  // Nota e evento de cancelamento representam a mesma NF-e.
  return chave ? JSON.stringify([/^\d{44}$/.test(chave) ? 'NFe' : kind(file), chave]) : null;
}

function compatibleLegacyRecord(a, b) {
  if (kind(a) !== kind(b)) return false;
  if (a.chave && b.chave && normalized(a.chave) !== normalized(b.chave)) return false;
  const fields = ['emitente', 'modelo', 'serie', 'anoInutilizacao', 'numero', 'numeroIni', 'numeroFin'];
  return fields.every(field => {
    const normalize = field === 'anoInutilizacao' ? year : numeric;
    const left = normalize(a[field]);
    const right = normalize(b[field]);
    return !left || !right || left === right;
  });
}

function mergeRecord(previous, incoming) {
  // Duplicatas antigas perderam o tipo original na interface. Aproveitamos seus
  // metadados novos sem substituir valores e classificação da nota principal.
  const merged = incoming.isDuplicada
    ? { ...previous }
    : { ...previous, ...incoming, id: previous.id, isDuplicada: false, error: null };
  for (const field of ['emitente', 'modelo', 'serie', 'anoInutilizacao', 'dataEmissao', 'aamm', 'numero', 'numeroIni', 'numeroFin', 'tpNF', 'finNFe', 'naturezaOperacao']) {
    merged[field] = incoming[field] ?? previous[field];
  }
  if (previous.isCancelled || incoming.isCancelled) {
    Object.assign(merged, {
      type: 'Cancelada', isCancelled: true, isDevolucao: false, isRemessa: false,
      isDevolucaoFornecedor: false, devolucaoSemClassificacao: false,
      isDuplicada: false, error: null, value: 0, valorComST: 0, valorSemST: 0,
      itensComST: 0, itensSemST: 0, csosns: [],
    });
  }
  return merged;
}

// Reimportar atualiza o documento existente. Também recupera os metadados das
// reimportações que a versão antiga já salvou como "Nota Duplicada".
export function mergeInvoiceImports(existing, incoming = []) {
  const result = [];
  const byKey = new Map();
  const byName = new Map();
  for (const file of [...existing, ...incoming]) {
    if (!usable(file)) {
      result.push(file);
      continue;
    }
    const key = documentKey(file);
    let index = key ? byKey.get(key) : undefined;
    if (index === undefined && file.name) {
      const candidates = (byName.get(file.name) || []).filter(i => {
        const candidate = result[i];
        // Nome é fallback apenas para o cache antigo sem identificação completa.
        return (!key || !documentKey(candidate)) && compatibleLegacyRecord(candidate, file);
      });
      if (candidates.length === 1) index = candidates[0];
    }
    if (index === undefined) {
      index = result.length;
      result.push(file);
    } else {
      result[index] = mergeRecord(result[index], file);
    }
    const mergedKey = documentKey(result[index]);
    if (mergedKey) byKey.set(mergedKey, index);
    if (file.name) {
      const indices = byName.get(file.name) || [];
      if (!indices.includes(index)) indices.push(index);
      byName.set(file.name, indices);
    }
  }
  return result;
}
