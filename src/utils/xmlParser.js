// CSOSNs que indicam Substituição Tributária (ICMS já recolhido)
const CSOSN_COM_ST = new Set(['201', '202', '203', '500']);

/**
 * Extrai o CSOSN de um elemento <det> (item da NF-e).
 * Procura em todas as tags ICMSSN* possíveis dentro de <ICMS>.
 */
const extrairCSOSN = (detElement) => {
  const icmsNode = detElement.getElementsByTagName("ICMS")[0];
  if (!icmsNode) return null;

  // Tenta encontrar o CSOSN em qualquer tag filha de <ICMS>
  // As tags possíveis: ICMSSN101, ICMSSN102, ICMSSN201, ICMSSN202, ICMSSN500, ICMSSN900
  const csosnTag = icmsNode.getElementsByTagName("CSOSN")[0];
  if (csosnTag) return csosnTag.textContent.trim();

  // Fallback: verificar se é regime normal (CST em vez de CSOSN)
  // Neste caso retornamos null — não é Simples Nacional
  return null;
};

/**
 * Analisa os itens (<det>) da NF-e e segrega a receita entre
 * itens com Substituição Tributária e sem ST.
 * Retorna { valorComST, valorSemST, itensComST, itensSemST, csosns }
 */
const analisarItensCSOSN = (xmlDoc) => {
  const detElements = xmlDoc.getElementsByTagName("det");
  if (detElements.length === 0) {
    return { valorComST: 0, valorSemST: 0, itensComST: 0, itensSemST: 0, csosns: [] };
  }

  let totalProdST = 0;
  let totalProdSemST = 0;
  let itensComST = 0;
  let itensSemST = 0;
  const csosnsEncontrados = new Set();

  for (let i = 0; i < detElements.length; i++) {
    const det = detElements[i];
    const prodNode = det.getElementsByTagName("prod")[0];
    if (!prodNode) continue;

    const vProd = parseFloat(prodNode.getElementsByTagName("vProd")[0]?.textContent || "0");
    const vDesc = parseFloat(prodNode.getElementsByTagName("vDesc")[0]?.textContent || "0");
    const valorItem = vProd - vDesc;

    const csosn = extrairCSOSN(det);
    if (csosn) {
      csosnsEncontrados.add(csosn);
    }

    if (csosn && CSOSN_COM_ST.has(csosn)) {
      totalProdST += valorItem;
      itensComST++;
    } else {
      totalProdSemST += valorItem;
      itensSemST++;
    }
  }

  return {
    valorComST: totalProdST,
    valorSemST: totalProdSemST,
    itensComST,
    itensSemST,
    csosns: Array.from(csosnsEncontrados).sort()
  };
};

