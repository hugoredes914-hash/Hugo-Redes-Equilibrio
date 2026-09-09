import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BrainCircuit,
  BookOpen,
  Search,
  Plus,
  Loader2,
  Sparkles,
  X,
  ChevronRight,
  Target,
  Edit2,
  MessageCircle,
  Tag,
  Calendar,
  Clock,
  Bell,
  Phone,
  ArrowRight,
  Download,
  Wand2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  parseLeadWithAI,
  draftMessageWithAI,
  generateReportWithAI,
} from "../lib/gemini";
import {
  authorizeGoogleCalendar,
  createGoogleCalendarEvent,
  getCachedAccessToken,
} from "../lib/googleCalendar";

const SALES_STAGES = [
  "Prospección",
  "Calificación",
  "Seguimiento",
  "Propuesta",
  "Cierre",
  "Perdido",
];
const CAPTURE_STAGES = [
  "Prospección",
  "Contacto Inicial",
  "Reunión/Tasación",
  "Firma Autorización",
  "Cierre (Captada)",
  "Perdido",
];

const TEMPLATES = [
  {
    id: "captacion",
    label: "Captacion",
    content:
      "Hola, soy [Tu Nombre] de Century 21. Estoy trabajando con compradores/inquilinos activos en la zona y quería saber si estás evaluando vender o alquilar tu propiedad. Si te parece, puedo hacerte una estimación realista de valor y comentarte cómo sería el proceso sin compromiso.",
  },
  {
    id: "seguimiento",
    label: "Seguimiento",
    content:
      "Hola [Nombre], te escribo para dar seguimiento a nuestra charla sobre [Propiedad]. ¿Pudiste pensar en la propuesta? Quedo a tu disposición para cualquier duda.",
  },
  {
    id: "reactivar",
    label: "Reactivar",
    content:
      "Hola [Nombre], hace un tiempo hablamos sobre tus planes inmobiliarios. Quería saber si retomaste la idea o si ya lo resolviste.",
  },
  {
    id: "objecion_precio",
    label: "Objecion precio",
    content:
      "Entiendo tu postura sobre el precio, [Nombre]. Muchos clientes sentían lo mismo al principio, pero luego de ver el análisis de mercado competitivo comprobaron que ese es el valor óptimo. ¿Te gustaría que te muestre ese estudio?",
  },
  {
    id: "lead_meta",
    label: "Lead Meta Ads",
    content:
      "Hola [Nombre], vi que dejaste tus datos en nuestro anuncio interesado en [Proyecto/Servicio]. ¿En qué horario te queda mejor que te llame para darte los detalles?",
  },
  {
    id: "negociar_pago",
    label: "Negociar pago",
    content:
      "Respecto a las condiciones de pago, [Nombre], podemos presentar esta oferta al propietario. Lo ideal es ser lo más flexibles posible para que ambas partes ganen. ¿Cuál sería tu propuesta formal para ponerla sobre la mesa?",
  },
];

const DURATION_OPTIONS = [
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1 hora y media" },
  { value: 120, label: "2 horas" },
];

const NOTIFICATION_OPTIONS = [
  { value: 5, label: "5 minutos antes" },
  { value: 10, label: "10 minutos antes" },
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 día antes (24 hrs)" },
];

const formatWhatsAppPhone = (phone: string) => {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "595" + clean.substring(1);
  } else if (clean.length === 9) {
    clean = "595" + clean;
  }
  return clean;
};

