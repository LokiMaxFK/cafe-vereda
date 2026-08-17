import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../state/AppContext";

export function ManagerOnly() {
  return useApp().session?.role === "manager" ? <Outlet /> : <Navigate to="/inicio" replace />;
}
