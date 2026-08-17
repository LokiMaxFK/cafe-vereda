import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ManagerOnly } from "./components/ManagerOnly";
import { ProtectedLayout } from "./layout/ProtectedLayout";
import { CashPage } from "./pages/CashPage";
import { CatalogPage } from "./pages/CatalogPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PeoplePage } from "./pages/PeoplePage";
import { PreparationPage } from "./pages/PreparationPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SalePage } from "./pages/SalePage";
import { SalonPage } from "./pages/SalonPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PrinterSettingsPage } from "./pages/PrinterSettingsPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [pathname]);
  return null;
}

export default function App() {
  return <><ScrollToTop /><Routes>
    <Route path="/" element={<LoginPage />} />
    <Route element={<ProtectedLayout />}>
      <Route path="inicio" element={<DashboardPage />} />
      <Route path="salon" element={<SalonPage />} />
      <Route path="preparacion" element={<PreparationPage />} />
      <Route path="pedidos" element={<OrdersPage />} />
      <Route element={<ManagerOnly />}>
        <Route path="caja" element={<CashPage />} />
        <Route path="catalogo" element={<CatalogPage />} />
        <Route path="insumos" element={<InventoryPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="personal" element={<PeoplePage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="configuracion/impresion" element={<PrinterSettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route>
    <Route path="venta/:orderId" element={<SalePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></>;
}
