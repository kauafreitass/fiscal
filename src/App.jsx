import { useState, useRef, useEffect } from 'react';
import { parseInvoiceXml } from './utils/xmlParser';
import { calcularSimplesNacional } from './utils/simplesNacional';
import './index.css';

function App() {
  // Inicialização do State a partir do LocalStorage
  const [files, setFiles] = useState(() => {
    const saved = localStorage.getItem('das_files');
    return saved ? JSON.parse(saved) : [];
  });
  const [rbt12, setRbt12] = useState(() => {
    const saved = localStorage.getItem('das_rbt12');
    return saved ? parseFloat(saved) : 0;
  });
  const [anexo, setAnexo] = useState(() => {
    const saved = localStorage.getItem('das_anexo');
    return saved || 'anexo1';
  });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Salvar no LocalStorage sempre que os estados mudarem
  useEffect(() => {
    localStorage.setItem('das_files', JSON.stringify(files));
    localStorage.setItem('das_rbt12', rbt12);
    localStorage.setItem('das_anexo', anexo);
  }, [files, rbt12, anexo]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = async (fileList) => {
    const newFiles = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type !== "text/xml" && !file.name.endsWith('.xml')) {
        newFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          error: "Apenas arquivos XML são permitidos.",
        });
        continue;
      }

      try {
        const text = await file.text();
        const data = parseInvoiceXml(text);
        newFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: data.type,
          value: data.value,
          isCancelled: data.isCancelled
        });
      } catch (err) {
        newFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          error: err.message || "Erro ao ler o arquivo.",
        });
      }
    }

    setFiles((prev) => [...prev, ...newFiles]);
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

  // Cálculos Financeiros
  const validFiles = files.filter((f) => !f.error && !f.isCancelled);
  
  // Divisão de Faturamento
  const totalProdutos = validFiles.filter(f => f.type.includes('NF-e')).reduce((acc, f) => acc + f.value, 0);
  const totalServicos = validFiles.filter(f => f.type.includes('NFS-e')).reduce((acc, f) => acc + f.value, 0);
  const totalFaturamento = totalProdutos + totalServicos;

  // Cálculo da Alíquota Efetiva do Simples Nacional
  const aliquotaEfetiva = calcularSimplesNacional(rbt12, anexo);
  const valorDas = totalFaturamento * aliquotaEfetiva;

  // Porcentagens para o Gráfico
  const pctProdutos = totalFaturamento > 0 ? (totalProdutos / totalFaturamento) * 100 : 0;
  const pctServicos = totalFaturamento > 0 ? (totalServicos / totalFaturamento) * 100 : 0;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatPercent = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="app-container">
      <div className="header-actions">
        <div>
          <h1 className="title">Calculadora de DAS</h1>
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
        {/* Painel Esquerdo: Upload e Arquivos */}
        <div className="glass-panel">
          <div
            className={`dropzone ${isDragging ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <svg className="dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>Arraste e solte seus XMLs aqui</p>
            <p>ou <span className="highlight">clique para procurar</span></p>
            <input type="file" multiple accept=".xml,text/xml" ref={fileInputRef} onChange={handleFileInput} />
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
                  <li key={file.id} className={`file-item ${file.error ? 'error' : ''} ${file.isCancelled ? 'cancelled' : ''}`}>
                    <div className="file-info">
                      <span className="file-name" title={file.name}>{file.name}</span>
                      <span className="file-type">{file.error ? file.error : file.type}</span>
                    </div>
                    <div className="file-actions">
                      {!file.error && (
                        <span className="file-value" style={{ marginRight: '1rem' }}>
                          {formatCurrency(file.value)}
                        </span>
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

        {/* Painel Direito: Configuração e Resultados */}
        <div className="glass-panel">
          <div className="settings-panel">
            
            <div className="input-group">
              <label htmlFor="anexo">Anexo do Simples Nacional</label>
              <div className="input-wrapper">
                <select id="anexo" value={anexo} onChange={(e) => setAnexo(e.target.value)}>
                  <option value="anexo1">Anexo I - Comércio</option>
                  <option value="anexo2">Anexo II - Indústria</option>
                  <option value="anexo3">Anexo III - Serviços</option>
                </select>
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="rbt12">Receita Bruta 12 Meses (RBT12)</label>
              <div className="input-wrapper">
                <span className="input-prefix">R$</span>
                <input
                  id="rbt12"
                  className="with-prefix"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rbt12}
                  onChange={(e) => setRbt12(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="results-card">
              <div className="result-row">
                <span className="result-label">Alíquota Efetiva</span>
                <span className="result-value aliquota">{formatPercent(aliquotaEfetiva)}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Notas Fiscais Válidas</span>
                <span className="result-value">{validFiles.length}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Faturamento Total</span>
                <span className="result-value total">{formatCurrency(totalFaturamento)}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Valor do DAS</span>
                <span className="result-value tax">{formatCurrency(valorDas)}</span>
              </div>
            </div>

            {/* Gráfico de Faturamento */}
            {(pctProdutos > 0 || pctServicos > 0) && (
              <div className="chart-container">
                <label className="result-label" style={{display: 'block', marginBottom: '0.5rem'}}>Composição do Faturamento</label>
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
