const mongoose = require("mongoose");

// One generic audit log, not a separate log per feature - so Offer,
// Onboarding, and anything added later (Payroll) all write to the same
// place and can be queried/reported on together.
//
// "Non-negotiable" per Shafaat: every submit, approve, decline, request-
// changes, and edit must be logged with who, when, and what changed.
const auditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true }, // e.g. "Offer", "Onboarding"
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, required: true }, // e.g. "submitted", "approved", "declined", "changes_requested", "edited"
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Free-form details: for an edit this holds { field, oldValue, newValue };
    // for a decision it can hold the reason. Kept flexible on purpose since
    // different actions log different things.
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);