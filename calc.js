/* ==========================================================================
   TAXAJIN 계산 엔진
   ※ 아래 세율·공제 수치는 2026.08 기준 확인된 자료이며, 실제 신고 시점의
     법령·시행령 개정 여부를 반드시 재확인해야 함. 계산기 화면에도 동일한
     안내 문구를 노출한다. (JB 확인 필요 — 매년 1월/개정 시 갱신)

   출처
   - 양도세 기본세율: 소득세법 §55①, §104① (누진세율 6~45%, 8단계)
     https://casenote.kr/법령/소득세법/제55조
   - 양도세 다주택 중과: 2026.5.10 유예 종료, 조정대상지역 2주택 +20%p,
     3주택↑ +30%p (소득세법 §104⑦, 국세청 안내)
   - 취득세 기본세율: 지방세법 §11 (6억↓ 1%, 6~9억 구간산식, 9억↑ 3%)
   - 취득세 다주택 중과: 조정대상지역 2주택 8%, 3주택↑ 12%
     증여취득 3.5%(조정지역 3억↑ 12%), 상속취득 2.8%
   - 상속·증여세 세율: 상증세법 §26, §56 (10~50% 5단계 누진)
   - 상속공제: 일괄공제 5억(§21), 배우자상속공제 5억~30억(§19)
   - 증여재산공제: 배우자 6억, 직계존속·비속 5천만(미성년 2천만),
     기타친족 1천만, 10년 합산 (§53)
   ========================================================================== */

const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const wonMinus = n => Math.round(n) === 0 ? won(0) : ('-' + won(n));
const clamp0 = n => Math.max(0, n);

/* 소득세법 §55① 8단계 누진세율표 — 양도세 기본세율에 동일 적용 */
const INCOME_TAX_BRACKETS = [
  { limit: 14000000,        rate: 0.06, deduction: 0 },
  { limit: 50000000,        rate: 0.15, deduction: 1260000 },
  { limit: 88000000,        rate: 0.24, deduction: 5760000 },
  { limit: 150000000,       rate: 0.35, deduction: 15440000 },
  { limit: 300000000,       rate: 0.38, deduction: 19940000 },
  { limit: 500000000,       rate: 0.40, deduction: 25940000 },
  { limit: 1000000000,      rate: 0.42, deduction: 35940000 },
  { limit: Infinity,        rate: 0.45, deduction: 65940000 },
];
function progressiveTax(base, brackets){
  if (base <= 0) return 0;
  const b = brackets.find(b => base <= b.limit);
  return base * b.rate - b.deduction;
}

/* 상증세법 §26/§56 5단계 누진세율표 */
const ESTATE_GIFT_BRACKETS = [
  { limit: 100000000,  rate: 0.10, deduction: 0 },
  { limit: 500000000,  rate: 0.20, deduction: 10000000 },
  { limit: 1000000000, rate: 0.30, deduction: 60000000 },
  { limit: 3000000000, rate: 0.40, deduction: 160000000 },
  { limit: Infinity,   rate: 0.50, deduction: 460000000 },
];

/* -------------------------------------------------------------------------
   1) 양도소득세 (간이 계산 — 주택 기준, 단일 자산 가정)
   ------------------------------------------------------------------------- */
