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
      serie = xmlDoc.getElementsByTagName("Serie")[0]?.textContent || "Única";
    }

    const n = numero ? parseInt(numero, 10) : null;
    const s = serie || "Única";

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
