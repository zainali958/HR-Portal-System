import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getOffer, hrDecideOffer, ceoDecideOffer, shareOffer, commentOnOffer, updateOffer, recordCandidateResponse } from "../api/offers";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import CommentThread from "../components/CommentThread";

export default function OfferDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [offer, setOffer] = useState(null);
  const [status, setStatus] = useState({ state: "loading", message: "" });
  const [decisionReason, setDecisionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [editSalary, setEditSalary] = useState("");

  function load() {
    setStatus({ state: "loading", message: "" });
    getOffer(id)
      .then((data) => {
        setOffer(data);
        setEditSalary(data.proposedSalary || "");
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        const message = err.response && err.response.data && err.response.data.message
          ? err.response.data.message
          : "Failed to load offer";
        setStatus({ state: "error", message });
      });
  }

  useEffect(() => { load(); }, [id]);

  const isSubmitter = offer && user && offer.submittedBy && String(offer.submittedBy._id || offer.submittedBy) === String(user.id);
  const isHR = user && user.role === "HR";
  const isCEO = user && user.role === "CEO";

  async function handleHRDecision(decision) {
    setActionError("");
    if ((decision === "Declined" || decision === "Changes Requested") && !decisionReason.trim()) {
      setActionError("A reason is required for Declined or Changes Requested");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await hrDecideOffer(id, decision, decisionReason.trim());
      setOffer(updated);
      setDecisionReason("");
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to record HR decision");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCEODecision(decision) {
    setActionError("");
    if ((decision === "Declined" || decision === "Changes Requested") && !decisionReason.trim()) {
      setActionError("A reason is required for Declined or Changes Requested");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await ceoDecideOffer(id, decision, decisionReason.trim());
      setOffer(updated);
      setDecisionReason("");
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to record CEO decision");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleShare() {
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await shareOffer(id);
      setOffer(updated);
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to share offer letter");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResubmit() {
    setActionError("");
    setActionLoading(true);
    try {
      const payload = { resubmit: true };
      if (offer.employmentType !== "Intern") payload.proposedSalary = Number(editSalary) || undefined;
      const updated = await updateOffer(id, payload);
      setOffer(updated);
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to resubmit");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddComment(message) {
    const comment = await commentOnOffer(id, message);
    setOffer((prev) => ({ ...prev, comments: [...prev.comments, comment] }));
  }

  async function handleCandidateResponse(response) {
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await recordCandidateResponse(id, response);
      setOffer(updated);
    } catch (err) {
      setActionError(err.response?.data?.message || "Failed to record candidate response");
    } finally {
      setActionLoading(false);
    }
  }

  if (status.state === "loading") return <div className="page-content"><p className="muted">Loading...</p></div>;
  if (status.state === "error") return <div className="page-content"><p className="msg error">{status.message}</p></div>;
  if (!offer) return null;

  const canHRDecide = isHR && offer.status === "Pending HR Review" && !isSubmitter;
  const canCEODecide = isCEO && offer.status === "Pending CEO Review" && !isSubmitter;
  const canShare = isHR && offer.status === "Approved" && !offer.sharedWithTeamLead;
  const canEditResubmit = isSubmitter && offer.status === "Changes Requested";
  const canRecordCandidateResponse =
    offer.status === "Approved" && offer.sharedWithTeamLead && offer.candidateResponse === "Pending" && isSubmitter;
  const readyForOnboarding = offer.status === "Approved" && offer.candidateResponse === "Accepted" && isSubmitter;
  return (
    <div className="page-content">
      <p className="eyebrow">Offer</p>
      <div className="page-header">
        <h1>{offer.candidateName}</h1>
        <StatusBadge status={offer.status} />
      </div>

      <div className="card">
        <dl className="review-list">
          <dt>Company</dt><dd>{offer.company ? offer.company.name : "-"}</dd>
          <dt>Submitted By</dt><dd>{offer.submittedBy ? offer.submittedBy.fullName : "-"}</dd>
          <dt>Employment Type</dt><dd>{offer.employmentType}</dd>
          <dt>Designation</dt><dd>{offer.designation}</dd>
          <dt>Timings</dt><dd>{offer.timings || "-"}</dd>
          <dt>Job Description</dt><dd className="pre-wrap">{offer.jobDescription}</dd>
          <dt>KPIs</dt><dd><ul>{offer.kpis.map((k, i) => <li key={i}>{k}</li>)}</ul></dd>
          {offer.employmentType !== "Intern" && (
            <><dt>Proposed Salary</dt><dd>{offer.proposedSalary ?? "-"}</dd></>
          )}
          {offer.hrApproval && offer.hrApproval.by && (
            <><dt>HR Approved By</dt><dd>{offer.hrApproval.by.fullName} — {new Date(offer.hrApproval.at).toLocaleString()}</dd></>
          )}
          {offer.ceoApproval && offer.ceoApproval.by && (
            <><dt>CEO Approved By</dt><dd>{offer.ceoApproval.by.fullName} — {new Date(offer.ceoApproval.at).toLocaleString()}</dd></>
          )}
          {offer.sharedWithTeamLead && (
            <><dt>Shared With Team Lead</dt><dd>{new Date(offer.sharedAt).toLocaleString()}</dd></>
          )}
          <dt>Candidate Response</dt><dd>{offer.candidateResponse}</dd>
          {offer.decisionReason && (
            <><dt>Last Decision Reason</dt><dd>{offer.decisionReason}</dd></>
          )}
        </dl>

        {actionError && <p className="msg error">{actionError}</p>}

        {canHRDecide && (
          <div className="decision-box">
            <h3>HR Review (Stage 1 of 2)</h3>
            <label>
              Reason <span className="optional">(required for Decline / Changes Requested)</span>
              <textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => handleHRDecision("Approved")}>Approve → Send to CEO</button>
              <button className="btn-secondary" disabled={actionLoading} onClick={() => handleHRDecision("Changes Requested")}>Request Changes</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => handleHRDecision("Declined")}>Decline</button>
            </div>
          </div>
        )}

        {canCEODecide && (
          <div className="decision-box">
            <h3>CEO Review (Stage 2 of 2 — Final)</h3>
            <p className="muted">Approving here generates the offer letter.</p>
            <label>
              Reason <span className="optional">(required for Decline / Changes Requested)</span>
              <textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => handleCEODecision("Approved")}>Approve → Generate Offer Letter</button>
              <button className="btn-secondary" disabled={actionLoading} onClick={() => handleCEODecision("Changes Requested")}>Request Changes</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => handleCEODecision("Declined")}>Decline</button>
            </div>
          </div>
        )}

        {offer.status === "Pending CEO Review" && !canCEODecide && (
          <div className="decision-box">
            <p className="muted">HR has approved this offer — awaiting CEO's final review.</p>
          </div>
        )}

        {canShare && (
          <div className="decision-box">
            <h3>Offer Letter Ready</h3>
            <p className="muted">The CEO has approved this offer. Share the letter with the Team Lead to proceed.</p>
            <button className="btn-primary" disabled={actionLoading} onClick={handleShare}>Share With Team Lead</button>
          </div>
        )}

        {canEditResubmit && (
          <div className="decision-box">
            <h3>Changes Requested — Update and Resubmit</h3>
            <p className="muted">Resubmitting sends this back to HR for review again.</p>
            {offer.employmentType !== "Intern" && (
              <label>
                Proposed Salary
                <input type="number" value={editSalary} onChange={(e) => setEditSalary(e.target.value)} />
              </label>
            )}
            <button className="btn-primary" disabled={actionLoading} onClick={handleResubmit}>Resubmit for HR Review</button>
          </div>
        )}

        {canRecordCandidateResponse && (
          <div className="decision-box">
            <h3>Candidate Response</h3>
            <p className="muted">Record whether the candidate accepted or declined this offer.</p>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => handleCandidateResponse("Accepted")}>Candidate Accepted</button>
              <button className="btn-secondary" disabled={actionLoading} onClick={() => handleCandidateResponse("Declined")}>Candidate Declined</button>
            </div>
          </div>
        )}

        {readyForOnboarding && (
          <div className="decision-box">
            <h3>Ready for Onboarding</h3>
            <p className="muted">The candidate accepted - start onboarding to collect their details.</p>
            <Link to={`/onboarding/new?offerId=${offer._id}`} className="btn-primary btn-link">Start Onboarding</Link>
          </div>
        )}
      </div>

      <div className="card">
        <CommentThread comments={offer.comments} onAddComment={handleAddComment} />
      </div>
    </div>
  );
}