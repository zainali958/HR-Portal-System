const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    canApprove: { type: Boolean, default: false },
    canCreateUsers: { type: Boolean, default: false },
    canViewAllCompanies: { type: Boolean, default: false },
    canManageCompanies: { type: Boolean, default: false },
    // New: gates the Payroll approval chain steps and the Onboarding
    // bank-details dual-approval, per Shafaat's voice note - these are
    // separate gates from canApprove, since Accountant/Finance don't
    // approve Offers, only these two things.
    canApprovePayroll: { type: Boolean, default: false },
    canApproveBankDetails: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Role", roleSchema);