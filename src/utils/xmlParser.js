export const parseInvoiceXml = (xmlString) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Erro ao interpretar arquivo XML.");
    }

    // 1. Extrair Chave de Acesso (chNFe) para evitar duplicatas
    let chaveAcesso = null;
    const infNFe = xmlDoc.getElementsByTagName("infNFe")[0];
    if (infNFe && infNFe.getAttribute("Id")) {
      chaveAcesso = infNFe.getAttribute("Id").replace("NFe", "");
    }
    // Se for NFS-e pode ter outra tag, tentamos um fallback simplificado
    if (!chaveAcesso) {
      chaveAcesso = xmlDoc.getElementsByTagName("CodigoVerificacao")[0]?.textContent 
                 || xmlDoc.getElementsByTagName("chNFe")[0]?.textContent;
    }

    // 2. Detectar Devolução (finNFe = 4)
    const finNFe = xmlDoc.getElementsByTagName("finNFe")[0]?.textContent;
    const isDevolucao = (finNFe === "4");

    // 3. Detectar Cancelamento
    const cStat = xmlDoc.getElementsByTagName("cStat")[0]?.textContent;
    const descEvento = xmlDoc.getElementsByTagName("descEvento")[0]?.textContent;
    const isCancelled = (cStat === "101") || 
                        (cStat === "135" && descEvento?.includes("Cancelamento")) ||
                        xmlDoc.getElementsByTagName("retCancNFe").length > 0;

    if (isCancelled) {
      return {
        type: "Cancelada",
        value: 0,
        isCancelled: true,
        isDevolucao: false,
        chave: chaveAcesso
      };
    }

    // Tentar extrair valor da NF-e (Tag <vNF> dentro de <ICMSTot>)
    let vNF = xmlDoc.getElementsByTagName("vNF")[0]?.textContent;
    if (vNF) {
      return {
        type: isDevolucao ? "Devolução (NF-e)" : "NF-e/NFC-e",
        value: parseFloat(vNF),
        isCancelled: false,
        isDevolucao: isDevolucao,
        chave: chaveAcesso
      };
    }

    // Tentar extrair valor da NFS-e (Tag <ValorServicos>)
    let valorServicos = xmlDoc.getElementsByTagName("ValorServicos")[0]?.textContent;
    if (valorServicos) {
      return {
        type: "NFS-e",
        value: parseFloat(valorServicos),
        isCancelled: false,
        isDevolucao: false,
        chave: chaveAcesso
      };
    }

    throw new Error("Formato de nota fiscal não reconhecido ou sem valor total.");
  } catch (error) {
    throw error;
  }
};
