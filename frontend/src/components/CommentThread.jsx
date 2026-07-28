import { useState } from "react";

export default function CommentThread({ comments, onAddComment }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(message.trim());
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="comment-thread">
      <h3>Comments</h3>
      {(!comments || comments.length === 0) && <p className="muted">No comments yet.</p>}
      <ul className="comment-list">
        {comments && comments.map((comment) => (
          <li key={comment._id} className="comment-item">
            <div className="comment-author">
              {comment.author && comment.author.fullName ? comment.author.fullName : "Unknown"}
              <span className="comment-time">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="comment-message">{comment.message}</div>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="comment-form">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
        />
        <button type="submit" className="btn-secondary" disabled={submitting}>
          {submitting ? "Posting..." : "Post comment"}
        </button>
      </form>
    </div>
  );
}