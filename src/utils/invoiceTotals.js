import { mergeInvoiceImports } from './invoiceImports.js';
import { classifyInvoice, classifyReturn } from './invoiceClassification.js';

export function summarizeInvoices(files) {
  const classifiedFiles = mergeInvoiceImports(files).map(classifyInvoice);
  const validFiles = classifiedFiles.filter(f => !f.error && !f.isCancelled && !f.isDuplicada && !f.isInutilizada &&
    !f.isDevolucaoFornecedor && !f.devolucaoSemClassificacao);
  const nfesValidas = validFiles.filter(f => f.type?.includes('NF-e') && !f.isDevolucao);
  const returns = validFiles.filter(f => classifyReturn(f) === 'venda');
  const sum = (items, field) => items.reduce((total, file) => total + (file[field] || 0), 0);
  return {
    classifiedFiles, validFiles, nfesValidas,
    totalProdutosNormal: sum(nfesValidas, 'value'),
    totalProdutosDevolucao: sum(returns, 'value'),
    devolucoesComST: sum(returns, 'valorComST'),
    totalServicos: sum(validFiles.filter(f => f.type === 'NFS-e'), 'value'),
    devolucoesPendentes: classifiedFiles.filter(f => f.devolucaoSemClassificacao && !f.error && !f.isCancelled && !f.isDuplicada),
  };
}
