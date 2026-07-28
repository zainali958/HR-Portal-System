const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    onboarding: { type: mongoose.Schema.Types.ObjectId, ref: "Onboarding", required: true, unique: true },
    offer: { type: mongoose.Schema.Types.ObjectId, ref: "Offer", required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },

    employerOfRecord: { type: String, trim: true, default: "" },

    employeeName: { type: String, required: true, trim: true },
    fatherName: { type: String, required: true, trim: true },
    cnic: { type: String, required: true, trim: true },
    contactNumber: { type: String, trim: true },

    designation: { type: String, required: true, trim: true },
    reportsTo: { type: String, trim: true },
    employmentType: { type: String, enum: ["Full-Time", "Part-Time", "Intern"], required: true },
    dateOfJoining: { type: Date, required: true },
    internshipDurationMonths: { type: Number, min: 1, default: 3 },
    employmentStatus: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    jdOnFile: { type: Boolean, default: false },

    basicSalary: { type: Number, min: 0, default: 0 },
    houseRentAllowance: { type: Number, min: 0, default: 0 },
    medicalAllowance: { type: Number, min: 0, default: 0 },
    conveyanceAllowance: { type: Number, min: 0, default: 0 },
    otherAllowance: { type: Number, min: 0, default: 0 },
    grossSalary: { type: Number, min: 0, default: 0 },

    incomeTaxDeduction: { type: Number, min: 0, default: 0 },
    eobiDeduction: { type: Number, min: 0, default: 0 },
    otherDeduction: { type: Number, min: 0, default: 0 },
    totalDeductions: { type: Number, min: 0, default: 0 },
    netPayable: { type: Number, default: 0 },

    bankName: { type: String, trim: true },
    accountTitle: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    bankDetailsStatus: {
      type: String,
      enum: ["Not Started", "Pending", "Approved", "Declined", "Changes Requested"],
      default: "Not Started",
    },
    notes: { type: String, trim: true, default: "" },

    syncedToSheetAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Same auto-calculation as Onboarding - if a Unit Manager later edits, say,
// Basic Salary via PATCH, Gross/Total/Net recompute automatically rather
// than needing to be set by hand.
employeeSchema.pre("save", function (next) {
  if (this.employmentType === "Intern") {
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

module.exports = mongoose.model("Employee", employeeSchema);