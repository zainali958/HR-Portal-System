import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOnboardingRecord, decideOnboarding, downloadOfferLetter, accountantBankDecision, financeBankDecision, updateBankDetails } from "../api/onboarding";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function OnboardingDetailPage() {
  const { id } = useParams();
  const { user, canApprove, isAccountant, isFinance } = useAuth();

  const [record, setRecord] = useState(null);
  const [status, setStatus] = useState({ state: "loading", message: "" });
  const [decisionReason, setDecisionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [bankReason, setBankReason] = useState("");
  const [bankEditFields, setBankEditFields] = useState({ bankName: "", accountTitle: "", accountNumber: "" });

  function load() {
    setStatus({ state: "loading", message: "" });
    getOnboardingRecord(id)
      .then((data) => {
        setRecord(data);
        setBankEditFields({ bankName: data.bankName || "", accountTitle: data.accountTitle || "", accountNumber: data.accountNumber || "" });
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        const message = err.response && err.response.data && err.response.data.message
          ? err.response.data.message
          : "Failed to load onboarding record";
        setStatus({ state: "error", message });
      });
  }

  useEffect(() => { load(); }, [id]);

  const isSubmitter = record && user && record.submittedBy && String(record.submittedBy._id) === String(user.id);

  async function handleDecision(decision) {
    setActionError("");
    if ((decision === "Declined" || decision === "Changes Requested") && !decisionReason.trim()) {
      setActionError("A reason is required for Declined or Changes Requested");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await decideOnboarding(id, decision, decisionReason.trim());
      setRecord(updated);
      setDecisionReason("");
    } catch (err) {
      const message = err.response && err.response.data && err.response.data.message
        ? err.response.data.message
        : "Failed to record decision";
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAccountantBankDecision(decision) {
    setActionError("");
    if (decision !== "Approved" && !bankReason.trim()) {
      setActionError("A reason is required for Declined or Changes Requested");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await accountantBankDecision(id, decision, bankReason.trim());
      setRecord(updated);
      setBankReason("");
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to record decision");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFinanceBankDecision(decision) {
    setActionError("");
    if (decision !== "Approved" && !bankReason.trim()) {
      setActionError("A reason is required for Declined or Changes Requested");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await financeBankDecision(id, decision, bankReason.trim());
      setRecord(updated);
      setBankReason("");
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to record decision");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBankResubmit() {
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await updateBankDetails(id, bankEditFields);
      setRecord(updated);
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to update bank details");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadLetter() {
    setActionError("");
    try {
      await downloadOfferLetter(id, `${record.employeeName.replace(/\s+/g, "_")}_Letter.docx`);
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to download letter");
    }
  }

  if (status.state === "loading") return <div className="page-content"><p className="muted">Loading...</p></div>;
  if (status.state === "error") return <div className="page-content"><p className="msg error">{status.message}</p></div>;
  if (!record) return null;

  const canDecide = canApprove && record.status === "Pending" && !isSubmitter;
  const isIntern = record.employmentType === "Intern";

  return (
    <div className="page-content">
      <p className="eyebrow">Onboarding Record</p>
      <div className="page-header">
        <h1>{record.employeeName}</h1>
        <StatusBadge status={record.status} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Personal Details</h3>
        <dl className="review-list">
          <dt>Father's Name</dt><dd>{record.fatherName}</dd>
          <dt>CNIC</dt><dd>{record.cnic}</dd>
          <dt>Contact Number</dt><dd>{record.contactNumber || "-"}</dd>
        </dl>

        <h3>Employment Details</h3>
        <dl className="review-list">
          <dt>Company</dt><dd>{record.company ? record.company.name : "-"}</dd>
          <dt>Employer of Record</dt><dd>{record.employerOfRecord || "-"}</dd>
          <dt>Designation</dt><dd>{record.offer ? record.offer.designation : "-"}</dd>
          <dt>Reports To</dt><dd>{record.reportsTo}</dd>
          <dt>Employment Type</dt><dd>{record.employmentType}</dd>
          <dt>Date of Joining</dt><dd>{new Date(record.dateOfJoining).toLocaleDateString()}</dd>
          <dt>Employment Status</dt><dd>{record.employmentStatus}</dd>
          <dt>JD on File</dt><dd>{record.jdOnFile ? "Yes" : "No"}</dd>
        </dl>

        {!isIntern && (
          <>
            <h3>Salary & Deductions</h3>
            <dl className="review-list">
              <dt>Basic Salary</dt><dd>{record.basicSalary}</dd>
              <dt>House Rent Allowance</dt><dd>{record.houseRentAllowance}</dd>
              <dt>Medical Allowance</dt><dd>{record.medicalAllowance}</dd>
              <dt>Conveyance Allowance</dt><dd>{record.conveyanceAllowance}</dd>
              <dt>Other Allowance</dt><dd>{record.otherAllowance}</dd>
              <dt>Gross Salary</dt><dd><strong>{record.grossSalary}</strong></dd>
              <dt>Income Tax Deduction</dt><dd>{record.incomeTaxDeduction}</dd>
              <dt>EOBI Deduction</dt><dd>{record.eobiDeduction}</dd>
              <dt>Other Deduction</dt><dd>{record.otherDeduction}</dd>
              <dt>Total Deductions</dt><dd><strong>{record.totalDeductions}</strong></dd>
              <dt>Net Payable</dt><dd><strong>{record.netPayable}</strong></dd>
            </dl>
          </>
        )}

        {record.notes && (
          <>
            <h3>Notes</h3>
            <p>{record.notes}</p>
          </>
        )}

        {!isIntern && record.bankDetailsStatus !== "Not Started" && (
          <div className="decision-box">
            <h3>Bank Details Review <StatusBadge status={record.bankDetailsStatus} /></h3>
            <dl className="review-list">
              <dt>Bank Name</dt><dd>{record.bankName || "-"}</dd>
              <dt>Account Title</dt><dd>{record.accountTitle || "-"}</dd>
              <dt>Account Number</dt><dd>{record.accountNumber || "-"}</dd>
              {record.bankAccountantDecision?.by && (
                <><dt>Accountant Decision</dt><dd>{record.bankAccountantDecision.decision} — {record.bankAccountantDecision.by.fullName} ({new Date(record.bankAccountantDecision.at).toLocaleString()}){record.bankAccountantDecision.reason ? `: ${record.bankAccountantDecision.reason}` : ""}</dd></>
              )}
              {record.bankFinanceDecision?.by && (
                <><dt>Finance Decision</dt><dd>{record.bankFinanceDecision.decision} — {record.bankFinanceDecision.by.fullName} ({new Date(record.bankFinanceDecision.at).toLocaleString()}){record.bankFinanceDecision.reason ? `: ${record.bankFinanceDecision.reason}` : ""}</dd></>
              )}
            </dl>

            {isAccountant && record.bankDetailsStatus === "Pending" && !record.bankAccountantDecision?.decision && (
              <>
                <label>
                  Reason <span className="optional">(required if declining or requesting changes)</span>
                  <textarea value={bankReason} onChange={(e) => setBankReason(e.target.value)} rows={2} />
                </label>
                <div className="wizard-actions">
                  <button className="btn-primary" disabled={actionLoading} onClick={() => handleAccountantBankDecision("Approved")}>Approve (Accountant)</button>
                  <button className="btn-secondary" disabled={actionLoading} onClick={() => handleAccountantBankDecision("Changes Requested")}>Request Changes</button>
                  <button className="btn-danger" disabled={actionLoading} onClick={() => handleAccountantBankDecision("Declined")}>Decline</button>
                </div>
              </>
            )}

            {isFinance && record.bankDetailsStatus === "Pending" && !record.bankFinanceDecision?.decision && (
              <>
                <label>
                  Reason <span className="optional">(required if declining or requesting changes)</span>
                  <textarea value={bankReason} onChange={(e) => setBankReason(e.target.value)} rows={2} />
                </label>
                <div className="wizard-actions">
                  <button className="btn-primary" disabled={actionLoading} onClick={() => handleFinanceBankDecision("Approved")}>Approve (Finance)</button>
                  <button className="btn-secondary" disabled={actionLoading} onClick={() => handleFinanceBankDecision("Changes Requested")}>Request Changes</button>
                  <button className="btn-danger" disabled={actionLoading} onClick={() => handleFinanceBankDecision("Declined")}>Decline</button>
                </div>
              </>
            )}

            {isSubmitter && ["Declined", "Changes Requested"].includes(record.bankDetailsStatus) && (
              <>
                <h4>Update Bank Details and Resubmit</h4>
                <label>
                  Bank Name
                  <input value={bankEditFields.bankName} onChange={(e) => setBankEditFields((p) => ({ ...p, bankName: e.target.value }))} />
                </label>
                <label>
                  Account Title
                  <input value={bankEditFields.accountTitle} onChange={(e) => setBankEditFields((p) => ({ ...p, accountTitle: e.target.value }))} />
                </label>
                <label>
                  Account Number
                  <input value={bankEditFields.accountNumber} onChange={(e) => setBankEditFields((p) => ({ ...p, accountNumber: e.target.value }))} />
                </label>
                <button className="btn-primary" disabled={actionLoading} onClick={handleBankResubmit}>Resubmit Bank Details</button>
              </>
            )}
          </div>
        )}

        <div className="decision-box">
          <h3>Offer Letter</h3>
          <p className="muted">Generates the letter using company details, job description, and reporting info on file.</p>
          <button className="btn-secondary" onClick={handleDownloadLetter}>Download Offer Letter (.docx)</button>
        </div>

        <dl className="review-list">
          <dt>Synced to Master Sheet</dt>
          <dd>{record.syncedToSheetAt ? new Date(record.syncedToSheetAt).toLocaleString() : "Not yet"}</dd>
        </dl>

        {actionError && <p className="msg error">{actionError}</p>}

        {canDecide && (
          <div className="decision-box">
            <h3>Record a Decision</h3>
            <label>
              Reason <span className="optional">(required for Decline / Changes Requested)</span>
              <textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => handleDecision("Approved")}>Approve</button>
              <button className="btn-secondary" disabled={actionLoading} onClick={() => handleDecision("Changes Requested")}>Request Changes</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => handleDecision("Declined")}>Decline</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}