import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  FolderOpen,
  Ticket,
  LogOut,
  Users,
  User,
  UserCheck,
  FolderKanban,
  Monitor,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  UserPlus,
  Search,
  Filter,
  Mail,
  Phone,
  Building,
  Briefcase,
  Shield,
  X,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase/config';
import { collection, query, getDocs, where, addDoc, orderBy, limit } from 'firebase/firestore';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import Projects from './Projects';
import AdminTickets from './AdminTickets';
import LogoutModal from './LogoutModal';
import EditTicketForm from './EditTicketForm';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

function Admin() {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [stats, setStats] = useState({
    totalClients: 0,
    totalEmployees: 0,
    clientHeads: 0,
    projectManagers: 0,
    totalProjects: 0,
    totalTickets: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLogoutDropdown, setShowLogoutDropdown] = useState(false);
  const dropdownRef = useRef(null); // Ref for the dropdown container
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [userFormData, setUserFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    company: '',
    role: 'employee',
    userType: 'employee'
  });
  const [userFilter, setUserFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ticketStats, setTicketStats] = useState({
    byStatus: {},
    byPriority: {},
    recentActivity: [],
    ticketsOverTime: []
  });
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [allProjects, setAllProjects] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchUsers();
    fetchTicketStats();
    fetchProjects();
 
    // Handle clicks outside the dropdown
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowLogoutDropdown(false);
      }
    };
 
    if (showLogoutDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
 
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLogoutDropdown]); // Re-run effect when dropdown visibility changes
 
  const fetchStats = async () => {
    try {
      // Fetch total clients
      const clientsQuery = query(collection(db, 'users'), where('role', '==', 'client'));
      const clientsSnapshot = await getDocs(clientsQuery);
     
      // Fetch total employees
      const employeesQuery = query(collection(db, 'users'), where('role', '==', 'employee'));
      const employeesSnapshot = await getDocs(employeesQuery);
     
      // Fetch client heads
      const clientHeadsQuery = query(collection(db, 'users'), where('role', '==', 'client_head'));
      const clientHeadsSnapshot = await getDocs(clientHeadsQuery);
     
      // Fetch project managers
      const projectManagersQuery = query(collection(db, 'users'), where('role', '==', 'project_manager'));
      const projectManagersSnapshot = await getDocs(projectManagersQuery);
     
      // Fetch total projects
      const projectsQuery = query(collection(db, 'projects'));
      const projectsSnapshot = await getDocs(projectsQuery);
     
      // Fetch total tickets
      const ticketsQuery = query(collection(db, 'tickets'));
      const ticketsSnapshot = await getDocs(ticketsQuery);
 
      setStats({
        totalClients: clientsSnapshot.size,
        totalEmployees: employeesSnapshot.size,
        clientHeads: clientHeadsSnapshot.size,
        projectManagers: projectManagersSnapshot.size,
        totalProjects: projectsSnapshot.size,
        totalTickets: ticketsSnapshot.size
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchTicketStats = async () => {
    try {
      // Fetch tickets by status
      const statusQuery = query(collection(db, 'tickets'));
      const statusSnapshot = await getDocs(statusQuery);
      const statusData = {};
      statusSnapshot.docs.forEach(doc => {
        const status = doc.data().status;
        statusData[status] = (statusData[status] || 0) + 1;
      });

      // Fetch tickets by priority
      const priorityData = {};
      statusSnapshot.docs.forEach(doc => {
        const priority = doc.data().priority;
        priorityData[priority] = (priorityData[priority] || 0) + 1;
      });

      // Fetch recent activity
      const recentQuery = query(
        collection(db, 'tickets'),
        orderBy('created', 'desc'),
        limit(5)
      );
      const recentSnapshot = await getDocs(recentQuery);
      const recentActivity = recentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Generate tickets over time data (last 7 days)
      const ticketsOverTime = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), i);
        const count = statusSnapshot.docs.filter(doc => {
          const ticketDate = doc.data().created?.toDate();
          return ticketDate && format(ticketDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        }).length;
        return { date, count };
      }).reverse();

      setTicketStats({
        byStatus: statusData,
        byPriority: priorityData,
        recentActivity,
        ticketsOverTime
      });
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'projects'));
      setAllProjects(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };
 
  const handleNavigation = (tab) => {
    setActiveTab(tab);
    // The navigation logic is now handled by the renderContent function based on activeTab
    // No need to use navigate here for internal tab changes within Admin component
  };
 
  // Sidebar items for navigation
  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'projects', label: 'Projects', icon: FolderOpen, active: activeTab === 'projects' },
    { id: 'admintickets', label: 'Tickets', icon: Ticket, active: activeTab === 'admintickets' },
    { id: 'editTicketform', label: 'Edit Ticketform', icon: Edit2, active: activeTab === 'editTicketform' },
  ];

  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => handleNavigation(item.id)}
        className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
          item.active
            ? 'bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white shadow-lg'
            : 'text-gray-600 hover:bg-orange-100 hover:text-orange-700'
        }`}
        title={isSidebarCollapsed ? item.label : ''}
      >
        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : ''}`}>
          <IconComponent className={`w-5 h-5 ${item.active ? 'text-white' : 'text-gray-600'}`} />
        </div>
        {!isSidebarCollapsed && <span>{item.label}</span>}
      </button>
    );
  };

  // Add new user function
  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      // Ensure project is always an array of names
      let projectField = userFormData.project;
      if (projectField && !Array.isArray(projectField)) {
        projectField = [projectField];
      }
      // Map selected project names to their IDs
      const selectedProjects = allProjects.filter(p => projectField && projectField.includes(p.name));
      const projectIds = selectedProjects.map(p => p.id);
      const projectNames = selectedProjects.map(p => p.name);

      const userRef = await addDoc(collection(db, 'users'), {
        ...userFormData,
        project: projectNames, // Always store as array of names
        projects: projectIds,  // Store as array of IDs
        createdAt: new Date().toISOString(),
        status: 'active'
      });
      
      setUsers([...users, { id: userRef.id, ...userFormData, project: projectNames, projects: projectIds }]);
      setShowAddUserModal(false);
      setUserFormData({
        email: '',
        password: '',
        name: '',
        phone: '',
        company: '',
        role: 'employee',
        userType: 'employee'
      });
      showNotification('User added successfully', 'success');
    } catch (error) {
      console.error('Error adding user:', error);
      showNotification('Failed to add user', 'error');
    }
  };

  // Filter users based on search and filter
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.company?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (userFilter === 'all') return matchesSearch;
    return user.userType === userFilter && matchesSearch;
  });

  // Render users management section
  const renderUsersSection = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Manage employees and clients</p>
        </div>
        <button
          onClick={() => setShowAddUserModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white rounded-xl hover:from-[#FFB86C] hover:to-[#FFA14A] transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl"
        >
          <UserPlus className="w-5 h-5" />
          <span>Add User</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
          />
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setUserFilter('all')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 ${
              userFilter === 'all'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-orange-50'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setUserFilter('employee')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 ${
              userFilter === 'employee'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-orange-50'
            }`}
          >
            Employees
          </button>
          <button
            onClick={() => setUserFilter('client')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 ${
              userFilter === 'client'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-orange-50'
            }`}
          >
            Clients
          </button>
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  user.userType === 'client' ? 'bg-purple-100' : 'bg-orange-100'
                }`}>
                  {user.userType === 'client' ? (
                    <User className="w-6 h-6 text-purple-600" />
                  ) : (
                    <Briefcase className="w-6 h-6 text-orange-500" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{user.name || 'Unnamed User'}</h3>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                user.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {user.status || 'pending'}
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center text-gray-600">
                <Phone className="w-4 h-4 mr-2" />
                <span className="text-sm">{user.phone || 'No phone'}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Building className="w-4 h-4 mr-2" />
                <span className="text-sm">{user.company || 'No company'}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Shield className="w-4 h-4 mr-2" />
                <span className="text-sm capitalize">{user.role?.replace('_', ' ') || 'No role'}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex justify-end space-x-2">
                <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Mail className="w-4 h-4" />
                </button>
                <button className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderDashboard = () => {
    const ticketStatusData = {
      labels: Object.keys(ticketStats.byStatus),
      datasets: [
        {
          data: Object.values(ticketStats.byStatus),
          backgroundColor: [
            'rgba(34, 197, 94, 0.8)',  // Green for Open
            'rgba(59, 130, 246, 0.8)', // Blue for In Progress
            'rgba(168, 85, 247, 0.8)', // Purple for Resolved
            'rgba(107, 114, 128, 0.8)' // Gray for Closed
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(59, 130, 246)',
            'rgb(168, 85, 247)',
            'rgb(107, 114, 128)'
          ],
          borderWidth: 1
        }
      ]
    };

    const ticketPriorityData = {
      labels: Object.keys(ticketStats.byPriority),
      datasets: [
        {
          label: 'Tickets by Priority',
          data: Object.values(ticketStats.byPriority),
          backgroundColor: [
            'rgba(34, 197, 94, 0.8)',  // Green for Low
            'rgba(234, 179, 8, 0.8)',  // Yellow for Medium
            'rgba(239, 68, 68, 0.8)'   // Red for High
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(234, 179, 8)',
            'rgb(239, 68, 68)'
          ],
          borderWidth: 1
        }
      ]
    };

    const ticketsOverTimeData = {
      labels: ticketStats.ticketsOverTime.map(t => format(t.date, 'MMM d')),
      datasets: [
        {
          label: 'New Tickets',
          data: ticketStats.ticketsOverTime.map(t => t.count),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };

    const lineOptions = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Tickets Created Over Time'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    };

    return (
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Tickets</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.totalTickets}</h3>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Ticket className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500 font-medium">12% increase</span>
              <span className="text-gray-600 ml-2">from last month</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Open Tickets</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">
                  {ticketStats.byStatus['Open'] || 0}
                </h3>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <Clock className="w-4 h-4 text-yellow-500 mr-1" />
              <span className="text-gray-600">Average response time: 2.5 hours</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Resolved Tickets</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">
                  {ticketStats.byStatus['Resolved'] || 0}
                </h3>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500 font-medium">95%</span>
              <span className="text-gray-600 ml-2">resolution rate</span>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tickets Over Time Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ticket Trends</h3>
            <div className="h-[300px]">
              <Line options={lineOptions} data={ticketsOverTimeData} />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {ticketStats.recentActivity.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className={`p-2 rounded-lg ${
                    ticket.priority === 'High' ? 'bg-red-100' :
                    ticket.priority === 'Medium' ? 'bg-yellow-100' : 'bg-green-100'
                  }`}>
                    <Ticket className={`w-4 h-4 ${
                      ticket.priority === 'High' ? 'text-red-600' :
                      ticket.priority === 'Medium' ? 'text-yellow-600' : 'text-green-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {ticket.subject}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {ticket.created?.toDate
                        ? format(ticket.created.toDate(), 'MMM d, yyyy h:mm a')
                        : 'Date not available'}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    ticket.status === 'Open' ? 'bg-green-100 text-green-800' :
                    ticket.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                    ticket.status === 'Resolved' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {ticket.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'projects':
        return <Projects />;
      case 'admintickets':
        return <AdminTickets />;
      case 'editTicketform':
        return <EditTicketForm />;
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <div
          className={`bg-white border-r border-gray-200 transition-all duration-300 ${
            isSidebarCollapsed ? 'w-20' : 'w-64'
          } min-h-screen flex flex-col`}
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            {!isSidebarCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-l font-bold text-gray-900">Admin Panel</h1>
                  <p className="text-sm text-gray-500">Admin Portal</p>
                </div>
              </div>
            )}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            >
              {isSidebarCollapsed ? (
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
            {!isSidebarCollapsed && (
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Admin</p>
                  <p className="text-xs text-gray-500">Admin User</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogoutClick}
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200`}
            >
              <LogOut className="w-4 h-4" />
              {!isSidebarCollapsed && <span className="text-sm font-medium">Sign Out</span>}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronsRight className="w-6 h-6 text-gray-600" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Welcome, Admin!</h1>
                  <p className="text-gray-600">Manage your organization, projects, and tickets</p>
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

          {/* Content Area */}
          <main className="p-6">
            {renderContent()}
          </main>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Add New User</h3>
                  <p className="text-sm text-gray-600 mt-1">Create a new employee or client account</p>
                </div>
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={userFormData.name}
                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    placeholder="Enter email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    placeholder="Enter password"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={userFormData.company}
                    onChange={(e) => setUserFormData({ ...userFormData, company: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    placeholder="Enter company name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">User Type</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setUserFormData({ ...userFormData, userType: 'employee', role: 'employee' })}
                      className={`flex items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${
                        userFormData.userType === 'employee'
                          ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                          : 'border-gray-200 hover:border-orange-200'
                      }`}
                    >
                      <div className="text-center">
                        <Briefcase className="w-6 h-6 mx-auto mb-2" />
                        <span className="block text-sm font-medium">Employee</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserFormData({ ...userFormData, userType: 'client', role: 'client' })}
                      className={`flex items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${
                        userFormData.userType === 'client'
                          ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                          : 'border-gray-200 hover:border-orange-200'
                      }`}
                    >
                      <div className="text-center">
                        <User className="w-6 h-6 mx-auto mb-2" />
                        <span className="block text-sm font-medium">Client</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Role</label>
                  <div className="grid grid-cols-2 gap-4">
                    {userFormData.userType === 'employee' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setUserFormData({ ...userFormData, role: 'employee' })}
                          className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                            userFormData.role === 'employee'
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 hover:border-orange-200'
                          }`}
                        >
                          Employee
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserFormData({ ...userFormData, role: 'manager' })}
                          className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                            userFormData.role === 'manager'
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 hover:border-orange-200'
                          }`}
                        >
                          Project Manager
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setUserFormData({ ...userFormData, role: 'client' })}
                          className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                            userFormData.role === 'client'
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 hover:border-orange-200'
                          }`}
                        >
                          Client
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserFormData({ ...userFormData, role: 'head' })}
                          className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                            userFormData.role === 'head'
                              ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-gray-200 hover:border-orange-200'
                          }`}
                        >
                          Client Manager
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Projects</label>
                  <select
                    multiple
                    value={userFormData.project || []}
                    onChange={e => {
                      const options = Array.from(e.target.selectedOptions, option => option.value);
                      setUserFormData({ ...userFormData, project: options });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl"
                  >
                    {allProjects.map(proj => (
                      <option key={proj.id} value={proj.name}>{proj.name}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">Hold Ctrl (Windows) or Cmd (Mac) to select multiple projects.</span>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white rounded-xl hover:from-[#FFB86C] hover:to-[#FFA14A] transition-colors"
                  >
                    Add User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <LogoutModal open={showLogoutModal} onCancel={handleLogoutCancel} onConfirm={handleLogoutConfirm} loading={loading} />
    </div>
  );
}

export default Admin;
 