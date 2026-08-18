const express = require("express");
const router = express.Router();
const Employee = require("../models/Employee");
const requireAuth = require("../middleware/auth");
const { scopeFilter, canAccessCompany, requireAnyRole } = require("../middleware/permissions");
const { logAction } = require("../utils/auditLog");

router.use(requireAuth);
router.use(requireAnyRole(["Unit Manager", "HR", "CEO"]));

// GET /api/employees
// - HR / CEO (canViewAllCompanies): see every employee, across every
//   company - unchanged.
// - Unit Manager (Team Lead): scoped to their own company AND further
//   restricted to only the employees THEY personally submitted/onboarded -
//   no longer every employee in the company. This matches how Offers and
//   Onboarding are already scoped to submittedBy.
router.get("/", async (req, res) => {
  try {
    const filter = scopeFilter(req.user);
    if (req.query.status) filter.employmentStatus = req.query.status;
    if (!req.user.role.canViewAllCompanies) {
      filter.submittedBy = req.user._id;
    }

    const employees = await Employee.find(filter).populate("company").sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// Shared access check for single-record routes below - HR/CEO get full
// access via canAccessCompany's canViewAllCompanies branch; a Unit Manager
// additionally needs to be the one who submitted this specific employee.
function canAccessEmployee(user, employee) {
  if (!canAccessCompany(user, employee.company._id || employee.company)) return false;
  if (user.role.canViewAllCompanies) return true;
  return !!employee.submittedBy && employee.submittedBy.toString() === user._id.toString();
}

// GET /api/employees/:id
router.get("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate("company");
    if (!employee || !canAccessEmployee(req.user, employee)) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/employees/:id - Active/Inactive toggle, designation changes, etc.
// Access: HR/CEO (see everything) OR the Unit Manager who submitted this
// specific employee - no longer any Unit Manager in the company.
router.patch("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate("company");
    if (!employee || !canAccessEmployee(req.user, employee)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const editableFields = ["employmentStatus", "designation", "grossSalary", "allowances", "deductions","basicSalary", "houseRentAllowance", "medicalAllowance", "conveyanceAllowance", "otherAllowance", "incomeTaxDeduction", "eobiDeduction", "otherDeduction", "reportsTo", "contactNumber", "jdOnFile", "attendanceUsername"];
    const changes = [];
    for (const field of editableFields) {
      if (req.body[field] !== undefined && JSON.stringify(req.body[field]) !== JSON.stringify(employee[field])) {
        changes.push({ field, oldValue: employee[field], newValue: req.body[field] });
        employee[field] = req.body[field];
      }
    }

    await employee.save();

    if (changes.length > 0) {
      await logAction({ entityType: "Employee", entityId: employee._id, action: "edited", performedBy: req.user._id, details: { changes } });
    }

    await employee.populate("company");
    res.json(employee);
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;
