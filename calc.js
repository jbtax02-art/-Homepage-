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

/* ---------- 날짜 두 개로 보유/거주 연수 자동 계산 ---------- */
function yearsBetween(startStr, endStr){
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
  return (end - start) / (1000 * 60 * 60 * 24 * 365.25);
}

/* ---------- 상담 신청: 클릭 한 번으로 계산 결과 + 전화번호를 이메일로 바로 전송 (EmailJS) ----------
   JB: emailjs.com에서 발급받은 3개 값을 아래에 붙여넣으세요.
   (Service ID, Template ID, Public Key — 설정 방법은 안내한 단계 참고)          */
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';

if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
  emailjs.init(EMAILJS_PUBLIC_KEY);
}

function submitLeadDirect(calculatorName, summaryLines){
  if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    alert('아직 상담 접수 연결이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  const phone = prompt('상담 연락받으실 전화번호를 입력해주세요.\n(입력 후 확인을 누르면 계산 결과와 함께 바로 접수됩니다)');
  if (!phone || !phone.trim()) return; // 취소하거나 빈 값이면 전송하지 않음

  const payload = {
    calculator: calculatorName,
    phone: phone.trim(),
    summary: summaryLines.join(' / '),
    url: location.href,
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, payload).then(() => {
    showCopyToast('상담 신청이 접수되었습니다. 확인 후 순차적으로 연락드립니다.');
  }).catch(() => {
    showCopyToast('전송 중 문제가 발생했습니다. 전화로 문의해주세요.');
  });
}

function buildSummaryFromBreakdown(prefix){
  const breakdownEl = document.getElementById(prefix + '-breakdown');
  const totalEl = document.getElementById(prefix + '-total');
  const lines = [];
  if (breakdownEl) {
    breakdownEl.querySelectorAll('.row').forEach(row => {
      const k = row.querySelector('.k');
      const v = row.querySelector('.v');
      if (k && v) lines.push(`${k.textContent.trim()}: ${v.textContent.trim()}`);
    });
  }
  if (totalEl) lines.push(`합계: ${totalEl.textContent.trim()}`);
  return lines;
}

function buildHoldingSummary(){
  const totalEl = document.getElementById('h-total');
  const ownerEl = document.getElementById('h-owner-breakdown');
  const lines = [];
  if (ownerEl) {
    ownerEl.querySelectorAll('.row').forEach(row => {
      const k = row.querySelector('.k');
      const v = row.querySelector('.v');
      if (k && v) lines.push(`${k.textContent.trim()}: ${v.textContent.trim()}`);
    });
  }
  if (totalEl) lines.push(`세대 합계: ${totalEl.textContent.trim()}`);
  return lines;
}

/* ---------- 인쇄(PDF 저장) 직전 발급일시 채워넣기 ---------- */
function preparePrintDate(){
  const now = new Date().toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
  document.querySelectorAll('.print-date').forEach(el => { el.textContent = now; });
}

function showCopyToast(message){
  let toast = document.getElementById('copyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copyToast';
    toast.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:300; background:#0F4C77; color:#fff; padding:12px 18px; border-radius:6px; font-size:13.5px; max-width:90vw; text-align:center; box-shadow:0 8px 24px rgba(0,0,0,.25);';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.display = 'none'; }, 4500);
}

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
   2026년 세제개편안 (2026.8.3 재정경제부 발표, 상세본 기준) — 연도별 시뮬레이션 설정
   ※ 발표안은 아직 국회 심의·의결 전으로 확정 법률이 아님. 조문·세율·시행일은
     국회 논의 과정에서 달라질 수 있음. 시행시기가 항목별로 2027/2028/2029로
     다르므로 "적용 연도"를 선택하면 그 시점 규정을 반영해 계산합니다.
   근거: 2026년 세제개편안 상세본, 소득세법 §95②③⑦~⑬, §103, §104①⑦,
        종합부동산세법 §7①·§8①·§9①②⑤⑧⑨·§10·§13·§14①
   ------------------------------------------------------------------------- */
function getReformSettings(reformYear){
  const y = reformYear || 2026; // 2026 = 현행법(개편 미적용)
  return {
    // 1세대1주택 특례 장기보유특별공제(개정 후 "장기거주 소득공제") — 보유/거주 tier
    // 시행 '28.1.1. 이후 양도분 (소득법 §95②)
    oneHouseHoldRate: y <= 2027 ? 0.04 : (y === 2028 ? 0.02 : 0),
    oneHouseHoldMax:  y <= 2027 ? 0.40 : (y === 2028 ? 0.20 : 0),
    oneHouseLiveRate: y <= 2027 ? 0.04 : (y === 2028 ? 0.06 : 0.08),
    oneHouseLiveMax:  y <= 2027 ? 0.40 : (y === 2028 ? 0.60 : 0.80),
    // 다주택자 주택(1세대1주택 특례 미해당) 장기보유특별공제 — 보유/거주 tier
    // 시행 '28.1.1. 이후 양도분 (소득법 §95②)
    multiHoldRate: y <= 2027 ? 0.02 : (y === 2028 ? 0.01 : 0),
    multiHoldMax:  y <= 2027 ? 0.30 : (y === 2028 ? 0.15 : 0),
    multiLiveRate: y <= 2027 ? 0 : 0.02,
    multiLiveMax:  y <= 2027 ? 0 : 0.30,
    // 다주택 조정대상지역 양도세 중과 가산율 한시 완화(2년 이상 보유 요건)
    // 시행 '27.1.1. 이후 양도분, '27~'28년 한시조치 (소득법 §104⑦)
    surcharge2: y === 2027 ? 0.05 : (y === 2028 ? 0.10 : 0.20),
    surcharge3: y === 2027 ? 0.10 : (y === 2028 ? 0.15 : 0.30),
    // 10년 이상 거주 1세대1주택(양도가액 30억원 이하) 양도소득 기본공제 확대(250만→2,500만)
    // 시행 '27.1.1. 이후 양도분 (소득법 §103)
    basicDeductionExpand: y >= 2027,
    // 비사업용토지 장기보유특별공제 배제 + 중과세율 10%p→20%p
    // 시행 '28.1.1. 이후 양도분 (소득법 §95④, §104①)
    nonbizNewRule: y >= 2028,
  };
}

/* -------------------------------------------------------------------------
   1) 양도소득세 — 자산유형별(주택/분양권/입주권) 세율 분기
   p.reformYear: 2026(현행, 기본값) | 2027 | 2028 | 2029 — 2026 세제개편안 시뮬레이션
   ------------------------------------------------------------------------- */
function calcTransferTax(p){
  const settings = getReformSettings(p.reformYear);
  const gain = clamp0(p.transferPrice - p.acquisitionPrice - p.necessaryExpense);
  const isExpandedBasicDeduction = settings.basicDeductionExpand
    && p.assetType === 'house' && p.isOneHouse && p.liveYears >= 10 && p.transferPrice <= 3000000000;
  const basicDeduction = isExpandedBasicDeduction ? 25000000 : 2500000; // 소득세법 §103
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
        ['지방소득세 (본세의 10%)', won(localIncomeTax)],
      ]
    };
  }

  // 단기보유세율: 주택·조합원입주권은 70%/60%, 비사업용토지·기타자산은 50%/40% (소득세법 §104①2·3호)
  const isHouseLike = (p.assetType === 'house' || p.assetType === 'right');
  if (p.holdYears < 2) {
    const rate = isHouseLike
      ? (p.holdYears < 1 ? 0.70 : 0.60)
      : (p.holdYears < 1 ? 0.50 : 0.40);
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
        ['지방소득세 (본세의 10%)', won(localIncomeTax)],
      ]
    };
  }

  // 2년 이상 보유: 조정대상지역 다주택 중과 대상이면 장기보유특별공제 자체가 배제됨(§95②),
  // 그 외에는 기본세율 + 장기보유특별공제 (비사업용토지는 기본세율에 10%p 가산)
  // 1세대1주택 비과세 특례는 조정대상지역 취득 주택의 경우 2년 이상 거주해야 인정됨 (소득세법 시행령 §154①)
  const qualifiesOneHouse = p.assetType === 'house' && p.isOneHouse && (!p.isAdjustedArea || p.liveYears >= 2);
  const oneHouseExceptionFailed = p.assetType === 'house' && p.isOneHouse && !qualifiesOneHouse;
  const isMultiHouseHeavy = p.assetType === 'house' && p.isAdjustedArea && p.houseCount >= 2 && !qualifiesOneHouse;

  let deductRate = 0, specialDeduction = 0, taxBase, capitalGainsTax, effectiveRatePct;
  let surchargeAddRate = null, nonbizExcluded = false, highValuePortion = null;

  if (isMultiHouseHeavy) {
    // 다주택 중과: 장특공제 배제, 과세표준 = 양도차익 - 기본공제만
    const addRate = p.houseCount === 2 ? settings.surcharge2 : settings.surcharge3;
    surchargeAddRate = addRate;
    const surchargeBrackets = INCOME_TAX_BRACKETS.map(b => ({...b, rate: b.rate + addRate}));
    taxBase = gainAfterBasic;
    capitalGainsTax = progressiveTax(taxBase, surchargeBrackets);
    const marginalBand = surchargeBrackets.find(b => taxBase <= b.limit);
    effectiveRatePct = marginalBand ? (marginalBand.rate * 100).toFixed(0) : '';
  } else if (p.assetType === 'nonbiz_land' && settings.nonbizNewRule) {
    // 2028년 이후: 비사업용토지 장특공제 완전 배제 + 중과세율 +20%p (개편안 §95④, §104①)
    nonbizExcluded = true;
    taxBase = gainAfterBasic;
    const nonbizBrackets = INCOME_TAX_BRACKETS.map(b => ({...b, rate: b.rate + 0.20}));
    capitalGainsTax = progressiveTax(taxBase, nonbizBrackets);
    const marginalBand = nonbizBrackets.find(b => taxBase <= b.limit);
    effectiveRatePct = marginalBand ? (marginalBand.rate * 100).toFixed(0) : '';
  } else {
    let baseGain = gain; // 장특공제·과세표준 산정에 쓸 기준 양도차익 (고가주택은 안분된 값으로 대체)

    if (qualifiesOneHouse) {
      // 고가주택(실거래가 12억원 초과): 12억원 초과분에 해당하는 양도차익만 과세 (소득세법 §95③)
      if (p.transferPrice > 1200000000) {
        const ratio = (p.transferPrice - 1200000000) / p.transferPrice;
        baseGain = gain * ratio;
        highValuePortion = { ratio, taxableGain: baseGain };
      }
      const holdRate = Math.min(Math.floor(p.holdYears) * settings.oneHouseHoldRate, settings.oneHouseHoldMax);
      const liveRate = Math.min(Math.floor(p.liveYears) * settings.oneHouseLiveRate, settings.oneHouseLiveMax);
      deductRate = p.liveYears >= 2 ? (holdRate + liveRate) : 0;
    } else if (p.assetType === 'house') {
      // 다주택자 주택(1세대1주택 특례 미해당, 또는 특례 요건 미충족) — 보유/거주 tier 중 큰 쪽 (§95②, '28년 이후 거주요건 추가)
      const holdRate = (p.holdYears >= 3) ? Math.min(Math.floor(p.holdYears) * settings.multiHoldRate, settings.multiHoldMax) : 0;
      const liveRate = (p.liveYears >= 2) ? Math.min(Math.floor(p.holdYears) * settings.multiLiveRate, settings.multiLiveMax) : 0;
      deductRate = Math.max(holdRate, liveRate);
    } else {
      // 조합원입주권·기타자산·비사업용토지(개편 미적용 연도): 일반 2%/년, 최대 30% — 이번 개편안에서 세율 변동 없음
      deductRate = p.holdYears >= 3 ? Math.min(Math.floor(p.holdYears) * 0.02, 0.30) : 0;
    }
    specialDeduction = baseGain * deductRate;
    taxBase = clamp0(baseGain - specialDeduction - basicDeduction);

    const brackets = (p.assetType === 'nonbiz_land')
      ? INCOME_TAX_BRACKETS.map(b => ({...b, rate: b.rate + 0.10})) // 비사업용토지 +10%p (§104①8, 개편 전)
      : INCOME_TAX_BRACKETS;
    capitalGainsTax = progressiveTax(taxBase, brackets);
    const marginalBand = brackets.find(b => taxBase <= b.limit);
    effectiveRatePct = marginalBand ? (marginalBand.rate * 100).toFixed(0) : '';
  }

  const localIncomeTax = capitalGainsTax * 0.1;
  const total = capitalGainsTax + localIncomeTax;

  const rows = [
    ['양도차익', won(gain)],
  ];
  if (oneHouseExceptionFailed) {
    rows.push(['1세대1주택 비과세 특례', '미적용 (조정대상지역 취득주택은 2년 이상 거주 필요)']);
  }
  if (highValuePortion) {
    rows.push(['12억원 초과분 과세대상 양도차익', won(highValuePortion.taxableGain) + ` (전체의 ${(highValuePortion.ratio*100).toFixed(1)}%)`]);
  }
  if (isMultiHouseHeavy) {
    rows.push(['장기보유특별공제', '배제 (다주택 중과 대상)']);
  } else if (p.assetType === 'nonbiz_land' && settings.nonbizNewRule) {
    rows.push(['장기보유특별공제', '배제 (2028년 개편안 — 비사업용토지)']);
  } else {
    rows.push([`장기보유특별공제 (${(deductRate*100).toFixed(0)}%)`, wonMinus(specialDeduction)]);
  }
  if (isExpandedBasicDeduction) {
    rows.push(['기본공제 (10년+거주 1세대1주택 확대, 개편안)', wonMinus(basicDeduction)]);
  } else {
    rows.push(['기본공제', wonMinus(basicDeduction)]);
  }
  rows.push(
    ['과세표준', won(taxBase)],
    [`양도소득세 (한계세율 ${effectiveRatePct}%)`, won(capitalGainsTax)],
    ['지방소득세 (본세의 10%)', won(localIncomeTax)],
  );

  return {
    gain, deductRate, specialDeduction, basicDeduction, taxBase,
    capitalGainsTax, localIncomeTax, total, isMultiHouseHeavy,
    surchargeAddRate, nonbizExcluded, isExpandedBasicDeduction,
    qualifiesOneHouse, oneHouseExceptionFailed, highValuePortion,
    rows
  };
}

