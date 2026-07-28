import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getEmployee, updateEmployee } from "../api/employees";

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [status, setStatus] = useState({ state: "loading", message: "" });
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    getEmployee(id)
      .then((data) => {
        setEmployee(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        const message = err.response && err.response.data && err.response.data.message
          ? err.response.data.message
          : "Failed to load employee";
        setStatus({ state: "error", message });
      });
  }

  useEffect(() => { load(); }, [id]);

  async function toggleStatus() {
    setActionError("");
    setSaving(true);
    try {
      const newStatus = employee.employmentStatus === "Active" ? "Inactive" : "Active";
      const updated = await updateEmployee(id, { employmentStatus: newStatus });
      setEmployee(updated);
    } catch (err) {
      const message = err.response && err.response.data && err.response.data.message
        ? err.response.data.message
        : "Failed to update employee";
      setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  if (status.state === "loading") return <div className="page-content"><p className="muted">Loading...</p></div>;
  if (status.state === "error") return <div className="page-content"><p className="msg error">{status.message}</p></div>;
  if (!employee) return null;

  const isIntern = employee.employmentType === "Intern";

  return (
    <div className="page-content">
      <p className="eyebrow">Employee</p>
      <div className="page-header">
        <h1>{employee.employeeName}</h1>
        <span className={employee.employmentStatus === "Active" ? "badge badge-approved" : "badge badge-draft"}>
          {employee.employmentStatus}
        </span>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Employment Details</h3>
        <dl className="review-list">
          <dt>Company</dt><dd>{employee.company ? employee.company.name : "-"}</dd>
          <dt>Employer of Record</dt><dd>{employee.employerOfRecord || "-"}</dd>
          <dt>Designation</dt><dd>{employee.designation}</dd>
          <dt>Reports To</dt><dd>{employee.reportsTo || "-"}</dd>
          <dt>Employment Type</dt><dd>{employee.employmentType}</dd>
          <dt>Date of Joining</dt><dd>{new Date(employee.dateOfJoining).toLocaleDateString()}</dd>
          <dt>JD on File</dt><dd>{employee.jdOnFile ? "Yes" : "No"}</dd>
        </dl>

        <h3>Personal Details</h3>
        <dl className="review-list">
          <dt>Father's Name</dt><dd>{employee.fatherName}</dd>
          <dt>CNIC</dt><dd>{employee.cnic}</dd>
          <dt>Contact Number</dt><dd>{employee.contactNumber || "-"}</dd>
        </dl>

        {!isIntern && (
          <>
            <h3>Salary & Deductions</h3>
            <dl className="review-list">
              <dt>Basic Salary</dt><dd>{employee.basicSalary}</dd>
              <dt>House Rent Allowance</dt><dd>{employee.houseRentAllowance}</dd>
              <dt>Medical Allowance</dt><dd>{employee.medicalAllowance}</dd>
              <dt>Conveyance Allowance</dt><dd>{employee.conveyanceAllowance}</dd>
              <dt>Other Allowance</dt><dd>{employee.otherAllowance}</dd>
              <dt>Gross Salary</dt><dd><strong>{employee.grossSalary}</strong></dd>
              <dt>Income Tax Deduction</dt><dd>{employee.incomeTaxDeduction}</dd>
              <dt>EOBI Deduction</dt><dd>{employee.eobiDeduction}</dd>
              <dt>Other Deduction</dt><dd>{employee.otherDeduction}</dd>
              <dt>Total Deductions</dt><dd><strong>{employee.totalDeductions}</strong></dd>
              <dt>Net Payable</dt><dd><strong>{employee.netPayable}</strong></dd>
              <dt>Bank Name</dt><dd>{employee.bankName || "-"}</dd>
              <dt>Account Title</dt><dd>{employee.accountTitle || "-"}</dd>
              <dt>Account Number</dt><dd>{employee.accountNumber || "-"}</dd>
            </dl>
          </>
        )}

        {employee.notes && (
          <>
            <h3>Notes</h3>
            <p>{employee.notes}</p>
          </>
        )}

        <dl className="review-list">
          <dt>Synced to Master Sheet</dt>
          <dd>{employee.syncedToSheetAt ? new Date(employee.syncedToSheetAt).toLocaleString() : "Not yet"}</dd>
        </dl>

        {actionError && <p className="msg error">{actionError}</p>}

        <div className="decision-box">
          <button className="btn-primary" disabled={saving} onClick={toggleStatus}>
            {saving ? "Updating..." : `Mark as ${employee.employmentStatus === "Active" ? "Inactive" : "Active"}`}
          </button>
        </div>
      </div>
    </div>
  );
}