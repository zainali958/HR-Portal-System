import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanies } from "../api/companies";
import { getEmployees } from "../api/employees";
import { createPayrollCycle } from "../api/payroll";

export default function PayrollCreatePage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [month, setMonth] = useState("");
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState({});
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCompanies()
      .then(setCompanies)
      .catch(() => setLoadError("Failed to load companies"));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      return;
    }
    getEmployees()
      .then((all) => {
        // Interns are unpaid per the brief - they should never be
        // selectable for a real payroll cycle. If AmanorX later wants a
        // paid stipend for interns, that's a separate policy decision that
        // needs its own explicit field, not reuse of "Proposed Amount".
        const filtered = all.filter(
          (e) => e.company && e.company._id === companyId &&
                 e.employmentStatus === "Active" &&
                 e.employmentType !== "Intern"
        );
        setEmployees(filtered);
        setEntries({});
      })
      .catch(() => setLoadError("Failed to load employees"));
  }, [companyId]);

  function toggleEmployee(empId, checked) {
    setEntries((prev) => {
      const next = { ...prev };
      if (checked) {
        next[empId] = { included: true, proposedAmount: "", attendanceSummary: "", tasksSummary: "", note: "" };
      } else {
        delete next[empId];
      }
      return next;
    });
  }

  function updateEntry(empId, field, value) {
    setEntries((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    const included = Object.entries(entries).filter(([, v]) => v.included);
    if (!companyId || !month) {
      setSubmitError("Company and month are required");
      return;
    }
    if (included.length === 0) {
      setSubmitError("Select at least one employee to include in this cycle");
      return;
    }
    const missingAmount = included.find(([, v]) => !v.proposedAmount);
    if (missingAmount) {
      setSubmitError("Every included employee needs a proposed amount");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        companyId,
        month,
        entries: included.map(([empId, v]) => ({
          employee: empId,
          proposedAmount: Number(v.proposedAmount),
          attendanceSummary: v.attendanceSummary,
          tasksSummary: v.tasksSummary,
          note: v.note,
        })),
      };
      const cycle = await createPayrollCycle(payload);
      navigate(`/payroll/${cycle._id}`);
    } catch (err) {
      setSubmitError(err.response?.data?.message || "Failed to create payroll cycle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-content">
      <p className="eyebrow">Payroll</p>
      <h1>New Payroll Cycle</h1>

      {loadError && <p className="msg error">{loadError}</p>}

      <form onSubmit={handleSubmit} className="card">
        <label>
          Company
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
            <option value="">Select a company...</option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        </label>

        {companyId && employees.length === 0 && (
          <p className="muted">No active employees found for this company.</p>
        )}
        {companyId && (
        <p className="muted" style={{ marginTop: "-0.6rem" }}>
            Interns are excluded from payroll (unpaid, per policy) — only Full-Time/Part-Time employees are shown.
        </p>
        )}

        {employees.length > 0 && (
          <>
            <h3>Employees</h3>
            {employees.map((emp) => {
              const entry = entries[emp._id];
              const included = !!entry?.included;
              return (
                <div key={emp._id} className="card" style={{ marginBottom: "0.8rem", padding: "1rem" }}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={(e) => toggleEmployee(emp._id, e.target.checked)}
                    />
                    <strong>{emp.employeeName}</strong> — {emp.designation}
                    {emp.netPayable ? <span className="muted"> (last net payable: {emp.netPayable})</span> : null}
                  </label>

                  {included && (
                    <>
                      <label>
                        Proposed Amount
                        <input
                          type="number"
                          min="0"
                          value={entry.proposedAmount}
                          onChange={(e) => updateEntry(emp._id, "proposedAmount", e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Attendance Summary <span className="optional">(optional)</span>
                        <textarea
                          rows={2}
                          value={entry.attendanceSummary}
                          onChange={(e) => updateEntry(emp._id, "attendanceSummary", e.target.value)}
                        />
                      </label>
                      <label>
                        Tasks Summary <span className="optional">(optional)</span>
                        <textarea
                          rows={2}
                          value={entry.tasksSummary}
                          onChange={(e) => updateEntry(emp._id, "tasksSummary", e.target.value)}
                        />
                      </label>
                      <label>
                        Note <span className="optional">(optional)</span>
                        <input
                          value={entry.note}
                          onChange={(e) => updateEntry(emp._id, "note", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}

        {submitError && <p className="msg error">{submitError}</p>}

        <button type="submit" className="btn-primary" disabled={submitting || employees.length === 0}>
          {submitting ? "Submitting..." : "Submit Cycle for Finance Review"}
        </button>
      </form>
    </div>
  );
}