export default function ProfessionalModule() {
  const [activeTab, setActiveTab] = useState("comercial");
  const [leads, setLeads] = useState<any[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(TEMPLATES[0]);

  const [isAddingLead, setIsAddingLead] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [leadError, setLeadError] = useState("");
  const [newLead, setNewLead] = useState({
    name: "",
    phone: "",
    property: "",
    stage: "Prospección",
    notes: "",
    nextActionDate: "",
    nextActionTime: "10:00",
    calendarDurationMinutes: 30,
    calendarNotificationMinutes: 30,
    propertyValue: "",
    interest: "Medio",
    googleCalendarSyncEnabled: false,
  });
  const [editingLead, setEditingLead] = useState<any>(null);

  const [aiInputText, setAiInputText] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);

  const uniqueProperties = Array.from(
    new Set(
      leads.map((l) => l.property).filter((p) => p && p.trim().length > 0),
    ),
  );

  const [aiMessageLead, setAiMessageLead] = useState<any>(null);
  const [generatedScript, setGeneratedScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);

  const [calendarSyncStatus, setCalendarSyncStatus] = useState<string | null>(
    null,
  );

  const handleConnectCalendar = async () => {
    try {
      setCalendarSyncStatus("Conectando Google...");
      const token = await authorizeGoogleCalendar();
      if (token) {
        setCalendarSyncStatus("✓ Google Calendar conectado con éxito");
        setTimeout(() => setCalendarSyncStatus(null), 3500);
      } else {
        setCalendarSyncStatus("Error al conectar");
        setTimeout(() => setCalendarSyncStatus(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setCalendarSyncStatus("Error de autenticación");
      setTimeout(() => setCalendarSyncStatus(null), 3000);
    }
  };

  const syncEventToGoogleCalendar = async (
    leadName: string,
    notes: string,
    dateStr: string,
    phone: string,
    timeStr?: string,
    durationMinutes?: number,
    notificationMinutes?: number,
  ) => {
    const isConnected = !!getCachedAccessToken();
    if (!isConnected) {
      console.warn("Unsynced as Google Calendar is not authorized.");
      return false;
    }

    const timeLabel = timeStr ? ` a las ${timeStr} hs` : '';
    const ok = await createGoogleCalendarEvent({
      summary: `Próxima acción con ${leadName}`,
      description: `CRM Recordatorio de Cliente: ${leadName}\nFecha y Horario: ${dateStr}${timeLabel}\nContacto: ${phone || "No especificado"}\nNotas: ${notes || "No especificadas"}`,
      startDate: dateStr,
      time: timeStr,
      durationMinutes: durationMinutes || 30,
      notificationMinutes: notificationMinutes !== undefined ? notificationMinutes : 30,
    });
    return ok;
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const qLeads = query(
      collection(db, "users", auth.currentUser.uid, "leads"),
      orderBy("createdAt", "desc"),
    );
    const unsubLeads = onSnapshot(
      qLeads,
      (snapshot) => {
        setLeads(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "leads"),
    );

    const unsubMetrics = onSnapshot(
      query(
        collection(db, "users", auth.currentUser.uid, "metrics"),
        orderBy("date", "desc"),
        limit(7),
      ),
      (snapshot) => {
        setMetricsHistory(snapshot.docs.map((d) => d.data()));
      },
      () => {},
    );

    return () => {
      unsubLeads();
      unsubMetrics();
    };
  }, []);

  const handleAddLead = async () => {
    if (!auth.currentUser || !newLead.name) return;

    const isDuplicate = leads.some((lead) => {
      const samePhone =
        newLead.phone && lead.phone && newLead.phone === lead.phone;
      const sameNameProperty =
        newLead.name.toLowerCase().trim() === lead.name.toLowerCase().trim() &&
        (newLead.property || "").toLowerCase().trim() ===
          (lead.property || "").toLowerCase().trim();
      return samePhone || sameNameProperty;
    });

    if (isDuplicate) {
      setLeadError(
        "Este lead ya existe (mismo teléfono, o mismo nombre y propiedad).",
      );
      return;
    }

    setLeadError("");

    try {
      const isTerminalStage =
        newLead.stage === "Perdido" || newLead.stage?.includes("Cierre");
      let parsedDate = 0;
      if (!isTerminalStage && newLead.nextActionDate) {
        const timePart = newLead.nextActionTime ? `${newLead.nextActionTime}:00` : "12:00:00";
        const time = new Date(`${newLead.nextActionDate}T${timePart}`).getTime();
        if (!isNaN(time)) {
          parsedDate = time;
        }
      }

      const initialHistory = [
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          type: "creación",
          description: "Lead creado",
        },
      ];

      if (parsedDate > 0 && newLead.googleCalendarSyncEnabled) {
        const syncResult = await syncEventToGoogleCalendar(
          newLead.name,
          newLead.notes,
          newLead.nextActionDate,
          newLead.phone,
          newLead.nextActionTime,
          newLead.calendarDurationMinutes,
          newLead.calendarNotificationMinutes,
        );
        if (syncResult) {
          initialHistory.push({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            type: "SISTEMA: Google Calendar",
            description: `✓ Sincronizado en Google Calendar (${newLead.nextActionDate} ${newLead.nextActionTime || ''} • notif. ${newLead.calendarNotificationMinutes || 30}m antes)`,
          });
        }
      }

      await addDoc(collection(db, "users", auth.currentUser.uid, "leads"), {
        userId: auth.currentUser.uid,
        type: activeTab,
        name: newLead.name,
        phone: newLead.phone || "",
        property: newLead.property || "",
        notes: newLead.notes || "",
        nextActionDate: parsedDate,
        nextActionTime: newLead.nextActionTime || "",
        calendarDurationMinutes: Number(newLead.calendarDurationMinutes) || 30,
        calendarNotificationMinutes: Number(newLead.calendarNotificationMinutes) || 30,
        propertyValue: Number(newLead.propertyValue) || 0,
        interest: newLead.interest || "Medio",
        stage:
          newLead.stage ||
          (activeTab === "captacion" ? CAPTURE_STAGES[0] : SALES_STAGES[0]),
        googleCalendarSyncEnabled: !!newLead.googleCalendarSyncEnabled,
        history: initialHistory,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setIsAddingLead(false);
      setNewLead({
        name: "",
        phone: "",
        property: "",
        stage: "Prospección",
        notes: "",
        nextActionDate: "",
        nextActionTime: "10:00",
        calendarDurationMinutes: 30,
        calendarNotificationMinutes: 30,
        propertyValue: "",
        interest: "Medio",
        googleCalendarSyncEnabled: false,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "leads");
    }
  };

  const handleSaveEdit = async () => {
    if (!auth.currentUser || !editingLead) return;
    try {
      const isTerminalStage =
        editingLead.stage === "Perdido" ||
        editingLead.stage?.includes("Cierre");
      let parsedDate = 0;
      if (!isTerminalStage && editingLead.nextActionDate) {
        const timePart = editingLead.nextActionTime ? `${editingLead.nextActionTime}:00` : "12:00:00";
        const time = new Date(
          `${editingLead.nextActionDate}T${timePart}`,
        ).getTime();
        if (!isNaN(time)) {
          parsedDate = time;
        }
      }
      const leadRef = doc(
        db,
        "users",
        auth.currentUser.uid,
        "leads",
        editingLead.id,
      );

      const originalLead = leads.find((l) => l.id === editingLead.id);
      let historyType = "edición";
      let historyDesc = "Datos del lead actualizados";

      if (originalLead) {
        let changes = [];
        if (originalLead.stage !== editingLead.stage) {
          historyType = "etapa";
          changes.push(`Etapa: ${editingLead.stage}`);
        }
        if (originalLead.interest !== editingLead.interest) {
          if (historyType === "edición") historyType = "interés";
          changes.push(`Interés: ${editingLead.interest}`);
        }
        const oldNotes = originalLead.notes || "";
        const newNotes = editingLead.notes || "";
        if (oldNotes !== newNotes && newNotes) {
          if (historyType === "edición") historyType = "notas";
          changes.push(`Notas: "${newNotes}"`);
        } else if (oldNotes !== newNotes && !newNotes) {
          if (historyType === "edición") historyType = "notas";
          changes.push(`Notas eliminadas`);
        }

        const oldPhone = originalLead.phone || "";
        const newPhone = editingLead.phone || "";
        if (oldPhone !== newPhone && newPhone) {
          changes.push(`Teléfono: ${newPhone}`);
        }

        const oldProp = originalLead.property || "";
        const newProp = editingLead.property || "";
        if (oldProp !== newProp && newProp) {
          changes.push(`Propiedad: ${newProp}`);
        }

        const oldVal = Number(originalLead.propertyValue) || 0;
        const newVal = Number(editingLead.propertyValue) || 0;
        if (oldVal !== newVal && newVal) {
          changes.push(`Valor: $${newVal}`);
        }

        if (originalLead.nextActionDate !== parsedDate) {
          if (parsedDate > 0) {
            changes.push(
              `Próxima acción: ${new Date(parsedDate).toLocaleDateString("es-ES")}${editingLead.nextActionTime ? ` ${editingLead.nextActionTime} hs` : ''}`,
            );
          } else if (originalLead.nextActionDate > 0) {
            changes.push(`Próxima acción eliminada`);
          }
        }

        if (changes.length > 0) {
          historyDesc = changes.join(" • ");
        }
      }

      const updatedHistory = [...(editingLead.history || [])];

      if (parsedDate > 0 && editingLead.googleCalendarSyncEnabled) {
        const syncResult = await syncEventToGoogleCalendar(
          editingLead.name,
          editingLead.notes,
          editingLead.nextActionDate,
          editingLead.phone,
          editingLead.nextActionTime,
          editingLead.calendarDurationMinutes,
          editingLead.calendarNotificationMinutes,
        );
        if (syncResult) {
          updatedHistory.push({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            type: "SISTEMA: Google Calendar",
            description: `✓ Sincronizado en Google Calendar (${editingLead.nextActionDate} ${editingLead.nextActionTime || ''} • notif. ${editingLead.calendarNotificationMinutes || 30}m antes)`,
          });
        }
      }

      const newHistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        type: historyType,
        description: historyDesc,
      };

      updatedHistory.push(newHistoryItem);

      await updateDoc(leadRef, {
        name: editingLead.name,
        phone: editingLead.phone || "",
        property: editingLead.property || "",
        notes: editingLead.notes || "",
        nextActionDate: parsedDate,
        nextActionTime: editingLead.nextActionTime || "",
        calendarDurationMinutes: Number(editingLead.calendarDurationMinutes) || 30,
        calendarNotificationMinutes: Number(editingLead.calendarNotificationMinutes) || 30,
        propertyValue: Number(editingLead.propertyValue) || 0,
        interest: editingLead.interest || "Medio",
        stage: editingLead.stage,
        googleCalendarSyncEnabled: !!editingLead.googleCalendarSyncEnabled,
        history: updatedHistory,
        updatedAt: Date.now(),
      });
      setEditingLead(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "leads");
    }
  };

  const handleAddHistory = async (
    lead: any,
    type: string,
    description: string,
  ) => {
    if (!auth.currentUser) return;
    try {
      const newHistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        type,
        description,
      };
      const updatedHistory = [...(lead.history || []), newHistoryItem];
      await updateDoc(
        doc(db, "users", auth.currentUser.uid, "leads", lead.id),
        {
          history: updatedHistory,
        },
      );
    } catch (e) {
      console.error("Error adding history", e);
    }
  };

  const handleUpdateStage = async (lead: any, stage: string) => {
    if (!auth.currentUser) return;
    try {
      let additionalUpdates: any = { stage };
      let actionDesc = `Etapa cambiada de ${lead.stage} a ${stage}`;

      // Automated funnel actions
      if (["Contacto", "Reunión", "Negociación"].includes(stage)) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowTime = tomorrow.getTime();
        if (!lead.nextActionDate || lead.nextActionDate < Date.now()) {
          additionalUpdates.nextActionDate = tomorrowTime;
          actionDesc += ". Auto-agendado seguimiento para mañana.";
        }
      }

      if (additionalUpdates.nextActionDate && lead.googleCalendarSyncEnabled) {
        const autoDateStr = new Date(additionalUpdates.nextActionDate)
          .toISOString()
          .split("T")[0];
        await syncEventToGoogleCalendar(
          lead.name,
          lead.notes || `Contacto / Seguimiento automatizado etapa: ${stage}`,
          autoDateStr,
          lead.phone,
          lead.nextActionTime || "10:00",
          lead.calendarDurationMinutes || 30,
          lead.calendarNotificationMinutes !== undefined ? lead.calendarNotificationMinutes : 30,
        );
      }

      const newHistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        type: "SISTEMA: Cambio de Etapa",
        description: actionDesc,
      };

      const updatedHistory = [...(lead.history || []), newHistoryItem];
      additionalUpdates.history = updatedHistory;
      additionalUpdates.updatedAt = Date.now();

      await updateDoc(
        doc(db, "users", auth.currentUser.uid, "leads", lead.id),
        additionalUpdates,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "leads");
    }
  };

  const handleDeleteLead = (leadId: string) => {
    setLeadToDelete(leadId);
  };

  const confirmDeleteLead = async () => {
    if (!auth.currentUser || !leadToDelete) return;
    try {
      await deleteDoc(
        doc(db, "users", auth.currentUser.uid, "leads", leadToDelete),
      );
      setLeadToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "leads");
    }
  };

  const draftMessage = async (lead: any) => {
    setAiMessageLead(lead);
    setIsGenerating(true);
    setGeneratedScript("");

    try {
      const message = await draftMessageWithAI(lead);
      setGeneratedScript(message || "Error al generar");
    } catch (err) {
      console.error(err);
      setGeneratedScript("Hubo un error al generar el mensaje.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = async () => {
    if (leads.length === 0) {
      setAiReport("No tienes leads suficientes para generar un reporte.");
      return;
    }

    setIsGeneratingReport(true);
    setAiReport(null);

    try {
      const report = await generateReportWithAI(leads, metricsHistory);
      setAiReport(report || "Error al generar el reporte.");
    } catch (err) {
      console.error(err);
      setAiReport("Hubo un error al generar el reporte. Intenta de nuevo.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleExportCSV = () => {
    const csvRows = [];
    const headers = [
      "Nombre",
      "Teléfono",
      "Propiedad",
      "Valor (USD)",
      "Etapa",
      "Interés",
      "Proxima Acción",
      "Notas",
    ];
    csvRows.push(headers.join(","));

    const tabLeads = leads.filter((l) =>
      activeTab === "captacion"
        ? l.type === "captacion"
        : l.type !== "captacion",
    );
    const filteredLeads = tabLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.property?.toLowerCase().includes(search.toLowerCase()),
    );

    filteredLeads.forEach((lead) => {
      const actionDate = lead.nextActionDate
        ? new Date(lead.nextActionDate).toLocaleDateString("es-ES")
        : "";
      const row = [
        `"${(lead.name || "").replace(/"/g, '""')}"`,
        `"${(lead.phone || "").replace(/"/g, '""')}"`,
        `"${(lead.property || "").replace(/"/g, '""')}"`,
        `"${lead.propertyValue || ""}"`,
        `"${(lead.stage || "").replace(/"/g, '""')}"`,
        `"${(lead.interest || "").replace(/"/g, '""')}"`,
        `"${actionDate}"`,
        `"${(lead.notes || "").replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(","));
    });

    const csvContent =
      "data:text/csv;charset=utf-8," + "\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Leads_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAIParse = async () => {
    if (!aiInputText.trim()) return;
    setIsAILoading(true);
    try {
      const parsed = await parseLeadWithAI(aiInputText);

      setNewLead((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        phone: parsed.phone || prev.phone,
        property: parsed.property || prev.property,
        propertyValue: parsed.propertyValue || prev.propertyValue,
        interest: ["Alto", "Medio", "Bajo"].includes(parsed.interest)
          ? parsed.interest
          : "Medio",
        notes: parsed.notes || prev.notes,
      }));
      setAiInputText("");
    } catch (e) {
      console.warn("Extracción completada con respaldo:", e);
    } finally {
      setIsAILoading(false);
    }
  };

  const currentStages =
    activeTab === "captacion" ? CAPTURE_STAGES : SALES_STAGES;
  const isCaptacion = activeTab === "captacion";

  const tabLeads = leads.filter((l) =>
    isCaptacion ? l.type === "captacion" : l.type !== "captacion",
  );

  const filteredLeads = tabLeads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.property?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalLeads = tabLeads.length;
  const closedLeads = tabLeads.filter(
    (l) => l.stage === "Cierre" || l.stage === "Cierre (Captada)",
  ).length;
  const newLeads = tabLeads.filter((l) => l.stage === "Prospección").length;
  const conversionRate =
    totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0;

  const pipelineValue = tabLeads
    .filter(
      (l) => !l.stage?.includes("Cierre") && !l.stage?.includes("Perdido"),
    )
    .reduce((acc, lead) => acc + (lead.propertyValue || 0), 0);

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const closedThisMonth = tabLeads.filter((l) => {
    if (!l.stage?.includes("Cierre")) return false;
    const d = new Date(l.updatedAt || l.createdAt || Date.now());
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const monthlyGoal = 1;
  const goalProgress = Math.min((closedThisMonth / monthlyGoal) * 100, 100);

  const getInterestColor = (interest: string) => {
    switch (interest) {
      case "Alto":
        return "bg-red-100 text-red-700 border-red-200";
      case "Medio":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "Bajo":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-[#E5E2D9] text-[#7B8371] border-[#F0EEE6]";
    }
  };

  const todayStr = new Date().toDateString();
  const priorityLeads = filteredLeads.filter((l) => {
    if (!l.nextActionDate) return false;
    if (
      l.stage === "Perdido" ||
      l.stage === "Cierre" ||
      l.stage === "Cierre (Captada)"
    )
      return false;
    const actionDate = new Date(l.nextActionDate);
    // If action date is today or in the past
    return (
      actionDate.getTime() <= new Date().getTime() ||
      actionDate.toDateString() === todayStr
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif tracking-tight mb-2 text-[#3E4639]">
            Desempeño Profesional
          </h2>
          <p className="text-[#7B8371] text-sm">
            Gestión de Relaciones (CRM) y Pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {calendarSyncStatus && (
            <span className="text-xs bg-[#4285F4]/10 text-[#4285F4] border border-[#4285F4]/20 px-3 py-1.5 rounded-xl font-bold animate-pulse">
              {calendarSyncStatus}
            </span>
          )}
          {!getCachedAccessToken() ? (
            <button
              type="button"
              onClick={handleConnectCalendar}
              className="text-xs font-bold bg-[#4285F4]/10 text-[#4285F4] hover:bg-[#4285F4]/20 border border-[#4285F4]/20 px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-[#4285F4]" /> Conectar Google
              Calendar
            </button>
          ) : (
            <div className="text-xs font-bold bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
              ✓ Google Calendar Conectado
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col sm:flex-row w-full md:w-fit bg-[#E5E2D9] rounded-2xl p-[6px] mb-8 gap-2">
        <button
          type="button"
          className={`flex-1 flex items-center justify-center whitespace-normal leading-tight min-h-[48px] rounded-xl font-bold text-sm md:text-base py-3 px-6 text-center transition-all ${activeTab === "comercial" ? "bg-white text-[#3E4639] shadow-sm" : "text-[#7B8371] hover:text-[#3E4639] hover:bg-[#F9F8F4]"}`}
          onClick={() => {
            setActiveTab("comercial");
            setNewLead({ ...newLead, stage: SALES_STAGES[0] });
          }}
        >
          Relaciones Comerciales (Ventas)
        </button>
        <button
          type="button"
          className={`flex-1 flex items-center justify-center whitespace-normal leading-tight min-h-[48px] rounded-xl font-bold text-sm md:text-base py-3 px-6 text-center transition-all ${activeTab === "captacion" ? "bg-white text-[#3E4639] shadow-sm" : "text-[#7B8371] hover:text-[#3E4639] hover:bg-[#F9F8F4]"}`}
          onClick={() => {
            setActiveTab("captacion");
            setNewLead({ ...newLead, stage: CAPTURE_STAGES[0] });
          }}
        >
          Relaciones Propietarios (Captaciones)
        </button>
      </div>

      <Tabs value={activeTab} className="w-full">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 shadow-sm flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Search className="w-8 h-8" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] mb-1">
              En Prospección
            </span>
            <span className="text-3xl font-serif text-[#3E4639]">
              {newLeads}
            </span>
          </div>
          <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 shadow-sm flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <BrainCircuit className="w-8 h-8" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] mb-1">
              Relaciones Creadas
            </span>
            <span className="text-3xl font-serif text-[#3E4639]">
              {totalLeads}
            </span>
          </div>

          <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 shadow-sm flex flex-col justify-center relative overflow-hidden md:col-span-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center">
                <Target className="w-3 h-3 mr-1 text-[#A3B18A]" /> Meta Mensual
                de {isCaptacion ? "Captaciones" : "Cierres"} ({closedThisMonth}/
                {monthlyGoal})
              </span>
              <span className="text-xs font-bold text-[#3E4639]">
                {closedThisMonth >= monthlyGoal
                  ? "¡Meta Cumplida!"
                  : "En progreso"}
              </span>
            </div>

            <div className="h-4 bg-[#F9F8F4] w-full rounded-full overflow-hidden border border-[#E5E2D9]">
              <div
                className={`h-full transition-all duration-1000 ease-out ${closedThisMonth >= monthlyGoal ? "bg-[#A3B18A]" : "bg-[#D4A373]"}`}
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-[#7B8371] mt-2 italic">
              Meta mínima: Ayudar a 1 familia al mes construyendo relaciones
              duraderas.
            </p>
          </div>
        </div>

        <TabsContent value={activeTab} className="outline-none">
          <div className="flex flex-col gap-6">
            <section className="bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">
              <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                    <BrainCircuit className="w-5 h-5 mr-2 opacity-80" />
                    Pipeline: {isCaptacion ? "Captaciones" : "Ventas"}
                  </h2>
                  <p className="text-xs text-[#7B8371]">
                    Gestiona prospectos, genera llamadas y avanza etapas hacia
                    tu meta.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end mt-4 md:mt-0">
                  <Button
                    onClick={handleExportCSV}
                    className="bg-white border border-[#E5E2D9] text-[#3E4639] hover:bg-[#F9F8F4] rounded-xl shadow-sm font-medium px-4 h-10 min-h-10 text-sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar
                  </Button>
                  <Button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className="bg-white border border-[#E5E2D9] text-[#3E4639] hover:bg-[#F9F8F4] rounded-xl shadow-sm font-medium px-4 h-10 min-h-10 text-sm"
                  >
                    {isGeneratingReport ? (
                      <Loader2 className="w-4 h-4 mr-2 text-[#A3B18A] animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2 text-[#A3B18A]" />
                    )}
                    {isGeneratingReport ? "Generando..." : "Reporte IA"}
                  </Button>
                  <Button
                    onClick={() => setIsAddingLead(!isAddingLead)}
                    className="bg-[#3E4639] hover:bg-[#2C3328] text-white rounded-xl shadow-lg shadow-[#3E4639]/20 font-medium px-4 h-10 min-h-10 text-sm"
                  >
                    {isAddingLead ? (
                      <X className="w-4 h-4 mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {isAddingLead ? "Cancelar" : "Nuevo Lead"}
                  </Button>
                </div>
              </div>

              {isAddingLead && (
                <div className="bg-[#F9F8F4] p-4 md:p-6 rounded-2xl border border-[#F0EEE6] mb-8 space-y-4">
                  <div className="mb-4 pt-2 border-b border-[#E5E2D9] pb-6">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] mb-2 flex items-center">
                      <Wand2 className="w-3.5 h-3.5 mr-1" />
                      Carga Inteligente con IA
                      {isAILoading && (
                        <Loader2 className="w-3 h-3 animate-spin text-[#A3B18A] ml-2" />
                      )}
                    </label>
                    <p className="text-xs text-[#7B8371] mb-3">
                      Pega un mensaje de WhatsApp para que la IA extraiga los
                      datos automáticamente.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Pega el mensaje o nota aquí..."
                        className="flex-1 bg-white text-sm"
                        value={aiInputText}
                        onChange={(e) => setAiInputText(e.target.value)}
                      />
                      <Button
                        disabled={isAILoading || !aiInputText.trim()}
                        onClick={handleAIParse}
                        className="bg-[#A3B18A] hover:bg-[#8CA070] text-white tooltip-trigger shrink-0"
                      >
                        Extraer Datos
                      </Button>
                    </div>
                  </div>

                  {leads.some((lead) => {
                    const samePhone =
                      newLead.phone &&
                      lead.phone &&
                      newLead.phone === lead.phone;
                    const sameNameProperty =
                      newLead.name &&
                      newLead.name.toLowerCase().trim() ===
                        lead.name.toLowerCase().trim() &&
                      (newLead.property || "").toLowerCase().trim() ===
                        (lead.property || "").toLowerCase().trim();
                    return samePhone || sameNameProperty;
                  }) && (
                    <div className="text-amber-600 bg-amber-50 p-2 text-xs rounded border border-amber-200">
                      ⚠️ Atención: Ya existe un lead con este nombre y
                      propiedad, o con el mismo teléfono.
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                        Nombre
                      </label>
                      <Input
                        value={newLead.name}
                        onChange={(e) =>
                          setNewLead({ ...newLead, name: e.target.value })
                        }
                        className="bg-white"
                        placeholder="Ej. Carlos Díaz"
                      />
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                        Teléfono
                      </label>
                      <Input
                        value={newLead.phone}
                        onChange={(e) =>
                          setNewLead({ ...newLead, phone: e.target.value })
                        }
                        className="bg-white"
                        placeholder="+54911..."
                      />
                    </div>
                    <div className="md:col-span-1 border border-transparent">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                        Propiedad
                      </label>
                      <Input
                        value={newLead.property}
                        onChange={(e) =>
                          setNewLead({ ...newLead, property: e.target.value })
                        }
                        className="bg-white"
                        placeholder="Ej. Casa Bosques"
                      />
                      {uniqueProperties.length > 0 && (
                        <div className="flex gap-1 overflow-x-auto mt-2 pb-1 scrollbar-hide">
                          {uniqueProperties.map((p: any) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() =>
                                setNewLead({ ...newLead, property: p })
                              }
                              className="text-[9px] px-2 py-0.5 bg-white border border-[#E5E2D9] hover:bg-[#F9F8F4] text-[#7B8371] hover:text-[#3E4639] transition-colors rounded-full whitespace-nowrap flex items-center"
                            >
                              <Tag className="w-2 h-2 mr-1 opacity-70" /> {p}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                        Valor (USD)
                      </label>
                      <Input
                        type="number"
                        value={newLead.propertyValue}
                        onChange={(e) =>
                          setNewLead({
                            ...newLead,
                            propertyValue: e.target.value,
                          })
                        }
                        className="bg-white"
                        placeholder="250000"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                        Nivel de Interés
                      </label>
                      <select
                        value={newLead.interest}
                        onChange={(e) =>
                          setNewLead({ ...newLead, interest: e.target.value })
                        }
                        className="w-full h-10 px-3 py-2 rounded-md bg-white border border-[#E5E2D9] text-sm focus:outline-none focus:ring-2 focus:ring-[#A3B18A]"
                      >
                        <option value="Alto">Alto 🔥</option>
                        <option value="Medio">Medio ☀️</option>
                        <option value="Bajo">Bajo ☁️</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                        Etapa
                      </label>
                      <select
                        value={newLead.stage}
                        onChange={(e) =>
                          setNewLead({ ...newLead, stage: e.target.value })
                        }
                        className="w-full h-10 px-3 py-2 rounded-md bg-white border border-[#E5E2D9] text-sm focus:outline-none focus:ring-2 focus:ring-[#A3B18A] focus:border-transparent"
                      >
                        {currentStages.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    {newLead.stage !== "Perdido" &&
                      !newLead.stage?.includes("Cierre") && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Próxima Acción (Fecha)
                          </label>
                          <Input
                            type="date"
                            value={newLead.nextActionDate}
                            onChange={(e) =>
                              setNewLead({
                                ...newLead,
                                nextActionDate: e.target.value,
                              })
                            }
                            className="bg-white"
                          />
                        </div>
                      )}
                  </div>

                  {/* Google Calendar & Schedule Configuration for New Lead */}
                  {newLead.stage !== "Perdido" &&
                    !newLead.stage?.includes("Cierre") &&
                    newLead.nextActionDate && (
                      <div className="p-4 rounded-2xl bg-[#F4F6F0] border border-[#D8DFD0] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-white border border-[#D8DFD0] flex items-center justify-center shadow-xs">
                              <Calendar className="w-4 h-4 text-[#4285F4]" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#3E4639] block">
                                Sincronizar y Notificar en Google Calendar
                              </span>
                              <span className="text-[10px] text-[#7B8371] block">
                                Crea el evento en tu calendario con horario y alertas
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {!getCachedAccessToken() ? (
                              <button
                                type="button"
                                onClick={handleConnectCalendar}
                                className="text-xs font-bold bg-[#4285F4] text-white hover:bg-[#3367D6] px-3.5 py-1.5 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                Conectar Google
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-green-700 font-bold bg-green-100/70 px-2 py-0.5 rounded-full border border-green-200">
                                  ✓ Conectado
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={newLead.googleCalendarSyncEnabled}
                                    onChange={(e) =>
                                      setNewLead({
                                        ...newLead,
                                        googleCalendarSyncEnabled:
                                          e.target.checked,
                                      })
                                    }
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#A3B18A]"></div>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>

                        {newLead.googleCalendarSyncEnabled && (
                          <div className="pt-3 border-t border-[#D8DFD0]/70 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/70 p-3 rounded-xl">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center gap-1 mb-1">
                                <Clock className="w-3 h-3 text-[#A3B18A]" />
                                Horario del Evento
                              </label>
                              <Input
                                type="time"
                                value={newLead.nextActionTime || "10:00"}
                                onChange={(e) =>
                                  setNewLead({
                                    ...newLead,
                                    nextActionTime: e.target.value,
                                  })
                                }
                                className="bg-white text-xs h-9"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center gap-1 mb-1">
                                <Calendar className="w-3 h-3 text-[#A3B18A]" />
                                Duración estimada
                              </label>
                              <select
                                value={newLead.calendarDurationMinutes || 30}
                                onChange={(e) =>
                                  setNewLead({
                                    ...newLead,
                                    calendarDurationMinutes: Number(
                                      e.target.value,
                                    ),
                                  })
                                }
                                className="w-full h-9 px-2 py-1 rounded-md bg-white border border-[#E5E2D9] text-xs text-[#3E4639] focus:outline-none focus:ring-1 focus:ring-[#A3B18A]"
                              >
                                {DURATION_OPTIONS.map((d) => (
                                  <option key={d.value} value={d.value}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center gap-1 mb-1">
                                <Bell className="w-3 h-3 text-[#D4A373]" />
                                Notificación / Alerta
                              </label>
                              <select
                                value={
                                  newLead.calendarNotificationMinutes !==
                                  undefined
                                    ? newLead.calendarNotificationMinutes
                                    : 30
                                }
                                onChange={(e) =>
                                  setNewLead({
                                    ...newLead,
                                    calendarNotificationMinutes: Number(
                                      e.target.value,
                                    ),
                                  })
                                }
                                className="w-full h-9 px-2 py-1 rounded-md bg-white border border-[#E5E2D9] text-xs text-[#3E4639] focus:outline-none focus:ring-1 focus:ring-[#A3B18A]"
                              >
                                {NOTIFICATION_OPTIONS.map((n) => (
                                  <option key={n.value} value={n.value}>
                                    {n.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-3 flex items-center gap-1.5 text-[11px] text-[#556B2F] font-medium bg-[#A3B18A]/15 px-2.5 py-1.5 rounded-lg">
                              <Bell className="w-3.5 h-3.5 text-[#556B2F] shrink-0" />
                              <span>
                                Google Calendar te enviará una notificación emergente y recordatorio{" "}
                                <strong>
                                  {NOTIFICATION_OPTIONS.find(
                                    (opt) =>
                                      opt.value ===
                                      (newLead.calendarNotificationMinutes ||
                                        30),
                                  )?.label.toLowerCase()}
                                </strong>{" "}
                                a las {newLead.nextActionTime || "10:00"} hs.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                      Notas / Siguiente paso
                    </label>
                    <Input
                      value={newLead.notes}
                      onChange={(e) =>
                        setNewLead({ ...newLead, notes: e.target.value })
                      }
                      className="bg-white"
                      placeholder="Ej. Interesado en financiación a 10 años. Llamar el viernes."
                    />
                  </div>
                  {leadError && (
                    <div className="text-red-500 text-sm font-medium p-2 bg-red-50 rounded border border-red-100">
                      {leadError}
                    </div>
                  )}
                  <Button
                    onClick={handleAddLead}
                    className="w-full bg-[#A3B18A] hover:bg-[#8CA070] text-white"
                  >
                    Guardar Lead
                  </Button>
                </div>
              )}

              <div className="mb-6">
                <Input
                  placeholder="Buscar por nombre o propiedad..."
                  className="max-w-md bg-[#F9F8F4] border-[#E5E2D9]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  icon={<Search className="w-4 h-4 text-[#7B8371]" />}
                />
              </div>

              {priorityLeads.length > 0 && (
                <div className="mb-6 bg-red-50/50 border border-red-100 rounded-xl p-4">
                  <h4 className="flex items-center text-sm font-bold text-red-800 mb-3">
                    <Target className="w-4 h-4 mr-2" />
                    Acciones Requeridas Hoy
                    <span className="ml-2 bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded-full">
                      {priorityLeads.length}
                    </span>
                  </h4>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {priorityLeads.map((lead) => (
                      <div
                        key={`prio-${lead.id}`}
                        className="min-w-[200px] bg-white border border-red-100 rounded-lg p-3 shadow-sm flex flex-col justify-between cursor-pointer"
                        onClick={() => {
                          let d = "";
                          let t = lead.nextActionTime || "10:00";
                          if (lead.nextActionDate) {
                            const dt = new Date(lead.nextActionDate);
                            d = dt.toISOString().split("T")[0];
                            if (!lead.nextActionTime) {
                              const h = String(dt.getHours()).padStart(2, '0');
                              const m = String(dt.getMinutes()).padStart(2, '0');
                              if (h !== "00" && h !== "12") {
                                t = `${h}:${m}`;
                              }
                            }
                          }
                          setEditingLead({
                            ...lead,
                            nextActionDate: d,
                            nextActionTime: t,
                            calendarDurationMinutes: lead.calendarDurationMinutes || 30,
                            calendarNotificationMinutes: lead.calendarNotificationMinutes !== undefined ? lead.calendarNotificationMinutes : 30,
                            property: lead.property || "",
                            propertyValue: lead.propertyValue || "",
                            notes: lead.notes || "",
                            interest: lead.interest || "Medio",
                            stage: lead.stage || "Prospección",
                            googleCalendarSyncEnabled: !!lead.googleCalendarSyncEnabled,
                          });
                        }}
                      >
                        <div>
                          <span className="font-bold text-[#3E4639] text-sm truncate block">
                            {lead.name}
                          </span>
                          <span className="text-xs text-[#7B8371] truncate block">
                            {lead.notes || "Hacer seguimiento"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            draftMessage(lead);
                          }}
                          className="h-6 px-2 mt-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-[10px] font-bold tracking-widest uppercase self-start border border-red-200"
                        >
                          <Sparkles className="w-3 h-3 mr-1" /> Resolver
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 overflow-x-auto pb-6 snap-x w-full items-start">
                {currentStages.map((stage) => {
                  const stageLeads = filteredLeads.filter(
                    (l) => l.stage === stage,
                  );
                  return (
                    <div
                      key={stage}
                      className="w-[300px] shrink-0 bg-[#F9F8F4] border border-[#E5E2D9] rounded-2xl p-4 flex flex-col snap-start max-h-[580px]"
                    >
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#E5E2D9] shrink-0">
                        <h3 className="font-serif text-lg text-[#3E4639] tracking-tight">
                          {stage}
                        </h3>
                        <span className="text-xs font-bold bg-[#E5E2D9] text-[#7B8371] px-2 py-0.5 rounded-full min-w-[24px] text-center">
                          {stageLeads.length}
                        </span>
                      </div>

                      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                        {stageLeads.length === 0 && (
                          <p className="text-xs text-[#7B8371] italic text-center py-8">
                            Sin leads
                          </p>
                        )}
                        {stageLeads.map((lead) => (
                          <div
                            key={lead.id}
                            onClick={() => {
                              let d = "";
                              let t = lead.nextActionTime || "10:00";
                              if (lead.nextActionDate) {
                                const dt = new Date(lead.nextActionDate);
                                d = dt.toISOString().split("T")[0];
                                if (!lead.nextActionTime) {
                                  const h = String(dt.getHours()).padStart(2, '0');
                                  const m = String(dt.getMinutes()).padStart(2, '0');
                                  if (h !== "00" && h !== "12") {
                                    t = `${h}:${m}`;
                                  }
                                }
                              }
                              setEditingLead({
                                ...lead,
                                nextActionDate: d,
                                nextActionTime: t,
                                calendarDurationMinutes: lead.calendarDurationMinutes || 30,
                                calendarNotificationMinutes: lead.calendarNotificationMinutes !== undefined ? lead.calendarNotificationMinutes : 30,
                                property: lead.property || "",
                                propertyValue: lead.propertyValue || "",
                                notes: lead.notes || "",
                                interest: lead.interest || "Medio",
                                stage: lead.stage || "Prospección",
                                googleCalendarSyncEnabled: !!lead.googleCalendarSyncEnabled,
                              });
                            }}
                            className="p-3 border border-[#F0EEE6] rounded-xl bg-white shadow-sm flex flex-col gap-2 hover:border-[#D4A373]/50 transition-colors cursor-pointer group h-[260px]"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <span
                                  className="font-serif text-base text-[#3E4639] font-medium leading-tight block truncate"
                                  title={lead.name}
                                >
                                  {lead.name}
                                </span>
                                <span
                                  className="text-[10px] uppercase font-bold text-[#A3B18A] tracking-wider mt-0.5 block truncate"
                                  title={lead.property}
                                >
                                  {lead.property || "Sin propiedad"}
                                </span>
                              </div>
                              <div className="flex z-10 transition-opacity shrink-0 gap-0.5 -mt-1 -mr-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    let d = "";
                                    let t = lead.nextActionTime || "10:00";
                                    if (lead.nextActionDate) {
                                      const dt = new Date(lead.nextActionDate);
                                      d = dt.toISOString().split("T")[0];
                                      if (!lead.nextActionTime) {
                                        const h = String(dt.getHours()).padStart(2, '0');
                                        const m = String(dt.getMinutes()).padStart(2, '0');
                                        if (h !== "00" && h !== "12") {
                                          t = `${h}:${m}`;
                                        }
                                      }
                                    }
                                    setEditingLead({
                                      ...lead,
                                      nextActionDate: d,
                                      nextActionTime: t,
                                      calendarDurationMinutes: lead.calendarDurationMinutes || 30,
                                      calendarNotificationMinutes: lead.calendarNotificationMinutes !== undefined ? lead.calendarNotificationMinutes : 30,
                                      property: lead.property || "",
                                      propertyValue: lead.propertyValue || "",
                                      notes: lead.notes || "",
                                      interest: lead.interest || "Medio",
                                      stage: lead.stage || "Prospección",
                                      googleCalendarSyncEnabled: !!lead.googleCalendarSyncEnabled,
                                    });
                                  }}
                                  className="w-7 h-7 text-[#7B8371] hover:text-[#A3B18A] hover:bg-[#F9F8F4] rounded-md"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLead(lead.id);
                                  }}
                                  className="w-7 h-7 text-[#7B8371] hover:text-red-500 hover:bg-red-50 rounded-md"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {lead.interest && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${getInterestColor(lead.interest)}`}
                                >
                                  {lead.interest}
                                </span>
                              )}
                              {lead.propertyValue > 0 && (
                                <span className="text-[10px] text-[#7B8371] font-medium border border-[#E5E2D9] px-1.5 py-0.5 rounded bg-[#F9F8F4]">
                                  ${lead.propertyValue.toLocaleString()}
                                </span>
                              )}
                              {lead.phone && (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={`https://wa.me/${formatWhatsAppPhone(lead.phone)}?text=Hola%20${encodeURIComponent(lead.name.split(" ")[0])},`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddHistory(
                                        lead,
                                        "whatsapp",
                                        "Botón directo WhatsApp usado",
                                      );
                                    }}
                                    className="text-[10px] text-[#25D366] hover:bg-[#25D366]/10 font-bold border border-[#25D366]/30 px-1.5 py-0.5 rounded flex items-center transition-colors"
                                    title="WhatsApp"
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </a>
                                  <a
                                    href={`tel:${formatWhatsAppPhone(lead.phone)}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddHistory(
                                        lead,
                                        "call",
                                        "Llamada rápida iniciada",
                                      );
                                    }}
                                    className="text-[10px] text-blue-500 hover:bg-blue-50 font-bold border border-blue-200 px-1.5 py-0.5 rounded flex items-center transition-colors"
                                    title="Llamar"
                                  >
                                    <Phone className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 overflow-hidden">
                              {lead.notes ? (
                                <p className="text-xs text-[#7B8371] leading-snug line-clamp-3">
                                  {lead.notes}
                                </p>
                              ) : (
                                <p className="text-xs text-[#7B8371] leading-snug opacity-40 italic">
                                  Sin notas
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-[#F0EEE6]/50">
                              {lead.nextActionDate > 0 &&
                                (() => {
                                  const actionDate = new Date(
                                    lead.nextActionDate,
                                  );
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const actionDateMidnight = new Date(
                                    actionDate,
                                  );
                                  actionDateMidnight.setHours(0, 0, 0, 0);
                                  const diffDays = Math.round(
                                    (actionDateMidnight.getTime() -
                                      today.getTime()) /
                                      (1000 * 60 * 60 * 24),
                                  );
                                  let colorClass =
                                    "text-[#A3B18A] bg-[#A3B18A]/10 border border-[#A3B18A]/20";
                                  let text =
                                    actionDate.toLocaleDateString("es-ES");
                                  if (diffDays < 0) {
                                    colorClass =
                                      "text-red-500 bg-red-50 border border-red-200";
                                    text = `Atrasado (${text})`;
                                  } else if (diffDays === 0) {
                                    colorClass =
                                      "text-amber-600 bg-amber-50 border border-amber-200";
                                    text = "Hoy";
                                  } else if (diffDays === 1) {
                                    colorClass =
                                      "text-blue-500 bg-blue-50 border border-blue-200";
                                    text = "Mañana";
                                  }
                                  return (
                                    <div
                                      className={`text-[9px] font-bold tracking-widest uppercase flex items-center self-start px-1.5 py-0.5 rounded ${colorClass}`}
                                    >
                                      <Calendar className="w-2.5 h-2.5 mr-1" />{" "}
                                      {text}
                                    </div>
                                  );
                                })()}
                              <div className="flex items-center gap-1.5 w-full">
                                <select
                                  value={lead.stage}
                                  onChange={(e) =>
                                    handleUpdateStage(lead, e.target.value)
                                  }
                                  className="flex-1 min-w-0 text-[10px] px-1 py-1.5 rounded-md bg-[#F9F8F4] border border-[#E5E2D9] text-[#7B8371] font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#A3B18A] overflow-hidden truncate"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {currentStages.map((s, idx) => (
                                    <option key={s} value={s}>
                                      {idx + 1}. {s}
                                    </option>
                                  ))}
                                </select>
                                {currentStages.indexOf(lead.stage) <
                                  currentStages.length - 1 && (
                                  <Button
                                    size="icon"
                                    disabled={
                                      currentStages.indexOf(lead.stage) >=
                                        currentStages.length - 1 ||
                                      currentStages.indexOf(lead.stage) === -1
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const idx = currentStages.indexOf(
                                        lead.stage,
                                      );
                                      if (
                                        idx !== -1 &&
                                        idx < currentStages.length - 1
                                      ) {
                                        handleUpdateStage(
                                          lead,
                                          currentStages[idx + 1],
                                        );
                                      }
                                    }}
                                    className="w-7 h-7 bg-white border border-[#E5E2D9] text-[#7B8371] hover:bg-[#A3B18A] hover:text-white hover:border-[#A3B18A] rounded-md shrink-0 focus:ring-0 focus:ring-offset-0"
                                    title="Avanzar etapa"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    draftMessage(lead);
                                  }}
                                  className="w-7 h-7 bg-[#A3B18A]/10 text-[#A3B18A] hover:bg-[#A3B18A] hover:text-white rounded-md shrink-0 ml-auto focus:ring-0 focus:ring-offset-0"
                                  title="Generar mensaje con IA"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI Generator Overlay */}
              {aiMessageLead && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAiMessageLead(null)}
                      className="absolute top-4 right-4"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <h3 className="font-serif text-xl text-[#3E4639] mb-1 flex items-center">
                      <Sparkles className="w-5 h-5 mr-2 text-[#D4A373]" />
                      Generador de Seguimiento (PNL)
                    </h3>
                    <p className="text-sm text-[#7B8371] mb-6">
                      Generando guión para <strong>{aiMessageLead.name}</strong>{" "}
                      ({aiMessageLead.vak}) en etapa de {aiMessageLead.stage}.
                    </p>

                    <div className="bg-[#F9F8F4] p-4 rounded-xl border border-[#E5E2D9] min-h-[120px] relative mt-4">
                      {isGenerating ? (
                        <div className="absolute inset-0 flex items-center justify-center flex-col text-[#A3B18A]">
                          <Loader2 className="w-6 h-6 animate-spin mb-2" />
                          <span className="text-xs font-bold uppercase tracking-widest">
                            Redactando...
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-[#3E4639] whitespace-pre-wrap">
                          {generatedScript}
                        </p>
                      )}
                    </div>
                    {!isGenerating && (
                      <div className="mt-6 flex justify-end">
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(generatedScript);
                            handleAddHistory(
                              aiMessageLead,
                              "mensaje",
                              "Mensaje copiado desde IA",
                            );
                            alert("Copiado al portapapeles");
                          }}
                          className="bg-[#3E4639] text-white"
                        >
                          Copiar Mensaje
                        </Button>
                        <Button
                          onClick={() => {
                            const text = encodeURIComponent(generatedScript);
                            let phone = aiMessageLead.phone || "";
                            const cleanPhone = formatWhatsAppPhone(phone);
                            const url = `https://wa.me/${cleanPhone}?text=${text}`;
                            window.open(url, "_blank");
                            handleAddHistory(
                              aiMessageLead,
                              "whatsapp",
                              "Redirigido a WhatsApp con mensaje IA",
                            );
                          }}
                          className="bg-[#25D366] hover:bg-[#128C7E] text-white ml-2 flex items-center"
                        >
                          WhatsApp
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Edit Lead Overlay */}
              {editingLead && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingLead(null)}
                      className="absolute top-4 right-4"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <h3 className="font-serif text-xl text-[#3E4639] mb-6 flex items-center">
                      <Edit2 className="w-5 h-5 mr-2 opacity-80" />
                      Editar Lead
                    </h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Nombre
                          </label>
                          <Input
                            value={editingLead.name}
                            onChange={(e) =>
                              setEditingLead({
                                ...editingLead,
                                name: e.target.value,
                              })
                            }
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Teléfono
                          </label>
                          <Input
                            value={editingLead.phone || ""}
                            onChange={(e) =>
                              setEditingLead({
                                ...editingLead,
                                phone: e.target.value,
                              })
                            }
                            className="bg-white"
                            placeholder="+54911..."
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Propiedad
                          </label>
                          <Input
                            value={editingLead.property}
                            onChange={(e) =>
                              setEditingLead({
                                ...editingLead,
                                property: e.target.value,
                              })
                            }
                            className="bg-white"
                          />
                          {uniqueProperties.length > 0 && (
                            <div className="flex gap-1 overflow-x-auto mt-2 pb-1 scrollbar-hide">
                              {uniqueProperties.map((p: any) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() =>
                                    setEditingLead({
                                      ...editingLead,
                                      property: p,
                                    })
                                  }
                                  className="text-[9px] px-2 py-0.5 bg-white border border-[#E5E2D9] hover:bg-[#F9F8F4] text-[#7B8371] hover:text-[#3E4639] transition-colors rounded-full whitespace-nowrap flex items-center"
                                >
                                  <Tag className="w-2 h-2 mr-1 opacity-70" />{" "}
                                  {p}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Valor (USD)
                          </label>
                          <Input
                            type="number"
                            value={editingLead.propertyValue}
                            onChange={(e) =>
                              setEditingLead({
                                ...editingLead,
                                propertyValue: e.target.value,
                              })
                            }
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Nivel de Interés
                          </label>
                          <select
                            value={editingLead.interest || "Medio"}
                            onChange={(e) =>
                              setEditingLead({
                                ...editingLead,
                                interest: e.target.value,
                              })
                            }
                            className="w-full h-10 px-3 py-2 rounded-md bg-white border border-[#E5E2D9] text-sm focus:outline-none focus:ring-2 focus:ring-[#A3B18A]"
                          >
                            <option value="Alto">Alto 🔥</option>
                            <option value="Medio">Medio ☀️</option>
                            <option value="Bajo">Bajo ☁️</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                            Etapa
                          </label>
                          <select
                            value={editingLead.stage}
                            onChange={(e) =>
                              setEditingLead({
                                ...editingLead,
                                stage: e.target.value,
                              })
                            }
                            className="w-full h-10 px-3 py-2 rounded-md bg-white border border-[#E5E2D9] text-sm focus:outline-none focus:ring-2 focus:ring-[#A3B18A]"
                          >
                            {currentStages.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        {editingLead.stage !== "Perdido" &&
                          !editingLead.stage?.includes("Cierre") && (
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                                Próxima Acción (Fecha)
                              </label>
                              <Input
                                type="date"
                                value={editingLead.nextActionDate}
                                onChange={(e) =>
                                  setEditingLead({
                                    ...editingLead,
                                    nextActionDate: e.target.value,
                                  })
                                }
                                className="bg-white"
                              />
                            </div>
                          )}
                      </div>

                      {/* Google Calendar & Schedule Configuration for Editing Lead */}
                      {editingLead.stage !== "Perdido" &&
                        !editingLead.stage?.includes("Cierre") &&
                        editingLead.nextActionDate && (
                          <div className="p-4 rounded-2xl bg-[#F4F6F0] border border-[#D8DFD0] space-y-3 mb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-white border border-[#D8DFD0] flex items-center justify-center shadow-xs">
                                  <Calendar className="w-4 h-4 text-[#4285F4]" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-[#3E4639] block">
                                    Sincronizar y Notificar en Google Calendar
                                  </span>
                                  <span className="text-[10px] text-[#7B8371] block">
                                    Guardar cambios actualizará el evento con horario y alertas
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!getCachedAccessToken() ? (
                                  <button
                                    type="button"
                                    onClick={handleConnectCalendar}
                                    className="text-xs font-bold bg-[#4285F4] text-white hover:bg-[#3367D6] px-3.5 py-1.5 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    Conectar Google
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-green-700 font-bold bg-green-100/70 px-2 py-0.5 rounded-full border border-green-200">
                                      ✓ Conectado
                                    </span>
                                    <label className="relative inline-flex items-center cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={
                                          editingLead.googleCalendarSyncEnabled ||
                                          false
                                        }
                                        onChange={(e) =>
                                          setEditingLead({
                                            ...editingLead,
                                            googleCalendarSyncEnabled:
                                              e.target.checked,
                                          })
                                        }
                                        className="sr-only peer"
                                      />
                                      <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#A3B18A]"></div>
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>

                            {editingLead.googleCalendarSyncEnabled && (
                              <div className="pt-3 border-t border-[#D8DFD0]/70 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/70 p-3 rounded-xl">
                                <div>
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center gap-1 mb-1">
                                    <Clock className="w-3 h-3 text-[#A3B18A]" />
                                    Horario del Evento
                                  </label>
                                  <Input
                                    type="time"
                                    value={editingLead.nextActionTime || "10:00"}
                                    onChange={(e) =>
                                      setEditingLead({
                                        ...editingLead,
                                        nextActionTime: e.target.value,
                                      })
                                    }
                                    className="bg-white text-xs h-9"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center gap-1 mb-1">
                                    <Calendar className="w-3 h-3 text-[#A3B18A]" />
                                    Duración estimada
                                  </label>
                                  <select
                                    value={editingLead.calendarDurationMinutes || 30}
                                    onChange={(e) =>
                                      setEditingLead({
                                        ...editingLead,
                                        calendarDurationMinutes: Number(
                                          e.target.value,
                                        ),
                                      })
                                    }
                                    className="w-full h-9 px-2 py-1 rounded-md bg-white border border-[#E5E2D9] text-xs text-[#3E4639] focus:outline-none focus:ring-1 focus:ring-[#A3B18A]"
                                  >
                                    {DURATION_OPTIONS.map((d) => (
                                      <option key={d.value} value={d.value}>
                                        {d.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] flex items-center gap-1 mb-1">
                                    <Bell className="w-3 h-3 text-[#D4A373]" />
                                    Notificación / Alerta
                                  </label>
                                  <select
                                    value={
                                      editingLead.calendarNotificationMinutes !==
                                      undefined
                                        ? editingLead.calendarNotificationMinutes
                                        : 30
                                    }
                                    onChange={(e) =>
                                      setEditingLead({
                                        ...editingLead,
                                        calendarNotificationMinutes: Number(
                                          e.target.value,
                                        ),
                                      })
                                    }
                                    className="w-full h-9 px-2 py-1 rounded-md bg-white border border-[#E5E2D9] text-xs text-[#3E4639] focus:outline-none focus:ring-1 focus:ring-[#A3B18A]"
                                  >
                                    {NOTIFICATION_OPTIONS.map((n) => (
                                      <option key={n.value} value={n.value}>
                                        {n.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="sm:col-span-3 flex items-center gap-1.5 text-[11px] text-[#556B2F] font-medium bg-[#A3B18A]/15 px-2.5 py-1.5 rounded-lg">
                                  <Bell className="w-3.5 h-3.5 text-[#556B2F] shrink-0" />
                                  <span>
                                    Google Calendar te enviará una notificación emergente y recordatorio{" "}
                                    <strong>
                                      {NOTIFICATION_OPTIONS.find(
                                        (opt) =>
                                          opt.value ===
                                          (editingLead.calendarNotificationMinutes ||
                                            30),
                                      )?.label.toLowerCase()}
                                    </strong>{" "}
                                    a las {editingLead.nextActionTime || "10:00"} hs.
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">
                          Notas / Siguiente paso
                        </label>
                        <Input
                          value={editingLead.notes}
                          onChange={(e) =>
                            setEditingLead({
                              ...editingLead,
                              notes: e.target.value,
                            })
                          }
                          className="bg-white"
                        />
                      </div>
                      <Button
                        onClick={handleSaveEdit}
                        className="w-full bg-[#A3B18A] hover:bg-[#8CA070] text-white mt-2 py-6 text-sm font-bold shadow-md rounded-xl"
                      >
                        Guardar Cambios
                      </Button>

                      {/* History Timeline preview */}
                      {editingLead.history &&
                        editingLead.history.length > 0 && (
                          <div className="mt-6 border-t border-[#F0EEE6] pt-4">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] mb-4">
                              Historial de Actividad
                            </h4>
                            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                              {editingLead.history
                                .slice()
                                .reverse()
                                .map((h: any) => (
                                  <div
                                    key={h.id}
                                    className="bg-[#F9F8F4] p-3 rounded-lg border border-[#E5E2D9] text-sm"
                                  >
                                    <div className="flex justify-between items-start mb-1">
                                      <span className="font-bold text-[#3E4639] capitalize">
                                        {h.type}
                                      </span>
                                      <span className="text-[10px] text-[#A3B18A] font-bold">
                                        {new Date(h.timestamp).toLocaleString(
                                          "es-ES",
                                          {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                          },
                                        )}
                                      </span>
                                    </div>
                                    <p className="text-[#7B8371] text-xs">
                                      {h.description}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Lead Confirmation Modal */}
              {leadToDelete && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-2xl relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLeadToDelete(null)}
                      className="absolute top-4 right-4 text-[#7B8371] hover:bg-gray-100"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <h3 className="font-serif text-xl text-[#3E4639] mb-4">
                      ¿Eliminar prospecto?
                    </h3>
                    <p className="text-sm text-[#7B8371] mb-6">
                      Esta acción no se puede deshacer.
                    </p>

                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => setLeadToDelete(null)}
                        variant="outline"
                        className="border-[#E5E2D9] text-[#7B8371] hover:bg-[#F9F8F4]"
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={confirmDeleteLead}
                        className="bg-red-500 hover:bg-red-600 text-white"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Report Modal */}
              {aiReport && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl relative max-h-[90vh] flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAiReport(null)}
                      className="absolute top-4 right-4 text-[#7B8371] hover:bg-gray-100"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <h3 className="font-serif text-2xl text-[#3E4639] mb-4 flex items-center">
                      <Sparkles className="w-6 h-6 mr-2 text-[#A3B18A]" />
                      Reporte Ejecutivo de Ventas
                    </h3>

                    <div className="flex-1 overflow-y-auto pr-2 bg-[#FDFBF7] p-4 rounded-2xl border border-[#E5E2D9] mb-6">
                      <pre className="text-sm text-[#3E4639] whitespace-pre-wrap font-sans leading-relaxed">
                        {aiReport}
                      </pre>
                    </div>

                    <div className="flex justify-end mt-auto">
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(aiReport);
                          alert("Reporte copiado al portapapeles");
                        }}
                        className="bg-[#3E4639] hover:bg-[#2C3328] text-white"
                      >
                        Copiar Reporte
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Plantillas Section */}
            <section className="bg-white rounded-3xl p-6 flex flex-col border border-[#E5E2D9] shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#A3B18A] mb-1">
                    PLANTILLAS
                  </h4>
                  <h3 className="text-lg font-serif text-[#3E4639] font-bold">
                    Mensajes para destrabar
                  </h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-[#E5E2D9] text-[#3E4639] bg-[#F9F8F4] hover:bg-[#E5E2D9] shadow-none"
                >
                  Sugerir mensaje
                </Button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    className={`py-2 px-2 text-[11px] font-bold rounded-lg transition-colors
                          ${selectedTemplate?.id === t.id ? "bg-[#3E4639] text-white" : "bg-[#F9F8F4] text-[#7B8371] hover:bg-[#E5E2D9]"}
                       `}
                    onClick={() => setSelectedTemplate(t)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 bg-white border border-[#E5E2D9] rounded-xl flex flex-col overflow-hidden mb-4 min-h-[200px] focus-within:ring-2 focus-within:ring-[#A3B18A] focus-within:border-transparent">
                <div className="p-4 flex-1">
                  <p
                    className="text-sm text-[#3E4639] leading-relaxed outline-none"
                    contentEditable
                    suppressContentEditableWarning
                  >
                    {selectedTemplate?.content || "Selecciona una plantilla..."}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => {
                  if (selectedTemplate) {
                    navigator.clipboard.writeText(selectedTemplate.content);
                    alert("Copiado al portapapeles");
                  }
                }}
                className="w-full bg-[#3E4639] hover:bg-[#2C3328] text-white rounded-xl font-bold py-6 shadow-lg shadow-[#3E4639]/20"
              >
                Copiar mensaje
              </Button>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
