// Run with: npm run seed
// Creates roles, the real 6 companies with their Employer-of-Record mapping
// (matching the actual Master Sheet), and HR + Unit Manager test accounts.
// Safe to re-run - updates existing companies by name (or a known old name)
// instead of creating duplicates, so renaming a company here fixes it
// in the database too, it doesn't just add a new row.

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const Role = require("../models/Role");
const Company = require("../models/Company");
const User = require("../models/User");

async function seed() {
  await connectDB();

  const roleDefs = [
    { name: "HR", canApprove: true, canCreateUsers: true, canViewAllCompanies: true, canManageCompanies: true, canApprovePayroll: true, canApproveBankDetails: false },
    { name: "CEO", canApprove: true, canCreateUsers: false, canViewAllCompanies: true, canManageCompanies: false, canApprovePayroll: true, canApproveBankDetails: false },
    { name: "Accountant", canApprove: false, canCreateUsers: false, canViewAllCompanies: true, canManageCompanies: false, canApprovePayroll: true, canApproveBankDetails: true },
    { name: "Finance", canApprove: false, canCreateUsers: false, canViewAllCompanies: true, canManageCompanies: false, canApprovePayroll: true, canApproveBankDetails: true },
    { name: "Unit Manager", canApprove: false, canCreateUsers: false, canViewAllCompanies: false, canManageCompanies: false, canApprovePayroll: false, canApproveBankDetails: false },
  ];

  const roles = {};
  for (const def of roleDefs) {
    let role = await Role.findOne({ name: def.name });
    if (!role) {
      role = await Role.create(def);
      console.log(`Created role: ${def.name}`);
    } else {
      // Existing roles only get NEW fields created, never updated with
      // fresh flag values - so re-running seed after a role definition
      // change (like adding Payroll/Bank-details flags) silently leaves
      // old roles out of date. Force every flag to match roleDefs exactly
      // on every seed run, so this class of bug can't happen again.
      role.canApprove = def.canApprove;
      role.canCreateUsers = def.canCreateUsers;
      role.canViewAllCompanies = def.canViewAllCompanies;
      role.canManageCompanies = def.canManageCompanies;
      role.canApprovePayroll = def.canApprovePayroll;
      role.canApproveBankDetails = def.canApproveBankDetails;
      await role.save();
      console.log(`Synced role flags: ${def.name}`);
    }
    roles[def.name] = role;
  }

  // Real 6 companies, matching the Employer of Record Map tab exactly.
  // oldNames lets a company already in the DB under a previous name get
  // renamed + updated in place rather than duplicated.
  const companyDefs = [
    {
      name: "Prepreneurship",
      legalEmployerName: "Prepreneurship (Pvt) Ltd",
      registrationStatus: "Registered — Pvt Ltd",
    },
    {
      name: "Beyoparee",
      legalEmployerName: "Prepreneurship (Pvt) Ltd",
      registrationStatus: "Brand only — not separately registered",
    },
    {
      name: "Al-Ukaz",
      legalEmployerName: "Prepreneurship (Pvt) Ltd",
      registrationStatus: "Brand only — not separately registered",
    },
    {
      name: "The Serenade Bhorban",
      oldNames: ["Serenade Bhorban"],
      legalEmployerName: "Serenade Bhorban (Pvt) Ltd",
      registrationStatus: "Registered — Pvt Ltd",
    },
    {
      name: "Ilham Creative",
      legalEmployerName: "Ilham Creative (Pvt) Ltd",
      registrationStatus: "Registered — Pvt Ltd",
    },
    {
      name: "As-Saadah International",
      oldNames: ["Assaadah"],
      legalEmployerName: "TBC — confirm registration status",
      registrationStatus: "TBC",
    },
  ];

  for (const def of companyDefs) {
    let company = await Company.findOne({ name: def.name });
    if (!company && def.oldNames) {
      company = await Company.findOne({ name: { $in: def.oldNames } });
    }

    if (company) {
      company.name = def.name;
      company.legalEmployerName = def.legalEmployerName;
      company.registrationStatus = def.registrationStatus;
      if (!company.sheetTabName) company.sheetTabName = def.name;
      await company.save();
      console.log(`Updated company: ${def.name}`);
    } else {
      await Company.create({
        name: def.name,
        sheetTabName: def.name,
        legalEmployerName: def.legalEmployerName,
        registrationStatus: def.registrationStatus,
      });
      console.log(`Created company: ${def.name}`);
    }
  }

  // HR test account
  const hrEmail = "hr@amanorx.test";
  const existingHr = await User.findOne({ email: hrEmail });
  if (!existingHr) {
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    await User.create({
      fullName: "Test HR Admin",
      email: hrEmail,
      passwordHash,
      role: roles["HR"]._id,
      company: null,
    });
    console.log(`Created HR test account -> email: ${hrEmail} / password: ChangeMe123!`);
  }

  // Unit Manager test account, tied to Prepreneurship
  const managerEmail = "manager@amanorx.test";
  const existingManager = await User.findOne({ email: managerEmail });
  if (!existingManager) {
    const prepreneurship = await Company.findOne({ name: "Prepreneurship" });
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    await User.create({
      fullName: "Test Unit Manager",
      email: managerEmail,
      passwordHash,
      role: roles["Unit Manager"]._id,
      company: prepreneurship._id,
    });
    console.log(`Created Unit Manager test account -> email: ${managerEmail} / password: ChangeMe123!`);
  }
  // CEO test account
  const ceoEmail = "ceo@amanorx.test";
  if (!(await User.findOne({ email: ceoEmail }))) {
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    await User.create({ fullName: "Test CEO", email: ceoEmail, passwordHash, role: roles["CEO"]._id, company: null });
    console.log(`Created CEO test account -> email: ${ceoEmail} / password: ChangeMe123!`);
  }

  // Accountant test account
  const accountantEmail = "accountant@amanorx.test";
  if (!(await User.findOne({ email: accountantEmail }))) {
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    await User.create({ fullName: "Test Accountant", email: accountantEmail, passwordHash, role: roles["Accountant"]._id, company: null });
    console.log(`Created Accountant test account -> email: ${accountantEmail} / password: ChangeMe123!`);
  }

  // Finance test account
  const financeEmail = "finance@amanorx.test";
  if (!(await User.findOne({ email: financeEmail }))) {
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    await User.create({ fullName: "Test Finance", email: financeEmail, passwordHash, role: roles["Finance"]._id, company: null });
    console.log(`Created Finance test account -> email: ${financeEmail} / password: ChangeMe123!`);
  }

  console.log("Seed complete.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});