/* -------------------------------------------------------------------------
   양도세 개편안 비교 — 2026(현행) 대비 지정 연도들의 세액 차이와 증감 사유 생성
   ------------------------------------------------------------------------- */
function compareTransferReform(p, baseResult, compareYears){
  return compareYears.map(year => {
    const cmp = calcTransferTax({ ...p, reformYear: year });
    const diff = cmp.total - baseResult.total;
    const pct = baseResult.total !== 0 ? (diff / baseResult.total * 100) : 0;
    const reasons = [];

    if (baseResult.isMultiHouseHeavy && cmp.isMultiHouseHeavy && baseResult.surchargeAddRate !== cmp.surchargeAddRate) {
      reasons.push(`다주택 중과 가산율이 +${(baseResult.surchargeAddRate*100).toFixed(0)}%p → +${(cmp.surchargeAddRate*100).toFixed(0)}%p로 한시 완화됨`);
    }
    if (!baseResult.isMultiHouseHeavy && !cmp.isMultiHouseHeavy && baseResult.deductRate !== cmp.deductRate
        && !(p.assetType === 'nonbiz_land' && cmp.nonbizExcluded)) {
      reasons.push(`장기보유특별공제율이 ${(baseResult.deductRate*100).toFixed(0)}% → ${(cmp.deductRate*100).toFixed(0)}%로 변경됨`);
    }
    if (cmp.nonbizExcluded && !baseResult.nonbizExcluded) {
      reasons.push('비사업용토지 장기보유특별공제가 배제되고 중과세율이 +10%p → +20%p로 인상됨');
    }
    if (baseResult.basicDeduction !== cmp.basicDeduction) {
      reasons.push(`양도소득 기본공제가 ${won(baseResult.basicDeduction)} → ${won(cmp.basicDeduction)}로 확대됨 (10년+거주 1세대1주택 특례)`);
    }
    if (reasons.length === 0) {
      reasons.push('입력하신 조건에서는 해당 연도 개편안이 적용되는 항목이 없어 현행과 동일합니다.');
    }

    return { year, result: cmp, diff, pct, reasons };
  });
}

