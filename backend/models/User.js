const mongoose = require("mongoose");

// One login per person, never a shared company login - per Shafaat's
// explicit instruction ("it destroys the audit trail" otherwise).
const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    passwordHash: { type: String, required: true },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    // Only set for Unit Managers, who are scoped to one company.
    // HR / COO / CEO leave this empty since canViewAllCompanies covers them.
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    isActive: {
      // Lets HR disable a login (someone leaves) without deleting the
      // account and losing their name from historical audit log entries.
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);