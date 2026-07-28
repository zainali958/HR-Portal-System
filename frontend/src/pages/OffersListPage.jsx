import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOffers } from "../api/offers";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

const STATUS_FILTERS = ["All", "Draft", "Pending", "Approved", "Declined", "Changes Requested"];

export default function OffersListPage() {
  const { isUnitManager, user } = useAuth();
  const [offers, setOffers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [mineOnly, setMineOnly] = useState(isUnitManager);
  const [status, setStatus] = useState({ state: "loading", message: "" });

  useEffect(() => {
    setStatus({ state: "loading", message: "" });
    getOffers(statusFilter === "All" ? undefined : statusFilter)
      .then((data) => {
        setOffers(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        const message = err.response && err.response.data && err.response.data.message
          ? err.response.data.message
          : "Failed to load offers";
        setStatus({ state: "error", message });
      });
  }, [statusFilter]);

  const visibleOffers = mineOnly
    ? offers.filter((o) => o.submittedBy && String(o.submittedBy._id) === String(user.id))
    : offers;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <p className="eyebrow">Offers</p>
          <h1>Job Offers</h1>
        </div>
        {isUnitManager && (
          <Link to="/offers/new" className="btn-primary btn-link">+ New Offer</Link>
        )}
      </div>

      {isUnitManager && (
        <div className="filter-row">
          <button
            className={mineOnly ? "filter-pill active" : "filter-pill"}
            onClick={() => setMineOnly(true)}
          >
            My Submissions
          </button>
          <button
            className={!mineOnly ? "filter-pill active" : "filter-pill"}
            onClick={() => setMineOnly(false)}
          >
            All Company Offers
          </button>
        </div>
      )}

      <div className="filter-row">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={s === statusFilter ? "filter-pill active" : "filter-pill"}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {status.state === "loading" && <p className="muted">Loading offers...</p>}
      {status.state === "error" && <p className="msg error">{status.message}</p>}

      {status.state === "success" && visibleOffers.length === 0 && (
        <p className="muted">No offers found.</p>
      )}

      {status.state === "success" && visibleOffers.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Company</th>
                <th>Designation</th>
                <th>Type</th>
                <th>Submitted By</th>
                <th>Status</th>
                <th>Candidate Response</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleOffers.map((offer) => (
                <tr key={offer._id}>
                  <td>{offer.candidateName}</td>
                  <td>{offer.company ? offer.company.name : "-"}</td>
                  <td>{offer.designation}</td>
                  <td>{offer.employmentType}</td>
                  <td>{offer.submittedBy ? offer.submittedBy.fullName : "-"}</td>
                  <td><StatusBadge status={offer.status} /></td>
                  <td>{offer.candidateResponse === "Pending" ? "-" : `Candidate ${offer.candidateResponse}`}</td>                   <td><Link to={`/offers/${offer._id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}