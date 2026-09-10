import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { parseInvoiceXml } from './utils/xmlParser';
import { auditSequence } from './utils/sequenceAudit';
import { mergeInvoiceImports } from './utils/invoiceImports';
import { calcularSimplesNacional, calcularDasComST } from './utils/simplesNacional';
import './index.css';

function App() {
  const [files, setFiles] = useState(() => {
    const saved = localStorage.getItem('das_files');
    return saved ? mergeInvoiceImports(JSON.parse(saved)) : [];
  });
  const [rbt12, setRbt12] = useState(() => {
    const saved = localStorage.getItem('das_rbt12');
    return saved ? parseFloat(saved) : 0;
  });
  const [anexo, setAnexo] = useState(() => {
    const saved = localStorage.getItem('das_anexo');
    return saved || 'anexo1';
  });
  const [anexoServicos, setAnexoServicos] = useState(() => {
    const saved = localStorage.getItem('das_anexo_servicos');
    return saved || 'anexo3';
  });
  const [periodoRef, setPeriodoRef] = useState(() => {
    return localStorage.getItem('das_periodo_ref') || '';
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);
  const dirInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('das_files', JSON.stringify(files));
    localStorage.setItem('das_rbt12', rbt12);
    localStorage.setItem('das_anexo', anexo);
    localStorage.setItem('das_anexo_servicos', anexoServicos);
    localStorage.setItem('das_periodo_ref', periodoRef);
  }, [files, rbt12, anexo, anexoServicos, periodoRef]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Helper: processa o texto de um XML e empurra resultado para newFiles
  const processXmlText = (text, name, newFiles) => {
    try {
      const data = parseInvoiceXml(text);
      newFiles.push({
        id: crypto.randomUUID(),
        name,
        type: data.type,
        value: data.value,
        valorComST: data.valorComST || 0,
        valorSemST: data.valorSemST || 0,
        itensComST: data.itensComST || 0,
        itensSemST: data.itensSemST || 0,
        csosns: data.csosns || [],
        isCancelled: data.isCancelled,
        isDevolucao: data.isDevolucao,
        isRemessa: data.isRemessa,
        isInutilizada: data.isInutilizada || false,
        isDuplicada: false,
        chave: data.chave,
        aamm: data.aamm || null,
        dataEmissao: data.dataEmissao || null,
        emitente: data.emitente || null,
        modelo: data.modelo || null,
        anoInutilizacao: data.anoInutilizacao || null,
        numero: data.numero,
        numeroIni: data.numeroIni || null,
        numeroFin: data.numeroFin || null,
        serie: data.serie,
        error: null,
      });
    } catch (err) {
      newFiles.push({ id: crypto.randomUUID(), name, error: err.message || 'Erro ao ler o arquivo.' });
    }
  };

  // Helper: extrai todos os XMLs de um JSZip (recursivo para ZIPs dentro de ZIPs)
  const extractZipEntries = async (zip, newFiles) => {
    const promises = [];
    zip.forEach((relativePath, entry) => {
      if (entry.dir) return;
      const lowerPath = relativePath.toLowerCase();
      if (lowerPath.endsWith('.xml')) {
        promises.push(
          entry.async('text').then(text => {
            const name = relativePath.split('/').pop();
            processXmlText(text, name, newFiles);
          })
        );
      } else if (lowerPath.endsWith('.zip')) {
        // ZIP aninhado: extrai como ArrayBuffer e processa recursivamente
        promises.push(
          entry.async('arraybuffer').then(async (buf) => {
            try {
              const innerZip = await JSZip.loadAsync(buf);
              await extractZipEntries(innerZip, newFiles);
            } catch {
              const name = relativePath.split('/').pop();
              newFiles.push({ id: crypto.randomUUID(), name, error: 'Erro ao descompactar ZIP interno.' });
            }
          })
        );
      }
    });
    await Promise.all(promises);
  };

  const processFiles = async (fileList) => {
    setIsProcessing(true);

    const newFiles = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

      if (isZip) {
        try {
          const zip = await JSZip.loadAsync(file);
          await extractZipEntries(zip, newFiles);
        } catch {
          newFiles.push({ id: crypto.randomUUID(), name: file.name, error: 'Erro ao descompactar arquivo ZIP.' });
        }
      } else if (file.type === 'text/xml' || file.name.endsWith('.xml')) {
        const text = await file.text();
        processXmlText(text, file.name, newFiles);
      } else {
        newFiles.push({ id: crypto.randomUUID(), name: file.name, error: 'Apenas arquivos XML ou ZIP são permitidos.' });
      }
    }

    setFiles((prev) => mergeInvoiceImports(prev, newFiles));
    setIsProcessing(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = null;
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFiles = () => {
    if (window.confirm("Deseja realmente limpar todos os arquivos?")) {
      setFiles([]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const audit = auditSequence(files, periodoRef);
  const { gaps } = audit;
  const auditPeriodLabel = audit.periodo ? audit.periodo.split('-').reverse().join('/') : null;
  const validFiles = files.filter((f) => !f.error && !f.isCancelled && !f.isDuplicada && !f.isInutilizada);
  
  const totalProdutosNormal = validFiles.filter(f => f.type.includes('NF-e') && !f.isDevolucao).reduce((acc, f) => acc + f.value, 0);
  const totalProdutosDevolucao = validFiles.filter(f => f.isDevolucao).reduce((acc, f) => acc + f.value, 0);
  
  const totalProdutos = totalProdutosNormal - totalProdutosDevolucao;
  const totalServicos = validFiles.filter(f => f.type.includes('NFS-e')).reduce((acc, f) => acc + f.value, 0);
  
  const totalFaturamento = Math.max(0, totalProdutos + totalServicos);

  // --- Cálculo separado: Produtos (NF-e) ---
  const aliquotaProdutos = calcularSimplesNacional(rbt12, anexo);
  const receitaProdutosBase = Math.max(0, totalProdutos);

  // Segregar receita com ST e sem ST
  const nfesValidas = validFiles.filter(f => f.type.includes('NF-e') && !f.isDevolucao);
  const totalComST = nfesValidas.reduce((acc, f) => acc + (f.valorComST || 0), 0);
  const totalSemST = nfesValidas.reduce((acc, f) => acc + (f.valorSemST || 0), 0);
  
  // Devoluções de ST também devem ser abatidas
  const devolucoesComST = validFiles.filter(f => f.isDevolucao).reduce((acc, f) => acc + (f.valorComST || 0), 0);
  const receitaComSTLiquida = Math.max(0, totalComST - devolucoesComST);

  // DAS de Produtos com dedução de ICMS-ST
  const dasCalcProdutos = calcularDasComST(rbt12, anexo, receitaProdutosBase, receitaComSTLiquida);

  // --- Cálculo separado: Serviços (NFS-e) ---
  const aliquotaServicos = calcularSimplesNacional(rbt12, anexoServicos);
  const valorDasServicos = totalServicos * aliquotaServicos;

  // --- Totais combinados ---
  const valorDasTotal = Math.round((dasCalcProdutos.valorDas + Math.max(0, valorDasServicos)) * 100) / 100;

  // Contagem de itens com ST
  const totalItensComST = nfesValidas.reduce((acc, f) => acc + (f.itensComST || 0), 0);
  const totalItensSemST = nfesValidas.reduce((acc, f) => acc + (f.itensSemST || 0), 0);

  // CSOSNs encontrados em todas as notas
  const todosCSOs = new Set();
  nfesValidas.forEach(f => (f.csosns || []).forEach(c => todosCSOs.add(c)));
  const csosnsUnicos = Array.from(todosCSOs).sort();

  const grossTotal = totalProdutosNormal + totalServicos;
  const pctProdutos = grossTotal > 0 ? (totalProdutosNormal / grossTotal) * 100 : 0;
  const pctServicos = grossTotal > 0 ? (totalServicos / grossTotal) * 100 : 0;

  // Nomes amigáveis dos anexos
  const nomeAnexo = { anexo1: 'Anexo I', anexo2: 'Anexo II', anexo3: 'Anexo III', anexo4: 'Anexo IV', anexo5: 'Anexo V' };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatPercent = (value) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  return (
    <div className="app-container">
      <div className="header-actions">
        <div>
          <h1 className="title">Simplifica DAS</h1>
          <p className="subtitle">Simples Nacional - Apuração Mensal</p>
        </div>
        <button className="btn" onClick={handlePrint} title="Imprimir Relatório ou Salvar como PDF">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
          </svg>
          Exportar PDF
        </button>
      </div>

      <div className="main-content">
        <div className="glass-panel">
          <div className={`dropzone ${isDragging ? 'active' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current.click()}>
            {isProcessing ? (
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'}}>
                <div className="spinner" style={{width: '40px', height: '40px', border: '4px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%', animation: 'spin 1s linear infinite'}}></div>
                <p>Processando centenas de arquivos, aguarde...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <>
                <svg className="dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>Arraste arquivos XML ou ZIP contendo suas notas</p>
                <p>ou <span className="highlight">clique para selecionar</span></p>
              </>
            )}
            <input type="file" multiple accept=".xml,text/xml,.zip,application/zip" ref={fileInputRef} onChange={handleFileInput} style={{display: 'none'}} />
          </div>
          
          <div style={{textAlign: 'center', marginTop: '1rem'}}>
            <button className="btn btn-outline" style={{width: '100%'}} onClick={() => dirInputRef.current.click()}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '0.5rem'}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
              </svg>
              Selecione uma Pasta Completa
            </button>
            <input type="file" webkitdirectory="true" directory="true" multiple ref={dirInputRef} onChange={handleFileInput} style={{display: 'none'}} />
          </div>

          <div className="file-list-container">
            <h3 className="file-list-title">
              Arquivos Processados
              {files.length > 0 && (
                <button className="btn btn-outline" style={{padding: '0.35rem 0.75rem', fontSize: '0.75rem'}} onClick={clearAllFiles}>
                  Limpar Todos
                </button>
              )}
            </h3>

            {files.length === 0 ? (
              <div className="empty-state">Nenhum arquivo enviado ainda.</div>
            ) : (
              <ul className="file-list">
                {files.map((file) => (
                  <li key={file.id} className={`file-item ${file.error ? 'error' : ''} ${file.isCancelled ? 'cancelled' : ''} ${file.isDevolucao ? 'devolucao' : ''} ${file.isRemessa ? 'remessa' : ''} ${file.isDuplicada ? 'duplicada' : ''} ${file.isInutilizada ? 'inutilizada' : ''}`}>
                    <div className="file-info">
                      <span className="file-name" title={file.name}>
                        {file.numero && <span style={{color: 'var(--text-secondary)', marginRight: '0.25rem'}}>#{file.isInutilizada && file.numeroFin > file.numeroIni ? `${file.numeroIni}-${file.numeroFin}` : file.numero}</span>}
                        {file.name}
                      </span>
                      <span className="file-type">
                      {file.error ? file.error : file.type}
                      {file.itensComST > 0 && !file.error && <span className="badge-st">ST</span>}
                      {file.csosns && file.csosns.length > 0 && !file.error && (
                        <span className="badge-csosn">CSOSN: {file.csosns.join(', ')}</span>
                      )}
                    </span>
                    </div>
                    <div className="file-actions">
                      {!file.error && !file.isCancelled && !file.isInutilizada && (
                        <span className="file-value" style={{ marginRight: '1rem' }}>
                          {file.isDevolucao ? '-' : ''}{formatCurrency(file.value)}
                        </span>
                      )}
                      {file.isCancelled && (
                        <span className="file-value" style={{ marginRight: '1rem' }}>Cancelada</span>
                      )}
                      {file.isInutilizada && (
                        <span className="file-value" style={{ marginRight: '1rem' }}>Inutilizada</span>
                      )}
                      <button className="remove-btn" onClick={() => removeFile(file.id)} title="Remover arquivo">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="glass-panel">
          <div className="settings-panel">
            <div className="input-group">
              <label htmlFor="rbt12">Receita Bruta 12 Meses (RBT12)</label>
              <div className="input-wrapper">
                <span className="input-prefix">R$</span>
                <input id="rbt12" className="with-prefix" type="number" min="0" step="0.01" value={rbt12} onChange={(e) => setRbt12(parseFloat(e.target.value) || 0)} placeholder="0.00" />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="periodoRef">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{verticalAlign: 'middle', marginRight: '0.3rem'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                Mês de Referência da Auditoria
              </label>
              <div className="input-wrapper" style={{position: 'relative'}}>
                <input
                  id="periodoRef"
                  type="month"
                  value={periodoRef}
                  onChange={(e) => setPeriodoRef(e.target.value)}
                  style={{width: '100%', paddingRight: periodoRef ? '2.5rem' : undefined}}
                />
                {periodoRef && (
                  <button
                    onClick={() => setPeriodoRef('')}
                    title="Limpar filtro (detectar automaticamente)"
                    style={{
                      position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-secondary)', padding: '0.25rem', lineHeight: 1,
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
              {!periodoRef && (
                <p style={{fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem'}}>
                  Sem filtro: usa o mês de emissão mais recente das notas.
                </p>
              )}
            </div>

            <div className="anexo-grid">
              <div className="input-group">
                <label htmlFor="anexo">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{verticalAlign: 'middle', marginRight: '0.3rem'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                  Produtos (NF-e)
                </label>
                <div className="input-wrapper">
                  <select id="anexo" value={anexo} onChange={(e) => setAnexo(e.target.value)}>
                    <option value="anexo1">Anexo I - Comércio</option>
                    <option value="anexo2">Anexo II - Indústria</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="anexoServicos">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{verticalAlign: 'middle', marginRight: '0.3rem'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  Serviços (NFS-e)
                </label>
                <div className="input-wrapper">
                  <select id="anexoServicos" value={anexoServicos} onChange={(e) => setAnexoServicos(e.target.value)}>
                    <option value="anexo3">Anexo III - Serviços</option>
                    <option value="anexo4">Anexo IV - Construção/Vigilância</option>
                    <option value="anexo5">Anexo V - Serviços Específicos</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="results-card">
              <div className="result-row">
                <span className="result-label">Notas Fiscais Válidas</span>
                <span className="result-value">{validFiles.length}</span>
              </div>
              {totalProdutosDevolucao > 0 && (
                <div className="result-row">
                  <span className="result-label">Devoluções Abatidas</span>
                  <span className="result-value" style={{color: '#f59e0b'}}>- {formatCurrency(totalProdutosDevolucao)}</span>
                </div>
              )}
              <div className="result-row">
                <span className="result-label">Faturamento Total</span>
                <span className="result-value total">{formatCurrency(totalFaturamento)}</span>
              </div>
            </div>

            {/* Breakdown por tipo */}
            <div className="breakdown-grid">
              {/* Card Produtos */}
              <div className="breakdown-card">
                <div className="breakdown-header">
                  <span className="breakdown-icon" style={{background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa'}}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                  </span>
                  <span className="breakdown-label">Produtos ({nomeAnexo[anexo]})</span>
                </div>
                <div className="breakdown-row">
                  <span>Receita</span>
                  <span>{formatCurrency(receitaProdutosBase)}</span>
                </div>
                <div className="breakdown-row">
                  <span>Alíquota Efetiva</span>
                  <span className="breakdown-aliq">{formatPercent(aliquotaProdutos)}</span>
                </div>
                {dasCalcProdutos.deducaoICMS > 0 && (
                  <div className="breakdown-row">
                    <span>Dedução ICMS-ST</span>
                    <span style={{color: '#10b981'}}>- {formatCurrency(dasCalcProdutos.deducaoICMS)}</span>
                  </div>
                )}
                <div className="breakdown-row breakdown-total">
                  <span>DAS Produtos</span>
                  <span>{formatCurrency(dasCalcProdutos.valorDas)}</span>
                </div>
              </div>

              {/* Card Serviços */}
              <div className="breakdown-card">
                <div className="breakdown-header">
                  <span className="breakdown-icon" style={{background: 'rgba(16, 185, 129, 0.15)', color: '#34d399'}}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </span>
                  <span className="breakdown-label">Serviços ({nomeAnexo[anexoServicos]})</span>
                </div>
                <div className="breakdown-row">
                  <span>Receita</span>
                  <span>{formatCurrency(totalServicos)}</span>
                </div>
                <div className="breakdown-row">
                  <span>Alíquota Efetiva</span>
                  <span className="breakdown-aliq">{formatPercent(aliquotaServicos)}</span>
                </div>
                {anexoServicos === 'anexo4' && totalServicos > 0 && (
                  <div className="breakdown-row" style={{color: '#f59e0b', fontSize: '0.7rem'}}>
                    <span>⚠ ISS pago separado à prefeitura</span>
                  </div>
                )}
                <div className="breakdown-row breakdown-total">
                  <span>DAS Serviços</span>
                  <span>{formatCurrency(Math.max(0, Math.round(valorDasServicos * 100) / 100))}</span>
                </div>
              </div>
            </div>

            {/* Total DAS */}
            <div className="results-card das-total-card">
              <div className="result-row">
                <span className="result-label">Valor Total do DAS</span>
                <span className="result-value tax">{formatCurrency(valorDasTotal)}</span>
              </div>
            </div>

            {/* Quadro de Auditoria */}
            {files.length > 1 && (
              <div className="audit-panel" style={{marginTop: '1rem', padding: '1rem', borderRadius: '0.75rem', backgroundColor: gaps.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${gaps.length > 0 ? 'var(--danger-color)' : 'var(--success-color)'}`}}>
                <h4 style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: gaps.length > 0 ? 'var(--danger-color)' : 'var(--success-color)'}}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Auditoria de Sequência
                </h4>
                <p style={{fontSize: '0.8rem', marginBottom: '0.5rem'}}>
                  {auditPeriodLabel ? `Mês auditado: ${auditPeriodLabel}. ` : 'Mês de emissão não identificado. '}
                  A conferência usa notas do mesmo emitente, modelo e série.
                </p>
                {audit.ignoradas > 0 && (
                  <p style={{fontSize: '0.8rem', color: '#f59e0b', marginBottom: '0.5rem'}}>
                    {audit.ignoradas} arquivo(s) sem dados suficientes para conferir a sequência. Reimporte os XMLs desses documentos para completar a auditoria.
                  </p>
                )}
                {gaps.length > 0 ? (
                  <div>
                    <p style={{fontSize: '0.875rem', marginBottom: '0.5rem'}}>Há números sem XML nos intervalos abaixo. A sequência sozinha não confirma a emissão nem o mês dessas notas:</p>
                    <ul style={{fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', marginBottom: '0.75rem'}}>
                      {gaps.map((gap, i) => (
                        <li key={i} style={{marginBottom: '0.2rem'}}>
                          <strong>{gap.group}:</strong> Conferir números {gap.missing}
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: '0.5rem',
                            padding: '0.1rem 0.45rem',
                            borderRadius: '999px',
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: 'var(--danger-color)',
                            fontWeight: 700,
                            fontSize: '0.7rem',
                          }}>
                            {gap.count} {gap.count === 1 ? 'número' : 'números'}
                          </span>
                          <div style={{fontSize: '0.7rem', marginTop: '0.2rem'}}>
                            Emitente: {gap.emitente} · {auditPeriodLabel} · Entre as notas {gap.primeira} e {gap.ultima}
                          </div>
                          {gap.outrasSeries.length > 0 && (
                            <div style={{fontSize: '0.75rem', marginTop: '0.4rem', color: '#f59e0b'}}>
                              XMLs com esses números já foram importados em outra série:
                              {' '}{gap.outrasSeries.slice(0, 10).map(n => `nº ${n.numero}, série ${n.serie}${n.periodo ? ` (${n.periodo.split('-').reverse().join('/')})` : ''}`).join('; ')}.
                              {gap.outrasSeries.length > 10 && ` E mais ${gap.outrasSeries.length - 10} documento(s).`}
                              {' '}Esses documentos não pertencem à sequência da série {gap.serie}.
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}>
                      <span style={{fontSize: '0.8rem', fontWeight: 600, color: 'var(--danger-color)'}}>Total de números a conferir</span>
                      <span style={{
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: 'var(--danger-color)',
                        letterSpacing: '-0.02em',
                      }}>
                        {gaps.reduce((acc, g) => acc + g.count, 0)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>{audit.gruposAuditados > 0 ? 'Nenhuma lacuna encontrada entre as notas do mês auditado.' : 'Não há pelo menos duas notas distintas do mês na mesma sequência para conferir.'}</p>
                )}
              </div>
            )}

            {/* Análise de CSOSN / Substituição Tributária */}
            {(totalComST > 0 || totalSemST > 0) && nfesValidas.length > 0 && (
              <div className="csosn-panel">
                <h4 className="csosn-title">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  Análise de CSOSN
                </h4>

                <div className="csosn-grid">
                  <div className="csosn-card csosn-card-st">
                    <span className="csosn-card-label">Receita com ST</span>
                    <span className="csosn-card-value">{formatCurrency(totalComST)}</span>
                    <span className="csosn-card-detail">{totalItensComST} {totalItensComST === 1 ? 'item' : 'itens'}</span>
                  </div>
                  <div className="csosn-card csosn-card-normal">
                    <span className="csosn-card-label">Receita sem ST</span>
                    <span className="csosn-card-value">{formatCurrency(totalSemST)}</span>
                    <span className="csosn-card-detail">{totalItensSemST} {totalItensSemST === 1 ? 'item' : 'itens'}</span>
                  </div>
                </div>

                {dasCalcProdutos.deducaoICMS > 0 && (
                  <div className="csosn-economia">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg>
                    <span>Economia com ST: <strong>{formatCurrency(dasCalcProdutos.deducaoICMS)}</strong> de ICMS já recolhido</span>
                  </div>
                )}

                {csosnsUnicos.length > 0 && (
                  <div className="csosn-tags">
                    <span className="csosn-tags-label">CSOSNs encontrados:</span>
                    {csosnsUnicos.map(c => (
                      <span key={c} className={`csosn-tag ${['201','202','203','500'].includes(c) ? 'csosn-tag-st' : 'csosn-tag-normal'}`}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {/* Barra proporcional ST vs Normal */}
                <div className="chart-container" style={{borderTop: 'none', marginTop: '0.5rem', paddingTop: '0'}}>
                  <label className="result-label" style={{display: 'block', marginBottom: '0.5rem'}}>Proporção ST vs Normal</label>
                  <div className="chart-bar-bg">
                    <div className="chart-segment" style={{ width: `${(totalComST / (totalComST + totalSemST)) * 100}%`, backgroundColor: '#f59e0b' }}></div>
                    <div className="chart-segment" style={{ width: `${(totalSemST / (totalComST + totalSemST)) * 100}%`, backgroundColor: '#6366f1' }}></div>
                  </div>
                  <div className="chart-legend">
                    <div className="legend-item">
                      <div className="legend-color" style={{ backgroundColor: '#f59e0b' }}></div>
                      <span>Com ST ({Math.round((totalComST / (totalComST + totalSemST)) * 100)}%)</span>
                    </div>
                    <div className="legend-item">
                      <div className="legend-color" style={{ backgroundColor: '#6366f1' }}></div>
                      <span>Sem ST ({Math.round((totalSemST / (totalComST + totalSemST)) * 100)}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(pctProdutos > 0 || pctServicos > 0) && (
              <div className="chart-container">
                <label className="result-label" style={{display: 'block', marginBottom: '0.5rem'}}>Composição do Faturamento Bruto</label>
                <div className="chart-bar-bg">
                  <div className="chart-segment" style={{ width: `${pctProdutos}%`, backgroundColor: '#3b82f6' }}></div>
                  <div className="chart-segment" style={{ width: `${pctServicos}%`, backgroundColor: '#10b981' }}></div>
                </div>
                <div className="chart-legend">
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#3b82f6' }}></div>
                    <span>Comércio/Indústria ({Math.round(pctProdutos)}%)</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
                    <span>Serviços ({Math.round(pctServicos)}%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
