/* ==========================================================================
   TAXAJIN 계산 엔진 (v3)
   ※ 아래 세율·공제 수치는 2026.08 기준 확인된 자료이며, 실제 신고 시점의
     법령·시행령 개정 여부를 반드시 재확인해야 함. 계산기 화면에도 동일한
     안내 문구를 노출한다. (JB 확인 필요 — 매년 1월/개정 시 갱신)

   출처
   - 양도세 기본세율: 소득세법 §55①, §104① (누진세율 6~45%, 8단계)
   - 양도세 단기세율: 1년미만 70%, 1~2년 60% (주택·조합원입주권·분양권 공통,
     소득세법 §104①, '21.6.1. 이후 양도분)
   - 분양권: 보유기간 무관 60%/70% 단일세율 고정, 장기보유특별공제 없음
   - 조합원입주권: 2년 이상 보유 시 기본세율+장기보유특별공제(일반 2%/년), 이하 단기세율
   - 양도세 다주택 중과(주택): 2026.5.10 유예 종료, 조정대상지역 2주택 +20%p,
     3주택↑ +30%p (소득세법 §104⑦)
   - 취득세 기본세율: 지방세법 §11 (6억↓ 1%, 6~9억 구간산식, 9억↑ 3%)
   - 취득세 다주택 중과: 조정대상지역 2주택 8%, 3주택↑ 12%
     증여취득 3.5%(조정지역 3억↑ 12%), 상속취득 2.8%
   - 상속·증여세 세율: 상증세법 §26, §56 (10~50% 5단계 누진)
   - 상속공제: 일괄공제 5억(§21), 배우자상속공제 5억~30억(§19)
   - 증여재산공제: 배우자 6억, 직계존속·비속 5천만(미성년 2천만),
     기타친족 1천만, 10년 합산 (§53)
   - 보유세: 지방세법 §111(재산세), 종부세법 §8·§9(종합부동산세)
   ========================================================================== */

const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const wonMinus = n => Math.round(n) === 0 ? won(0) : ('-' + won(n));
const clamp0 = n => Math.max(0, n);

/* ---------- 금액 입력창 천단위 콤마 자동 포맷 ---------- */
function attachThousands(el){
  if (!el) return;
  el.addEventListener('input', function(){
    const raw = el.value.replace(/[^0-9]/g, '');
    el.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
  });
}
function rawNumber(el){
  if (!el) return 0;
  return Number((el.value || '0').replace(/[^0-9]/g, '')) || 0;
}
function attachThousandsAll(selector){
  document.querySelectorAll(selector).forEach(attachThousands);
}

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
   1) 양도소득세 — 자산유형별(주택/분양권/입주권) 세율 분기
   ------------------------------------------------------------------------- */
