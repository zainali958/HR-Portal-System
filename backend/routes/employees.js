const express = require("express");
const router = express.Router();
const Employee = require("../models/Employee");
const requireAuth = require("../middleware/auth");
const { scopeFilter, canAccessCompany, requireAnyRole } = require("../middleware/permissions");
const { logAction } = require("../utils/auditLog");

router.use(requireAuth);
router.use(requireAnyRole(["Unit Manager", "HR", "CEO"]));

// GET /api/employees - scoped the same way as Offers/Onboarding.
// Note: unlike Offers, ANY Unit Manager in the company can view/edit these
// (not just whoever originally submitted the offer) - an employee record
// belongs to the company, not to one manager, per the brief's wording.
router.get("/", async (req, res) => {
  try {
    const filter = scopeFilter(req.user);
    if (req.query.status) filter.employmentStatus = req.query.status;

    const employees = await Employee.find(filter).populate("company").sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// GET /api/employees/:id
router.get("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate("company");
    if (!employee || !canAccessCompany(req.user, employee.company._id)) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/employees/:id - Active/Inactive toggle, designation changes, etc.
// Access: HR/COO/CEO (see everything) OR any Unit Manager in that employee's
// own company - not restricted to the original submitter.
router.patch("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    if (!canAccessCompany(req.user, employee.company)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const editableFields = ["employmentStatus", "designation", "grossSalary", "allowances", "deductions","basicSalary", "houseRentAllowance", "medicalAllowance", "conveyanceAllowance", "otherAllowance", "incomeTaxDeduction", "eobiDeduction", "otherDeduction", "reportsTo", "contactNumber", "jdOnFile"];
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