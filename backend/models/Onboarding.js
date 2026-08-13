const mongoose = require("mongoose");

const STATUS_OPTIONS = ["Draft", "Pending", "Approved", "Declined", "Changes Requested"];
const EMPLOYMENT_TYPES = ["Full-Time", "Part-Time", "Intern"];

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const onboardingSchema = new mongoose.Schema(
  {
    // Optional now - only new hires coming through the Offer pipeline have
    // one. Existing employees entered directly (never had an AmanorX
    // Offer) leave this unset. sparse:true so multiple records can all
    // have offer:undefined without violating the unique index.
    offer: { type: mongoose.Schema.Types.ObjectId, ref: "Offer", unique: true, sparse: true },
    // true for employees entered directly via "Add Existing Employee"
    // (no linked Offer) rather than the normal new-hire pipeline.
    isExistingEmployee: { type: Boolean, default: false },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Normally copied from the linked Offer at creation time; for an
    // existing employee (no Offer) it's entered directly on this form
    // instead. Either way, this field is now the single source of truth
    // so downstream code (Employee creation, the letter generator) doesn't
    // need to care which path the record came from.
    designation: { type: String, trim: true, default: "" },

    // Snapshot of the company's legal employer name/status at the moment
    // this record was created - looked up automatically, never typed by
    // the Unit Manager, same as the real sheet's lookup formula. Stored as
    // a snapshot (not re-derived live) so a later company registration
    // change doesn't silently rewrite historical payroll records.
    employerOfRecord: { type: String, trim: true, default: "" },

    // --- Personal ---
    employeeName: { type: String, required: true, trim: true },
    fatherName: { type: String, required: true, trim: true },
    cnic: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{5}-\d{7}-\d{1}$/, "CNIC must be in the format 00000-0000000-0"],
    },
    contactNumber: { type: String, trim: true },

    // --- Employment ---
    // designation comes from the linked Offer, not re-entered here.
    reportsTo: { type: String, trim: true, required: true },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    dateOfJoining: { type: Date, required: true },
    internshipDurationMonths: { type: Number, min: 1, default: 3 },
    employmentStatus: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    jdOnFile: { type: Boolean, default: false },

    // --- Salary breakdown (Interns leave these at 0) ---
    basicSalary: { type: Number, min: 0, default: 0 },
    houseRentAllowance: { type: Number, min: 0, default: 0 },
    medicalAllowance: { type: Number, min: 0, default: 0 },
    conveyanceAllowance: { type: Number, min: 0, default: 0 },
    otherAllowance: { type: Number, min: 0, default: 0 },
    // Auto-calculated in the pre-save hook below - never set directly from
    // a request body, same "white fill = formula, do not overwrite" rule
    // the real sheet enforces.
    grossSalary: { type: Number, min: 0, default: 0 },

    // --- Deductions breakdown ---
    incomeTaxDeduction: { type: Number, min: 0, default: 0 },
    eobiDeduction: { type: Number, min: 0, default: 0 },
    otherDeduction: { type: Number, min: 0, default: 0 },
    totalDeductions: { type: Number, min: 0, default: 0 },
    netPayable: { type: Number, default: 0 },

    // --- Bank ---
    bankName: { type: String, trim: true },
    accountTitle: { type: String, trim: true },
    accountNumber: { type: String, trim: true },

    // Bank details get their own separate approval gate, per Shafaat:
    // once the overall onboarding record is Approved (HR/CEO), bank
    // details specifically need sign-off from BOTH Accountant and Finance
    // independently - neither has to go first. bankDetailsStatus is
    // derived from the two decisions below, recomputed on every change.
    bankDetailsStatus: {
      type: String,
      enum: ["Not Started", "Pending", "Approved", "Declined", "Changes Requested"],
      default: "Not Started",
    },
    bankAccountantDecision: {
      decision: { type: String, enum: ["Approved", "Declined", "Changes Requested", null], default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      reason: { type: String, trim: true, default: "" },
    },
    bankFinanceDecision: {
      decision: { type: String, enum: ["Approved", "Declined", "Changes Requested", null], default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      reason: { type: String, trim: true, default: "" },
    },
    notes: { type: String, trim: true, default: "" },

    status: { type: String, enum: STATUS_OPTIONS, default: "Draft" },

    decisionReason: { type: String, trim: true, default: "" },
    decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionAt: { type: Date, default: null },

    // "Add Existing Employee" records (isExistingEmployee: true) go through
    // a stricter, sequential two-person approval instead of the single
    // canApprove decision used for normal offer-based onboarding: HR must
    // approve first, and only then can CEO act. Mirrors the shape of
    // bankAccountantDecision/bankFinanceDecision below, but unlike those two
    // (which are independent/either-order), these are ordered - the CEO
    // route rejects any attempt before HR has approved.
    existingEmployeeHRDecision: {
      decision: { type: String, enum: ["Approved", "Declined", "Changes Requested", null], default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      reason: { type: String, trim: true, default: "" },
    },
    existingEmployeeCEODecision: {
      decision: { type: String, enum: ["Approved", "Declined", "Changes Requested", null], default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      reason: { type: String, trim: true, default: "" },
    },

    comments: [commentSchema],

    syncedToSheetAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Recomputes Gross Salary, Total Deductions, and Net Payable every time the
// record is saved - exactly mirroring the real sheet's formula columns, so
// these three numbers can never drift out of sync with their components.
onboardingSchema.pre("save", function (next) {
  if (this.employmentType === "Intern") {
    this.basicSalary = 0;
    this.houseRentAllowance = 0;
    this.medicalAllowance = 0;
    this.conveyanceAllowance = 0;
    this.otherAllowance = 0;
    this.incomeTaxDeduction = 0;
    this.eobiDeduction = 0;
    this.otherDeduction = 0;
    this.grossSalary = 0;
    this.totalDeductions = 0;
    this.netPayable = 0;
    return next();
  }

  this.grossSalary =
    (this.basicSalary || 0) +
    (this.houseRentAllowance || 0) +
    (this.medicalAllowance || 0) +
    (this.conveyanceAllowance || 0) +
    (this.otherAllowance || 0);

  this.totalDeductions =
    (this.incomeTaxDeduction || 0) +
    (this.eobiDeduction || 0) +
    (this.otherDeduction || 0);

  this.netPayable = this.grossSalary - this.totalDeductions;

  next();
});

module.exports = mongoose.model("Onboarding", onboardingSchema);
module.exports.STATUS_OPTIONS = STATUS_OPTIONS;
module.exports.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;
