export const parseInvoiceXml = (xmlString) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Verificar se houve erro de parse
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Erro ao interpretar arquivo XML.");
    }

    // Identificar Cancelamento (NFe Cancelada)
    const cStat = xmlDoc.getElementsByTagName("cStat")[0]?.textContent;
    const isCancelled = (cStat === "101") || xmlDoc.getElementsByTagName("retCancNFe").length > 0;

    if (isCancelled) {
      return {
        type: "Cancelada",
        value: 0,
        isCancelled: true
      };
    }

    // Tentar extrair valor da NF-e (Tag <vNF> dentro de <ICMSTot> ou <total>)
    let vNF = xmlDoc.getElementsByTagName("vNF")[0]?.textContent;
    if (vNF) {
      return {
        type: "NF-e/NFC-e",
        value: parseFloat(vNF),
        isCancelled: false
      };
    }

    // Tentar extrair valor da NFS-e (Tag <ValorServicos>)
    let valorServicos = xmlDoc.getElementsByTagName("ValorServicos")[0]?.textContent;
    if (valorServicos) {
      return {
        type: "NFS-e",
        value: parseFloat(valorServicos),
        isCancelled: false
      };
    }

    // Fallback: se não encontrar tags conhecidas
    throw new Error("Formato de nota fiscal não reconhecido ou sem valor total.");
  } catch (error) {
    throw error;
  }
};
