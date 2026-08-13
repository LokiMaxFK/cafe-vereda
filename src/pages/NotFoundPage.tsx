import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Page, Panel } from "../../design-system/react";
export function NotFoundPage() { return <Page><Panel><EmptyState title="Esta ruta no existe" description="Vuelve al salón para continuar operando." action={<Link to="/salon"><Button variant="primary"><ArrowLeft size={18} /> Ir al salón</Button></Link>} /></Panel></Page>; }
