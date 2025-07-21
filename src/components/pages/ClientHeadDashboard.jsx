import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ClientHeadTickets from './ClientHeadTickets';
import Ticketing from './Ticketing';
import {
  Users,
  Building,
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
  Briefcase,
  Activity,
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  ChevronRight,
  Calendar,
  XCircle
} from 'lucide-react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LabelList
} from 'recharts';
import LogoutModal from './LogoutModal';
import TicketDetails from './TicketDetails';
import { computeKPIsForTickets, exportKpiToExcelWithChartImage, SLA_RULES } from './ProjectManagerDashboard';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Animated count-up hook
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

const getStatusIcon = (status) => {
  switch (status) {
    case 'Open': return <AlertCircle className="w-4 h-4 text-blue-500" />;
    case 'In Progress': return <Clock className="w-4 h-4 text-amber-500" />;
    case 'Resolved': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'Closed': return <XCircle className="w-4 h-4 text-gray-500" />;
    default: return null;
  }
};

const getStatusBadge = (status) => {
  const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
  switch (status) {
    case 'Open':
      return `${baseClasses} bg-blue-100 text-blue-800`;
    case 'In Progress':
      return `${baseClasses} bg-amber-100 text-amber-800`;
    case 'Resolved':
      return `${baseClasses} bg-emerald-100 text-emerald-800`;
    case 'Closed':
      return `${baseClasses} bg-gray-100 text-gray-800`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`;
  }
};

const ClientHeadDashboard = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clientHeadName, setClientHeadName] = useState('');
  const [stats, setStats] = useState({
   
    pendingTickets: 0,
    resolvedTickets: 0
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [searchParams] = useSearchParams();
  const auth = getAuth();
  const db = getFirestore();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [statsYearFilter, setStatsYearFilter] = useState('current');

  // --- KPI Filter State ---
  const [kpiSelectedYear, setKpiSelectedYear] = useState(() => {
    const now = new Date();
    return now.getFullYear();
  });
  const [kpiSelectedMonth, setKpiSelectedMonth] = useState(''); // '' means not set
  const [kpiPeriod, setKpiPeriod] = useState(''); // '', 'last3months', 'last6months', 'lastyear'
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
          const d = new Date(yearNum, i, 1);
          months.push({ year: d.getFullYear(), month: d.getMonth(), label: getMonthLabel(d.getFullYear(), d.getMonth()) });
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
    if (tabParam && ['dashboard', 'tickets', 'create', 'clients'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
  useEffect(() => {
    if (!authChecked || !user) return;
    setIsLoading(true);
    setError(null);
    let unsubscribe;
    // Real-time listener for projects
    const projectsQuery = query(collection(db, 'projects'));
    unsubscribe = onSnapshot(projectsQuery, (projectsSnapshot) => {
      const projectsData = projectsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(project =>
          (project.members || []).some(
            m => m.email === user.email && (m.role === 'client_head' || m.role === 'client')
          )
        );
      setProjects(projectsData);
      if (projectsData.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectsData[0].id);
      }
      setIsLoading(false);
    }, (error) => {
      setError('Failed to load projects.');
      setIsLoading(false);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [authChecked, user, db]);

  useEffect(() => {
    if (!authChecked || !user || !selectedProjectId || !projects.length) return;
    setIsLoading(true);
    setError(null);
    let unsubscribe1, unsubscribe2;
    // Use project name for ticket queries
    const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || '';
    if (!selectedProjectName) {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    const ticketsCollectionRef = collection(db, 'tickets');
    const q1 = query(ticketsCollectionRef, where('project', '==', selectedProjectName));
    const q2 = query(ticketsCollectionRef, where('project', 'array-contains', selectedProjectName));
    let ticketsMap = {};
    unsubscribe1 = onSnapshot(q1, (snapshot) => {
      snapshot.docs.forEach(doc => {
        ticketsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTickets(Object.values(ticketsMap));
      setIsLoading(false);
    }, (error) => {
      setError('Failed to load tickets.');
      setIsLoading(false);
    });
    unsubscribe2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        ticketsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTickets(Object.values(ticketsMap));
      setIsLoading(false);
    }, (error) => {
      setError('Failed to load tickets.');
      setIsLoading(false);
    });
    return () => {
      if (unsubscribe1) unsubscribe1();
      if (unsubscribe2) unsubscribe2();
    };
  }, [authChecked, user, db, selectedProjectId, projects]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        if (!user) return;
        // Get client head's name
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        let clientHeadProject = null;
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          let displayName = '';
          if (userData.firstName && userData.lastName) {
            displayName = `${userData.firstName} ${userData.lastName}`;
          } else if (userData.firstName) {
            displayName = userData.firstName;
          } else if (userData.lastName) {
            displayName = userData.lastName;
          } else {
            displayName = userData.email.split('@')[0];
          }
          setClientHeadName(displayName);
          clientHeadProject = userData.project || null;
        }
        // Fetch clients
        const clientsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'client')
        );
        const clientsSnapshot = await getDocs(clientsQuery);
        const clientsData = clientsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClients(clientsData);
        // Update stats
        setStats({
          totalClients: clientsData.length,
          activeProjects: projects.filter(project => project.status === 'active').length,
          pendingTickets: tickets.filter(ticket => ticket.status === 'Open').length,
          resolvedTickets: tickets.filter(ticket => ticket.status === 'Closed').length
        });
        setLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading(false);
      }
    };
    if (authChecked && user) {
      setLoading(true);
      fetchDashboardData();
    }
  }, [authChecked, user, db]);
  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setSigningOut(false);
      setShowLogoutModal(false);
    }
  };

  const handleLogoutClick = () => setShowLogoutModal(true);
  const handleLogoutCancel = () => setShowLogoutModal(false);

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'team', label: 'Team', icon: Users, active: activeTab === 'team' },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare, active: activeTab === 'tickets' },
    { id: 'kpi', label: 'KPI Reports', icon: BarChart3, active: activeTab === 'kpi' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' },
  ];

  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => {
          setActiveTab(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
          item.active
            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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

  // Filter bar handlers
  const handleFilterApply = () => {
    // setAppliedFromDate(fromDate); // Removed
    // setAppliedToDate(toDate); // Removed
    // setAppliedPeriod(period); // Removed
  };
  const handleFilterReset = () => {
    // setFromDate(''); // Removed
    // setToDate(''); // Removed
    // setPeriod('custom'); // Removed
    // setAppliedFromDate(''); // Removed
    // setAppliedToDate(''); // Removed
    // setAppliedPeriod('custom'); // Removed
  };

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

  // Helper to get year from ticket
  function getTicketYear(ticket) {
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    return created ? created.getFullYear() : null;
  }

  // For year filtering, always use created.getFullYear() for all year-based filters and stats.
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;
  let yearToFilter = currentYear;
  if (statsYearFilter === 'last') yearToFilter = lastYear;

  // Filter tickets by year
  const ticketsForStats = tickets.filter(t => getTicketYear(t) === yearToFilter);
  const unclosedTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() !== 'closed').length;
  const closedTicketsCount = ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'closed').length;

  // Compute counts for each priority for the selected year
  const criticalCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'critical').length;
  const highCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'high').length;
  const mediumCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'medium').length;
  const lowCount = ticketsForStats.filter(t => String(t.priority).trim().toLowerCase() === 'low').length;

  // Helper to extract closed date from ticket comments
  function getClosedDate(ticket) {
    if (!ticket.comments || !Array.isArray(ticket.comments)) return null;
    for (const c of ticket.comments) {
      if (
        c.message &&
        typeof c.message === 'string' &&
        c.message.toLowerCase().includes('status changed to closed') &&
        c.timestamp
      ) {
        if (typeof c.timestamp.toDate === 'function') return c.timestamp.toDate();
        return new Date(c.timestamp);
      }
    }
    return null;
  }

  // Helper to get chart image as base64
  async function getChartPngDataUrl(chartId) {
    const chartElem = document.getElementById(chartId);
    if (!chartElem) return null;
    const svgElem = chartElem.querySelector('svg');
    if (!svgElem) return null;
    const svgString = new XMLSerializer().serializeToString(svgElem);
    const canvas = document.createElement('canvas');
    const bbox = svgElem.getBoundingClientRect();
    canvas.width = bbox.width;
    canvas.height = bbox.height;
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    const svg = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svgString)));
    return new Promise(resolve => {
      img.onload = function() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = svg;
    });
  }

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

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Find the project where the client head is a member
  const myProject = projects.find(project => (project.members || []).some(m => m.email === user?.email && m.role === 'client_head'));

  // Filter tickets for current user (assigned to or raised by)
  const currentUserEmail = user?.email;
  // Get all client and employee emails for the current project
  const clientAndEmployeeEmails = (myProject?.members || [])
    .filter(m => m.role === 'client' || m.userType === 'client' || m.role === 'employee' || m.userType === 'employee')
    .map(m => m.email);

  // Filter tickets assigned to the client head or raised by any client or employee in the project
  let myTickets = tickets.filter(t =>
    (t.assignedTo && t.assignedTo.email === currentUserEmail) ||
    (t.email && clientAndEmployeeEmails.includes(t.email))
  );
  // Only exclude closed tickets (case-insensitive, trim whitespace)
  myTickets = myTickets.filter(t => String(t.status).trim().toLowerCase() !== 'closed');

  // Filter myTickets based on kpiPeriod
  let filteredMyTickets = myTickets;
  if (kpiPeriod === 'week') {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfWeek && created <= now;
    });
  } else if (kpiPeriod === 'month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfMonth && created <= now;
    });
  } else if (kpiPeriod === 'last2days') {
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= twoDaysAgo && created <= now;
    });
  } else if (kpiPeriod === 'custom') {
    // Custom date range
    if (kpiSelectedMonth) {
      const [selYear, selMonth] = kpiSelectedMonth.split('-').map(Number);
      const from = new Date(selYear, selMonth - 1, 1);
      const to = new Date(selYear, selMonth, 0, 23, 59, 59, 999);
      filteredMyTickets = myTickets.filter(t => {
        const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
        return created && created >= from && created <= to;
      });
    } else if (kpiSelectedYear) {
      const from = new Date(kpiSelectedYear, 0, 1);
      const to = new Date(kpiSelectedYear, 11, 31, 23, 59, 59, 999);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= from && created <= to;
    });
    }
  }

  // Trends chart data grouping (should use all project tickets, not myTickets)
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
    // Count resolved and in progress tickets
    const resolvedCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length;
    const inProgressCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length;
    const closedCount = groupTickets.filter(t => String(t.status).trim().toLowerCase() === 'closed').length;
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* LogoutModal always rendered above, not blurred */}
      <LogoutModal open={showLogoutModal} onCancel={handleLogoutCancel} onConfirm={handleLogout} loading={signingOut} />
      {/* Blurred content (sidebar + main) */}
      <div className={showLogoutModal ? 'flex flex-1 filter blur-sm pointer-events-none select-none' : 'flex flex-1'}>
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white shadow-xl lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                    <Building className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-l font-bold text-gray-900">Client Manager</h1>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
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
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{clientHeadName.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Client Manager</p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogoutClick}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200`}
              >
                <LogOut className="w-4 h-4" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Sign Out</span>}
              </button>
            </div>
          </div>
        </aside>
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
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
                  <h1 className="text-2xl font-bold text-gray-900">{myProject?.name || 'General'}</h1>
                  <p className="text-gray-600">Monitor client activities and project progress</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleLogoutClick}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </header>
          {/* Dashboard Content */}
          <main className="flex-1 overflow-auto p-6 bg-gray-50">
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {/* Stats Grid */}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                  
                  {/* Unclosed Tickets Stat Card */}
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'All',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Unclosed Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{unclosedTicketsCount}</p>
                        <p className="text-xs text-gray-500 mt-1">All unclosed project tickets</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  {/* Closed Tickets Stat Card */}
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'Closed',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
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
                    onClick={() => {
                      setActiveTab('tickets');
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'Open',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Open Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'open').length}</p>
                        <p className="text-xs text-gray-500 mt-1">Needs attention</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <AlertCircle className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  {/* In Progress Tickets Stat Card */}
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'In Progress',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">In Progress</p>
                        <p className="text-3xl font-bold text-gray-900">{ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length}</p>
                        <p className="text-xs text-gray-500 mt-1">Being worked on</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <Clock className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  {/* Resolved Tickets Stat Card */}
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'Resolved',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Resolved</p>
                        <p className="text-3xl font-bold text-gray-900">{ticketsForStats.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length}</p>
                        <p className="text-xs text-gray-500 mt-1">Completed</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <CheckCircle className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                </div>

                {/* My Project Tickets Table */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
                  
                  <div className="flex flex-wrap gap-4 mb-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
                      <input type="date" className="border rounded px-2 py-1 text-sm" value={kpiSelectedMonth} onChange={e => setKpiSelectedMonth(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
                      <input type="date" className="border rounded px-2 py-1 text-sm" value={kpiSelectedMonth} onChange={e => setKpiSelectedMonth(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Period</label>
                      <select className="border rounded px-2 py-1 text-sm" value={kpiPeriod} onChange={e => setKpiPeriod(e.target.value)}>
                        <option value="">-- Select --</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="last2days">Last 2 Days</option>
                        <option value="custom">Custom Date Range</option>
                      </select>
                    </div>
                    <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold" onClick={() => downloadTicketsAsExcel(filteredMyTickets)}>Download</button>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold" onClick={handleFilterApply}>Apply</button>
                    <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded font-semibold" onClick={handleFilterReset}>Reset</button>
                  </div>
                  {selectedTicketId ? (
                    <TicketDetails ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />
                  ) : filteredMyTickets.length === 0 ? (
                    <div className="text-gray-500">You have no tickets assigned to you or raised by you in this project.</div>
                  ) : (
                    <div className="overflow-x-auto" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response Time (min)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resolution Time (min)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breached</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredMyTickets
                              .filter(ticket => {
                                const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
                                return created && created.getFullYear() === yearToFilter;
                              })
                              .sort((a, b) => {
                                const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
                                const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
                                return dateB - dateA;
                              })
                              .map((ticket, idx) => {
                                // Calculate response/resolution time and breached
                                const kpi = computeKPIsForTickets([ticket]);
                                const detail = kpi.details[0] || {};
                                return (
                                  <tr
                                    key={ticket.id || idx}
                                    onClick={() => setSelectedTicketId(ticket.id)}
                                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ticket.ticketNumber}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.subject}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                      {ticket.assignedTo
                                        ? (typeof ticket.assignedTo === 'object'
                                            ? (ticket.assignedTo.name || ticket.assignedTo.email)
                                            : ticket.assignedTo)
                                        : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.priority}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        ticket.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                                        ticket.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                        ticket.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                                        ticket.status === 'Closed' ? 'bg-gray-100 text-gray-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {ticket.status}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                      {ticket.created ? (ticket.created.toDate ? ticket.created.toDate().toLocaleString() : new Date(ticket.created).toLocaleString()) : ''}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{detail.responseTime ? (detail.responseTime/1000/60).toFixed(2) : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{detail.resolutionTime ? (detail.resolutionTime/1000/60).toFixed(2) : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{detail.breached ? <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Yes</span> : <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">No</span>}</td>
                                  </tr>
                                );
                              })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Charts and Analytics Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Status Distribution Line Chart (Trends) */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
                       Trends
                    </h3>
                    {/* Trends Month Filter */}
                    <div className="mb-4 flex gap-4 items-center">
                      <span className="font-semibold text-gray-700">Month:</span>
                      <input type="month" value={kpiSelectedMonth} onChange={e => setKpiSelectedMonth(e.target.value)} className="border rounded px-2 py-1 text-sm" />
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
                          <Line type="monotone" dataKey="unclosed" name="Unclosed" stroke="#F2994A" strokeWidth={3} dot={{ r: 6, fill: '#F2994A', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                          <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#1976D2" strokeWidth={3} dot={{ r: 6, fill: '#1976D2', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                          <Line type="monotone" dataKey="closed" name="Closed" stroke="#27AE60" strokeWidth={3} dot={{ r: 6, fill: '#27AE60', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                          <Line type="monotone" dataKey="created" name="Created" stroke="#34495E" strokeWidth={3} dot={{ r: 6, fill: '#34495E', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                          <Line type="monotone" dataKey="inProgress" name="In Progress" stroke="#FFC107" strokeWidth={3} dot={{ r: 6, fill: '#FFC107', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Priority Distribution */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
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
                </div>

                
              </div>
            )}

            {/* Other tabs content */}
            {activeTab === 'team' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Clients</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {(myProject?.members?.filter(m => m.userType === 'client') || []).map(member => (
                    <div key={member.uid} className="bg-purple-50 rounded-xl p-6 flex flex-col items-center shadow hover:shadow-lg transition">
                      <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center mb-4">
                        <User className="w-8 h-8 text-purple-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-gray-900">{member.email}</p>
                        <p className="text-sm text-gray-600 capitalize">{member.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                  ))}
                  {((myProject?.members?.filter(m => m.userType === 'client') || []).length === 0) && (
                    <div className="col-span-full text-center text-gray-500">No clients found for this project.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'clients' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Clients Management</h2>
                {/* Clients management content */}
              </div>
            )}

            {activeTab === 'tickets' && (
              <ClientHeadTickets />
            )}

            {activeTab === 'create' && (
              <Ticketing />
            )}

            {activeTab === 'kpi' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-blue-600" />KPI Reports</h2>
               
                {/* KPI Filters: Month, Year, and Period */}
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
                {kpiFilteredTickets.length === 0 ? (
                  <div className="text-gray-500">No tickets found for KPI analysis.</div>
                ) : (
                  <>
                    {/* Export to Excel Button for KPI */}
                    <div className="mb-4">
                      <button
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold"
                        onClick={async () => {
                          const kpiData = computeKPIsForTickets(kpiFilteredTickets);
                          await exportKpiExcelWithCharts(kpiData, ['kpi-bar-chart-count', 'kpi-bar-chart-time'], myProject?.name || 'Project');
                        }}
                      >
                        Download
                      </button>
                    </div>
                    {/* KPI Bar Chart (Created/Closed/Breached) */}
                              <div className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm" id="kpi-bar-chart-count">
                      <h3 className="text-lg font-semibold mb-2">KPI Bar Chart (Created Tickets/Closed/Breached)</h3>
                          <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={kpiChartData}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="period" />
                                      <YAxis allowDecimals={false} />
                                      <Tooltip />
                                      <Legend />
                          <Bar dataKey="open" name="Created Tickets" fill="#F2994" />
                          <Bar dataKey="inProgress" name="In Progress" fill="#FFC107" />
                          <Bar dataKey="resolved" name="Resolved" fill="#1976D2" />
                          <Bar dataKey="closed" name="Closed" fill="#27AE60" />
                          <Bar dataKey="breached" name="Breached" fill="#EB5757" />
                          <Bar dataKey="unclosed" name="Unclosed" fill="#F2994A" />
                                    </BarChart>
                                </ResponsiveContainer>
                              </div>
                    {/* KPI Bar Chart (Response/Resolution Time) */}
                              <div className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm" id="kpi-bar-chart-time">
                      <h3 className="text-lg font-semibold mb-2">KPI Bar Chart (Avg Response/Avg Resolution Time in min)</h3>
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
                         {/* SLA Table */}
                <div className="mb-6 mt-8">
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
                      </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
export default ClientHeadDashboard;