function calcTransferTax(p){
  const gain = clamp0(p.transferPrice - p.acquisitionPrice - p.necessaryExpense);
  const basicDeduction = 2500000; // 소득세법 §103, 인별 연 250만원
  const gainAfterBasic = clamp0(gain - basicDeduction);

  // 분양권: 보유기간과 무관하게 60%/70% 단일세율, 장특공제 없음
  if (p.assetType === 'presale') {
    const rate = p.holdYears < 1 ? 0.70 : 0.60;
    const capitalGainsTax = gainAfterBasic * rate;
    const localIncomeTax = capitalGainsTax * 0.1;
    const total = capitalGainsTax + localIncomeTax;
    return {
      gain, taxBase: gainAfterBasic, capitalGainsTax, localIncomeTax, total, rateApplied: rate,
      rows: [
        ['양도차익', won(gain)],
        ['기본공제', wonMinus(basicDeduction)],
        ['과세표준', won(gainAfterBasic)],
        [`분양권 단일세율 (${(rate*100).toFixed(0)}%)`, won(capitalGainsTax)],
        ['지방소득세 (10%)', won(localIncomeTax)],
      ]
    };
  }

  // 주택 / 조합원입주권 공통: 보유기간에 따라 단기세율 vs (기본세율/중과) 분기
  if (p.holdYears < 2) {
    const rate = p.holdYears < 1 ? 0.70 : 0.60;
    const capitalGainsTax = gainAfterBasic * rate;
    const localIncomeTax = capitalGainsTax * 0.1;
    const total = capitalGainsTax + localIncomeTax;
    return {
      gain, taxBase: gainAfterBasic, capitalGainsTax, localIncomeTax, total, rateApplied: rate,
      rows: [
        ['양도차익', won(gain)],
        ['기본공제', wonMinus(basicDeduction)],
        ['과세표준', won(gainAfterBasic)],
        [`단기보유세율 (${(rate*100).toFixed(0)}%)`, won(capitalGainsTax)],
        ['지방소득세 (10%)', won(localIncomeTax)],
      ]
    };
  }

  // 2년 이상 보유: 장기보유특별공제 + 기본세율 (주택은 1세대1주택 특례 가능)
  let deductRate = 0;
  if (p.assetType === 'house' && p.isOneHouse) {
    const holdRate = Math.min(Math.floor(p.holdYears) * 0.04, 0.40);
    const liveRate = Math.min(Math.floor(p.liveYears) * 0.04, 0.40);
    deductRate = p.liveYears >= 2 ? (holdRate + liveRate) : 0;
  } else {
    deductRate = p.holdYears >= 3 ? Math.min(Math.floor(p.holdYears) * 0.02, 0.30) : 0;
  }
  const specialDeduction = gain * deductRate;
  const taxBase = clamp0(gain - specialDeduction - basicDeduction);

  const basic = progressiveTax(taxBase, INCOME_TAX_BRACKETS);
  let surchargeTax = 0;
  if (p.assetType === 'house' && p.isAdjustedArea && p.houseCount >= 2 && !p.isOneHouse) {
    const addRate = p.houseCount === 2 ? 0.20 : 0.30;
    const surchargeBrackets = INCOME_TAX_BRACKETS.map(b => ({...b, rate: b.rate + addRate}));
    surchargeTax = progressiveTax(gainAfterBasic, surchargeBrackets);
  }
  const capitalGainsTax = Math.max(basic, surchargeTax);
  const localIncomeTax = capitalGainsTax * 0.1;
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

  // 생애최초 구입 감면 (지방세특례제한법 §36의3): 12억원 이하 주택, 취득세 200만원 한도 감면
  let firstTimeDeduction = 0;
  if (p.isFirstTime && p.acquireType === 'trade' && p.houseCount === 1 && p.price <= 1200000000) {
    firstTimeDeduction = Math.min(acquisitionTax, 2000000);
  }

  const total = acquisitionTax + localEduTax + ruralTax - firstTimeDeduction;

  const rows = [
    ['취득세율', (rate*100).toFixed(2) + '%'],
    ['취득세', won(acquisitionTax)],
    ['지방교육세', won(localEduTax)],
    ['농어촌특별세', won(ruralTax)],
  ];
  if (firstTimeDeduction > 0) rows.push(['생애최초 구입 감면', wonMinus(firstTimeDeduction)]);

  return { rate, acquisitionTax, localEduTax, ruralTax, firstTimeDeduction, total, rows };
}

/* -------------------------------------------------------------------------
   3) 증여세 (부담부증여 채무인수액 반영 가능)
   ------------------------------------------------------------------------- */
function calcGiftTax(p){
  const deductionTable = {
    spouse: 600000000,
    lineal_adult: 50000000,
    lineal_minor: 20000000,
    other_relative: 10000000,
  };
  const debt = p.debt || 0; // 부담부증여 시 수증자가 인수한 채무액 (상증세법 §47③)
  const netGiftValue = clamp0(p.giftValue - debt);
  const cap = clamp0(deductionTable[p.relation] - p.priorUsed);
  const deduction = Math.min(cap, netGiftValue);
  const taxBase = clamp0(netGiftValue - deduction);
  const tax = progressiveTax(taxBase, ESTATE_GIFT_BRACKETS);
  const reportCredit = tax * 0.03; // 신고세액공제 3% (§69)
  const total = tax - reportCredit;

  const rows = [
    ['증여재산가액', won(p.giftValue)],
  ];
  if (debt > 0) rows.push(['인수한 채무액', wonMinus(debt)]);
  rows.push(
    ['증여재산공제', wonMinus(deduction)],
    ['과세표준', won(taxBase)],
    ['산출세액', won(tax)],
    ['신고세액공제 (3%)', wonMinus(reportCredit)],
  );

  return { debt, netGiftValue, deduction, taxBase, tax, reportCredit, total, rows };
}

