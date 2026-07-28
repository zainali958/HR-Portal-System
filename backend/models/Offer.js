const mongoose = require("mongoose");

// Two-stage sequential approval, per Shafaat: Team Lead submits -> HR
// reviews first -> only if HR approves does it go to CEO -> only CEO's
// approval actually produces the offer letter -> then HR shares it with
// the Team Lead. This replaces the old single-stage "any approver decides"
// model entirely.
const STATUS_OPTIONS = [
  "Draft",
  "Pending HR Review",
  "Pending CEO Review",
  "Approved",       // = offer letter has been generated
  "Declined",
  "Changes Requested",
];
const CANDIDATE_RESPONSE_OPTIONS = ["Pending", "Accepted", "Declined"];
const EMPLOYMENT_TYPES = ["Employee", "Intern"];

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// Small reusable shape for "who approved this stage and when" - used for
// both the HR stage and the CEO stage below.
const stageApprovalSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const offerSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    candidateName: { type: String, required: true, trim: true },
    candidateEmail: { type: String, trim: true, lowercase: true },
    candidatePhone: { type: String, trim: true },

    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    designation: { type: String, required: true, trim: true },
    timings: { type: String, trim: true },
    jobDescription: { type: String, required: true, trim: true },
    kpis: [{ type: String, trim: true }],
    proposedSalary: { type: Number, min: 0 },

    status: { type: String, enum: STATUS_OPTIONS, default: "Draft" },

    // Recorded once each stage's approval happens - lets the offer letter
    // (and audit trail) show exactly who signed off at each step.
    hrApproval: { type: stageApprovalSchema, default: () => ({}) },
    ceoApproval: { type: stageApprovalSchema, default: () => ({}) },

    // Once CEO approves, HR still needs to actually hand the letter to
    // the Team Lead - this tracks that hand-off as its own explicit step,
    // per Shafaat's description, rather than assuming it happens instantly.
    sharedWithTeamLead: { type: Boolean, default: false },
    sharedAt: { type: Date, default: null },

    candidateResponse: { type: String, enum: CANDIDATE_RESPONSE_OPTIONS, default: "Pending" },

    // Reason from whichever stage most recently decided - kept generic
    // (not split into hrReason/ceoReason) since only one stage is ever
    // "active" at a time and the comment thread has the full history anyway.
    decisionReason: { type: String, trim: true, default: "" },
    decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionAt: { type: Date, default: null },

    comments: [commentSchema],

    letterGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Offer", offerSchema);
module.exports.STATUS_OPTIONS = STATUS_OPTIONS;
module.exports.CANDIDATE_RESPONSE_OPTIONS = CANDIDATE_RESPONSE_OPTIONS;
module.exports.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;