console.log("TeamManagement component file loaded");
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  Mail,
  Phone,
  Calendar,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import 'react-responsive-modal/styles.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
 
// Utility to compute KPI metrics from ticket data
function computeKPIsForTickets(tickets, employeeEmail) {
  let totalResponse = 0, totalResolution = 0, count = 0;
  const details = tickets.map(ticket => {
    // Find created time
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    // Find assignment time (first comment with 'Assigned to <name>' and authorRole 'user' or 'system')
    let assigned = null;
    let resolved = null;
    if (ticket.comments && Array.isArray(ticket.comments)) {
      for (const c of ticket.comments) {
        if (!assigned && c.message && c.message.toLowerCase().includes('assigned to') && c.authorRole && (c.authorRole === 'user' || c.authorRole === 'system')) {
          assigned = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
        if (!resolved && c.message && c.message.toLowerCase().includes('resolution updated') && c.authorRole && c.authorRole === 'resolver') {
          resolved = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
      }
    }
    // Fallback: if ticket.status is Resolved and lastUpdated exists
    if (!resolved && ticket.status === 'Resolved' && ticket.lastUpdated) {
      resolved = ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate() : new Date(ticket.lastUpdated);
    }
    // Only count if assigned to this employee
    if (ticket.assignedTo && ticket.assignedTo.email === employeeEmail) {
      count++;
      let responseTime = assigned && created ? (assigned - created) : null;
      let resolutionTime = resolved && assigned ? (resolved - assigned) : null;
      if (responseTime) totalResponse += responseTime;
      if (resolutionTime) totalResolution += resolutionTime;
      return {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        responseTime,
        resolutionTime,
        status: ticket.status,
        created,
        assigned,
        resolved
      };
    }
    return null;
  }).filter(Boolean);
  return {
    count,
    avgResponse: count ? totalResponse / count : 0,
    avgResolution: count ? totalResolution / count : 0,
    details
  };
}
 
// Utility to convert KPI data to CSV and trigger download
function downloadKpiCsv(kpiData, member) {
  if (!kpiData || !kpiData.details) return;
  const header = ['Ticket #','Subject','Response Time (min)','Resolution Time (min)','Status'];
  const rows = kpiData.details.map(row => [
    row.ticketNumber,
    row.subject,
    row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
    row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
    row.status
  ]);
  const csvContent = [header, ...rows].map(r => r.map(x => '"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KPI_Report_${member?.firstName||''}_${member?.lastName||''}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
 
const TeamManagement = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [allTeamMembers, setAllTeamMembers] = useState([]); // Store all employees for 'All Projects'
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [selectedRole, setSelectedRole] = useState('All');
  const [projects, setProjects] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiData, setKpiData] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [dashboardEmployee, setDashboardEmployee] = useState(null);
 
  const auth = getAuth();
  const db = getFirestore();
 
  useEffect(() => {
    const fetchTeamMembers = async () => {
      // Fetch all users with role 'employee' or 'project_manager' for 'All Projects'
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const usersRef = collection(db, 'users');
        const teamQuery = query(
          usersRef,
          where('role', 'in', ['employee', 'project_manager'])
        );
        const teamSnapshot = await getDocs(teamQuery);
        const teamData = teamSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTeamMembers(teamData);
        setAllTeamMembers(teamData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching team members:', error);
        setLoading(false);
      }
    };
    fetchTeamMembers();
    // Fetch current user role
    const fetchCurrentUserRole = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUserRole(userDocSnap.data().role);
        }
      }
    };
    fetchCurrentUserRole();
 
    // Fetch projects from Firestore
    const fetchProjects = async () => {
      try {
        const projectsRef = collection(db, 'projects');
        const projectsSnapshot = await getDocs(projectsRef);
        const allProjectsData = projectsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // If current user is a project manager, only show projects where they are a manager
        const currentUser = auth.currentUser;
        let filteredProjects = allProjectsData;
        if (currentUserRole === 'project_manager' && currentUser) {
          filteredProjects = allProjectsData.filter(project =>
            (project.members || []).some(
              m => m.email === currentUser.email && m.role === 'project_manager'
            )
          );
        }
        setProjects(filteredProjects);
      } catch (error) {
        console.error('Error fetching projects:', error);
      }
    };
    fetchProjects();
  }, [auth, db]);
 
  // Effect to fetch project members when selectedProject changes
  useEffect(() => {
    const fetchProjectMembers = async () => {
      if (selectedProject === 'All') {
        setTeamMembers(allTeamMembers);
        return;
      }
      try {
        const projectDocRef = doc(db, 'projects', selectedProject);
        const projectDocSnap = await getDoc(projectDocRef);
        if (projectDocSnap.exists()) {
          const projectData = projectDocSnap.data();
          // Get current user info
          const currentUser = auth.currentUser;
          if (!currentUser) {
            setTeamMembers([]);
            return;
          }
          // Check if current user is a project manager in this project
          const isManagerInProject = (projectData.members || []).some(
            m => m.email === currentUser.email && m.role === 'project_manager'
          );
          if (!isManagerInProject && currentUserRole === 'project_manager') {
            // Not a manager in this project, show nothing
            setTeamMembers([]);
            return;
          }
          // Only show members with role 'employee' or 'project_manager'
          const filteredMembers = (projectData.members || []).filter(m => m.role === 'employee' || m.role === 'project_manager');
          setTeamMembers(filteredMembers);
        } else {
          setTeamMembers([]);
        }
      } catch (error) {
        console.error('Error fetching project members:', error);
        setTeamMembers([]);
      }
    };
    fetchProjectMembers();
  }, [selectedProject, allTeamMembers, db, auth, currentUserRole]);
 
  // Update filteredTeamMembers to just filter by search and role (not project)
  const filteredTeamMembers = teamMembers.filter(member => {
    const matchesSearch =
      `${member.firstName ? member.firstName : ''} ${member.lastName ? member.lastName : ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'All' || member.role === selectedRole;
    return matchesSearch && matchesRole;
  });
 
  // Debug log before rendering grid
  console.log("Rendering TeamManagement, filteredTeamMembers:", filteredTeamMembers);
 
  // Handler for employee card click
  const handleEmployeeClick = async (member) => {
    if (currentUserRole !== 'project_manager') {
      alert('Access denied: Only project managers can view detailed KPIs.');
      return;
    }
    setDashboardEmployee(null);
    setKpiLoading(true);
    // Fetch tickets assigned to this member
    const ticketsRef = collection(db, 'tickets');
    const q = query(ticketsRef, where('assignedTo.email', '==', member.email));
    const snapshot = await getDocs(q);
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Compute KPIs
    const kpi = computeKPIsForTickets(tickets, member.email);
    setKpiData(kpi);
    setKpiLoading(false);
    setDashboardEmployee(member);
  };
 
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }
 
  return (
    <div className="space-y-6">
      {dashboardEmployee ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 relative">
          <button
            className="absolute top-4 left-4 text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-3 py-1"
            onClick={() => setDashboardEmployee(null)}
            aria-label="Back"
          >
            ← Back
          </button>
          <h2 className="text-2xl font-bold mb-4 text-center">KPI Report for {dashboardEmployee?.firstName} {dashboardEmployee?.lastName}</h2>
          {kpiLoading ? (
            <div className="flex items-center justify-center p-8"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>
          ) : kpiData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-gray-500 text-sm">Total Tickets</div>
                  <div className="text-2xl font-bold">{kpiData.count}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-gray-500 text-sm">Avg. Response (min)</div>
                  <div className="text-2xl font-bold">{kpiData.avgResponse ? (kpiData.avgResponse/1000/60).toFixed(2) : 'N/A'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-gray-500 text-sm">Avg. Resolution (min)</div>
                  <div className="text-2xl font-bold">{kpiData.avgResolution ? (kpiData.avgResolution/1000/60).toFixed(2) : 'N/A'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-gray-500 text-sm">Resolution %</div>
                  <div className="text-2xl font-bold">{kpiData.details && kpiData.details.length ? ((kpiData.details.filter(row => row.status === 'Resolved').length / kpiData.details.length) * 100).toFixed(1) : '0.0'}%</div>
                </div>
              </div>
              {/* KPI Bar Chart */}
              <div className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm">
                <h3 className="text-lg font-semibold mb-2">KPI Bar Chart</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={kpiData.details.map(row => ({
                    name: row.ticketNumber,
                    'Response Time (min)': row.responseTime ? (row.responseTime/1000/60) : 0,
                    'Resolution Time (min)': row.resolutionTime ? (row.resolutionTime/1000/60) : 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Response Time (min)" fill="#8884d8" />
                    <Bar dataKey="Resolution Time (min)" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Table and Export Button */}
              <table className="min-w-full text-xs text-left text-gray-700 border mb-8">
                <thead>
                  <tr>
                    <th className="py-1 px-2">Ticket #</th>
                    <th className="py-1 px-2">Subject</th>
                    <th className="py-1 px-2">Response Time</th>
                    <th className="py-1 px-2">Resolution Time</th>
                    <th className="py-1 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiData.details.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-1 px-2">{row.ticketNumber}</td>
                      <td className="py-1 px-2">{row.subject}</td>
                      <td className="py-1 px-2">{row.responseTime ? (row.responseTime/1000/60).toFixed(2) + ' min' : 'N/A'}</td>
                      <td className="py-1 px-2">{row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) + ' min' : 'N/A'}</td>
                      <td className="py-1 px-2">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="mb-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold"
                onClick={() => downloadKpiCsv(kpiData, dashboardEmployee)}
              >
                Download CSV
              </button>
            </>
          ) : <div>No KPI data found.</div>}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search team members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
 
              {/* Project Filter */}
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="All">All Projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
 
              {/* Role Filter */}
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="All">All Roles</option>
                <option value="employee">Employee</option>
                <option value="project_manager">Project Manager</option>
              </select>
 
              {/* Clear Filters */}
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedProject('All');
                  setSelectedRole('All');
                }}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Filter className="w-5 h-5 mr-2" />
                Clear Filters
              </button>
            </div>
          </div>
          {/* Team Members Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeamMembers.map((member) => {
              console.log("Rendering tile for", member);
              return (
                <button
                  key={member.id}
                  type="button"
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer text-left w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={() => handleEmployeeClick(member)}
                  style={{ appearance: 'none' }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-medium text-lg">
                        {member.firstName?.[0]}{member.lastName?.[0]}
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {member.firstName} {member.lastName}
                        </h3>
                        <p className="text-sm text-gray-500">{member.role}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {member.status || 'Active'}
                    </span>
                  </div>
 
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center text-sm text-gray-500">
                      <Mail className="w-4 h-4 mr-2" />
                      {member.email}
                    </div>
                    {member.phone && (
                      <div className="flex items-center text-sm text-gray-500">
                        <Phone className="w-4 h-4 mr-2" />
                        {member.phone}
                      </div>
                    )}
                   
                    {member.joinDate && (
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="w-4 h-4 mr-2" />
                        Joined {new Date(member.joinDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
 
                 
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
 
export default TeamManagement;