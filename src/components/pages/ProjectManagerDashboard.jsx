import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Briefcase,
  AlertCircle,
  CheckCircle,
  Plus,
  MessageSquare,
  LogOut,
  Home,
  Menu,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  BarChart3,
  TrendingUp,
  Zap,
  User,
  Loader2,
  RefreshCw,
  FileText,
  X,
  Clock,
  XCircle
} from 'lucide-react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc,onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import ProjectTickets from './ProjectManagerTickets';
import TeamManagement from './TeamManagement';
import Ticketing from './Ticketing';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import TicketDetails from './TicketDetails';

// SLA rules in minutes
export const SLA_RULES = {
  critical: { response: 10, resolution: 60 },
  high: { response: 60, resolution: 120 },
  medium: { response: 120, resolution: 360 },
  low: { response: 360, resolution: 1440 }
};

// Animated count-up hook (same as ClientDashboard)
function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const startTime = performance.now();
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }
    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    }
    requestAnimationFrame(animate);
  }, [target, duration]);
  return count;
}

// Utility to compute KPI metrics from ticket data (reuse from TeamManagement)
export function computeKPIsForTickets(tickets) {
  let totalResponse = 0, totalResolution = 0, count = 0, breachedCount = 0;
  let openCount = 0, closedCount = 0;
  const details = tickets.map(ticket => {
    // Find created time
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    // Defensive assignedTo access
    const assignedTo = ticket.assignedTo;
    let assignedToEmail = undefined;
    if (assignedTo) {
      if (typeof assignedTo.get === 'function') {
        assignedToEmail = assignedTo.get('email');
      } else {
        assignedToEmail = assignedTo.email;
      }
    }
    console.log('Ticket', ticket.ticketNumber, 'assignedTo:', assignedTo);
    // Find assignment time (first comment with 'Assigned to' or 'Ticket assigned to' and authorRole 'user' or 'system')
    let assigned = null;
    let resolved = null;
    if (ticket.comments && Array.isArray(ticket.comments)) {
      for (const c of ticket.comments) {
        if (
          !assigned &&
          c.message &&
          (/assigned to/i.test(c.message)) &&
          c.authorRole && (c.authorRole === 'user' || c.authorRole === 'system')
        ) {
          assigned = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
        if (
          !resolved &&
          c.message &&
          (/resolution updated/i.test(c.message)) &&
          c.authorRole && c.authorRole === 'resolver'
        ) {
          resolved = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
      }
    }
    // Fallback for assignment: use assignedTo.assignedAt or lastUpdated if not Open
    if (!assigned) {
      if (assignedTo && (assignedTo.assignedAt || (typeof assignedTo.get === 'function' && assignedTo.get('assignedAt')))) {
        const assignedAt = typeof assignedTo.get === 'function' ? assignedTo.get('assignedAt') : assignedTo.assignedAt;
        assigned = assignedAt?.toDate ? assignedAt.toDate() : (assignedAt ? new Date(assignedAt) : null);
      } else if (ticket.lastUpdated && ticket.status !== 'Open') {
        assigned = ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate() : new Date(ticket.lastUpdated);
      }
    }
    // Fallback: if ticket.status is Resolved and lastUpdated exists
    if (!resolved && ticket.status === 'Resolved' && ticket.lastUpdated) {
      resolved = ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate() : new Date(ticket.lastUpdated);
    }
    // Only count if assigned
    if (assignedTo && assignedToEmail) {
      let responseTime = assigned && created ? (assigned - created) : null;
      let resolutionTime = resolved && assigned ? (resolved - assigned) : null;
      // Debug output
      if (!created) {
        console.log('Ticket', ticket.ticketNumber, 'skipped: no created date');
      } else if (!assigned) {
        console.log('Ticket', ticket.ticketNumber, 'skipped: no assigned time');
      } else {
        console.log('Ticket', ticket.ticketNumber, 'included:', { responseTime, resolutionTime });
      }
      count++;
      if (responseTime) totalResponse += responseTime;
      if (resolutionTime) totalResolution += resolutionTime;
      // SLA breach logic
      let breached = false;
      let priority = (ticket.priority || '').toLowerCase();
      let sla = SLA_RULES[priority];
      if (sla) {
        if ((responseTime && responseTime > sla.response * 60 * 1000) ||
            (resolutionTime && resolutionTime > sla.resolution * 60 * 1000)) {
          breached = true;
          breachedCount++;
        }
      }
      if (ticket.status === 'Open') openCount++;
      if (ticket.status === 'Closed') closedCount++;
      return {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        assignee: assignedToEmail,
        responseTime,
        resolutionTime,
        status: ticket.status,
        created,
        assigned,
        resolved,
        breached,
        priority: ticket.priority
      };
    } else {
      console.log('Ticket', ticket.ticketNumber, 'skipped: no assignedTo.email');
    }
    return null;
  }).filter(Boolean);
  return {
    count,
    avgResponse: count ? totalResponse / count : 0,
    avgResolution: count ? totalResolution / count : 0,
    breachedCount,
    openCount,
    closedCount,
    details
  };
}

// Utility to convert KPI data to CSV and trigger download
async function downloadKpiCsv(kpiData, projectName = '') {
  if (!kpiData || !kpiData.details) return;
  // Chart data summary rows
  const chartHeader = ['Ticket #', 'Response Time (min)', 'Resolution Time (min)'];
  const chartRows = kpiData.details.map(row => [
    row.ticketNumber,
    row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
    row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : ''
  ]);
  // Table data
  const header = ['Ticket #','Subject','Assignee','Response Time (min)','Resolution Time (min)','Status'];
  const rows = kpiData.details.map(row => [
    row.ticketNumber,
    row.subject,
    row.assignee,
    row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
    row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
    row.status
  ]);
  // Compose CSV
  const csvContent = [
    ['KPI Bar Chart Data:'],
    chartHeader,
    ...chartRows,
    [],
    ['KPI Table Data:'],
    header,
    ...rows
  ].map(r => r.map(x => '"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');

  // Save KPI report to Firestore
  try {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    const reportDoc = {
      createdAt: serverTimestamp(),
      createdBy: user ? { uid: user.uid, email: user.email } : null,
      project: projectName || '',
      summary: {
        totalTickets: kpiData.count,
        avgResponse: kpiData.avgResponse,
        avgResolution: kpiData.avgResolution
      },
      chartData: chartRows,
      tableData: rows
    };
    await addDoc(collection(db, 'kpi_reports'), reportDoc);
  } catch (e) {
    // Optionally show error to user
    console.error('Failed to save KPI report to Firestore:', e);
  }

  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KPI_Report_Project.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to convert SVG chart to PNG data URL
async function getChartPngDataUrl(chartId) {
  const chartElem = document.getElementById(chartId);
  if (!chartElem) return null;
  const svg = chartElem.querySelector('svg');
  if (!svg) return null;
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new window.Image();
  img.src = 'data:image/svg+xml;base64,' + window.btoa(svgData);
  await new Promise(res => { img.onload = res; });
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function exportKpiToExcelWithChartImage(kpiData, chartIds, projectName = '') {
  if (!kpiData || !kpiData.details) return;

  // 1. Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('KPI Report');

  // 2. Add table data FIRST
  worksheet.addRow(['Ticket #','Subject','Assignee','Response Time (min)', 'Resolution Time (min)', 'Status']);
  kpiData.details.forEach(row => {
    worksheet.addRow([
      row.ticketNumber,
      row.subject,
      row.assignee,
      row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
      row.status
    ]);
  });

  // 3. Add chart images BELOW the table
  let currentRow = worksheet.lastRow.number + 2; // Leave a blank row after table
  if (chartIds) {
    const ids = Array.isArray(chartIds) ? chartIds : [chartIds];
    for (const chartId of ids) {
      const imgDataUrl = await getChartPngDataUrl(chartId);
      if (imgDataUrl) {
        const imageId = workbook.addImage({
          base64: imgDataUrl,
          extension: 'png',
        });
        worksheet.addImage(imageId, {
          tl: { col: 0, row: currentRow },
          ext: { width: 500, height: 300 }
        });
        currentRow += 20; // Space between images (approximate)
      }
    }
  }

  // 4. Download the Excel file
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `KPI_Report_${projectName || 'Project'}.xlsx`);

  // 5. Save KPI report to Firestore (unchanged)
  try {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    const chartData = kpiData.details.map(row => ({
      ticketNumber: row.ticketNumber,
      responseTime: row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      resolutionTime: row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : ''
    }));
    const tableData = kpiData.details.map(row => ({
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      assignee: row.assignee,
      responseTime: row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      resolutionTime: row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
      status: row.status
    }));
    const reportDoc = {
      createdAt: serverTimestamp(),
      createdBy: user ? { uid: user.uid, email: user.email } : null,
      project: projectName || '',
      summary: {
        totalTickets: kpiData.count,
        avgResponse: kpiData.avgResponse,
        avgResolution: kpiData.avgResolution
      },
      chartData,
      tableData
    };
    await addDoc(collection(db, 'kpi_reports'), reportDoc);
  } catch (e) {
    console.error('Failed to save KPI report to Firestore:', e);
  }
}

function getField(ticket, ...keys) {
  for (const key of keys) {
    if (ticket[key]) return ticket[key];
  }
  return '';
}

function downloadTicketsAsExcel(tickets) {
  if (!tickets || tickets.length === 0) return;
  // Define the desired columns and their mapping
  const columns = [
    { header: 'Ticket ID', keys: ['ticketNumber', 'id'] },
    { header: 'Subject', keys: ['subject'] },
    { header: 'Module', keys: ['module', 'Module'] },
    { header: 'Type of Issue', keys: ['typeOfIssue', 'type_of_issue', 'type', 'Type of Issue'] },
    { header: 'Category', keys: ['category', 'Category'] },
    { header: 'Sub-Category', keys: ['subCategory', 'sub_category', 'sub-category', 'Sub-Category'] },
    { header: 'Status', keys: ['status', 'Status'] },
    { header: 'Priority', keys: ['priority', 'Priority'] },
    { header: 'Assigned To', keys: ['assignedTo', 'assigned_to', 'Assigned To'] },
    { header: 'Created By', keys: ['customer', 'createdBy', 'Created By', 'email'] },
    { header: 'Reported By', keys: ['reportedBy', 'Reported By'] },
  ];
  // Build rows
  const rows = tickets.map(ticket =>
    columns.map(col => {
      if (col.header === 'Assigned To') {
        const at = ticket.assignedTo;
        if (typeof at === 'object' && at) return at.name || at.email || '';
        return at || '';
      }
      if (col.header === 'Created By') {
        return getField(ticket, ...col.keys);
      }
      return getField(ticket, ...col.keys);
    })
  );
  // Add header
  rows.unshift(columns.map(col => col.header));
  // Create worksheet and workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
  XLSX.writeFile(wb, 'tickets_export.xlsx');
}

// Helper to get chart image as base64

async function exportKpiExcelWithCharts(kpiData, chartIds, projectName = '') {
  if (!kpiData || !kpiData.details) return;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('KPI Report');
  // Add table data first
  worksheet.addRow(['Ticket #','Subject','Assignee','Response Time (min)', 'Resolution Time (min)', 'Status']);
  kpiData.details.forEach(row => {
    worksheet.addRow([
      row.ticketNumber,
      row.subject,
      row.assignee,
      row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
      row.status
    ]);
  });
  // Add chart images below the table
  let currentRow = worksheet.lastRow.number + 2;
  if (chartIds) {
    const ids = Array.isArray(chartIds) ? chartIds : [chartIds];
    for (const chartId of ids) {
      const imgDataUrl = await getChartPngDataUrl(chartId);
      if (imgDataUrl) {
        const imageId = workbook.addImage({ base64: imgDataUrl, extension: 'png' });
        worksheet.addImage(imageId, { tl: { col: 0, row: currentRow }, ext: { width: 500, height: 300 } });
        currentRow += 20;
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `KPI_Report_${projectName || 'Project'}.xlsx`);
}

const ProjectManagerDashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [managerName, setManagerName] = useState('');
  const [stats, setStats] = useState({
   
    activeTickets: 0,
    teamMembers: 0,
    completedTickets: 0
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [searchParams] = useSearchParams();
  const auth = getAuth();
  const db = getFirestore();
  const [roleChangeToast, setRoleChangeToast] = useState({ show: false, message: '' });
  const [showMobilePopup, setShowMobilePopup] = useState(false);
  const [showSwitchProjectModal, setShowSwitchProjectModal] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [kpiFromDate, setKpiFromDate] = useState('');
  const [kpiToDate, setKpiToDate] = useState('');
  const [kpiPeriod, setKpiPeriod] = useState('custom');
  // Add applied filter state
  const [appliedKpiFromDate, setAppliedKpiFromDate] = useState('');
  const [appliedKpiToDate, setAppliedKpiToDate] = useState('');
  const [appliedKpiPeriod, setAppliedKpiPeriod] = useState('custom');
  // Add state for year filter
  const [statsYearFilter, setStatsYearFilter] = useState('current');

  // Add state to track if a ticket is being viewed in detail
  const [viewingTicket, setViewingTicket] = useState(false);

  // Add state for filter UI
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [period, setPeriod] = useState('custom');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState('custom');

  // Add state for selected Trends month
  const [trendsSelectedMonth, setTrendsSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  });

  // --- KPI Filter State ---
  const [kpiSelectedYear, setKpiSelectedYear] = useState(() => {
    const now = new Date();
    return now.getFullYear();
  });
  const [kpiSelectedMonth, setKpiSelectedMonth] = useState(''); // '' means not set
  // --- KPI Filter Handlers ---
  const handleKpiPeriodChange = (val) => {
    setKpiPeriod(val);
    setKpiSelectedMonth('');
    setKpiSelectedYear(new Date().getFullYear());
  };
  const handleKpiMonthChange = (val) => {
    setKpiSelectedMonth(val);
    setKpiPeriod('');
    setKpiSelectedYear(Number(val.split('-')[0]));
  };
  const handleKpiYearChange = (val) => {
    setKpiSelectedYear(Number(val));
    setKpiSelectedMonth('');
    setKpiPeriod('');
  };

  // Filter bar handlers
  const handleFilterApply = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setAppliedPeriod(period);
  };
  const handleFilterReset = () => {
    setFromDate('');
    setToDate('');
    setPeriod('custom');
    setAppliedFromDate('');
    setAppliedToDate('');
    setAppliedPeriod('custom');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      if (!firebaseUser) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [auth, navigate]);
 // Handle URL parameters for tab navigation
 useEffect(() => {
  const tabParam = searchParams.get('tab');
  if (tabParam && ['dashboard', 'tickets', 'create'].includes(tabParam)) {
    setActiveTab(tabParam);
  }
}, [searchParams]);
  useEffect(() => {
    if (!authChecked || !user) return;
    setLoading(true);
    let unsubscribe;
    // Real-time listener for projects
    const projectsQuery = query(collection(db, 'projects'));
    unsubscribe = onSnapshot(projectsQuery, (projectsSnapshot) => {
        const projectsData = projectsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(project =>
            (project.members || []).some(
              m => m.email === user.email && m.role === 'project_manager'
            )
          );
        setProjects(projectsData);
        // Set default selected project
        if (projectsData.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projectsData[0].id);
        }
        setLoading(false);
    }, (error) => {
      console.error('Error fetching projects:', error);
        setLoading(false);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [authChecked, user, db]);

  // Add a real-time listener for role changes
  useEffect(() => {
    let unsubscribe;
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      unsubscribe = onSnapshot(userDocRef, (userDoc) => {
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          if (role === 'employee') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/employeedashboard'), 2000);
          } else if (role === 'admin') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/admin'), 2000);
          } else if (role === 'client') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/clientdashboard'), 2000);
          } else if (role !== 'project_manager') {
            setRoleChangeToast({ show: true, message: 'Your access has been removed. Signing out...' });
            setTimeout(() => { auth.signOut(); navigate('/login'); }, 2000);
          }
        } else {
          setRoleChangeToast({ show: true, message: 'Your access has been removed. Signing out...' });
          setTimeout(() => { auth.signOut(); navigate('/login'); }, 2000);
        }
      });
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [auth, navigate]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare, active: activeTab === 'tickets' },
    { id: 'team', label: 'Team', icon: Users, active: activeTab === 'team' },
    { id: 'kpi', label: 'KPI Reports', icon: BarChart3, active: activeTab === 'kpi' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' }
  ];

  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={item.onClick ? item.onClick : () => {
          setActiveTab(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
          item.active
            ? 'bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white shadow-lg'
            : 'text-gray-600 hover:bg-orange-100 hover:text-orange-700'
        }`}
        title={sidebarCollapsed ? item.label : ''}
      >
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <IconComponent className={`w-5 h-5 ${item.active ? 'text-white' : 'text-gray-600'}`} />
        </div>
        {!sidebarCollapsed && <span>{item.label}</span>}
      </button>
    );
  };

  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        setShowMobilePopup(true);
      } else {
        setShowMobilePopup(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSwitchProject = (projectId) => {
    setSelectedProjectId(projectId);
    setShowSwitchProjectModal(false);
  };

  // Filter tickets for current user (assigned to or raised by)
  const currentUserEmail = user?.email;
  let myTickets = tickets.filter(t =>
    (t.assignedTo && t.assignedTo.email === currentUserEmail) ||
    t.email === currentUserEmail
  );
  // Only show unresolved tickets
  myTickets = myTickets.filter(t => t.status !== 'Resolved');

  // Filter myTickets based on appliedFromDate, appliedToDate, appliedPeriod
  let filteredMyTickets = myTickets;
  if (appliedPeriod === 'week') {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfWeek && created <= now;
    });
  } else if (appliedPeriod === 'month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfMonth && created <= now;
    });
  } else if (appliedPeriod === 'last2days') {
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= twoDaysAgo && created <= now;
    });
  } else if (appliedFromDate && appliedToDate) {
    const from = new Date(appliedFromDate);
    const to = new Date(appliedToDate);
    to.setHours(23,59,59,999);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= from && created <= to;
    });
  }
  // Only show unresolved tickets (case-insensitive, trim whitespace)
  filteredMyTickets = filteredMyTickets.filter(t => String(t.status).trim().toLowerCase() !== 'resolved');

  // Add this after the useEffect that fetches projects
  useEffect(() => {
    if (!authChecked || !user || !selectedProjectId) return;
    setLoading(true);
    let unsubscribe;
    const ticketsCollectionRef = collection(db, 'tickets');
    // Use project name for ticket queries
    const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || '';
    if (!selectedProjectName) {
      setTickets([]);
      setLoading(false);
      return;
    }
    const q1 = query(ticketsCollectionRef, where('project', '==', selectedProjectName));
    const q2 = query(ticketsCollectionRef, where('project', 'array-contains', selectedProjectName));
    let ticketsMap = {};
    let unsub1 = onSnapshot(q1, (snapshot) => {
      snapshot.docs.forEach(doc => {
        ticketsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTickets(Object.values(ticketsMap));
      setLoading(false);
    }, (err) => {
      setLoading(false);
    });
    let unsub2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        ticketsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTickets(Object.values(ticketsMap));
      setLoading(false);
    }, (err) => {
      setLoading(false);
    });
    unsubscribe = () => { unsub1(); unsub2(); };
    return unsubscribe;
  }, [authChecked, user, db, selectedProjectId, projects]);

  const handleKpiFilterApply = () => {
    setAppliedKpiFromDate(kpiFromDate);
    setAppliedKpiToDate(kpiToDate);
    setAppliedKpiPeriod(kpiPeriod);
  };

  const handleKpiFilterReset = () => {
    setKpiFromDate('');
    setKpiToDate('');
    setKpiPeriod('custom');
    setAppliedKpiFromDate('');
    setAppliedKpiToDate('');
    setAppliedKpiPeriod('custom');
  };

  // Helper to get week number and year
  function getWeekYear(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return { week: weekNo, year: d.getUTCFullYear() };
  }

  // Add custom vertical label renderer
  const VerticalBarLabel = ({ x, y, width, height, value, name }) => {
    if (height < 20) return null;
    return (
      <g>
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.max(10, Math.min(width, height) / 3)}
          fill="#fff"
          transform={`rotate(-90, ${x + width / 2}, ${y + height / 2})`}
          style={{ pointerEvents: 'none', fontWeight: 600 }}
        >
          {name}
        </text>
      </g>
    );
  };

  // Helper to get year from ticket
  function getTicketYear(ticket) {
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    return created ? created.getFullYear() : null;
  }

  // Compute year for filtering
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;
  let yearToFilter = currentYear;
  if (statsYearFilter === 'last') yearToFilter = lastYear;

  // Filter tickets by year
  const ticketsForStats = tickets.filter(t => getTicketYear(t) === yearToFilter);
  const unclosedTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() !== 'closed').length;
  const closedTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'closed').length;
  const openTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'open').length;
  const inProgressTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length;
  const resolvedTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length;
  const criticalCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'critical').length;
  const highCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'high').length;
  const mediumCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'medium').length;
  const lowCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'low').length;

  // Filter tickets for table by year and applied filters
  let filteredTableTickets = ticketsForStats;
  if (appliedPeriod === 'week') {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    filteredTableTickets = filteredTableTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfWeek && created <= now;
    });
  } else if (appliedPeriod === 'month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filteredTableTickets = filteredTableTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfMonth && created <= now;
    });
  } else if (appliedPeriod === 'last2days') {
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    filteredTableTickets = filteredTableTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= twoDaysAgo && created <= now;
    });
  } else if (appliedFromDate && appliedToDate) {
    const from = new Date(appliedFromDate);
    const to = new Date(appliedToDate);
    to.setHours(23,59,59,999);
    filteredTableTickets = filteredTableTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= from && created <= to;
    });
  }

  // Trends chart data grouping (calendar-based week-of-month, like ClientHeadDashboard)
  const [trendsYear, trendsMonth] = kpiSelectedMonth.split('-').map(Number);
  const trendsMonthTickets = tickets.filter(t => {
    const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
    return created && created.getFullYear() === trendsYear && created.getMonth() + 1 === trendsMonth;
  });
  const firstDay = new Date(trendsYear, trendsMonth - 1, 1);
  const lastDay = new Date(trendsYear, trendsMonth, 0);
  const weeksInMonth = getWeekOfMonth(lastDay);
  const weekLabels = Array.from({ length: weeksInMonth }, (_, i) => `Week ${i + 1}`);
  let weekMap = {};
  weekLabels.forEach(label => { weekMap[label] = []; });
  trendsMonthTickets.forEach(ticket => {
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    if (!created) return;
    const week = `Week ${getWeekOfMonth(created)}`;
    if (!weekMap[week]) weekMap[week] = [];
    weekMap[week].push(ticket);
  });
  const trendsChartData = weekLabels.map(label => {
    const groupTickets = weekMap[label];
    if (!groupTickets || groupTickets.length === 0) {
      return { period: label, created: 0, closed: 0, resolved: 0, inProgress: 0, unclosed: 0 };
    }
    const closedCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() === 'closed').length;
    const resolvedCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length;
    const inProgressCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length;
    const unclosedCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() !== 'closed').length;
    const createdCount = groupTickets.length;
    return {
      period: label,
      created: createdCount, // total tickets raised in this period
      inProgress: inProgressCount,
      resolved: resolvedCount,
      closed: closedCount,
      unclosed: unclosedCount // tickets not closed
    };
  });

  // --- KPI Filter Logic ---
  const getKpiFilteredTickets = () => {
    if (kpiPeriod) {
      // Period filter takes precedence
      const now = new Date();
      let monthsToShow = 3;
      if (kpiPeriod === 'last6months') monthsToShow = 6;
      if (kpiPeriod === 'lastyear') monthsToShow = 12;
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      let monthIndices = [];
      for (let i = monthsToShow - 1; i >= 0; i--) {
        let month = currentMonth - i;
        let year = currentYear;
        if (month < 0) {
          month += 12;
          year--;
        }
        monthIndices.push({ year, month });
      }
      return tickets.filter(t => {
        const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
        return created && monthIndices.some(mi => created.getFullYear() === mi.year && created.getMonth() === mi.month);
      });
    } else if (kpiSelectedMonth) {
      // Filter by selected month
      const [selYear, selMonth] = kpiSelectedMonth.split('-').map(Number);
      return tickets.filter(t => {
        const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
        return created && created.getFullYear() === selYear && created.getMonth() + 1 === selMonth;
      });
    } else if (kpiSelectedYear) {
      // Filter by selected year
      return tickets.filter(t => {
        const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
        return created && created.getFullYear() === kpiSelectedYear;
      });
    }
    return tickets;
  };
  const kpiFilteredTickets = getKpiFilteredTickets();

  // --- KPI Bar Chart Data Logic ---
  const getKpiChartData = () => {
    if (kpiSelectedMonth) {
      // Group by week for the selected month
      const [selYear, selMonth] = kpiSelectedMonth.split('-').map(Number);
      // Find how many weeks in this month
      const firstDay = new Date(selYear, selMonth - 1, 1);
      const lastDay = new Date(selYear, selMonth, 0);
      const weeksInMonth = getWeekOfMonth(lastDay);
      const weekLabels = Array.from({ length: weeksInMonth }, (_, i) => `Week ${i + 1}`);
      return weekLabels.map((label, i) => {
        const weekNum = i + 1;
        const weekTickets = kpiFilteredTickets.filter(t => {
          const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
          return created && created.getFullYear() === selYear && (created.getMonth() + 1) === selMonth && getWeekOfMonth(created) === weekNum;
        });
        const open = weekTickets.length;
        const closed = weekTickets.filter(t => String(t.status).trim().toLowerCase() === 'closed').length;
        const inProgress = weekTickets.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length;
        const resolved = weekTickets.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length;
        const unclosed = weekTickets.filter(t => String(t.status).trim().toLowerCase() !== 'closed').length;
        const breached = weekTickets.filter(t => {
          const kpi = computeKPIsForTickets([t]);
          return kpi.breachedCount;
        }).length;
        let responseSum = 0, responseCount = 0, resolutionSum = 0, resolutionCount = 0;
        weekTickets.forEach(t => {
          const kpi = computeKPIsForTickets([t]);
          if (kpi.avgResponse) { responseSum += kpi.avgResponse; responseCount++; }
          if (kpi.avgResolution) { resolutionSum += kpi.avgResolution; resolutionCount++; }
        });
        const response = responseCount ? Number((responseSum/responseCount/1000/60).toFixed(2)) : 0;
        const resolution = resolutionCount ? Number((resolutionSum/resolutionCount/1000/60).toFixed(2)) : 0;
        return { period: label, open, inProgress, resolved, closed, unclosed, breached, response, resolution };
      });
    } else {
      // Group by month for period/year
      let months = [];
      if (kpiPeriod) {
        const now = new Date();
        let monthsToShow = 3;
        if (kpiPeriod === 'last6months') monthsToShow = 6;
        if (kpiPeriod === 'lastyear') monthsToShow = 12;
        for (let i = monthsToShow - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push({ year: d.getFullYear(), month: d.getMonth(), label: getMonthLabel(d.getFullYear(), d.getMonth()) });
        }
      } else {
        // Show all months in selected year
        let yearNum = Number(kpiSelectedYear);
        if (!yearNum || isNaN(yearNum)) yearNum = new Date().getFullYear();
        for (let i = 0; i < 12; i++) {
          months.push({ year: yearNum, month: i, label: getMonthLabel(yearNum, i) });
        }
      }
      return months.map(({ year, month, label }) => {
        const monthTickets = kpiFilteredTickets.filter(t => {
          const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
          return created && created.getFullYear() === year && created.getMonth() === month;
        });
        const open = monthTickets.length;
        const closed = monthTickets.filter(t => String(t.status).trim().toLowerCase() === 'closed').length;
        const inProgress = monthTickets.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length;
        const resolved = monthTickets.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length;
        const unclosed = monthTickets.filter(t => String(t.status).trim().toLowerCase() !== 'closed').length;
        const breached = monthTickets.filter(t => {
          const kpi = computeKPIsForTickets([t]);
          return kpi.breachedCount;
        }).length;
        let responseSum = 0, responseCount = 0, resolutionSum = 0, resolutionCount = 0;
        monthTickets.forEach(t => {
          const kpi = computeKPIsForTickets([t]);
          if (kpi.avgResponse) { responseSum += kpi.avgResponse; responseCount++; }
          if (kpi.avgResolution) { resolutionSum += kpi.avgResolution; resolutionCount++; }
        });
        const response = responseCount ? Number((responseSum/responseCount/1000/60).toFixed(2)) : 0;
        const resolution = resolutionCount ? Number((resolutionSum/resolutionCount/1000/60).toFixed(2)) : 0;
        return { period: label, open, inProgress, resolved, closed, unclosed, breached, response, resolution };
      });
    }
  };
  const kpiChartData = getKpiChartData();

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      {showMobilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-xs text-center">
            <h2 className="text-lg font-bold mb-4">Please use desktop for better use</h2>
            <p className="text-gray-600 mb-4">This dashboard is best experienced on a desktop device.</p>
            <button
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-semibold"
              onClick={() => setShowMobilePopup(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-xs w-full text-center">
            <h2 className="text-lg font-semibold mb-4">Confirm Logout</h2>
            <p className="mb-6 text-gray-700">Are you sure you want to log out?</p>
            <div className="flex justify-center gap-4">
              <button
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={showLogoutConfirm ? 'flex h-screen bg-gray-50 filter blur-sm pointer-events-none select-none' : 'flex h-screen bg-gray-50'}>
        <aside className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-white shadow-xl lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-xl flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-l font-bold text-gray-900">Project Head</h1>
                    <p className="text-sm text-gray-500">Manager Portal</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-lg hover:bg-orange-100 transition-colors text-gray-600"
              >
                {sidebarCollapsed ? (
                  <ChevronsRight className="w-6 h-6" />
                ) : (
                  <ChevronsLeft className="w-6 h-6" />
                )}
              </button>
            </div>

            {/* Sidebar Navigation */}
            <nav className="flex-1 p-6 space-y-2">
              {sidebarItems.map(renderSidebarItem)}
            </nav>

            {/* Sidebar Footer */}
            <div className="p-6 border-t border-gray-200">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{managerName.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Project Manager</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200`}
              >
                <LogOut className="w-4 h-4" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Sign Out</span>}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Menu className="w-6 h-6 text-gray-600" />
                </button>
                <div>
                  {projects.length === 0 ? (
                    <h1 className="text-2xl font-bold text-gray-900">No Project Assigned</h1>
                  ) : projects.length === 1 ? (
                    <h1 className="text-2xl font-bold text-gray-900">Project: {projects[0].name}</h1>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-bold text-gray-900">Project:</span>
                      <select
                        className="text-2xl font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                      >
                        {projects.map(project => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-gray-600">Manage your assigned support tickets and communications</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6 sm:p-4 xs:p-2">
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {/* Year Filter Dropdown */}
                <div className="col-span-1 flex items-center mb-2">
                  <label className="mr-2 font-semibold text-gray-700">Year:</label>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={statsYearFilter}
                    onChange={e => setStatsYearFilter(e.target.value)}
                  >
                    <option value="current">Current Year ({currentYear})</option>
                    <option value="last">Last Year ({lastYear})</option>
                  </select>
                </div>
                {/* Ticket Summary Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-6">
                  {/* Unclosed Tickets Stat Card */}
                  <button 
                    onClick={() => setActiveTab('tickets')}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Unclosed Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{unclosedTicketsCount}</p>
                        <p className="text-xs text-gray-500 mt-1">All unclosed project tickets</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                        <FileText className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </button>
                  {/* Closed Tickets Stat Card */}
                  <button 
                    onClick={() => setActiveTab('tickets')}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Closed Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{closedTicketsCount}</p>
                        <p className="text-xs text-gray-500 mt-1">All closed project tickets</p>
                      </div>
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                        <XCircle className="w-6 h-6 text-gray-600" />
                      </div>
                    </div>
                  </button>
                  {/* Open Tickets Stat Card */}
                  <button 
                    onClick={() => setActiveTab('tickets')}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Open Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{openTicketsCount}</p>
                        <p className="text-xs text-gray-500 mt-1">Needs attention</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                        <AlertCircle className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </button>
                  {/* In Progress Tickets Stat Card */}
                  <button 
                    onClick={() => setActiveTab('tickets')}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">In Progress</p>
                        <p className="text-3xl font-bold text-gray-900">{inProgressTicketsCount}</p>
                        <p className="text-xs text-gray-500 mt-1">Being worked on</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                        <Clock className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </button>
                  {/* Resolved Tickets Stat Card */}
                  <button 
                    onClick={() => setActiveTab('tickets')}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Resolved</p>
                        <p className="text-3xl font-bold text-gray-900">{resolvedTicketsCount}</p>
                        <p className="text-xs text-gray-500 mt-1">Completed</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                        <CheckCircle className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </button>
                </div>
                {/* My Project Tickets Table */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">My Project Tickets</h2>
                  {/* Filter controls */}
                  <div className="flex flex-wrap gap-4 mb-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
                      <input type="date" className="border rounded px-2 py-1 text-sm" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
                      <input type="date" className="border rounded px-2 py-1 text-sm" value={toDate} onChange={e => setToDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Period</label>
                      <select className="border rounded px-2 py-1 text-sm" value={period} onChange={e => setPeriod(e.target.value)}>
                        <option value="custom">Custom</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="last2days">Last 2 Days</option>
                      </select>
                    </div>
                    <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold" onClick={handleFilterApply}>Apply</button>
                    <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded font-semibold" onClick={handleFilterReset}>Reset</button>
                  </div>
                  {selectedTicketId ? (
                    <TicketDetails ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />
                  ) : (
                  <div className="overflow-x-auto">
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raised By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredTableTickets
                            .filter(ticket => String(ticket.status).trim().toLowerCase() !== 'closed')
                            .sort((a, b) => {
                              const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
                              const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
                              return dateB - dateA;
                            })
                            .map((ticket, idx) => (
                              <tr
                                key={ticket.id || idx}
                                className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                                  onClick={() => setSelectedTicketId(ticket.id)}
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ticket.ticketNumber}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.subject}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    ticket.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                                    ticket.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                    ticket.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {ticket.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.priority}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.customer}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.assignedBy || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.lastUpdated ? (ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate().toLocaleString() : new Date(ticket.lastUpdated).toLocaleString()) : ''}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}
                </div>
                {/* Priority Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2 text-orange-600" />
                    Priority Distribution
                  </h3>
                  <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                    <div className="flex-1 bg-pink-50 border border-pink-200 rounded-xl p-6 flex flex-col items-center">
                      <Flag className="w-8 h-8 text-pink-600 mb-2" />
                      <span className="text-2xl font-bold text-pink-700">{criticalCount}</span>
                      <span className="text-sm font-medium text-pink-700 mt-1">Critical Priority</span>
                    </div>
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center">
                      <Flag className="w-8 h-8 text-red-500 mb-2" />
                      <span className="text-2xl font-bold text-red-600">{highCount}</span>
                      <span className="text-sm font-medium text-red-700 mt-1">High Priority</span>
                    </div>
                    <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl p-6 flex flex-col items-center">
                      <Flag className="w-8 h-8 text-yellow-500 mb-2" />
                      <span className="text-2xl font-bold text-yellow-600">{mediumCount}</span>
                      <span className="text-sm font-medium text-yellow-700 mt-1">Medium Priority</span>
                    </div>
                    <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-6 flex flex-col items-center">
                      <Flag className="w-8 h-8 text-green-500 mb-2" />
                      <span className="text-2xl font-bold text-green-600">{lowCount}</span>
                      <span className="text-sm font-medium text-green-700 mt-1">Low Priority</span>
                    </div>
                  </div>
                </div>
                {/* Trends Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-orange-600" />
                    Trends
                  </h3>
                  {/* Trends Month Filter */}
                  <div className="mb-4 flex gap-4 items-center">
                    <span className="font-semibold text-gray-700">Month:</span>
                    <input type="month" value={trendsSelectedMonth} onChange={e => setTrendsSelectedMonth(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                  </div>
                  {/* Trends Line Chart */}
                  <div className="h-64 bg-gray-50 rounded-lg p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trendsChartData}
                        margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<TrendsTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="created" name="Created" stroke="#F2994A" strokeWidth={3} dot={{ r: 6, fill: '#F2994A', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        <Line type="monotone" dataKey="inProgress" name="In Progress" stroke="#1976D2" strokeWidth={3} dot={{ r: 6, fill: '#1976D2', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#27AE60" strokeWidth={3} dot={{ r: 6, fill: '#27AE60', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        <Line type="monotone" dataKey="closed" name="Closed" stroke="#34495E" strokeWidth={3} dot={{ r: 6, fill: '#34495E', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        <Line type="monotone" dataKey="unclosed" name="Unclosed" stroke="#FFC107" strokeWidth={3} dot={{ r: 6, fill: '#FFC107', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                    <Zap className="w-6 h-6 mr-3 text-orange-600" />
                    Quick Actions
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                   

                    <button
                      onClick={() => setActiveTab('tickets')}
                      className="group bg-white p-6 rounded-xl border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all duration-300 text-left"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                          <MessageSquare className="w-6 h-6 text-orange-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-gray-900 text-lg">View Tickets</p>
                          <p className="text-gray-600 text-sm">Manage support tickets</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                
              </div>
            )}

            {activeTab === 'team' && (
              <TeamManagement />
            )}

            {activeTab === 'tickets' && (
              <ProjectTickets
                setActiveTab={setActiveTab}
                selectedProjectId={selectedProjectId}
                selectedProjectName={projects.find(p => p.id === selectedProjectId)?.name || ''}
                allProjectIds={projects.map(p => p.id)}
                setViewingTicket={setViewingTicket}
              />
            )}

            {activeTab === 'create' && (
              <div className="max-w-auto mx-auto">
                <Ticketing 
                  onTicketCreated={() => setActiveTab('tickets')}
                  selectedProjectId={selectedProjectId}
                  selectedProjectName={projects.find(p => p.id === selectedProjectId)?.name || ''}
                />
              </div>
            )}

            {activeTab === 'kpi' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-orange-600" />KPI Reports</h2>
                {/* SLA Table */}
                <div className="mb-6">
                  <h3 className="text-md font-semibold mb-2">SLA Table</h3>
                  <table className="min-w-full text-xs text-left text-gray-700 border mb-4">
                    <thead><tr><th className="py-1 px-2">Priority</th><th className="py-1 px-2">Initial Response Time</th><th className="py-1 px-2">Resolution Time</th></tr></thead>
                    <tbody>
                      <tr><td className="py-1 px-2">Critical</td><td className="py-1 px-2">10 min</td><td className="py-1 px-2">1 hour</td></tr>
                      <tr><td className="py-1 px-2">High</td><td className="py-1 px-2">1 hour</td><td className="py-1 px-2">2 hours</td></tr>
                      <tr><td className="py-1 px-2">Medium</td><td className="py-1 px-2">2 hours</td><td className="py-1 px-2">6 hours</td></tr>
                      <tr><td className="py-1 px-2">Low</td><td className="py-1 px-2">6 hours</td><td className="py-1 px-2">1 day</td></tr>
                    </tbody>
                  </table>
                </div>
                {/* KPI Filters: From Date, To Date, Period, Apply, Reset */}
                <div className="mb-4 flex gap-4 items-center">
                  <span className="font-semibold text-gray-700">Year:</span>
                  <select
                    value={kpiSelectedYear}
                    onChange={e => handleKpiYearChange(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <span className="font-semibold text-gray-700">Month:</span>
                  <input
                    type="month"
                    value={kpiSelectedMonth}
                    onChange={e => handleKpiMonthChange(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                    max={`${kpiSelectedYear}-${String(new Date().getMonth()+1).padStart(2,'0')}`}
                  />
                  <span className="font-semibold text-gray-700">Period:</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={kpiPeriod}
                    onChange={e => handleKpiPeriodChange(e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    <option value="last3months">Last 3 Months</option>
                    <option value="last6months">Last 6 Months</option>
                    <option value="lastyear">Last Year</option>
                  </select>
                </div>
                {/* Download Button for KPI Excel Export */}
                {kpiFilteredTickets.length > 0 && (
                  <div className="mb-4">
                    <button
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold"
                      onClick={async () => {
                        const kpiData = computeKPIsForTickets(kpiFilteredTickets);
                        await exportKpiExcelWithCharts(
                          kpiData,
                          ['kpi-bar-chart', 'kpi-bar-chart-time'],
                          projects.find(p => p.id === selectedProjectId)?.name || 'Project'
                        );
                      }}
                    >
                      Download
                    </button>
                  </div>
                )}
                {/* KPI Chart and Table */}
                {kpiFilteredTickets.length === 0 ? (
                  <div className="text-gray-500">No tickets found for KPI analysis.</div>
                ) : (
                  <>
                    {/* KPI Bar Chart (Created/Closed/Breached) - already present */}
                              <div className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm" id="kpi-bar-chart">
                      <h3 className="text-lg font-semibold mb-2">KPI Bar Chart (Created Tickets/Closed/Breached)</h3>
                                <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={kpiChartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="period" />
                          <YAxis allowDecimals={false} />
                                    <Tooltip content={<KpiBarTooltip />} />
                                    <Legend />
                          <Bar dataKey="open" name="Created Tickets" fill="#F2994A" />
                          <Bar dataKey="inProgress" name="In Progress" fill="#1976D2" />
                          <Bar dataKey="resolved" name="Resolved" fill="#27AE60" />
                          <Bar dataKey="closed" name="Closed" fill="#34495E" />
                          <Bar dataKey="breached" name="Breached" fill="#EB5757" />
                          <Bar dataKey="unclosed" name="Unclosed" fill="#FFC107" />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                    {/* KPI Bar Chart (Response/Resolution Time) */}
                    <div id="kpi-bar-chart-time" className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm">
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={kpiChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="response" name="Avg Response Time" fill="#56CCF2" />
                          <Bar dataKey="resolution" name="Avg Resolution Time" fill="#BB6BD9" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* KPI Table */}
                              <div className="overflow-x-auto">
                                  <table className="min-w-full text-xs text-left text-gray-700 border">
                                    <thead>
                                      <tr>
                                        <th className="py-1 px-2">Ticket #</th>
                                        <th className="py-1 px-2">Subject</th>
                                        <th className="py-1 px-2">Assignee</th>
                                        <th className="py-1 px-2">Priority</th>
                                        <th className="py-1 px-2">Status</th>
                                        <th className="py-1 px-2">Created</th>
                                        <th className="py-1 px-2">Response Time (min)</th>
                                        <th className="py-1 px-2">Resolution Time (min)</th>
                                        <th className="py-1 px-2">Breached</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                          {kpiFilteredTickets.map((ticket, idx) => {
                            const kpi = computeKPIsForTickets([ticket]);
                            const detail = kpi.details[0] || {};
                            return (
                              <tr key={ticket.id || idx} className="border-t">
                                <td className="py-1 px-2">{ticket.ticketNumber}</td>
                                <td className="py-1 px-2">{ticket.subject}</td>
                                <td className="py-1 px-2">{ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}</td>
                                <td className="py-1 px-2">{ticket.priority}</td>
                                <td className="py-1 px-2">{ticket.status}</td>
                                <td className="py-1 px-2">{ticket.created ? (ticket.created.toDate ? ticket.created.toDate().toLocaleString() : new Date(ticket.created).toLocaleString()) : ''}</td>
                                <td className="py-1 px-2">{detail.responseTime ? (detail.responseTime/1000/60).toFixed(2) : '-'}</td>
                                <td className="py-1 px-2">{detail.resolutionTime ? (detail.resolutionTime/1000/60).toFixed(2) : '-'}</td>
                                <td className="py-1 px-2">{detail.breached ? <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Yes</span> : <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">No</span>}</td>
                                        </tr>
                            );
                          })}
                                    </tbody>
                                  </table>
                              </div>
                            </>
                )}
              </div>
            )}
          </main>
        </div>
        {/* Add toast UI */}
        {roleChangeToast.show && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 p-4 rounded-xl shadow-lg z-[9999] bg-orange-600 text-white font-semibold">
            {roleChangeToast.message}
          </div>
        )}
        {/* Switch Project Modal */}
        {showSwitchProjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full relative">
              <button
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                onClick={() => setShowSwitchProjectModal(false)}
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold mb-4">Switch Project</h2>
              <ul className="space-y-2">
                {projects.map(project => (
                  <li key={project.id}>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedProjectId === project.id ? 'bg-orange-100 text-orange-700 font-semibold' : 'hover:bg-gray-100'}`}
                      onClick={() => handleSwitchProject(project.id)}
                    >
                      {project.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Custom Tooltip for Trends LineChart
const TrendsTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // Find values by key
    const created = payload.find(p => p.dataKey === 'created')?.value ?? 0;
    const inProgress = payload.find(p => p.dataKey === 'inProgress')?.value ?? 0;
    const resolved = payload.find(p => p.dataKey === 'resolved')?.value ?? 0;
    const closed = payload.find(p => p.dataKey === 'closed')?.value ?? 0;
    const unclosed = payload.find(p => p.dataKey === 'unclosed')?.value ?? 0;
    return (
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', color: '#334155', padding: 12, minWidth: 120 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div>Created - {created}</div>
        <div>In Progress - {inProgress}</div>
        <div>Resolved - {resolved}</div>
        <div>Closed - {closed}</div>
        <div>Unclosed - {unclosed}</div>
      </div> 
    );
  }
  return null;
};

// Custom Tooltip for KPI Bar Chart
const KpiBarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // Find values by key
    const open = payload.find(p => p.dataKey === 'open')?.value ?? 0;
    const inProgress = payload.find(p => p.dataKey === 'inProgress')?.value ?? 0;
    const resolved = payload.find(p => p.dataKey === 'resolved')?.value ?? 0;
    const closed = payload.find(p => p.dataKey === 'closed')?.value ?? 0;
    const breached = payload.find(p => p.dataKey === 'breached')?.value ?? 0;
    const unclosed = payload.find(p => p.dataKey === 'unclosed')?.value ?? (open + inProgress + resolved);
    return (
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', color: '#334155', padding: 12, minWidth: 120 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div>Open - {open} / In Progress - {inProgress}</div>
        <div>Resolved - {resolved} / Closed - {closed}</div>
        <div>Breached - {breached}</div>
        <div>Unclosed - {unclosed}</div>
      </div>
    );
  }
  return null;
};

// Helper: Get week of month (1-based, calendar week)
function getWeekOfMonth(date) {
  const d = new Date(date);
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  const dayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
  // Calculate offset: if first day is not Sunday, week 1 is shorter
  const offset = (dayOfWeek === 0 ? 0 : 7 - dayOfWeek + 1);
  const day = d.getDate();
  if (day <= (7 - dayOfWeek)) return 1;
  return Math.ceil((day - (7 - dayOfWeek)) / 7) + 1;
}

// Helper: Get month label (e.g., 'Jan 2024')
function getMonthLabel(year, month) {
  return new Date(year, month, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
}

export default ProjectManagerDashboard; 