/* -------------------------------------------------------------------------
   4) 상속세 — 일괄공제(5억)와 인적공제(기초2억+자녀·미성년·연로자) 중 큰 금액 자동 적용
   ------------------------------------------------------------------------- */
function calcInheritanceTax(p){
  const lumpSum = 500000000; // 일괄공제 (§21)
  const basicDeduction = 200000000; // 기초공제 (§18)
  const childDeduction = (p.childCount || 0) * 50000000; // 자녀공제 1인당 5천만 (§20)
  const minorDeduction = (p.minorRemainingYears || 0) * 10000000; // 미성년자공제: 잔여연수 합 × 1천만
  const elderlyDeduction = (p.elderlyCount || 0) * 50000000; // 연로자공제(65세 이상) 1인당 5천만
  const individualTotal = basicDeduction + childDeduction + minorDeduction + elderlyDeduction;
  const generalDeduction = Math.max(lumpSum, individualTotal); // 일괄공제 vs 인적공제 중 큰 것 (§21②)

  const spouseDeduction = p.hasSpouse ? Math.min(Math.max(p.spouseShare, 500000000), 3000000000, p.totalEstate) : 0; // 배우자상속공제 5억~30억 (§19)
  const totalDeduction = Math.min(generalDeduction + spouseDeduction, p.totalEstate);
  const taxBase = clamp0(p.totalEstate - totalDeduction);
  const tax = progressiveTax(taxBase, ESTATE_GIFT_BRACKETS);
  const reportCredit = tax * 0.03;
  const total = tax - reportCredit;

  const rows = [
    ['상속재산가액', won(p.totalEstate)],
    [generalDeduction > lumpSum ? '인적공제 (일괄공제보다 유리)' : '일괄공제', wonMinus(generalDeduction)],
    ['배우자상속공제', wonMinus(spouseDeduction)],
    ['과세표준', won(taxBase)],
    ['산출세액', won(tax)],
    ['신고세액공제 (3%)', wonMinus(reportCredit)],
  ];

  return {
    lumpSum, individualTotal, generalDeduction, spouseDeduction, totalDeduction, taxBase, tax, reportCredit, total, rows
  };
}

/* -------------------------------------------------------------------------
   5) 보유세 — 재산세 (지방세법 §111) + 종합부동산세 (종부세법 §8, §9)
   ------------------------------------------------------------------------- */
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
  const fmvRatio = p.isOneHouse
    ? (p.publicPrice <= 300000000 ? 0.43 : p.publicPrice <= 600000000 ? 0.44 : 0.45)
    : 0.60;
  const ptBase = p.publicPrice * fmvRatio;
  const ptBrackets = p.isOneHouse ? PROPERTY_TAX_ONEHOUSE : PROPERTY_TAX_STANDARD;
  const propertyTax = progressiveTax(ptBase, ptBrackets);
  const localEduTaxPT = propertyTax * 0.2;
  const urbanAreaTax = p.isUrbanArea ? ptBase * 0.0014 : 0;
  const propertyTaxTotal = propertyTax + localEduTaxPT + urbanAreaTax;

  const deduction = p.isOneHouse ? 1200000000 : 900000000;
  const ctBase = clamp0(p.publicPrice - deduction) * 0.60;
  const ctBrackets = p.houseCount >= 3 ? COMP_TAX_OVER3 : COMP_TAX_UNDER2;
  const compTax = progressiveTax(ctBase, ctBrackets);
  const ruralTaxCT = compTax * 0.2;
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
