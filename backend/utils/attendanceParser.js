const XLSX = require("xlsx");

// Deduction rules, all expressed as a fraction of one day's pay. Tweak
// these constants if AmanorX wants a different policy - nothing else in
// this file needs to change.
const INFORMED_LEAVE_FACTOR = 0.5;   // approved leave request on file - lighter deduction
const UNINFORMED_LEAVE_FACTOR = 1;   // no attendance AND no approved leave request - full day
const LATE_GRACE_COUNT = 3;          // this many "Late" check-ins per month are free
const LATE_DEDUCTION_FACTOR = 0.25;  // each late check-in beyond the grace count costs this much of a day

// AttendanceSystem's real export is a check-in log, not a day-by-day
// status sheet: only days the employee actually checked in appear as rows
// (Date, Username, Full Name, Department, Check-In Time, Late, Check-Out
// Time, Working Hours). Days with no row could be a weekly off, an
// approved leave, or an unexplained absence - which one depends on the
// calendar (weekly off) and a separate leave-request export, so we combine
// three things instead of reading one flat Status column:
//   1. This check-in file        -> which dates the person was Present
//   2. A leave-request file      -> which dates were an approved (Informed) leave
//   3. The month + weekly-off day -> which dates don't count at all

function pad(n) {
  return String(n).padStart(2, "0");
}

// Normalizes a raw cell value (JS Date from Excel, or a text date in
// various formats) down to a plain "YYYY-MM-DD" string. Returns null if it
// can't confidently parse the value, so the caller can flag it rather than
// silently misreading someone's attendance.
function normalizeDateCell(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;

  // DD/MM/YYYY (or DD-MM-YYYY) - assumed over MM/DD since this is a
  // Pakistan-based export, not a US one.
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return `${slash[3]}-${pad(slash[1])}-${pad(slash[2])}`;

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }
  return null;
}

function normalizeLate(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

function readRows(buffer, filename) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (err) {
    throw new Error(`Could not read "${filename}" - please upload a valid .xlsx, .xls, or .csv file (export it from AttendanceSystem, not a Word doc)`);
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`"${filename}" doesn't contain any sheets`);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  if (rows.length === 0) {
    throw new Error(`"${filename}" has no data rows`);
  }
  return rows;
}

function findColumn(row, names) {
  const keys = Object.keys(row);
  return keys.find((k) => names.includes(k.trim().toLowerCase()));
}

// Parses the check-in log export. Returns { presentDates: Set<"YYYY-MM-DD">, lateDates: Set<"YYYY-MM-DD"> }.
function parseCheckInFile({ data, filename }) {
  const rows = readRows(Buffer.from(data, "base64"), filename);
  const dateKey = findColumn(rows[0], ["date"]);
  if (!dateKey) {
    throw new Error(`"${filename}" must have a "Date" column - export the check-in log from AttendanceSystem`);
  }
  const lateKey = findColumn(rows[0], ["late"]);

  const presentDates = new Set();
  const lateDates = new Set();
  const badRows = [];

  rows.forEach((row, i) => {
    const raw = row[dateKey];
    if (String(raw).trim() === "") return;
    const date = normalizeDateCell(raw);
    if (!date) {
      badRows.push({ row: i + 2, value: raw });
      return;
    }
    presentDates.add(date);
    if (lateKey && normalizeLate(row[lateKey])) lateDates.add(date);
  });

  if (badRows.length > 0) {
    const examples = badRows.slice(0, 3).map((r) => `row ${r.row} ("${r.value}")`).join(", ");
    throw new Error(`"${filename}" has ${badRows.length} row(s) with an unreadable Date, e.g. ${examples}`);
  }

  return { presentDates, lateDates };
}