export const parseInvoiceXml = (xmlString) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    const parserError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parserError) {
      throw new Error("Erro ao interpretar arquivo XML.");
    }

    let chaveAcesso = null;
    const infNFe = xmlDoc.getElementsByTagName("infNFe")[0];
    if (infNFe && infNFe.getAttribute("Id")) {
      chaveAcesso = infNFe.getAttribute("Id").replace("NFe", "");
    }
    if (!chaveAcesso) {
      chaveAcesso = xmlDoc.getElementsByTagName("CodigoVerificacao")[0]?.textContent 
                 || xmlDoc.getElementsByTagName("chNFe")[0]?.textContent;
    }

    const ide = infNFe?.getElementsByTagName("ide")[0];
    const infInut = xmlDoc.getElementsByTagName("infInut")[0];
    const identificationNode = ide || infInut;
    let numero = ide?.getElementsByTagName("nNF")[0]?.textContent;
    let serie = identificationNode?.getElementsByTagName("serie")[0]?.textContent;

    if (!numero) {
      numero = xmlDoc.getElementsByTagName("Numero")[0]?.textContent;
      if (!serie) {
        serie = xmlDoc.getElementsByTagName("Serie")[0]?.textContent || "Única";
      }
    }

    // Fallback: extrair número e série da chave de acesso (44 dígitos)
    // Isso é essencial para XMLs de evento (cancelamento, carta de correção, etc.)
    // que não possuem as tags <nNF> e <serie> diretamente.
    // Estrutura da chave: UF(2) AAMM(4) CNPJ(14) MOD(2) SERIE(3) NUM(9) ...
    if (!numero && chaveAcesso && /^\d{44}$/.test(chaveAcesso)) {
      serie = String(parseInt(chaveAcesso.substring(22, 25), 10));
      numero = String(parseInt(chaveAcesso.substring(25, 34), 10));
    }

    const n = numero ? parseInt(numero, 10) : null;
    const s = serie || "Única";

    const hasAccessKey = /^\d{44}$/.test(chaveAcesso || '');
    const emit = infNFe?.getElementsByTagName("emit")[0];
    const prestador = xmlDoc.getElementsByTagName("PrestadorServico")[0]
                   || xmlDoc.getElementsByTagName("Prestador")[0];
    const issuerNode = emit || infInut || prestador;
    const dataEmissao = ide?.getElementsByTagName("dhEmi")[0]?.textContent
                     || ide?.getElementsByTagName("dEmi")[0]?.textContent
                     || (!infNFe && !infInut ? xmlDoc.getElementsByTagName("DataEmissao")[0]?.textContent : null)
                     || null;
    const emissionMonth = dataEmissao?.match(/^(\d{4})-(0[1-9]|1[0-2])/);
    const identification = {
      dataEmissao,
      aamm: emissionMonth ? emissionMonth[1].slice(2) + emissionMonth[2]
        : hasAccessKey ? chaveAcesso.slice(2, 6) : null,
      emitente: hasAccessKey ? chaveAcesso.slice(6, 20)
        : issuerNode?.getElementsByTagName("CNPJ")[0]?.textContent
          || issuerNode?.getElementsByTagName("CPF")[0]?.textContent || null,
      modelo: hasAccessKey ? chaveAcesso.slice(20, 22)
        : identificationNode?.getElementsByTagName("mod")[0]?.textContent
          || (prestador ? 'NFS-e' : null),
    };

    // Detectar Inutilização de numeração (procInutNFe)
    // Esses XMLs possuem <nNFIni> e <nNFFin> indicando o intervalo inutilizado
    const nNFIni = xmlDoc.getElementsByTagName("nNFIni")[0]?.textContent;
    const nNFFin = xmlDoc.getElementsByTagName("nNFFin")[0]?.textContent;
    if (nNFIni && nNFFin) {
      const iniNum = parseInt(nNFIni, 10);
      const finNum = parseInt(nNFFin, 10);

      // O ano da numeração inutilizada é independente da data do protocolo.
      const anoInutilizacao = infInut?.getElementsByTagName("ano")[0]?.textContent || null;

      return {
        ...identification,
        type: "Inutilizada",
        value: 0,
        valorComST: 0,
        valorSemST: 0,
        itensComST: 0,
        itensSemST: 0,
        csosns: [],
        isCancelled: false,
        isDevolucao: false,
        isRemessa: false,
        isInutilizada: true,
        chave: null,
        aamm: null,
        anoInutilizacao,
        numero: iniNum,
        numeroIni: iniNum,
        numeroFin: finNum,
        serie: s
      };
    }

    const finNFe = xmlDoc.getElementsByTagName("finNFe")[0]?.textContent;
    const isDevolucao = (finNFe === "4");

    const cStat = xmlDoc.getElementsByTagName("cStat")[0]?.textContent;
    const descEvento = xmlDoc.getElementsByTagName("descEvento")[0]?.textContent;
    const isCancelled = (cStat === "101") || 
                        (cStat === "135" && descEvento?.includes("Cancelamento")) ||
                        xmlDoc.getElementsByTagName("retCancNFe").length > 0;

    // Detectar Remessa / Transferência
    const natOpNode = xmlDoc.getElementsByTagName("natOp")[0];
    let isRemessa = false;
    if (natOpNode) {
      const natOp = natOpNode.textContent.toLowerCase();
      // Verifica se a natureza da operação é uma remessa, transferência ou retorno
      if (
        natOp.includes("remessa") || 
        natOp.includes("transferencia") || 
        natOp.includes("transferência") || 
        natOp.includes("retorno") ||
        natOp.includes("simbolica") ||
        natOp.includes("simbólica")
      ) {
        isRemessa = true;
      }
    }

    if (isCancelled) {
      return {
        ...identification,
        type: "Cancelada",
        value: 0,
        valorComST: 0,
        valorSemST: 0,
        itensComST: 0,
        itensSemST: 0,
        csosns: [],
        isCancelled: true,
        isDevolucao: false,
        isRemessa: false,
        chave: chaveAcesso,
        numero: n,
        serie: s
      };
    }

    if (isRemessa) {
      return {
        ...identification,
        type: "Remessa/Transf.",
        value: 0, // Ignoramos o valor para o faturamento base
        valorComST: 0,
        valorSemST: 0,
        itensComST: 0,
        itensSemST: 0,
        csosns: [],
        isCancelled: false,
        isDevolucao: false,
        isRemessa: true,
        chave: chaveAcesso,
        numero: n,
        serie: s
      };
    }

    // Analisar CSOSNs dos itens da NF-e
    const analise = analisarItensCSOSN(xmlDoc);

    let vNF = xmlDoc.getElementsByTagName("vNF")[0]?.textContent;
    if (vNF) {
      const valorTotal = parseFloat(vNF);

      // Calcular proporção de ST sobre o valor total da nota
      // Usamos proporção porque vNF inclui frete, seguro, outras despesas
      const totalItens = analise.valorComST + analise.valorSemST;
      let valorComST = 0;
      let valorSemST = valorTotal;

      if (totalItens > 0) {
        const propST = analise.valorComST / totalItens;
        valorComST = valorTotal * propST;
        valorSemST = valorTotal * (1 - propST);
      }

      return {
        ...identification,
        type: isDevolucao ? "Devolução (NF-e)" : "NF-e/NFC-e",
        value: valorTotal,
        valorComST: Math.round(valorComST * 100) / 100,
        valorSemST: Math.round(valorSemST * 100) / 100,
        itensComST: analise.itensComST,
        itensSemST: analise.itensSemST,
        csosns: analise.csosns,
        isCancelled: false,
        isDevolucao: isDevolucao,
        isRemessa: false,
        chave: chaveAcesso,
        numero: n,
        serie: s
      };
    }

    let valorServicos = xmlDoc.getElementsByTagName("ValorServicos")[0]?.textContent;
    if (valorServicos) {
      return {
        ...identification,
        type: "NFS-e",
        value: parseFloat(valorServicos),
        valorComST: 0,
        valorSemST: 0,
        itensComST: 0,
        itensSemST: 0,
        csosns: [],
        isCancelled: false,
        isDevolucao: false,
        isRemessa: false,
        chave: chaveAcesso,
        numero: n,
        serie: s
      };
    }

    throw new Error("Formato de nota fiscal não reconhecido ou sem valor total.");
  } catch (error) {
    throw error;
  }
};
