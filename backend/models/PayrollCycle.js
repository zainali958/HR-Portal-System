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

const entrySchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    attendanceSummary: { type: String, trim: true, default: "" },
    tasksSummary: { type: String, trim: true, default: "" },
    proposedAmount: { type: Number, min: 0, required: true },
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