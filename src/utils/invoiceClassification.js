const plainText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function classifyReturn(file) {
  const operation = plainText(file.naturezaOperacao);
  const isReturn = file.isDevolucao || String(file.finNFe ?? '') === '4' || operation.includes('devolu');
  if (!isReturn) return null;
  // Uma saída de devolução ao fornecedor não estorna receita de venda.
  if (file.isDevolucaoFornecedor || operation.includes('fornecedor') || String(file.tpNF ?? '') === '1') return 'fornecedor';
  if (String(file.tpNF ?? '') === '0' || operation.includes('devolucao de venda')) return 'venda';
  return 'nao_identificada';
}

export function classifyInvoice(file) {
  if (file.isCancelled || file.isInutilizada || file.error || file.isDuplicada) return file;
  const returnType = classifyReturn(file);
  if (!returnType) return file;
  return {
    ...file,
    isDevolucao: true,
    isDevolucaoFornecedor: returnType === 'fornecedor',
    devolucaoSemClassificacao: returnType === 'nao_identificada',
    type: returnType === 'fornecedor' ? 'Devolução ao fornecedor (sem abatimento)'
      : returnType === 'venda' ? 'Devolução de venda (NF-e)' : 'Devolução: reimporte o XML para identificar o tipo',
  };
}
