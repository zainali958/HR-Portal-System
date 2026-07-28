const mongoose = require("mongoose");

// legalEmployerName / registrationStatus mirror the "Employer of Record Map"
// tab in the real Master Sheet. This is looked up automatically from the
// company a Unit Manager picks - it is NEVER typed manually, same rule the
// sheet itself enforces with its dropdown + lookup formula.
const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      unique: true,
    },
    sheetTabName: { type: String, trim: true },
    isActive: { type: Boolean, default: true },

    // e.g. "Prepreneurship (Pvt) Ltd" - the actual legal entity that issues
    // contracts/payroll for this brand. Several brands share one legal
    // entity (Beyoparee and Al-Ukaz both fall under Prepreneurship), per
    // an explicit business decision recorded on the real Master Sheet.
    legalEmployerName: { type: String, trim: true, default: "" },

    // e.g. "Registered — Pvt Ltd", "Brand only — not separately registered",
    // or "TBC" while a registration is still unconfirmed.
    registrationStatus: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);