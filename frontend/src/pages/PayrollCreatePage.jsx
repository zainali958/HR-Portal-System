import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanies } from "../api/companies";
import { getEmployees } from "../api/employees";
import { createPayrollCycle, previewAttendance, fetchAttendanceFromSystem } from "../api/payroll";

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
        next[empId] = {
          included: true, proposedAmount: "", attendanceFile: null, leaveFile: null, tasksFile: null, note: "",
          attendancePreview: null, attendanceError: "", previewLoading: false,
        };
      } else {
        delete next[empId];
      }
      return next;
    });
  }

  function updateEntry(empId, field, value) {
    setEntries((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
  }

  const MAX_FILE_BYTES = 8 * 1024 * 1024; // keep comfortably under the 15mb JSON body limit once base64-encoded

  function handleFileChange(empId, field, fileList) {
    const file = fileList && fileList[0];
    if (!file) {
      updateEntry(empId, field, null);
      if (field === "attendanceFile" || field === "leaveFile") {
        updateEntry(empId, "attendancePreview", null);
        updateEntry(empId, "attendanceError", "");
      }
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setSubmitError(`${file.name} is too large - please upload a file under 8MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:<mimetype>;base64,<data>" - only the part
      // after the comma is the actual base64 payload we store.
      const base64 = reader.result.split(",")[1];
      const fileObj = { filename: file.name, mimetype: file.type || "application/octet-stream", data: base64 };

      setEntries((prev) => {
        const updatedEntry = { ...prev[empId], [field]: fileObj };
        // Manually picking a file overrides any previous auto-fetch from
        // AttendanceSystem for this employee.
        if (field === "attendanceFile") updatedEntry.useAttendanceSystem = false;

        // The check-in log drives the automatic deduction; the leave file
        // is optional context for it. Re-run the preview whenever either
        // one changes, using whichever files are currently selected.
        if ((field === "attendanceFile" || field === "leaveFile") && updatedEntry.attendanceFile) {
          updatedEntry.previewLoading = true;
          updatedEntry.attendanceError = "";
          previewAttendance(empId, month, updatedEntry.attendanceFile, updatedEntry.leaveFile)
            .then((result) => {
              setEntries((p2) => ({
                ...p2,
                [empId]: { ...p2[empId], attendancePreview: result, proposedAmount: String(result.suggestedProposedAmount), previewLoading: false, attendanceError: "" },
              }));
            })
            .catch((err) => {
              setEntries((p2) => ({
                ...p2,
                [empId]: { ...p2[empId], attendancePreview: null, previewLoading: false, attendanceError: err.response?.data?.message || "Failed to read the attendance/leave file" },
              }));
            });
        }

        return { ...prev, [empId]: updatedEntry };
      });
    };
    reader.onerror = () => setSubmitError(`Failed to read ${file.name}`);
    reader.readAsDataURL(file);
  }

  function handleAutoFetch(empId) {
    if (!month) {
      setSubmitError("Pick a month above first");
      return;
    }
    updateEntry(empId, "attendanceError", "");
    updateEntry(empId, "previewLoading", true);
    fetchAttendanceFromSystem(empId, month)
      .then((result) => {
        setEntries((prev) => ({
          ...prev,
          [empId]: {
            ...prev[empId],
            attendancePreview: result,
            proposedAmount: String(result.suggestedProposedAmount),
            useAttendanceSystem: true,
            attendanceFile: null, // fetched data replaces any file that was selected
            previewLoading: false,
            attendanceError: "",
          },
        }));
      })
      .catch((err) => {
        setEntries((prev) => ({
          ...prev,
          [empId]: { ...prev[empId], attendancePreview: null, previewLoading: false, attendanceError: err.response?.data?.message || "Failed to fetch from AttendanceSystem" },
        }));
      });
  }

  function downloadTemplate(kind) {
    const rows = kind === "attendance"
      ? ["Date,Username,Full Name,Department,Check-In Time,Late,Check-Out Time,Working Hours",
         "2026-07-01,zain,Zain Ali,IT,09:05:00,No,18:02:00,8h 57m",
         "2026-07-02,zain,Zain Ali,IT,12:07:07,Yes,,"]
      : ["Date,Reason", "2026-07-06,Sick leave - approved"];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "attendance" ? "attendance-checkin-template.csv" : "leave-requests-template.csv";
    a.click();
    URL.revokeObjectURL(url);
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
          attendanceFile: v.attendanceFile,
          leaveFile: v.leaveFile,
          useAttendanceSystem: !!v.useAttendanceSystem,
          tasksFile: v.tasksFile,
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
            <div className="page-header" style={{ marginBottom: "0.4rem" }}>
              <h3 style={{ margin: 0 }}>Employees</h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => downloadTemplate("attendance")}>
                  Download Check-In Template
                </button>
                <button type="button" className="btn-secondary" onClick={() => downloadTemplate("leave")}>
                  Download Leave Template
                </button>
              </div>
            </div>
            <p className="muted" style={{ marginTop: "-0.4rem" }}>
              Upload each employee's check-in log (exported from AttendanceSystem) and pay is deducted
              automatically: any weekday with no check-in and no approved leave request deducts a full
              day's pay, an approved leave deducts half a day's pay, and more than 3 late check-ins in
              the month cost a quarter-day each. Sundays are treated as the weekly off and never deducted.
            </p>
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
                    {emp.pendingSalaryCarryForward > 0 && (
                      <span className="msg error" style={{ display: "inline", marginLeft: "0.5rem" }}>
                        + {emp.pendingSalaryCarryForward.toLocaleString()} carried over from a previous cycle
                      </span>
                    )}
                  </label>

                  {included && (
                    <>
                      {!month && (
                        <p className="msg error" style={{ marginTop: "0.4rem" }}>Pick a month above first, so attendance can be matched to the right calendar days.</p>
                      )}

                      {emp.attendanceUsername ? (
                        <div className="decision-box" style={{ marginTop: "0.4rem" }}>
                          <p className="muted" style={{ margin: "0 0 0.5rem" }}>
                            Linked to AttendanceSystem as <strong>{emp.attendanceUsername}</strong> — pull this month's attendance directly instead of uploading files.
                          </p>
                          <button type="button" className="btn-primary" disabled={!month} onClick={() => handleAutoFetch(emp._id)}>
                            Fetch from AttendanceSystem
                          </button>
                        </div>
                      ) : (
                        <p className="muted" style={{ marginTop: "0.4rem" }}>
                          No AttendanceSystem username on file for this employee — add one on their Employee page to enable auto-fetch, or upload the files below manually.
                        </p>
                      )}

                      <label>
                        Check-In Log <span className="optional">(.csv/.xlsx export from AttendanceSystem — required for auto-calculation)</span>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          disabled={!month}
                          onChange={(e) => handleFileChange(emp._id, "attendanceFile", e.target.files)}
                        />
                        {entry.attendanceFile && (
                          <span className="muted" style={{ display: "block", marginTop: "0.3rem" }}>
                            Selected: {entry.attendanceFile.filename}
                          </span>
                        )}
                      </label>
                      <label>
                        Approved Leave Requests <span className="optional">(.csv/.xlsx, optional — dates not listed here count as Uninformed)</span>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={(e) => handleFileChange(emp._id, "leaveFile", e.target.files)}
                        />
                        {entry.leaveFile && (
                          <span className="muted" style={{ display: "block", marginTop: "0.3rem" }}>
                            Selected: {entry.leaveFile.filename}
                          </span>
                        )}
                      </label>

                      {entry.previewLoading && <p className="muted">Calculating deduction from attendance...</p>}
                      {entry.attendanceError && <p className="msg error">{entry.attendanceError}</p>}
                      {entry.attendancePreview && (
                        <div className="card" style={{ background: "var(--bg-subtle, #f7f7f7)", padding: "0.8rem", marginBottom: "0.8rem" }}>
                          <p className="muted" style={{ marginTop: 0 }}>
                            Source: {entry.attendancePreview.source === "attendance-system" ? "Fetched live from AttendanceSystem" : "Uploaded file"}
                          </p>
                          <dl className="review-list" style={{ margin: 0 }}>
                            <dt>Working Days</dt><dd>{entry.attendancePreview.summary.workingDays} of {entry.attendancePreview.summary.totalDaysInMonth} ({entry.attendancePreview.summary.weeklyOffDays} Sunday off)</dd>
                            <dt>Present</dt><dd>{entry.attendancePreview.summary.presentDays}</dd>
                            <dt>Informed Leave</dt>
                            <dd>{entry.attendancePreview.summary.informedLeaveDays} day(s) — deducts {entry.attendancePreview.deduction.informedLeaveDeduction.toLocaleString()}</dd>
                            <dt>Uninformed Leave / Absent</dt>
                            <dd>{entry.attendancePreview.summary.uninformedLeaveDays} day(s) — deducts {entry.attendancePreview.deduction.uninformedLeaveDeduction.toLocaleString()}</dd>
                            <dt>Late Check-Ins</dt>
                            <dd>{entry.attendancePreview.summary.lateDays} total, {entry.attendancePreview.deduction.chargeableLateDays} chargeable — deducts {entry.attendancePreview.deduction.lateDeduction.toLocaleString()}</dd>
                            <dt>Per-Day Rate</dt><dd>{entry.attendancePreview.deduction.perDayRate.toLocaleString()}</dd>
                            <dt>Total Deduction</dt><dd>{entry.attendancePreview.deduction.totalDeduction.toLocaleString()}</dd>
                            {entry.attendancePreview.carriedForwardAmount > 0 && (
                              <><dt>Carried Over From Before</dt><dd>+ {entry.attendancePreview.carriedForwardAmount.toLocaleString()}</dd></>
                            )}
                            <dt>Suggested Net Pay</dt><dd><strong>{entry.attendancePreview.suggestedProposedAmount.toLocaleString()}</strong></dd>
                          </dl>
                        </div>
                      )}

                      <label>
                        Proposed Amount {entry.attendancePreview && <span className="optional">(auto-filled from attendance — you can still adjust it)</span>}
                        <input
                          type="number"
                          min="0"
                          value={entry.proposedAmount}
                          onChange={(e) => updateEntry(emp._id, "proposedAmount", e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Task Report <span className="optional">(optional)</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx,.xls"
                          onChange={(e) => handleFileChange(emp._id, "tasksFile", e.target.files)}
                        />
                        {entry.tasksFile && (
                          <span className="muted" style={{ display: "block", marginTop: "0.3rem" }}>
                            Selected: {entry.tasksFile.filename}
                          </span>
                        )}
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
