const SPREADSHEET_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE";
const SHEET_NAME = "Transactions";
const DRIVE_FOLDER_ID = "";

const HEADERS = ["Type", "Name", "Amount", "Account", "Date", "LogTime", "Screenshot"];

function doGet() {
  const sheet = getTransactionSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return jsonResponse([]);
  }

  const rows = values.slice(1).map((row) => ({
    Type: row[0],
    Name: row[1],
    Amount: row[2],
    Account: row[3],
    Date: formatSheetDate(row[4]),
    LogTime: formatSheetDateTime(row[5]),
    Screenshot: row[6]
  }));

  return jsonResponse(rows);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const sheet = getTransactionSheet();
    const screenshotUrl = saveScreenshotFile(payload.ScreenshotFile);

    const row = [
      String(payload.Type || "").trim().toUpperCase(),
      String(payload.Name || "").trim(),
      Number(payload.Amount || 0),
      String(payload.Account || "").trim().toUpperCase(),
      String(payload.Date || "").trim(),
      String(payload.LogTime || new Date().toISOString()).trim(),
      screenshotUrl
    ];

    validateTransactionRow(row);
    sheet.appendRow(row);

    return jsonResponse({
      status: "success",
      message: "Transaction record saved."
    });
  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.message || "Unable to save transaction record."
    });
  }
}

function saveScreenshotFile(fileData) {
  if (!fileData || !fileData.base64) {
    return "";
  }

  const bytes = Utilities.base64Decode(fileData.base64);
  const blob = Utilities.newBlob(
    bytes,
    fileData.mimeType || "application/octet-stream",
    buildScreenshotFileName(fileData.name)
  );

  const folder = DRIVE_FOLDER_ID
    ? DriveApp.getFolderById(DRIVE_FOLDER_ID)
    : DriveApp.getRootFolder();
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function buildScreenshotFileName(originalName) {
  const safeName = String(originalName || "screenshot")
    .replace(/[^\w.\- ]+/g, "")
    .trim() || "screenshot";

  return new Date().toISOString().replace(/[:.]/g, "-") + "-" + safeName;
}

function getTransactionSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = HEADERS.every((header, index) => currentHeaders[index] === header);

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function validateTransactionRow(row) {
  const validTypes = ["SENT", "RECEIVED"];
  const validAccounts = ["AXIS", "KVB"];

  if (!validTypes.includes(row[0])) {
    throw new Error("Invalid transaction type.");
  }

  if (!row[1]) {
    throw new Error("Particulars are required.");
  }

  if (!Number.isFinite(row[2]) || row[2] <= 0) {
    throw new Error("Amount must be greater than 0.");
  }

  if (!validAccounts.includes(row[3])) {
    throw new Error("Invalid account.");
  }

  if (!row[4]) {
    throw new Error("Transaction date is required.");
  }
}

function formatSheetDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  return value || "";
}

function formatSheetDateTime(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }

  return value || "";
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
