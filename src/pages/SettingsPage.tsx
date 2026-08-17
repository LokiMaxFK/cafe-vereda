import { Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Page, PageHeader, Panel } from "../../design-system/react";

export function SettingsPage() {
  const navigate = useNavigate();
  return <Page size="default">
    <PageHeader eyebrow="SUCURSAL ÚNICA" title="Configuración" description="Ajustes operativos del punto de venta." />
    <Panel className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Printer /></span>
          <div>
            <h2 className="font-bold">Impresión térmica</h2>
            <p className="text-sm text-on-surface-variant">Ajusta el formato y prueba la impresión nativa del navegador.</p>
          </div>
        </div>
        <Button variant="primary" onClick={() => navigate("/configuracion/impresion")}><Printer size={18} /> Configurar y probar</Button>
      </div>
      <p className="mt-5 rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">No requiere QZ Tray ni certificados. La impresora se elige desde el diálogo de Windows y el diseño del ticket se guarda al pulsar <strong>Guardar</strong>.</p>
    </Panel>
  </Page>;
}
