import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  MessageSquare,
  User,
  Loader2,
  RefreshCw,
  LogOut,
  Home,
  FileText,
  Menu,
  ChevronsLeft,
  ChevronsRight,
  Briefcase,
  X
} from 'lucide-react';
import { collection, query, onSnapshot, doc, where, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { auth } from '../../firebase/config';
import Ticketing from './Ticketing'; // Import the Ticketing component
import EmployeeTickets from './EmployeeTickets'; // Import the EmployeeTickets component
import LogoutModal from './LogoutModal';
import { Modal } from 'antd'; // Add this import if you use Ant Design, or use a custom modal
import TicketDetails from './TicketDetails';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
 
function EmployeeDashboard() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [employeeName, setEmployeeName] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const messagesContainerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [searchParams] = useSearchParams();
  const [roleChangeToast, setRoleChangeToast] = useState({ show: false, message: '' });
  const [showSwitchProjectModal, setShowSwitchProjectModal] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [period, setPeriod] = useState('custom');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState('custom');
 
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      if (!firebaseUser) {
        setError('Please sign in to view tickets');
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);
 
  // Handle URL parameters for tab navigation
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['dashboard', 'tickets', 'create'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
 
  // Fetch projects when user is authenticated
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
                m => m.email === user.email && m.role === 'employee'
              )
            );
          setProjects(projectsData);
      // Always select the first project the employee is in
      if (projectsData.length > 0) {
            setSelectedProjectId(projectsData[0].id);
      } else {
        setSelectedProjectId('');
          }
          setIsLoading(false);
    }, (error) => {
          setError('Failed to load projects.');
          setIsLoading(false);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [authChecked, user, db]);
 
  // Ticket listener updates when selectedProjectId, projects, or user changes
  useEffect(() => {
    if (!authChecked || !user) return;
    setIsLoading(true);
    setError(null);
    let unsubscribe;
    // Set employee name from email
    const email = user.email;
    const name = email.split('@')[0];
    setEmployeeName(name.charAt(0).toUpperCase() + name.slice(1));
    if (selectedProjectId && selectedProjectId !== 'all') {
      // Single project
      const q = query(
        collection(db, 'tickets'),
        where('projectId', '==', selectedProjectId)
      );
      unsubscribe = onSnapshot(q,
        (querySnapshot) => {
          try {
            const ticketsData = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              ticketsData.push({
                id: doc.id,
                subject: data.subject || 'No Subject',
                description: data.description || 'No Description',
                status: data.status || 'Open',
                created: data.created || null,
                dueDate: data.dueDate || null,
                ticketNumber: data.ticketNumber || `TKT-${doc.id}`,
                adminResponses: data.adminResponses || [],
                customerResponses: data.customerResponses || [],
                customer: data.customer || 'Unknown',
                project: data.project || 'General',
                assignedTo: data.assignedTo || null,
                assignedBy: data.assignedBy || null,
                lastUpdated: data.lastUpdated || null,
                priority: data.priority || 'Medium',
                email: data.email || null,
                module: data.module || '',
                typeOfIssue: data.typeOfIssue || '',
                category: data.category || '',
                subCategory: data.subCategory || ''
              });
            });
            // Sort tickets by created date
            ticketsData.sort((a, b) => {
              const dateA = a.created?.toDate?.() || new Date(a.created);
              const dateB = b.created?.toDate?.() || new Date(b.created);
              return dateB - dateA;
            });
            setTickets(ticketsData);
            // Debug: log all tickets and their assignedTo field
            console.log('All tickets:', ticketsData.map(t => ({ id: t.id, assignedTo: t.assignedTo })));
            setError(null);
            setIsLoading(false);
          } catch (err) {
            console.error('Error processing tickets:', err);
            setError('Error processing tickets. Please try again.');
            setIsLoading(false);
          }
        },
        (error) => {
          console.error('Firestore error:', error);
          setError('Error connecting to the server. Please try again.');
          setIsLoading(false);
        }
      );
    } else if (selectedProjectId === 'all' && projects.length > 0) {
      // All projects: fetch tickets for all managed projects
      const projectIds = projects.map(p => p.id);
      let allTickets = [];
      let unsubscribes = [];
      const batchSize = 10;
      for (let i = 0; i < projectIds.length; i += batchSize) {
        const batchIds = projectIds.slice(i, i + batchSize);
        const q = query(
          collection(db, 'tickets'),
          where('projectId', 'in', batchIds)
        );
        const batchUnsub = onSnapshot(q, (querySnapshot) => {
          let batchTickets = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            batchTickets.push({
              id: doc.id,
              subject: data.subject || 'No Subject',
              description: data.description || 'No Description',
              status: data.status || 'Open',
              created: data.created || null,
              dueDate: data.dueDate || null,
              ticketNumber: data.ticketNumber || `TKT-${doc.id}`,
              adminResponses: data.adminResponses || [],
              customerResponses: data.customerResponses || [],
              customer: data.customer || 'Unknown',
              project: data.project || 'General',
              assignedTo: data.assignedTo || null,
              assignedBy: data.assignedBy || null,
              lastUpdated: data.lastUpdated || null,
              priority: data.priority || 'Medium',
              email: data.email || null,
              module: data.module || '',
              typeOfIssue: data.typeOfIssue || '',
              category: data.category || '',
              subCategory: data.subCategory || ''
            });
          });
          allTickets = allTickets.filter(t => !batchTickets.some(bt => bt.id === t.id)).concat(batchTickets);
          // Sort tickets by created date
          allTickets.sort((a, b) => {
            const dateA = a.created?.toDate?.() || new Date(a.created);
            const dateB = b.created?.toDate?.() || new Date(b.created);
            return dateB - dateA;
          });
          setTickets([...allTickets]);
          setError(null);
          setIsLoading(false);
        }, (error) => {
          console.error('Firestore error:', error);
          setError('Error connecting to the server. Please try again.');
          setIsLoading(false);
        });
        unsubscribes.push(batchUnsub);
      }
      unsubscribe = () => unsubscribes.forEach(unsub => unsub());
    } else {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    unsubscribeRef.current = unsubscribe;
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [authChecked, user, selectedProjectId, projects]);
 
  // Enhanced scroll to bottom function
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  };
 
  // Scroll to bottom when messages change
  useEffect(() => {
    if (selectedTicket) {
      // Use setTimeout to ensure messages are rendered
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [selectedTicket?.adminResponses, selectedTicket?.customerResponses, selectedTicket?.id]);
 
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
    { id: 'tickets', label: 'Tickets', icon: FileText, active: activeTab === 'tickets' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' }
  ];
 
  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => {
          // For 'tickets' tab, we no longer navigate to a separate route
          // Instead, we just set the activeTab to render the component within the dashboard
          setActiveTab(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
          item.active
            ? 'bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white shadow-lg'
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
 
  // Replace the fetchRole useEffect with a real-time listener for role changes
  useEffect(() => {
    let unsubscribe;
      if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      unsubscribe = onSnapshot(userDocRef, (userDoc) => {
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          if (role === 'client') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/clientdashboard'), 2000);
          } else if (role === 'admin') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/admin'), 2000);
          } else if (role === 'project_manager') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/projectmanagerdashboard'), 2000);
          } else if (role !== 'employee') {
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
  }, [navigate]);
 
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
 
  // My Tickets: Simple logic - if the logged-in user's email matches assignedTo.email, include the ticket
  const currentUserEmail = user?.email ? user.email.trim().toLowerCase() : '';
  
  // Debug: print current user email and all tickets
  console.log('Current user email:', currentUserEmail);
  console.log('All tickets:', tickets.map(t => ({
    id: t.id,
    assignedTo: t.assignedTo,
    assignedBy: t.assignedBy,
    email: t.email
  })));

  const myTickets = tickets.filter(t => {
    // Simple check: if assignedTo.email matches current user's email
    let isAssignedToMe = false;
    
    if (t.assignedTo && typeof t.assignedTo === 'object' && t.assignedTo.email) {
      const assignedEmail = t.assignedTo.email.toLowerCase().trim();
      if (assignedEmail === currentUserEmail) {
        isAssignedToMe = true;
      }
    }
    
    // Also include tickets created by the current user
    const isCreator = t.email && t.email.toLowerCase().trim() === currentUserEmail;
    
    // Also include tickets assigned by the current user
    let isAssignedByMe = false;
    if (t.assignedBy) {
      if (typeof t.assignedBy === 'object' && t.assignedBy.email) {
        const assignedByEmail = t.assignedBy.email.toLowerCase().trim();
        if (assignedByEmail === currentUserEmail) {
          isAssignedByMe = true;
        }
      } else if (typeof t.assignedBy === 'string') {
        const assignedByStr = t.assignedBy.toLowerCase().trim();
        if (assignedByStr === currentUserEmail) {
          isAssignedByMe = true;
        }
      }
    }
    
    return isAssignedToMe || isCreator || isAssignedByMe;
  });
  // Debug: log which tickets are included with reason
  console.log('myTickets:', myTickets.map(t => {
    let isAssignedToMe = false;
    if (t.assignedTo && typeof t.assignedTo === 'object' && t.assignedTo.email) {
      const assignedEmail = t.assignedTo.email.toLowerCase().trim();
      if (assignedEmail === currentUserEmail) {
        isAssignedToMe = true;
      }
    }
    
    const isCreator = t.email && t.email.toLowerCase().trim() === currentUserEmail;
    
    let isAssignedByMe = false;
    if (t.assignedBy) {
      if (typeof t.assignedBy === 'object' && t.assignedBy.email) {
        const assignedByEmail = t.assignedBy.email.toLowerCase().trim();
        if (assignedByEmail === currentUserEmail) {
          isAssignedByMe = true;
        }
      } else if (typeof t.assignedBy === 'string') {
        const assignedByStr = t.assignedBy.toLowerCase().trim();
        if (assignedByStr === currentUserEmail) {
          isAssignedByMe = true;
        }
      }
    }
    
    return { 
    id: t.id, 
    assignedTo: t.assignedTo, 
    assignedBy: t.assignedBy,
      email: t.email,
      reason: {
        isAssignedToMe,
        isCreator,
        isAssignedByMe
      }
    };
  }));
 
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
      { header: 'Ticket ID', key: 'ticketNumber' },
      { header: 'Subject', key: 'subject' },
      { header: 'Module', key: 'module' },
      { header: 'Type of Issue', key: 'typeOfIssue' },
      { header: 'Category', key: 'category' },
      { header: 'Sub-Category', key: 'subCategory' },
      { header: 'Status', key: 'status' },
      { header: 'Priority', key: 'priority' },
      { header: 'Assigned To', key: 'assignedTo' },
      { header: 'Created By', key: 'createdBy' },
      { header: 'Reported By', key: 'reportedBy' },
    ];
    // Build rows: first row is header, then ticket rows
    const rows = [columns.map(col => col.header)];
    tickets.forEach(ticket => {
      rows.push([
        getField(ticket, 'ticketNumber', 'ticket_number', 'ticketId', 'ticket_id'),
        getField(ticket, 'subject', 'Subject'),
        getField(ticket, 'module', 'Module'),
        getField(ticket, 'typeOfIssue', 'type_of_issue', 'typeOfissue', 'type_of_Issue', 'type', 'Type of Issue'),
        getField(ticket, 'category', 'Category'),
        getField(ticket, 'subCategory', 'sub_category', 'sub-category', 'Sub-Category'),
        getField(ticket, 'status', 'Status'),
        getField(ticket, 'priority', 'Priority'),
        ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-',
        ticket.customer || ticket.createdBy || '',
        ticket.reportedBy || ticket.email || ''
      ]);
    });
    // Create worksheet and workbook
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');
    // Export to file
    XLSX.writeFile(workbook, 'tickets_export.xlsx');
  }
 
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Connection Error</h2>
          <p className="text-gray-600 mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white px-6 py-3 rounded-xl hover:from-[#FFB86C] hover:to-[#FFC98C] transition-all duration-200 flex items-center justify-center space-x-2 font-medium shadow-lg hover:shadow-xl"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }
 
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Loading Dashboard</h2>
          <p className="text-gray-600 leading-relaxed">Please wait while we connect to the server...</p>
        </div>
      </div>
    );
  }
 
  return (
    <div className="flex h-screen bg-gray-50">
      {/* LogoutModal always rendered above, not blurred */}
      <LogoutModal open={showLogoutModal} onCancel={handleLogoutCancel} onConfirm={handleLogout} loading={signingOut} />
      {/* Blurred content (sidebar + main) */}
      <div className={showLogoutModal ? 'flex flex-1 filter blur-sm pointer-events-none select-none' : 'flex flex-1'}>
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out ${ sidebarCollapsed ? 'w-20' : 'w-64' } bg-white shadow-xl lg:translate-x-0 lg:static ${ sidebarOpen ? 'translate-x-0' : '-translate-x-full' }`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                   
                    <p className="text-sm text-gray-500">Employee Portal</p>
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
                  <div className="w-8 h-8 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{employeeName.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Employee</p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogoutClick}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} space-x-2 px-4 py-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all duration-200`}
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
                  onClick={handleLogoutClick}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </header>
 
          {/* Dashboard Content */}
          <main className="flex-1 overflow-auto p-6 sm:p-4 xs:p-2">
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Stats Cards */}
                {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Tickets</p>
                        <p className="text-2xl font-bold text-gray-900">{tickets.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                        <FileText className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Open Tickets</p>
                        <p className="text-2xl font-bold text-orange-600">{tickets.filter(t => t.status === 'Open').length}</p>
                      </div>
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">In Progress</p>
                        <p className="text-2xl font-bold text-amber-600">{tickets.filter(t => t.status === 'In Progress').length}</p>
                      </div>
                      <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Resolved</p>
                        <p className="text-2xl font-bold text-emerald-600">{tickets.filter(t => t.status === 'Resolved').length}</p>
                      </div>
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                </div> */}

                {/* My Tickets Table */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">My Tickets</h2>
                  {(() => {
                    const currentUserEmail = user?.email ? user.email.trim().toLowerCase() : '';
                    // Show tickets assigned to the user or raised by the user (no duplicates)
                    const myTickets = tickets.filter(t => {
                      let assignedEmail = '';
                      if (t.assignedTo) {
                        if (typeof t.assignedTo === 'object' && t.assignedTo.email) {
                          assignedEmail = t.assignedTo.email;
                        } else if (typeof t.assignedTo === 'string') {
                          assignedEmail = t.assignedTo;
                        }
                      }
                      const isAssignedToMe = assignedEmail.trim().toLowerCase() === currentUserEmail;
                      const isRaisedByMe = t.email && t.email.trim().toLowerCase() === currentUserEmail;
                      return isAssignedToMe || isRaisedByMe;
                    });
                    // Remove duplicates by ticket id
                    const uniqueMyTickets = Array.from(new Map(myTickets.map(t => [t.id, t])).values());
                    if (uniqueMyTickets.length === 0) {
                      return <div className="text-gray-500">No tickets assigned to you or raised by you.</div>;
                    }
                    return (
                      <div className="overflow-x-auto">
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
                            {uniqueMyTickets.map((ticket) => (
                              <tr
                                key={ticket.id}
                                className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{
                                  ticket.assignedTo
                                    ? (typeof ticket.assignedTo === 'object'
                                        ? (ticket.assignedTo.name || ticket.assignedTo.email)
                                        : ticket.assignedTo)
                                    : '-'
                                }</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{
                                  ticket.assignedBy
                                    ? (typeof ticket.assignedBy === 'object'
                                        ? (ticket.assignedBy.name || ticket.assignedBy.email)
                                        : ticket.assignedBy)
                                    : '-'
                                }</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.created?.toDate ? ticket.created.toDate().toLocaleString() : (ticket.created ? new Date(ticket.created).toLocaleString() : '')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                {/* Quick Actions */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setActiveTab('create')}
                      className="flex items-center space-x-3 p-4 border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-all duration-200"
                    >
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        {/* Removed Plus icon */}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Create New Ticket</p>
                        <p className="text-sm text-gray-500">Submit a new support request</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveTab('tickets')}
                      className="flex items-center space-x-3 p-4 border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-all duration-200"
                    >
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">View All Project Tickets</p>
                        <p className="text-sm text-gray-500">See all tickets for your project</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
 
            {activeTab === 'tickets' && <EmployeeTickets selectedProjectId={selectedProjectId} allProjectIds={projects.map(p => p.id)} />}
 
            {activeTab === 'create' && (
              <div className="max-w-auto mx-auto">
                <Ticketing 
                  onTicketCreated={() => setActiveTab('tickets')}
                  selectedProjectId={selectedProjectId}
                  selectedProjectName={projects.find(p => p.id === selectedProjectId)?.name || ''}
                />
              </div>
            )}
          </main>
        </div>
      </div>
      {/* Add toast UI */}
      {roleChangeToast.show && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 p-4 rounded-xl shadow-lg z-[9999] bg-orange-600 text-white font-semibold">
          {roleChangeToast.message}
        </div>
      )}
    </div>
  );
}
 
export default EmployeeDashboard;