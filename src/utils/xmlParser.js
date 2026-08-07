export const parseInvoiceXml = (xmlString) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    const parserError = xmlDoc.querySelector("parsererror");
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

    let numero = xmlDoc.getElementsByTagName("nNF")[0]?.textContent;
    let serie = xmlDoc.getElementsByTagName("serie")[0]?.textContent;

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

    // Detectar Inutilização de numeração (procInutNFe)
    // Esses XMLs possuem <nNFIni> e <nNFFin> indicando o intervalo inutilizado
    const nNFIni = xmlDoc.getElementsByTagName("nNFIni")[0]?.textContent;
    const nNFFin = xmlDoc.getElementsByTagName("nNFFin")[0]?.textContent;
    if (nNFIni && nNFFin) {
      const iniNum = parseInt(nNFIni, 10);
      const finNum = parseInt(nNFFin, 10);
      return {
        type: "Inutilizada",
        value: 0,
        isCancelled: false,
        isDevolucao: false,
        isRemessa: false,
        isInutilizada: true,
        chave: null,
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
        type: "Cancelada",
        value: 0,
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
        type: "Remessa/Transf.",
        value: 0, // Ignoramos o valor para o faturamento base
        isCancelled: false,
        isDevolucao: false,
        isRemessa: true,
        chave: chaveAcesso,
        numero: n,
        serie: s
      };
    }

    let vNF = xmlDoc.getElementsByTagName("vNF")[0]?.textContent;
    if (vNF) {
      return {
        type: isDevolucao ? "Devolução (NF-e)" : "NF-e/NFC-e",
        value: parseFloat(vNF),
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
        type: "NFS-e",
        value: parseFloat(valorServicos),
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