/* -------------------------------------------------------------------------
   2) 취득세 (유상취득 / 증여취득 / 상속취득)
   ------------------------------------------------------------------------- */
function calcAcquisitionTax(p){
  const { assetType, acquireType, price, houseCount, isAdjustedArea, exceedsArea85, isSelfFarmed } = p;
  let rate;

  if (assetType === 'house') {
    if (acquireType === 'inherit' || acquireType === 'original') rate = 0.028; // 상속·원시 2.8%
    else if (acquireType === 'gift') rate = (isAdjustedArea && price >= 300000000) ? 0.12 : 0.035;
    else {
      // 매매(유상취득)
      if (houseCount >= 2 && isAdjustedArea) rate = houseCount === 2 ? 0.08 : 0.12;
      else if (houseCount >= 4 && !isAdjustedArea) rate = 0.12;
      else {
        if (price <= 600000000) rate = 0.01;
        else if (price <= 900000000) rate = (price / 300000000 * 2 - 3) / 100;
        else rate = 0.03;
      }
    }
  } else if (assetType === 'officetel') {
    if (acquireType === 'inherit' || acquireType === 'original') rate = 0.028;
    else if (acquireType === 'gift') rate = 0.035;
    else rate = 0.04; // 매매 고정 4% (주택법상 주택 아님, 다주택 중과 대상 아님)
  } else if (assetType === 'farmland') {
    if (acquireType === 'inherit') rate = 0.023; // 농지 상속은 2.3%로 일반상속(2.8%)과 다름
    else if (acquireType === 'original') rate = 0.028;
    else if (acquireType === 'gift') rate = 0.035;
    else rate = isSelfFarmed ? 0.015 : 0.03; // 매매: 2년 이상 자경 1.5%, 신규 3%
  } else {
    // 그 외 (토지·상가·건물 등 일반)
    if (acquireType === 'inherit' || acquireType === 'original') rate = 0.028;
    else if (acquireType === 'gift') rate = 0.035;
    else rate = 0.04;
  }

  const base = price;
  const acquisitionTax = base * rate;
  const isHouseHeavy = assetType === 'house' && (rate === 0.08 || rate === 0.12);

  // 지방교육세: 주택 유상취득은 취득세율의 1/10, 그 외(무상·원시·비주택)는 (세율-2%)×20% (지방세법 §151①)
  let localEduTax;
  if (assetType === 'farmland' && acquireType === 'trade' && isSelfFarmed) {
    localEduTax = base * 0.001; // 2년 이상 자경 농지 감면 특례 (실무 확인값 0.1%)
  } else if (assetType === 'house' && acquireType === 'trade' && !isHouseHeavy) {
    localEduTax = acquisitionTax * 0.1;
  } else if (isHouseHeavy) {
    localEduTax = base * 0.004;
  } else {
    localEduTax = base * Math.max(rate - 0.02, 0) * 0.2;
  }

  // 농어촌특별세: 주택은 전용 85㎡ 초과 시만, 그 외 자산은 규모 무관 0.2% (농특세법 §5)
  let ruralTax;
  if (assetType === 'farmland' && acquireType === 'trade' && isSelfFarmed) {
    ruralTax = 0;
  } else if (assetType === 'house') {
    ruralTax = isHouseHeavy
      ? (exceedsArea85 ? base * (rate === 0.12 ? 0.01 : 0.006) : 0)
      : (exceedsArea85 ? base * 0.002 : 0);
  } else {
    ruralTax = base * 0.002;
  }

  // 생애최초 구입 감면 (지방세특례제한법 §36의3): 주택·매매·1주택·12억원 이하, 취득세 200만원 한도 감면
  let firstTimeDeduction = 0;
  if (p.isFirstTime && assetType === 'house' && acquireType === 'trade' && houseCount === 1 && price <= 1200000000) {
    firstTimeDeduction = Math.min(acquisitionTax, 2000000);
  }

  const total = acquisitionTax + localEduTax + ruralTax - firstTimeDeduction;

  const localEduPct = base > 0 ? (localEduTax / base * 100) : 0;
  const ruralPct = base > 0 ? (ruralTax / base * 100) : 0;

  const rows = [
    ['취득세율', (rate*100).toFixed(2) + '%'],
    ['취득세', won(acquisitionTax)],
    [`지방교육세 (취득가액의 ${localEduPct.toFixed(2)}%)`, won(localEduTax)],
    [`농어촌특별세 (취득가액의 ${ruralPct.toFixed(2)}%)`, won(ruralTax)],
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
  const relationDeduction = Math.min(cap, netGiftValue);

  // 혼인·출산 증여재산공제 (§53의2, 2024.1.1 시행): 혼인신고일 전후 2년(출산은 출생일부터 2년) 이내
  // 직계존속 증여에 한해 기존 공제와 별도로 최대 1억원 추가 공제 (혼인+출산 합산 1억 한도)
  const marriageChildDeduction = (p.useMarriageChildDeduction && (p.relation === 'lineal_adult' || p.relation === 'lineal_minor'))
    ? Math.min(100000000, clamp0(netGiftValue - relationDeduction))
    : 0;

  const deduction = relationDeduction + marriageChildDeduction;
  const taxBase = clamp0(netGiftValue - deduction);
  const tax = progressiveTax(taxBase, ESTATE_GIFT_BRACKETS);
  const reportCredit = tax * 0.03; // 신고세액공제 3% (§69)
  const total = tax - reportCredit;

  const rows = [
    ['증여재산가액', won(p.giftValue)],
  ];
  if (debt > 0) rows.push(['인수한 채무액', wonMinus(debt)]);
  rows.push(['증여재산공제', wonMinus(relationDeduction)]);
  if (marriageChildDeduction > 0) rows.push(['혼인·출산 증여재산공제', wonMinus(marriageChildDeduction)]);
  rows.push(
    ['과세표준', won(taxBase)],
    ['산출세액', won(tax)],
    ['신고세액공제 (3%)', wonMinus(reportCredit)],
  );

  return { debt, netGiftValue, relationDeduction, marriageChildDeduction, deduction, taxBase, tax, reportCredit, total, rows };
}

/* -------------------------------------------------------------------------
   4) 상속세 — 일괄공제(5억)와 인적공제(기초2억+자녀·미성년·연로자) 중 큰 금액 자동 적용
   ------------------------------------------------------------------------- */
function calcInheritanceTax(p){
  // 상속세 과세가액 = 상속재산가액 + 사전증여재산가산액 - 공과금 - 장례비용 - 채무 (§13, §14)
  const priorGift = p.priorGift || 0; // 상속인 10년·비상속인 5년 이내 사전증여재산 가산
  const publicDues = p.publicDues || 0; // 공과금
  const funeralCost = p.funeralCost || 0; // 장례비용 (§14, 통상 500만~1500만원 한도)
  const debt = p.debt || 0; // 채무
  const taxableEstate = clamp0(p.totalEstate + priorGift - publicDues - funeralCost - debt);

  const lumpSum = 500000000; // 일괄공제 (§21)
  const basicDeduction = 200000000; // 기초공제 (§18)
  const childDeduction = (p.childCount || 0) * 50000000; // 자녀공제 1인당 5천만 (§20)
  const minorDeduction = (p.minorRemainingYears || 0) * 10000000; // 미성년자공제: 잔여연수 합 × 1천만
  const elderlyDeduction = (p.elderlyCount || 0) * 50000000; // 연로자공제(65세 이상) 1인당 5천만
  const individualTotal = basicDeduction + childDeduction + minorDeduction + elderlyDeduction;
  const generalDeduction = Math.max(lumpSum, individualTotal); // 일괄공제 vs 인적공제 중 큰 것 (§21②)

  const spouseDeduction = p.hasSpouse ? Math.min(Math.max(p.spouseShare, 500000000), 3000000000, taxableEstate) : 0; // 배우자상속공제 5억~30억 (§19)
  const financialDeduction = Math.min(Math.max((p.financialAsset || 0) * 0.2, (p.financialAsset || 0) > 0 ? 20000000 : 0), 200000000); // 금융재산상속공제 (§22): 순금융재산의 20%와 2천만원 중 큰 금액, 최대 2억
  const totalDeduction = Math.min(generalDeduction + spouseDeduction + financialDeduction, taxableEstate);
  const taxBase = clamp0(taxableEstate - totalDeduction);
  const grossTax = progressiveTax(taxBase, ESTATE_GIFT_BRACKETS);

  const giftTaxCredit = Math.min(p.giftTaxCredit || 0, grossTax); // 증여세액공제 (§28, 사전증여분 기납부세액 이중과세 조정)
  const taxAfterCredit = clamp0(grossTax - giftTaxCredit);
  const reportCredit = taxAfterCredit * 0.03; // 신고세액공제 3% (§69)
  const total = taxAfterCredit - reportCredit;

  const rows = [
    ['상속재산가액', won(p.totalEstate)],
  ];
  if (priorGift > 0) rows.push(['사전증여재산가산액', won(priorGift)]);
  if (publicDues > 0) rows.push(['공과금', wonMinus(publicDues)]);
  if (funeralCost > 0) rows.push(['장례비용', wonMinus(funeralCost)]);
  if (debt > 0) rows.push(['채무', wonMinus(debt)]);
  rows.push(['상속세 과세가액', won(taxableEstate)]);
  rows.push([generalDeduction > lumpSum ? '인적공제 (일괄공제보다 유리)' : '일괄공제', wonMinus(generalDeduction)]);
  rows.push(['배우자상속공제', wonMinus(spouseDeduction)]);
  if (financialDeduction > 0) rows.push(['금융재산상속공제', wonMinus(financialDeduction)]);
  rows.push(
    ['과세표준', won(taxBase)],
    ['산출세액', won(grossTax)],
  );
  if (giftTaxCredit > 0) rows.push(['증여세액공제', wonMinus(giftTaxCredit)]);
  rows.push(['신고세액공제 (3%)', wonMinus(reportCredit)]);

  return {
    taxableEstate, lumpSum, individualTotal, generalDeduction, spouseDeduction, financialDeduction,
    totalDeduction, taxBase, grossTax, giftTaxCredit, reportCredit, total, rows
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

/* 2026년 세제개편안 — 종부세 세율표 (상세본 확인, §9①②)
   '27년: 2주택이하/3주택이상 구분 유지, 6~12억 구간 세율 인상(1.0%→1.3%)
   '28년 이후: 주택수 구분 폐지, 아래 OVER3와 동일한 단일세율표 적용 */
const COMP_TAX_2027_UNDER2 = [
  { limit: 300000000,   rate: 0.005,  deduction: 0 },
  { limit: 600000000,   rate: 0.007,  deduction: 600000 },
  { limit: 1200000000,  rate: 0.013,  deduction: 4200000 },
  { limit: 2500000000,  rate: 0.015,  deduction: 6600000 },
  { limit: 5000000000,  rate: 0.020,  deduction: 19100000 },
  { limit: 9400000000,  rate: 0.027,  deduction: 54100000 },
  { limit: Infinity,    rate: 0.035,  deduction: 129300000 },
];
const COMP_TAX_2027_OVER3 = [ // '28년 이후 단일세율표와 동일
  { limit: 300000000,   rate: 0.005,  deduction: 0 },
  { limit: 600000000,   rate: 0.007,  deduction: 600000 },
  { limit: 1200000000,  rate: 0.013,  deduction: 4200000 },
  { limit: 2500000000,  rate: 0.020,  deduction: 12600000 },
  { limit: 5000000000,  rate: 0.030,  deduction: 37600000 },
  { limit: 9400000000,  rate: 0.040,  deduction: 87600000 },
  { limit: Infinity,    rate: 0.050,  deduction: 181600000 },
];

/* -------------------------------------------------------------------------
   calcHoldingTaxDetailed — 세대 단위, 자산(주택/토지/건물)별·소유자별 보유세
   - 1세대1주택 판정: 세대 전체 "주택" 자산이 정확히 1건일 때 자동 적용
   - 재산세: 자산(물건) 전체 기준으로 세액 산출 후 지분율대로 소유자에게 안분 (실무 관행)
   - 종부세: 주택 자산만 인별로 지분 합산해서 계산 (토지·건물의 종부세는 별도 확인 필요, 미반영)
   ------------------------------------------------------------------------- */
function calcHoldingTaxDetailed(state){
  const assets = state.assets || [];
  const houseAssets = assets.filter(a => a.type === 'house');
  const isOneHouseHousehold = houseAssets.length === 1;
  const houseCount = houseAssets.length;

  const ownerTotals = {}; // key: 소유자명 -> { name, propertyTax, compTax, houseShareSum }
  function getOwner(name){
    if (!ownerTotals[name]) ownerTotals[name] = { name, propertyTax: 0, compTax: 0, houseShareSum: 0 };
    return ownerTotals[name];
  }

  const assetRows = [];
  let grandPropertyTax = 0;

  assets.forEach(asset => {
    const owners = (asset.owners || [])
      .filter(o => o.sharePct > 0)
      .map((o, idx) => ({ ...o, name: (o.name && o.name.trim()) || `소유자${idx + 1}` }));
    const shareTotal = owners.reduce((s,o)=>s+o.sharePct,0) || 100;

    let wholeBase, wholeBrackets, wholeTaxLabel;
    if (asset.type === 'house') {
      const fmvRatio = isOneHouseHousehold
        ? (asset.publicPrice <= 300000000 ? 0.43 : asset.publicPrice <= 600000000 ? 0.44 : 0.45)
        : 0.60;
      wholeBase = asset.publicPrice * fmvRatio;
      wholeBrackets = isOneHouseHousehold ? PROPERTY_TAX_ONEHOUSE : PROPERTY_TAX_STANDARD;
    } else {
      // 토지·건물: 공정시장가액비율 70% (지방세법 시행령 §109), 세율은 간이 근사치(0.3%) — 종합/별도합산·분리과세 구분 미반영
      wholeBase = asset.publicPrice * 0.70;
      wholeBrackets = [{ limit: Infinity, rate: 0.003, deduction: 0 }];
    }
    const wholePropertyTaxRaw = progressiveTax(wholeBase, wholeBrackets);
    const wholeLocalEdu = wholePropertyTaxRaw * 0.2;
    const wholeUrban = state.isUrbanArea ? wholeBase * 0.0014 : 0;
    const wholePropertyTotal = wholePropertyTaxRaw + wholeLocalEdu + wholeUrban;
    grandPropertyTax += wholePropertyTotal;

    const ownerShares = owners.map(o => {
      const pct = o.sharePct / shareTotal * 100;
      const amount = wholePropertyTotal * (pct / 100);
      const owner = getOwner(o.name);
      owner.propertyTax += amount;
      if (asset.type === 'house') owner.houseShareSum += asset.publicPrice * (pct / 100);
      return { name: o.name, relation: o.relation, pct, amount };
    });

    assetRows.push({
      type: asset.type, desc: asset.desc, publicPrice: asset.publicPrice,
      propertyTaxTotal: wholePropertyTotal, ownerShares,
    });
  });

  // 종부세: 주택만, 인별 지분 합산
  // 2026년 세제개편안(발표안, 미확정) 반영: 기본공제·공정시장가액비율·세율표가 '27년, '28년부터 각각 달라짐
  const reformYear = state.reformYear || 2026;
  const deduction = isOneHouseHousehold
    ? (reformYear >= 2027 ? (state.isResident ? 1400000000 : 900000000) : 1200000000)
    : 900000000; // '기타' 공제 확대식(4억+5억×비중)은 세부 산정요건 복잡해 미반영, 현행 9억으로 근사
  const ctFmvRatio = reformYear < 2027
    ? 0.60
    : (houseCount >= 3 ? (reformYear === 2027 ? 0.70 : 0.80) : 0.70); // 3주택+조정지역자 80%(28년~)는 조정지역 여부 미반영, 3주택 이상이면 적용으로 근사
  const ctBrackets = reformYear < 2027
    ? (houseCount >= 3 ? COMP_TAX_OVER3 : COMP_TAX_UNDER2)
    : (reformYear === 2027 ? (houseCount >= 3 ? COMP_TAX_2027_OVER3 : COMP_TAX_2027_UNDER2) : COMP_TAX_2027_OVER3);

  let grandCompTax = 0;
  Object.values(ownerTotals).forEach(owner => {
    if (owner.houseShareSum <= 0) return;
    const ctBase = clamp0(owner.houseShareSum - deduction) * ctFmvRatio;
    const compTaxRaw = progressiveTax(ctBase, ctBrackets);
    const ruralTax = compTaxRaw * 0.2;
    owner.compTax = compTaxRaw + ruralTax;
    grandCompTax += owner.compTax;
  });

  const grandTotal = grandPropertyTax + grandCompTax;
  const ownerList = Object.values(ownerTotals).map(o => ({
    ...o, total: o.propertyTax + o.compTax
  }));

  return {
    isOneHouseHousehold, houseCount, deduction, reformYear, ctFmvRatio, assetRows, ownerList,
    grandPropertyTax, grandCompTax, grandTotal,
  };
}

/* -------------------------------------------------------------------------
   보유세 개편안 비교 — 2026(현행) 대비 지정 연도들의 세액 차이와 증감 사유 생성
   ------------------------------------------------------------------------- */
function compareHoldingReform(state, baseResult, compareYears){
  return compareYears.map(year => {
    const cmp = calcHoldingTaxDetailed({ ...state, reformYear: year });
    const diff = cmp.grandTotal - baseResult.grandTotal;
    const pct = baseResult.grandTotal !== 0 ? (diff / baseResult.grandTotal * 100) : 0;
    const reasons = [];

    if (baseResult.deduction !== cmp.deduction) {
      reasons.push(`종부세 기본공제가 ${won(baseResult.deduction)} → ${won(cmp.deduction)}로 변경됨`);
    }
    if (baseResult.ctFmvRatio !== cmp.ctFmvRatio) {
      reasons.push(`종부세 공정시장가액비율이 ${(baseResult.ctFmvRatio*100).toFixed(0)}% → ${(cmp.ctFmvRatio*100).toFixed(0)}%로 상향됨`);
    }
    if (year >= 2028 && baseResult.houseCount < 3) {
      reasons.push('2028년부터 종부세 세율표에서 주택수 구분이 폐지되어 세율 구조가 달라짐');
    }
    if (reasons.length === 0) {
      reasons.push('입력하신 조건에서는 해당 연도 개편안이 적용되는 항목이 없어 현행과 동일합니다.');
    }

    return { year, result: cmp, diff, pct, reasons };
  });
}

/* -------------------------------------------------------------------------
   종합 절세 Simulation — 세대가 보유한 여러 부동산(주택/토지/건물) 중 어느 것을
   먼저 매도할 때 (매도 시 양도세 + 매도 후 남은 세대의 연간 보유세) 부담이
   가장 낮은지 비교. 다주택 판정(중과·1세대1주택 특례)은 "주택" 개수만 기준으로 함.
   properties: [{ name, type('house'|'land'|'building'), acquisitionPrice,
                   transferPrice, necessaryExpense, holdYears, liveYears,
                   isAdjustedArea, publicPrice }]
   opts: { isUrbanArea, isResident }
   ------------------------------------------------------------------------- */
function calcMultiPropertyStrategy(properties, opts){
  const houseCount = properties.filter(p => p.type === 'house').length;
  const toAsset = p => ({
    type: p.type, desc: p.name, publicPrice: p.publicPrice,
    owners: [{ name: '세대', relation: '본인', sharePct: 100 }],
  });
  const transferAssetType = p => p.type === 'house' ? 'house' : (p.type === 'land' ? 'nonbiz_land' : 'other_asset');

  const beforeState = { isUrbanArea: opts.isUrbanArea, isResident: opts.isResident, reformYear: 2026, assets: properties.map(toAsset) };
  const beforeHolding = calcHoldingTaxDetailed(beforeState);

  const scenarios = properties.map((p, idx) => {
    const transferResult = calcTransferTax({
      assetType: transferAssetType(p),
      transferPrice: p.transferPrice,
      acquisitionPrice: p.acquisitionPrice,
      necessaryExpense: p.necessaryExpense,
      holdYears: p.holdYears,
      liveYears: p.liveYears,
      houseCount,
      isOneHouse: p.type === 'house' && houseCount === 1,
      isAdjustedArea: p.isAdjustedArea,
      reformYear: 2026,
    });

    const remaining = properties.filter((_, i) => i !== idx);
    let remainingHolding;
    if (remaining.length === 0) {
      remainingHolding = { grandTotal: 0, grandPropertyTax: 0, grandCompTax: 0 };
    } else {
      const afterState = { isUrbanArea: opts.isUrbanArea, isResident: opts.isResident, reformYear: 2026, assets: remaining.map(toAsset) };
      remainingHolding = calcHoldingTaxDetailed(afterState);
    }

    const combinedFirstYear = transferResult.total + remainingHolding.grandTotal;

    return {
      name: p.name,
      type: p.type,
      transferTotal: transferResult.total,
      transferRows: transferResult.rows,
      remainingHoldingTotal: remainingHolding.grandTotal,
      remainingCount: remaining.length,
      combinedFirstYear,
    };
  }).sort((a, b) => a.combinedFirstYear - b.combinedFirstYear);

  return { houseCount, beforeHolding, scenarios };
}