function calcTransferTax(p){
  const gain = clamp0(p.transferPrice - p.acquisitionPrice - p.necessaryExpense);

  // 장기보유특별공제 (소득세법 §95②)
  let deductRate = 0;
  if (p.isOneHouse) {
    // 1세대1주택 특례: 보유 4%/년(최대40%) + 거주 4%/년(최대40%), 2년 이상 거주 요건
    const holdRate = Math.min(Math.floor(p.holdYears) * 0.04, 0.40);
    const liveRate = Math.min(Math.floor(p.liveYears) * 0.04, 0.40);
    deductRate = p.liveYears >= 2 ? (holdRate + liveRate) : 0;
  } else {
    // 일반 부동산: 3년 이상 보유 시 연 2%, 최대 30% (15년)
    deductRate = p.holdYears >= 3 ? Math.min(Math.floor(p.holdYears) * 0.02, 0.30) : 0;
  }
  const specialDeduction = gain * deductRate;

  // 기본공제 (소득세법 §103, 인별 연 250만원)
  const basicDeduction = 2500000;
  const taxBase = clamp0(gain - specialDeduction - basicDeduction);

  // 세율 적용: 기본세율 vs 다주택 중과(조정지역, '26.5.10~ 중과 부활) 중 큰 세액
  const basic = progressiveTax(taxBase, INCOME_TAX_BRACKETS);
  let surchargeTax = 0;
  if (p.isAdjustedArea && p.houseCount >= 2 && !p.isOneHouse) {
    const addRate = p.houseCount === 2 ? 0.20 : 0.30;
    const surchargeBrackets = INCOME_TAX_BRACKETS.map(b => ({...b, rate: b.rate + addRate}));
    // 중과 시에는 장기보유특별공제 배제(§95②, 다주택 중과 주택 제외)됨에 유의 — 아래는 공제 전 차익 기준
    surchargeTax = progressiveTax(clamp0(gain - basicDeduction), surchargeBrackets);
  }
  const capitalGainsTax = Math.max(basic, surchargeTax);
  const localIncomeTax = capitalGainsTax * 0.1; // 지방소득세 10%
  const total = capitalGainsTax + localIncomeTax;

  return {
    gain, deductRate, specialDeduction, basicDeduction, taxBase,
    capitalGainsTax, localIncomeTax, total,
    rows: [
      ['양도차익', won(gain)],
      [`장기보유특별공제 (${(deductRate*100).toFixed(0)}%)`, wonMinus(specialDeduction)],
      ['기본공제', wonMinus(basicDeduction)],
      ['과세표준', won(taxBase)],
      ['양도소득세', won(capitalGainsTax)],
      ['지방소득세 (10%)', won(localIncomeTax)],
    ]
  };
}

/* -------------------------------------------------------------------------
   2) 취득세 (유상취득 / 증여취득 / 상속취득)
   ------------------------------------------------------------------------- */
function calcAcquisitionTax(p){
  let rate;
  let base = p.price;

  if (p.acquireType === 'inherit') {
    rate = 0.028; // 상속취득 2.8%
  } else if (p.acquireType === 'gift') {
    rate = (p.isAdjustedArea && p.price >= 300000000) ? 0.12 : 0.035; // 증여 3.5%, 조정지역 3억↑ 12%
  } else {
    // 유상취득
    if (p.houseCount >= 2 && p.isAdjustedArea) {
      rate = p.houseCount === 2 ? 0.08 : 0.12;
    } else if (p.houseCount >= 4 && !p.isAdjustedArea) {
      rate = 0.12; // 비조정지역 4주택↑ 12%
    } else {
      // 기본세율 (지방세법 §11): 6억↓ 1%, 6~9억 구간산식, 9억↑ 3%
      if (p.price <= 600000000) rate = 0.01;
      else if (p.price <= 900000000) rate = (p.price / 300000000 * 2 - 3) / 100;
      else rate = 0.03;
    }
  }

  const acquisitionTax = base * rate;
  const localEduTax = (p.acquireType === 'trade' && rate <= 0.03) ? base * (rate/2) * 0.2 : (rate >= 0.08 ? base * 0.004 : 0);
  const ruralTax = p.exceedsArea85 ? base * (rate >= 0.08 ? (rate === 0.12 ? 0.01 : 0.006) : 0.002) : 0;
  const total = acquisitionTax + localEduTax + ruralTax;

  return {
    rate, acquisitionTax, localEduTax, ruralTax, total,
    rows: [
      ['취득세율', (rate*100).toFixed(2) + '%'],
      ['취득세', won(acquisitionTax)],
      ['지방교육세', won(localEduTax)],
      ['농어촌특별세', won(ruralTax)],
    ]
  };
}

/* -------------------------------------------------------------------------
   3) 증여세
   ------------------------------------------------------------------------- */
function calcGiftTax(p){
  const deductionTable = {
    spouse: 600000000,
    lineal_adult: 50000000,
    lineal_minor: 20000000,
    other_relative: 10000000,
  };
  const deduction = Math.min(p.priorDeduction != null ? Math.max(deductionTable[p.relation] - p.priorUsed, 0) : deductionTable[p.relation], p.giftValue);
  const taxBase = clamp0(p.giftValue - deduction);
  const tax = progressiveTax(taxBase, ESTATE_GIFT_BRACKETS);
  const reportCredit = tax * 0.03; // 신고세액공제 3% (§69)
  const total = tax - reportCredit;

  return {
    deduction, taxBase, tax, reportCredit, total,
    rows: [
      ['증여재산가액', won(p.giftValue)],
      ['증여재산공제', wonMinus(deduction)],
      ['과세표준', won(taxBase)],
      ['산출세액', won(tax)],
      ['신고세액공제 (3%)', wonMinus(reportCredit)],
    ]
  };
}

