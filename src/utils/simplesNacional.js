// Tabelas do Simples Nacional
// Referência: Anexos I, II e III da LC 123/2006 (atualizadas)

const tabelas = {
  anexo1: [
    { limite: 180000, aliquota: 0.040, pd: 0 },
    { limite: 360000, aliquota: 0.073, pd: 5940 },
    { limite: 720000, aliquota: 0.095, pd: 13860 },
    { limite: 1800000, aliquota: 0.107, pd: 22500 },
    { limite: 3600000, aliquota: 0.143, pd: 87300 },
    { limite: 4800000, aliquota: 0.190, pd: 378000 },
  ],
  anexo2: [
    { limite: 180000, aliquota: 0.045, pd: 0 },
    { limite: 360000, aliquota: 0.078, pd: 5940 },
    { limite: 720000, aliquota: 0.100, pd: 13860 },
    { limite: 1800000, aliquota: 0.112, pd: 22500 },
    { limite: 3600000, aliquota: 0.147, pd: 85500 },
    { limite: 4800000, aliquota: 0.300, pd: 720000 },
  ],
  anexo3: [
    { limite: 180000, aliquota: 0.060, pd: 0 },
    { limite: 360000, aliquota: 0.112, pd: 9360 },
    { limite: 720000, aliquota: 0.135, pd: 17640 },
    { limite: 1800000, aliquota: 0.160, pd: 35640 },
    { limite: 3600000, aliquota: 0.210, pd: 125640 },
    { limite: 4800000, aliquota: 0.330, pd: 648000 },
  ]
};

export const calcularSimplesNacional = (rbt12, anexo) => {
  if (rbt12 <= 0) return 0;
  
  const tabela = tabelas[anexo];
  if (!tabela) return 0;

  // Encontrar a faixa
  let faixa = tabela.find(f => rbt12 <= f.limite);
  
  // Se faturou mais de 4.8M, usa a última faixa
  if (!faixa) {
    faixa = tabela[tabela.length - 1];
  }

  // Alíquota Efetiva = ((RBT12 * Alíquota Nominal) - PD) / RBT12
  const aliquotaEfetiva = ((rbt12 * faixa.aliquota) - faixa.pd) / rbt12;
  
  return aliquotaEfetiva;
};
