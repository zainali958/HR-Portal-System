import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  // If allowedRoles is provided and the user's role isn't in it, redirect
  // to Onboarding - the one page every role has legitimate access to -
  // rather than showing a broken/empty page.
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}