// Parses the leave-request export. Returns Set<"YYYY-MM-DD"> of approved
// (informed) leave dates. A missing/empty file just means "no leave
// requests on file" - every unexplained absence is then Uninformed.
function parseLeaveFile({ data, filename }) {
  const rows = readRows(Buffer.from(data, "base64"), filename);
  const dateKey = findColumn(rows[0], ["date"]);
  if (!dateKey) {
    throw new Error(`"${filename}" must have a "Date" column - export the approved leave list from AttendanceSystem`);
  }

  const leaveDates = new Set();
  const badRows = [];

  rows.forEach((row, i) => {
    const raw = row[dateKey];
    if (String(raw).trim() === "") return;
    const date = normalizeDateCell(raw);
    if (!date) {
      badRows.push({ row: i + 2, value: raw });
      return;
    }
    leaveDates.add(date);
  });

  if (badRows.length > 0) {
    const examples = badRows.slice(0, 3).map((r) => `row ${r.row} ("${r.value}")`).join(", ");
    throw new Error(`"${filename}" has ${badRows.length} row(s) with an unreadable Date, e.g. ${examples}`);
  }

  return leaveDates;
}

// Walks every calendar day of the given month ("YYYY-MM") and classifies
// it as Weekly Off / Present / Informed Leave / Uninformed Leave, using
// the check-in dates and approved-leave dates already parsed above.
// weeklyOffWeekday follows JS's Date.getDay() numbering (0 = Sunday).
function buildAttendanceSummary({ month, presentDates, lateDates, leaveDates, weeklyOffWeekday = 0 }) {
  const [year, monthNum] = month.split("-").map(Number);
  const totalDaysInMonth = new Date(year, monthNum, 0).getDate();

  const summary = {
    totalDaysInMonth,
    presentDays: 0,
    weeklyOffDays: 0,
    informedLeaveDays: 0,
    uninformedLeaveDays: 0,
    lateDays: lateDates.size,
  };

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const date = `${year}-${pad(monthNum)}-${pad(day)}`;
    const weekday = new Date(year, monthNum - 1, day).getDay();

    if (weekday === weeklyOffWeekday) {
      summary.weeklyOffDays += 1;
    } else if (presentDates.has(date)) {
      summary.presentDays += 1;
    } else if (leaveDates.has(date)) {
      summary.informedLeaveDays += 1;
    } else {
      summary.uninformedLeaveDays += 1;
    }
  }

  summary.workingDays = totalDaysInMonth - summary.weeklyOffDays;
  return summary;
}

// Given an employee's gross salary and a built summary, works out the
// per-day rate and the full deduction breakdown (leave + lateness).
function calculateAttendanceDeduction(grossSalary, summary) {
  if (!summary.workingDays || summary.workingDays <= 0) {
    return { perDayRate: 0, informedLeaveDeduction: 0, uninformedLeaveDeduction: 0, chargeableLateDays: 0, lateDeduction: 0, totalDeduction: 0 };
  }

  const perDayRate = grossSalary / summary.workingDays;
  const informedLeaveDeduction = Math.round(summary.informedLeaveDays * perDayRate * INFORMED_LEAVE_FACTOR);
  const uninformedLeaveDeduction = Math.round(summary.uninformedLeaveDays * perDayRate * UNINFORMED_LEAVE_FACTOR);
  const chargeableLateDays = Math.max(0, summary.lateDays - LATE_GRACE_COUNT);
  const lateDeduction = Math.round(chargeableLateDays * perDayRate * LATE_DEDUCTION_FACTOR);

  return {
    perDayRate: Math.round(perDayRate),
    informedLeaveDeduction,
    uninformedLeaveDeduction,
    chargeableLateDays,
    lateDeduction,
    totalDeduction: informedLeaveDeduction + uninformedLeaveDeduction + lateDeduction,
  };
}

module.exports = {
  parseCheckInFile,
  parseLeaveFile,
  buildAttendanceSummary,
  calculateAttendanceDeduction,
  normalizeDateCell,
  INFORMED_LEAVE_FACTOR,
  UNINFORMED_LEAVE_FACTOR,
  LATE_GRACE_COUNT,
  LATE_DEDUCTION_FACTOR,
};
