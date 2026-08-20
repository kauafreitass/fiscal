// Tabelas do Simples Nacional
// Referência: Anexos I a V da LC 123/2006 (atualizadas)
// O campo `icms` indica o percentual de repartição do ICMS dentro da alíquota total
// O campo `iss` indica o percentual de repartição do ISS dentro da alíquota total

const tabelas = {
  anexo1: [
    { limite: 180000, aliquota: 0.040, pd: 0, icms: 0.3400, iss: 0 },
    { limite: 360000, aliquota: 0.073, pd: 5940, icms: 0.3400, iss: 0 },
    { limite: 720000, aliquota: 0.095, pd: 13860, icms: 0.3350, iss: 0 },
    { limite: 1800000, aliquota: 0.107, pd: 22500, icms: 0.3350, iss: 0 },
    { limite: 3600000, aliquota: 0.143, pd: 87300, icms: 0.3350, iss: 0 },
    { limite: 4800000, aliquota: 0.190, pd: 378000, icms: 0.3050, iss: 0 },
  ],
  anexo2: [
    { limite: 180000, aliquota: 0.045, pd: 0, icms: 0.3200, iss: 0 },
    { limite: 360000, aliquota: 0.078, pd: 5940, icms: 0.3200, iss: 0 },
    { limite: 720000, aliquota: 0.100, pd: 13860, icms: 0.3200, iss: 0 },
    { limite: 1800000, aliquota: 0.112, pd: 22500, icms: 0.3200, iss: 0 },
    { limite: 3600000, aliquota: 0.147, pd: 85500, icms: 0.3200, iss: 0 },
    { limite: 4800000, aliquota: 0.300, pd: 720000, icms: 0.3050, iss: 0 },
  ],
  anexo3: [
    { limite: 180000, aliquota: 0.060, pd: 0, icms: 0, iss: 0.3350 },
    { limite: 360000, aliquota: 0.112, pd: 9360, icms: 0, iss: 0.3200 },
    { limite: 720000, aliquota: 0.135, pd: 17640, icms: 0, iss: 0.3250 },
    { limite: 1800000, aliquota: 0.160, pd: 35640, icms: 0, iss: 0.3250 },
    { limite: 3600000, aliquota: 0.210, pd: 125640, icms: 0, iss: 0.3350 },
    { limite: 4800000, aliquota: 0.330, pd: 648000, icms: 0, iss: 0.1500 },
  ],
  // Anexo IV: Construção, vigilância, limpeza, conservação
  // ISS NÃO está incluso no DAS — deve ser pago separadamente à prefeitura
  anexo4: [
    { limite: 180000, aliquota: 0.045, pd: 0, icms: 0, iss: 0 },
    { limite: 360000, aliquota: 0.090, pd: 8100, icms: 0, iss: 0 },
    { limite: 720000, aliquota: 0.102, pd: 12420, icms: 0, iss: 0 },
    { limite: 1800000, aliquota: 0.140, pd: 39780, icms: 0, iss: 0 },
    { limite: 3600000, aliquota: 0.220, pd: 183780, icms: 0, iss: 0 },
    { limite: 4800000, aliquota: 0.330, pd: 828000, icms: 0, iss: 0 },
  ],
  // Anexo V: Serviços específicos (auditoria, jornalismo, tecnologia, engenharia, etc.)
  anexo5: [
    { limite: 180000, aliquota: 0.155, pd: 0, icms: 0, iss: 0.1400 },
    { limite: 360000, aliquota: 0.180, pd: 4500, icms: 0, iss: 0.1700 },
    { limite: 720000, aliquota: 0.195, pd: 9900, icms: 0, iss: 0.1900 },
    { limite: 1800000, aliquota: 0.205, pd: 17100, icms: 0, iss: 0.2100 },
    { limite: 3600000, aliquota: 0.230, pd: 62100, icms: 0, iss: 0.2350 },
    { limite: 4800000, aliquota: 0.305, pd: 540000, icms: 0, iss: 0.2350 },
  ],
};

/**
 * Encontra a faixa do Simples Nacional baseada no RBT12.
 */
const encontrarFaixa = (rbt12, anexo) => {
  const tabela = tabelas[anexo];
  if (!tabela) return null;
  let faixa = tabela.find(f => rbt12 <= f.limite);
  if (!faixa) faixa = tabela[tabela.length - 1];
  return faixa;
};

/**
 * Calcula a alíquota efetiva do Simples Nacional.
 */
export const calcularSimplesNacional = (rbt12, anexo) => {
  if (rbt12 <= 0) return 0;
  
  const faixa = encontrarFaixa(rbt12, anexo);
  if (!faixa) return 0;

  // Alíquota Efetiva = ((RBT12 * Alíquota Nominal) - PD) / RBT12
  const aliquotaEfetiva = ((rbt12 * faixa.aliquota) - faixa.pd) / rbt12;
  
  return aliquotaEfetiva;
};

/**
 * Calcula o DAS considerando a segregação de receita com Substituição Tributária.
 * 
 * Para a receita com ST, o ICMS já foi recolhido pelo substituto tributário,
 * portanto deve ser deduzido do DAS.
 * 
 * @param {number} rbt12 - Receita Bruta acumulada nos últimos 12 meses
 * @param {string} anexo - Anexo do Simples Nacional (anexo1, anexo2, anexo3)
 * @param {number} receitaTotal - Receita total do período (faturamento base)
 * @param {number} receitaComST - Parcela da receita referente a produtos com ST
 * @returns {{ valorDas, valorDasSemDeducao, deducaoICMS, aliquotaEfetiva, percICMS }}
 */
export const calcularDasComST = (rbt12, anexo, receitaTotal, receitaComST) => {
  if (rbt12 <= 0 || receitaTotal <= 0) {
    return {
      valorDas: 0,
      valorDasSemDeducao: 0,
      deducaoICMS: 0,
      aliquotaEfetiva: 0,
      percICMS: 0,
    };
  }

  const faixa = encontrarFaixa(rbt12, anexo);
  if (!faixa) {
    return {
      valorDas: 0,
      valorDasSemDeducao: 0,
      deducaoICMS: 0,
      aliquotaEfetiva: 0,
      percICMS: 0,
    };
  }

  const aliquotaEfetiva = ((rbt12 * faixa.aliquota) - faixa.pd) / rbt12;
  const valorDasSemDeducao = receitaTotal * aliquotaEfetiva;

  // Percentual de ICMS dentro da alíquota efetiva
  const percICMS = faixa.icms;

  // Valor do ICMS que seria cobrado no DAS sobre a receita com ST
  // Como esse ICMS já foi recolhido por ST, deve ser deduzido
  const aliquotaICMS = aliquotaEfetiva * percICMS;
  const deducaoICMS = receitaComST * aliquotaICMS;

  const valorDas = Math.max(0, valorDasSemDeducao - deducaoICMS);

  return {
    valorDas: Math.round(valorDas * 100) / 100,
    valorDasSemDeducao: Math.round(valorDasSemDeducao * 100) / 100,
    deducaoICMS: Math.round(deducaoICMS * 100) / 100,
    aliquotaEfetiva,
    percICMS,
  };
};

