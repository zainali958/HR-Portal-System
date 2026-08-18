const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

// Reads directly from the same Google Sheet AttendanceSystem writes to, so
// HR doesn't have to export/upload a file at all for employees whose
// AttendanceSystem username is on file (see Employee.attendanceUsername).
// This intentionally mirrors AttendanceSystem's own sheetsDb.ts as closely
// as possible - same sheet titles, same column names, same lateness
// resolution rules - so a number computed here matches what AttendanceSystem
// itself would show, instead of drifting out of sync over time.

let _doc = null;
let _connecting = null;

function parseTimeFlexible(s) {
  const parts = String(s).split(":").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) {
    throw new Error("Invalid time format");
  }
  return { h: parts[0], m: parts[1], sec: parts[2] ?? 0 };
}

function timeToSeconds(t) {
  return t.h * 3600 + t.m * 60 + t.sec;
}

// Whether a recorded check-in time falls after expected start + grace -
// copied verbatim from AttendanceSystem's checkInIsLate so "Late" here
// means exactly what it means over there.
function checkInIsLate(checkInTime, expectedStart, graceMinutes) {
  try {
    const cutoffSeconds = timeToSeconds(parseTimeFlexible(expectedStart)) + graceMinutes * 60;
    const seconds = timeToSeconds(parseTimeFlexible(checkInTime));
    return seconds > cutoffSeconds;
  } catch {
    return false;
  }
}

async function connect() {
  if (_doc) return _doc;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      throw new Error("GOOGLE_SHEET_ID is not set - copy it from the AttendanceSystem spreadsheet's URL");
    }

    let email, privateKey;
    const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    if (credsJson) {
      const creds = JSON.parse(credsJson);
      email = creds.client_email;
      privateKey = creds.private_key;
    } else {
      email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    }
    if (!email || !privateKey) {
      throw new Error(
        "Google service account credentials are missing - set GOOGLE_CREDENTIALS_JSON " +
        "(the full downloaded key file contents) or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY"
      );
    }

    // Read-only scope - the HR Portal never writes to this sheet.
    const auth = new JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    _doc = doc;
    return doc;
  })();

  try {
    return await _connecting;
  } catch (err) {
    _connecting = null; // let the next call retry instead of staying wedged
    throw err;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// Expands a Leaves-sheet "Start Date".."End Date" range (inclusive) into
// individual "YYYY-MM-DD" strings, clipped to the given month.
function expandDateRange(startDateStr, endDateStr, month) {
  const dates = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return dates;

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 0);

  const from = start < monthStart ? monthStart : start;
  const to = end > monthEnd ? monthEnd : end;

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return dates;
}

// Fetches everything needed to compute one employee's attendance summary
// for one month directly from AttendanceSystem's Google Sheet: which dates
// they checked in, which of those were late, and which dates fall under an
// Approved leave request. Shaped to drop straight into
// attendanceParser.buildAttendanceSummary().
async function fetchAttendanceFromSheet(username, month) {
  const doc = await connect();

  const attendanceSheet = doc.sheetsByTitle["Attendance"];
  const leavesSheet = doc.sheetsByTitle["Leaves"];
  const usersSheet = doc.sheetsByTitle["Users"];
  const departmentsSheet = doc.sheetsByTitle["Departments"];
  if (!attendanceSheet || !leavesSheet || !usersSheet) {
    throw new Error("The Google Sheet doesn't have the expected Attendance/Leaves/Users tabs - is GOOGLE_SHEET_ID pointing at the right spreadsheet?");
  }

  const [attendanceRows, leaveRows, userRows, deptRows] = await Promise.all([
    attendanceSheet.getRows(),
    leavesSheet.getRows(),
    usersSheet.getRows(),
    departmentsSheet ? departmentsSheet.getRows() : Promise.resolve([]),
  ]);

  const userRow = userRows.find((r) => r.get("Username") === username);
  if (!userRow) {
    throw new Error(`No AttendanceSystem user found with username "${username}" - double check it on the employee's record`);
  }
  const department = (userRow.get("Department") || "").trim();

  // Lateness resolution: per-user override > per-department override >
  // global default - same precedence AttendanceSystem itself uses.
  const defaultExpectedStart = process.env.EXPECTED_START_TIME?.trim() || "09:00:00";
  const defaultGraceMinutes = parseInt(process.env.EXPECTED_GRACE_MINUTES || "15", 10);

  let expectedStart = defaultExpectedStart;
  let graceMinutes = defaultGraceMinutes;
  const deptRow = deptRows.find((r) => (r.get("Department") || "").trim() === department);
  if (deptRow) {
    const deptStart = (deptRow.get("Expected Start Time") || "").trim();
    if (deptStart) expectedStart = deptStart;
    const deptGrace = parseInt(deptRow.get("Grace Minutes") || "", 10);
    if (Number.isFinite(deptGrace)) graceMinutes = deptGrace;
  }
  const userStart = (userRow.get("Expected Start Time") || "").trim();
  if (userStart) expectedStart = userStart;
  const userGrace = parseInt(userRow.get("Grace Minutes") || "", 10);
  if (Number.isFinite(userGrace)) graceMinutes = userGrace;

  const presentDates = new Set();
  const lateDates = new Set();
  for (const row of attendanceRows) {
    if (row.get("Username") !== username) continue;
    const date = row.get("Date") || "";
    if (!date.startsWith(month)) continue;
    presentDates.add(date);
    const checkIn = row.get("Check-In Time");
    if (checkIn && checkInIsLate(checkIn, expectedStart, graceMinutes)) {
      lateDates.add(date);
    }
  }

  const leaveDates = new Set();
  for (const row of leaveRows) {
    if (row.get("Username") !== username) continue;
    if (row.get("Status") !== "Approved") continue;
    const start = row.get("Start Date");
    const end = row.get("End Date");
    if (!start || !end) continue;
    for (const date of expandDateRange(start, end, month)) {
      leaveDates.add(date);
    }
  }

  return { presentDates, lateDates, leaveDates };
}

module.exports = { fetchAttendanceFromSheet, expandDateRange };
