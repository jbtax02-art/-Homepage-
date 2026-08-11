function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // 첫 실행 시 헤더 행이 없으면 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['접수시각', '계산기', '성함', '연락처', '계산결과 요약', '접속페이지']);
  }

  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    new Date(),
    data.calculator || '',
    data.name || '',
    data.phone || '',
    data.summary || '',
    data.url || ''
  ]);

  return ContentService.createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