/* -------------------------------------------------------------------------
   4) 상속세 (간이 계산 — 배우자 유무 기준 일괄공제/배우자공제만 반영)
   ------------------------------------------------------------------------- */
function calcInheritanceTax(p){
  const lumpSum = 500000000; // 일괄공제 (§21)
  const spouseDeduction = p.hasSpouse ? Math.min(Math.max(p.spouseShare, 500000000), 3000000000, p.totalEstate) : 0; // 배우자상속공제 5억~30억 (§19)
  const totalDeduction = Math.min(lumpSum + spouseDeduction, p.totalEstate);
  const taxBase = clamp0(p.totalEstate - totalDeduction);
  const tax = progressiveTax(taxBase, ESTATE_GIFT_BRACKETS);
  const reportCredit = tax * 0.03;
  const total = tax - reportCredit;

  return {
    lumpSum, spouseDeduction, totalDeduction, taxBase, tax, reportCredit, total,
    rows: [
      ['상속재산가액', won(p.totalEstate)],
      ['일괄공제', wonMinus(lumpSum)],
      ['배우자상속공제', wonMinus(spouseDeduction)],
      ['과세표준', won(taxBase)],
      ['산출세액', won(tax)],
      ['신고세액공제 (3%)', wonMinus(reportCredit)],
    ]
  };
}

/* -------------------------------------------------------------------------
   5) 보유세 — 재산세 (지방세법 §111) + 종합부동산세 (종부세법 §8, §9)
   ------------------------------------------------------------------------- */
/* 재산세 표준세율 / 1주택 특례세율 (지방세법 시행규칙 별지 제59호의3서식) */
const PROPERTY_TAX_STANDARD = [
  { limit: 60000000,   rate: 0.001,  deduction: 0 },
  { limit: 150000000,  rate: 0.0015, deduction: 30000 },
  { limit: 300000000,  rate: 0.0025, deduction: 195000 },
  { limit: Infinity,   rate: 0.004,  deduction: 570000 },
];
const PROPERTY_TAX_ONEHOUSE = [
  { limit: 60000000,   rate: 0.0005, deduction: 0 },
  { limit: 150000000,  rate: 0.001,  deduction: 30000 },
  { limit: 300000000,  rate: 0.002,  deduction: 120000 },
  { limit: Infinity,   rate: 0.0035, deduction: 420000 },
];
/* 종부세 세율표 (종부세법 §9①, 2026년 현행) */
const COMP_TAX_UNDER2 = [
  { limit: 300000000,   rate: 0.005,  deduction: 0 },
  { limit: 600000000,   rate: 0.007,  deduction: 900000 },
  { limit: 1200000000,  rate: 0.010,  deduction: 2700000 },
  { limit: 2500000000,  rate: 0.013,  deduction: 6300000 },
  { limit: 5000000000,  rate: 0.015,  deduction: 11300000 },
  { limit: 9400000000,  rate: 0.020,  deduction: 36300000 },
  { limit: Infinity,    rate: 0.027,  deduction: 101100000 },
];
const COMP_TAX_OVER3 = [
  { limit: 300000000,   rate: 0.005,  deduction: 0 },
  { limit: 600000000,   rate: 0.007,  deduction: 900000 },
  { limit: 1200000000,  rate: 0.010,  deduction: 2700000 },
  { limit: 2500000000,  rate: 0.020,  deduction: 15300000 },
  { limit: 5000000000,  rate: 0.030,  deduction: 40300000 },
  { limit: 9400000000,  rate: 0.040,  deduction: 90300000 },
  { limit: Infinity,    rate: 0.050,  deduction: 184300000 },
];

