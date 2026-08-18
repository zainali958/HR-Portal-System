import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPayrollCycle, financeDecidePayroll, accountantDecidePayroll, ceoDecidePayroll, markPayrollPaid,
  escalatePayroll, resolvePayrollEscalation, escalatePayrollToCEO,
} from "../api/payroll";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function PayrollDetailPage() {
  const { id } = useParams();
  const { isHR, isCEO, isAccountant, isFinance } = useAuth();

  const [cycle, setCycle] = useState(null);
  const [status, setStatus] = useState({ state: "loading", message: "" });
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  // Per-entry revised-amount drafts, keyed by employee id - used by both
  // the Finance and CEO review boxes. Reset whenever the cycle (re)loads.
  const [revisions, setRevisions] = useState({});

  function load() {
    setStatus({ state: "loading", message: "" });
    getPayrollCycle(id)
      .then((data) => {
        setCycle(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        setStatus({ state: "error", message: err.response?.data?.message || "Failed to load payroll cycle" });
      });
  }

  useEffect(() => { load(); }, [id]);

  // Whenever the cycle loads (or a decision updates it), reset the
  // revision drafts to the current baseline for whichever stage is active,
  // so reviewers start from "no change" and only touch what they mean to.
  useEffect(() => {
    if (!cycle) return;
    const next = {};
    for (const e of cycle.entries) {
      if (!e.employee) continue;
      const baseline = cycle.status === "Pending CEO Review"
        ? (e.financeApprovedAmount ?? e.proposedAmount)
        : e.proposedAmount;
      next[e.employee._id] = String(baseline);
    }
    setRevisions(next);
  }, [cycle?._id, cycle?.status]);

  async function runAction(fn, ...args) {
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await fn(id, ...args);
      setCycle(updated);
      setReason("");
    } catch (err) {
      setActionError(err.response?.data?.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  function buildRevisedAmounts(entries) {
    // Only send entries whose draft actually differs from the baseline -
    // an empty/unchanged map on the backend just means "approve as-is".
    const out = {};
    for (const e of entries) {
      if (!e.employee) continue;
      const baseline = cycle.status === "Pending CEO Review" ? (e.financeApprovedAmount ?? e.proposedAmount) : e.proposedAmount;
      const draft = Number(revisions[e.employee._id]);
      if (Number.isFinite(draft) && draft !== baseline) out[e.employee._id] = draft;
    }
    return out;
  }

  if (status.state === "loading") return <div className="page-content"><p className="muted">Loading...</p></div>;
  if (status.state === "error") return <div className="page-content"><p className="msg error">{status.message}</p></div>;
  if (!cycle) return null;

  const total = cycle.entries.reduce((sum, e) => sum + (e.proposedAmount || 0), 0);
  const finalTotal = cycle.entries.reduce((sum, e) => sum + (e.paidAmount ?? e.ceoApprovedAmount ?? e.financeApprovedAmount ?? e.proposedAmount ?? 0), 0);

  const canFinanceDecide = isFinance && cycle.status === "Pending Finance Review";
  const canAccountantDecide = isAccountant && cycle.status === "Pending Accountant Review";
  const canCEODecide = isCEO && cycle.status === "Pending CEO Review";
  const canMarkPaid = isAccountant && cycle.status === "Approved";
  const canEscalate = (isFinance || isAccountant) &&
    ["Pending Finance Review", "Pending Accountant Review"].includes(cycle.status);
  const canResolveEscalation = isHR && cycle.status === "Needs HR Attention";
  const canEscalateToCEO = isHR && cycle.status === "Needs HR Attention" && !cycle.escalatedToCEO;

  // Did Finance actually propose a reduction anywhere? Drives the banner
  // CEO sees, and which baseline column reviewers are editing against.
  const financeReducedSomewhere = cycle.entries.some((e) => e.financeApprovedAmount != null && e.financeApprovedAmount !== e.proposedAmount);

  return (
    <div className="page-content">
      <p className="eyebrow">Payroll Cycle</p>
      <div className="page-header">
        <h1>{cycle.company ? cycle.company.name : "-"} — {cycle.month}</h1>
        <StatusBadge status={cycle.status} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Entries</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Designation</th>
                <th>Proposed</th>
                {cycle.entries.some((e) => e.carriedForwardAmount > 0) && <th>Incl. Carried Over</th>}
                {(canFinanceDecide) && <th>Finance's Amount</th>}
                {!canFinanceDecide && cycle.entries.some((e) => e.financeApprovedAmount != null) && <th>Finance Approved</th>}
                {(canCEODecide) && <th>CEO's Amount</th>}
                {!canCEODecide && cycle.entries.some((e) => e.ceoApprovedAmount != null) && <th>CEO Approved</th>}
                {cycle.entries.some((e) => e.paidAmount != null) && <><th>Paid</th><th>Shortfall</th></>}
                <th>Attendance</th>
                <th>Tasks</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {cycle.entries.map((e, i) => (
                <tr key={i}>
                  <td>{e.employee ? e.employee.employeeName : "-"}</td>
                  <td>{e.employee ? e.employee.designation : "-"}</td>
                  <td>{e.proposedAmount.toLocaleString()}</td>
                  {cycle.entries.some((x) => x.carriedForwardAmount > 0) && (
                    <td>{e.carriedForwardAmount > 0 ? e.carriedForwardAmount.toLocaleString() : "-"}</td>
                  )}
                  {canFinanceDecide && e.employee && (
                    <td>
                      <input
                        type="number" min="0" max={e.proposedAmount} style={{ width: "110px" }}
                        value={revisions[e.employee._id] ?? e.proposedAmount}
                        onChange={(ev) => setRevisions((prev) => ({ ...prev, [e.employee._id]: ev.target.value }))}
                      />
                    </td>
                  )}
                  {!canFinanceDecide && cycle.entries.some((x) => x.financeApprovedAmount != null) && (
                    <td>{e.financeApprovedAmount != null ? e.financeApprovedAmount.toLocaleString() : "-"}</td>
                  )}
                  {canCEODecide && e.employee && (
                    <td>
                      <input
                        type="number" min="0" max={e.proposedAmount} style={{ width: "110px" }}
                        value={revisions[e.employee._id] ?? (e.financeApprovedAmount ?? e.proposedAmount)}
                        onChange={(ev) => setRevisions((prev) => ({ ...prev, [e.employee._id]: ev.target.value }))}
                      />
                    </td>
                  )}
                  {!canCEODecide && cycle.entries.some((x) => x.ceoApprovedAmount != null) && (
                    <td>{e.ceoApprovedAmount != null ? e.ceoApprovedAmount.toLocaleString() : "-"}</td>
                  )}
                  {cycle.entries.some((x) => x.paidAmount != null) && (
                    <>
                      <td>{e.paidAmount != null ? e.paidAmount.toLocaleString() : "-"}</td>
                      <td>{e.shortfall > 0 ? <strong>{e.shortfall.toLocaleString()}</strong> : "-"}</td>
                    </>
                  )}
                  <td>
                    {e.attendanceFile ? (
                      <a
                        href={`data:${e.attendanceFile.mimetype};base64,${e.attendanceFile.data}`}
                        download={e.attendanceFile.filename}
                      >
                        {e.attendanceFile.filename}
                      </a>
                    ) : e.attendanceSource === "attendance-system" ? "AttendanceSystem" : "-"}
                  </td>
                  <td>
                    {e.tasksFile ? (
                      <a
                        href={`data:${e.tasksFile.mimetype};base64,${e.tasksFile.data}`}
                        download={e.tasksFile.filename}
                      >
                        {e.tasksFile.filename}
                      </a>
                    ) : "-"}
                  </td>
                  <td>{e.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cycle.entries.some((e) => e.attendanceSummary) && (
          <div className="card" style={{ marginTop: "0.8rem" }}>
            <h4 style={{ marginTop: 0 }}>Attendance Deductions</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Working Days</th>
                    <th>Informed Leave</th>
                    <th>Uninformed Leave</th>
                    <th>Late (chargeable)</th>
                    <th>Per-Day Rate</th>
                    <th>Total Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {cycle.entries.filter((e) => e.attendanceSummary).map((e, i) => (
                    <tr key={i}>
                      <td>{e.employee ? e.employee.employeeName : "-"}</td>
                      <td>{e.attendanceSummary.workingDays} / {e.attendanceSummary.totalDaysInMonth}</td>
                      <td>{e.attendanceSummary.informedLeaveDays} day(s) — {e.attendanceSummary.informedLeaveDeduction.toLocaleString()}</td>
                      <td>{e.attendanceSummary.uninformedLeaveDays} day(s) — {e.attendanceSummary.uninformedLeaveDeduction.toLocaleString()}</td>
                      <td>{e.attendanceSummary.lateDays} total, {e.attendanceSummary.chargeableLateDays} chargeable — {e.attendanceSummary.lateDeduction.toLocaleString()}</td>
                      <td>{e.attendanceSummary.perDayRate.toLocaleString()}</td>
                      <td><strong>{e.attendanceSummary.totalDeduction.toLocaleString()}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p style={{ textAlign: "right", marginTop: "0.8rem" }}>
          {finalTotal !== total && <span className="muted">Originally proposed: {total.toLocaleString()} — </span>}
          <strong>Total: {finalTotal.toLocaleString()}</strong>
        </p>

        <dl className="review-list">
          <dt>Created By</dt><dd>{cycle.createdBy ? cycle.createdBy.fullName : "-"}</dd>
          {cycle.financeDecision?.by && (
            <><dt>Finance Decision</dt><dd>{cycle.financeDecision.by.fullName} — {new Date(cycle.financeDecision.at).toLocaleString()}{cycle.financeDecision.reason ? ` (${cycle.financeDecision.reason})` : ""}</dd></>
          )}
          {cycle.accountantDecision?.by && (
            <><dt>Accountant Decision</dt><dd>{cycle.accountantDecision.by.fullName} — {new Date(cycle.accountantDecision.at).toLocaleString()}{cycle.accountantDecision.reason ? ` (${cycle.accountantDecision.reason})` : ""}</dd></>
          )}
          {cycle.ceoDecision?.by && (
            <><dt>CEO Decision</dt><dd>{cycle.ceoDecision.by.fullName} — {new Date(cycle.ceoDecision.at).toLocaleString()}{cycle.ceoDecision.reason ? ` (${cycle.ceoDecision.reason})` : ""}</dd></>
          )}
          {cycle.paidBy && (
            <><dt>Marked Paid</dt><dd>{cycle.paidBy.fullName} — {new Date(cycle.paidAt).toLocaleString()}</dd></>
          )}
          {cycle.escalatedToHR && (
            <><dt>Escalated to HR</dt><dd>{cycle.escalationReason} — {new Date(cycle.escalatedAt).toLocaleString()}</dd></>
          )}
          {cycle.escalatedToCEO && (
            <><dt>Escalated to CEO</dt><dd>{new Date(cycle.escalatedToCEOAt).toLocaleString()}</dd></>
          )}
        </dl>

        {actionError && <p className="msg error">{actionError}</p>}

        {canFinanceDecide && (
          <div className="decision-box">
            <h3>Finance Review</h3>
            <p className="muted" style={{ marginTop: "-0.4rem" }}>
              If the company can pay everyone in full, just Approve. If not, lower any employee's amount in
              the "Finance's Amount" column above before approving — that sends this cycle straight to the
              CEO for sign-off instead of the Accountant, since a reduced payroll needs their judgment call.
            </p>
            <label>
              Reason <span className="optional">(required if declining or reducing any amount)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(financeDecidePayroll, "Approved", reason, buildRevisedAmounts(cycle.entries))}>
                Approve
              </button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => runAction(financeDecidePayroll, "Declined", reason)}>Decline</button>
            </div>
          </div>
        )}

        {canAccountantDecide && (
          <div className="decision-box">
            <h3>Accountant Review</h3>
            <label>
              Reason <span className="optional">(required if declining)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(accountantDecidePayroll, "Approved", reason)}>Approve → Send to CEO</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => runAction(accountantDecidePayroll, "Declined", reason)}>Decline</button>
            </div>
          </div>
        )}

        {canCEODecide && (
          <div className="decision-box">
            <h3>CEO Final Sign-Off</h3>
            {financeReducedSomewhere ? (
              <p className="muted" style={{ marginTop: "-0.4rem" }}>
                Finance proposed a reduced amount for one or more employees — check the "CEO's Amount"
                column above. You can approve Finance's numbers as-is, type in your own different amount for
                any employee, or decline the whole cycle.
              </p>
            ) : (
              <p className="muted" style={{ marginTop: "-0.4rem" }}>
                You can adjust any employee's amount above before approving, or just approve as proposed.
              </p>
            )}
            <label>
              Reason <span className="optional">(required if declining or changing any amount)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(ceoDecidePayroll, "Approved", reason, buildRevisedAmounts(cycle.entries))}>
                Approve Payroll
              </button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => runAction(ceoDecidePayroll, "Declined", reason)}>Decline</button>
            </div>
          </div>
        )}

        {canMarkPaid && (
          <div className="decision-box">
            <h3>Mark as Paid</h3>
            <p className="muted" style={{ marginTop: "-0.4rem" }}>
              Confirms this cycle has actually been disbursed. Any employee whose approved amount came in
              under what was originally proposed will have the difference automatically added to their next
              payroll cycle.
            </p>
            <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(markPayrollPaid)}>
              Confirm Paid
            </button>
          </div>
        )}

        {canEscalate && (
          <div className="decision-box">
            <h3>Escalate to HR</h3>
            <p className="muted">If there's a problem with this cycle, flag it to HR instead of approving or declining.</p>
            <label>
              Reason
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <button className="btn-secondary" disabled={actionLoading || !reason.trim()} onClick={() => runAction(escalatePayroll, reason)}>
              Escalate to HR
            </button>
          </div>
        )}

        {cycle.status === "Needs HR Attention" && (
          <div className="decision-box">
            <h3>Needs HR Attention</h3>
            <p className="muted">{cycle.escalationReason}</p>
            {canResolveEscalation && (
              <div className="wizard-actions">
                <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(resolvePayrollEscalation)}>
                  Resolved — Send Back
                </button>
                {canEscalateToCEO && (
                  <button className="btn-secondary" disabled={actionLoading} onClick={() => runAction(escalatePayrollToCEO)}>
                    Escalate to CEO
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
