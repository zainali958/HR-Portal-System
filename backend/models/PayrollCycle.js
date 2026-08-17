const mongoose = require("mongoose");

// One cycle = one company's payroll for one month. Sequential approval
// chain per Shafaat: HR compiles -> Finance checks affordability -> 
// Accountant approves -> CEO signs off. Finance/Accountant can escalate
// a stuck cycle to HR; if still unresolved, HR (or the cycle itself) can
// escalate further to CEO.
const STATUS_OPTIONS = [
  "Draft",
  "Pending Finance Review",
  "Pending Accountant Review",
  "Pending CEO Review",
  "Approved",
  "Declined",
  "Needs HR Attention",
];

// Attendance/Tasks used to be free-text boxes - replaced with an actual
// uploaded file (attendance sheet / task report) per Shafaat's request, so
// the field holds real evidence instead of a typed summary. Stored inline
// as base64 (no S3/cloud storage wired up in this project yet) - fine for
// the small PDFs/images/spreadsheets this is meant for.
const fileSchema = new mongoose.Schema(
  {
    filename: { type: String, trim: true, required: true },
    mimetype: { type: String, trim: true, required: true },
    data: { type: String, required: true }, // base64-encoded file content
  },
  { _id: false }
);

// Computed breakdown from parsing an uploaded attendance file - stored so
// Finance/Accountant/CEO reviewers can see exactly why the proposed amount
// is what it is, without re-opening the raw file. Null when no attendance
// file was uploaded for that entry (HR typed the amount by hand instead).
const attendanceSummarySchema = new mongoose.Schema(
  {
    totalDaysInMonth: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    weeklyOffDays: { type: Number, default: 0 },
    informedLeaveDays: { type: Number, default: 0 },
    uninformedLeaveDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    chargeableLateDays: { type: Number, default: 0 },
    perDayRate: { type: Number, default: 0 },
    informedLeaveDeduction: { type: Number, default: 0 },
    uninformedLeaveDeduction: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 },
    totalDeduction: { type: Number, default: 0 },
  },
  { _id: false }
);

const entrySchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    attendanceFile: { type: fileSchema, default: null },
    // Separate export from AttendanceSystem listing approved/informed
    // leave requests - the check-in log alone can't tell an approved leave
    // apart from an unexplained absence, since both are just "no row".
    leaveFile: { type: fileSchema, default: null },
    tasksFile: { type: fileSchema, default: null },
    proposedAmount: { type: Number, min: 0, required: true },
    attendanceSummary: { type: attendanceSummarySchema, default: null },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const stageDecisionSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: null },
    reason: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const payrollCycleSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    month: { type: String, required: true, trim: true }, // e.g. "2026-07"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    entries: [entrySchema],

    status: { type: String, enum: STATUS_OPTIONS, default: "Draft" },

    financeDecision: { type: stageDecisionSchema, default: () => ({}) },
    accountantDecision: { type: stageDecisionSchema, default: () => ({}) },
    ceoDecision: { type: stageDecisionSchema, default: () => ({}) },

    escalatedToHR: { type: Boolean, default: false },
    escalationReason: { type: String, trim: true, default: "" },
    escalatedAt: { type: Date, default: null },

    escalatedToCEO: { type: Boolean, default: false },
    escalatedToCEOAt: { type: Date, default: null },

    // Which stage a cycle returns to once HR resolves an escalation -
    // otherwise HR would have no way to hand it back to the right place.
    stageBeforeEscalation: { type: String, default: null },
  },
  { timestamps: true }
);

// One payroll cycle per company per month.
payrollCycleSchema.index({ company: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("PayrollCycle", payrollCycleSchema);
module.exports.STATUS_OPTIONS = STATUS_OPTIONS;