function calcHoldingTax(p){
  // 1) 재산세
  const fmvRatio = p.isOneHouse
    ? (p.publicPrice <= 300000000 ? 0.43 : p.publicPrice <= 600000000 ? 0.44 : 0.45)
    : 0.60;
  const ptBase = p.publicPrice * fmvRatio;
  const ptBrackets = p.isOneHouse ? PROPERTY_TAX_ONEHOUSE : PROPERTY_TAX_STANDARD;
  const propertyTax = progressiveTax(ptBase, ptBrackets);
  const localEduTaxPT = propertyTax * 0.2; // 지방교육세 (재산세액의 20%)
  const urbanAreaTax = p.isUrbanArea ? ptBase * 0.0014 : 0; // 도시지역분
  const propertyTaxTotal = propertyTax + localEduTaxPT + urbanAreaTax;

  // 2) 종합부동산세 (현행법: 1주택 12억 공제, 그 외 9억 공제)
  const deduction = p.isOneHouse ? 1200000000 : 900000000;
  const ctBase = clamp0(p.publicPrice - deduction) * 0.60; // 공정시장가액비율 60%
  const ctBrackets = p.houseCount >= 3 ? COMP_TAX_OVER3 : COMP_TAX_UNDER2;
  const compTax = progressiveTax(ctBase, ctBrackets);
  const ruralTaxCT = compTax * 0.2; // 농어촌특별세 (종부세액의 20%)
  const compTaxTotal = compTax + ruralTaxCT;

  const total = propertyTaxTotal + compTaxTotal;

  return {
    fmvRatio, ptBase, propertyTax, localEduTaxPT, urbanAreaTax, propertyTaxTotal,
    deduction, ctBase, compTax, ruralTaxCT, compTaxTotal, total,
    rows: [
      ['[재산세] 과세표준', won(ptBase)],
      ['[재산세] 산출세액', won(propertyTax)],
      ['[재산세] 지방교육세 (20%)', won(localEduTaxPT)],
      ['[재산세] 도시지역분', won(urbanAreaTax)],
      ['[종부세] 공제 후 과세표준', won(ctBase)],
      ['[종부세] 산출세액', won(compTax)],
      ['[종부세] 농어촌특별세 (20%)', won(ruralTaxCT)],
    ]
  };
}

/* -------------------------------------------------------------------------
   6) 상속지분 — 법정상속분 (민법 §1009)
   ------------------------------------------------------------------------- */
function calcInheritanceShare(p){
  const childShare = 1;
  const spouseShare = p.hasSpouse ? 1.5 : 0;
  const totalUnits = spouseShare + (p.childCount * childShare);
  const results = [];
  if (p.hasSpouse) {
    results.push(['배우자', spouseShare, spouseShare / totalUnits]);
  }
  for (let i = 1; i <= p.childCount; i++) {
    results.push([`자녀 ${i}`, childShare, childShare / totalUnits]);
  }
  return {
    totalUnits, results,
    rows: results.map(([name, unit, ratio]) => [
      `${name} (지분 ${unit})`, (ratio * 100).toFixed(2) + '%'
    ])
  };
}

/* -------------------------------------------------------------------------
   7) 등기비용 — 취득세 + 국민주택채권 손실분 + 법무사 정액보수
   ------------------------------------------------------------------------- */
function calcRegistrationCost(p){
  // 취득세는 기존 calcAcquisitionTax 재사용
  const acq = calcAcquisitionTax({
    acquireType: p.acquireType, price: p.price, houseCount: p.houseCount,
    exceedsArea85: p.exceedsArea85, isAdjustedArea: p.isAdjustedArea,
  });
  // 국민주택채권: 매입금액은 시가표준액 구간·지역별로 상이해 사용자가 직접 입력
  const bondLoss = p.bondAmount * (p.bondDiscountRate / 100);
  // 법무사 보수기준 §25: 취득세신고대행 5만 + 채권매입대행 4만 + 기타업무대행 4만
  const legalFeeBase = 50000 + 40000 + 40000;
  const registrationStampFee = 15000; // 대법원등기 수입증지 (소유권이전, 통상 기준)
  const total = acq.total + bondLoss + legalFeeBase + registrationStampFee;

  return {
    acq, bondLoss, legalFeeBase, registrationStampFee, total,
    rows: [
      ['취득세·지방교육세·농특세', won(acq.total)],
      ['국민주택채권 매입 손실분', won(bondLoss)],
      ['법무사 정액보수 (법무사보수기준 §25)', won(legalFeeBase)],
      ['등기신청수수료 (수입증지)', won(registrationStampFee)],
    ]
  };
}

/* ---------- 법적고지 모달 ---------- */
function openLegalModal(){
  const el = document.getElementById('legalOverlay');
  if (el) el.classList.add('show');
}
function closeLegalModal(){
  const el = document.getElementById('legalOverlay');
  if (el) el.classList.remove('show');
}
document.addEventListener('click', function(e){
  if (e.target && e.target.id === 'legalOverlay') closeLegalModal();
});
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') closeLegalModal();
});
