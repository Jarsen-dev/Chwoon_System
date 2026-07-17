// Centralized, domain-semantic icon registry.
//
// We re-export Lucide icons under business names so screens never couple to a
// specific Lucide icon name. Icons inherit `currentColor`, so they tint with the
// module accent (e.g. `text-[var(--accent)]`). Always size via the `size` prop,
// never font-size.
export {
  // Navegación / general
  Home as IconInicio,
  ScanLine as IconCaptura,
  LayoutDashboard as IconDashboard,
  LogOut as IconSalir,
  X as IconCerrar,
  User as IconUsuario,
  RefreshCw as IconActualizar,
  Search as IconBuscar,
  ChevronLeft as IconAnterior,
  ChevronRight as IconSiguiente,

  // Módulos
  Factory as IconProduccion,
  Warehouse as IconAlmacen,
  Microscope as IconCalidad,
  ShoppingCart as IconCompras,
  Truck as IconLogistica,
  DollarSign as IconFinanzas,
  Banknote as IconVentas,
  Cog as IconMaquinas,
  ShieldCheck as IconAdmin,

  // Almacén — tabs y conceptos
  Package as IconInventario,
  Boxes as IconLotes,
  PackagePlus as IconRecepciones,
  MapPin as IconUbicaciones,
  Repeat as IconTraslados,
  Search as IconTrazabilidad,
  Ruler as IconConteo,
  ClipboardList as IconPicking,
  Settings as IconConfig,
  Printer as IconEtiquetas,

  // Producción / IA / alertas
  Sparkles as IconPrediccion,
  TriangleAlert as IconAlertas,
  ShieldAlert as IconFraude,
  Turtle as IconLento,
  Keyboard as IconTeclado,
  ClipboardX as IconPegado,
  Siren as IconAlarma,

  // Turnos
  Sun as IconTurnoDia,
  Moon as IconTurnoNoche,

  // Estados
  Check as IconOk,
  CheckCheck as IconCompletado,
  Lock as IconBloqueado,
  Hourglass as IconPendiente,
  Clock as IconTiempo,
  PauseCircle as IconSinMovimiento,

  // Acciones comunes
  Plus as IconNuevo,
  Play as IconEjecutar,
  Eye as IconVer,
  Pencil as IconEditar,
  Trash2 as IconEliminar,
  FileText as IconDocumento,
  Filter as IconFiltro,
  Tag as IconTag,
  History as IconHistorial,
  Calendar as IconFecha,

  // Vistas / gráficos
  Info as IconInfo,
  Inbox as IconBandeja,
  Lightbulb as IconTip,
  ListChecks as IconLista,
  BarChart3 as IconGrafico,
  TrendingUp as IconFifo,
  LineChart as IconDemanda,
  PieChart as IconPie,

  // Producción — tabs
  Wrench as IconEnsamble,
  Flame as IconPreExpansion,
  Syringe as IconInyeccion,
  Thermometer as IconSecado,
  Camera as IconCamara,
  Container as IconSilo,
  Recycle as IconReciclar,

  // Calidad
  PackageCheck as IconOQC,
  Undo2 as IconDevoluciones,

  // Compras
  Handshake as IconProveedores,
  Scale as IconValidacion,

  // Ventas / clientes
  Users as IconUsuarios,
  Mail as IconEmail,
  Phone as IconTelefono,

  // Admin
  Database as IconDatabase,
  MonitorCog as IconSistema,
  Building2 as IconEmpresa,
  ScrollText as IconLogs,
  Hash as IconContador,
  CircleStop as IconParo,
  Contact as IconContacto,
  PenLine as IconFirmar,
  Trophy as IconRanking,
  Save as IconGuardar,
  Unlock as IconDesbloqueado,
  Folder as IconModulo,
  Ban as IconInactivo,
  Landmark as IconBanco,
  Star as IconEstrella,
} from 'lucide-react';

export type { LucideIcon } from 'lucide-react';
