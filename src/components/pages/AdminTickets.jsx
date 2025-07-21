import { useState, useEffect, useRef } from 'react';
import {
  // Projector,
  // Edit2,
  // ChevronDown,
  // ChevronUp,
  // DownloadCloud,
  Filter,
  // Trash2,
  // Search,
  FolderKanban,
  // AlertCircle,
  // FolderOpen
} from 'lucide-react';
import { serverTimestamp, updateDoc, doc, onSnapshot, collection, query, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import TicketDetails from './TicketDetails';
import { BsTicketFill } from 'react-icons/bs';
 
function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [activeTab, setActiveTab] = useState('live');
  const [filterStatus, setFilterStatus] = useState(['All']);
  const [filterPriority, setFilterPriority] = useState(['All']);
  const [filterProject, setFilterProject] = useState(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ status: '', priority: '', category: '', subject: '', description: '' });
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const priorityDropdownRef = useRef(null);
  const projectDropdownRef = useRef(null);
 
  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'tickets')), (snapshot) => {
      const ticketList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(ticketList);
      setLoading(false);
    }, () => {
      setError('Failed to load tickets.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const projectList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projectList);
    });
    return () => unsubscribe();
  }, []);
 
  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) setStatusDropdownOpen(false);
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target)) setPriorityDropdownOpen(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target)) setProjectDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
 
  // Helper to summarize selected options
  const summarize = (arr, allLabel) => {
    if (arr.includes('All')) return allLabel;
    if (arr.length === 0) return allLabel;
    return arr.join(', ');
  };
 
  const handleTicketClick = (ticketId) => setSelectedTicketId(ticketId);
  const handleBackToTickets = () => setSelectedTicketId(null);
 
  const handleEditTicket = (ticket) => {
    setSelectedTicketId(ticket.id);
    setEditFormData({
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      subject: ticket.subject,
      description: ticket.description
    });
    setShowEditModal(true);
  };
 
  const handleDeleteTicket = async (ticketId) => {
    if (window.confirm('Are you sure you want to delete this ticket?')) {
      try {
        await deleteDoc(doc(db, 'tickets', ticketId));
        setTickets(tickets.filter(t => t.id !== ticketId));
      } catch {
        alert('Error deleting ticket.');
      }
    }
  };
 
  const handleUpdateTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicketId) return;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicketId), {
        ...editFormData,
        lastUpdated: serverTimestamp()
      });
      setShowEditModal(false);
      setSelectedTicketId(null);
    } catch {
      alert('Error updating ticket.');
    }
  };
 
  const handleCheckboxFilter = (filter, setFilter, value) => {
    if (value === 'All') {
      setFilter(['All']);
    } else {
      setFilter(prev => {
        let next = prev.includes('All') ? [] : [...prev];
        if (next.includes(value)) {
          next = next.filter(v => v !== value);
        } else {
          next.push(value);
        }
        if (next.length === 0) return ['All'];
        return next;
      });
    }
  };
 
  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus.includes('All') || filterStatus.includes(ticket.status);
    const matchesPriority = filterPriority.includes('All') || filterPriority.includes(ticket.priority);
    const projectName = projects.find(p => p.id === ticket.projectId)?.name || ticket.project || ticket.projectId;
    const matchesProject = filterProject.includes('All') || filterProject.includes(projectName);
    const matchesSearch = ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) || ticket.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPriority && matchesProject && matchesSearch;
  });
 
  const allSelected = activeTab === 'deleted' && filteredTickets.length > 0 && filteredTickets.every(t => selectedTicketIds.includes(t.id));
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTicketIds(filteredTickets.map(t => t.id));
    } else {
      setSelectedTicketIds([]);
    }
  };
  const handleSelectTicket = (ticketId, checked) => {
    setSelectedTicketIds(prev => checked ? [...prev, ticketId] : prev.filter(id => id !== ticketId));
  };
  const handleBulkDelete = async () => {
    if (window.confirm('Are you sure you want to delete all selected tickets?')) {
      for (const ticketId of selectedTicketIds) {
        await deleteDoc(doc(db, 'tickets', ticketId));
      }
      setTickets(tickets.filter(t => !selectedTicketIds.includes(t.id)));
      setSelectedTicketIds([]);
    }
  };
 
  // Ticket counts for cards
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => t.status === 'Open').length;
  const inProgressTickets = tickets.filter(t => t.status === 'In Progress').length;
  const resolvedTickets = tickets.filter(t => t.status === 'Resolved').length;
  const closedTickets = tickets.filter(t => t.status === 'Closed').length;
 
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tickets...</p>
        </div>
      </div>
    );
  }
 
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }
 
  if (selectedTicketId && !showEditModal) {
    return <TicketDetails ticketId={selectedTicketId} onBack={handleBackToTickets} onAssign={() => {}} />;
  }
 
  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BsTicketFill className="mr-3 text-orange-500" /> Tickets
        </h1>
          {/* Ticket Stats Cards */}
          <div className="flex gap-2">
            <div className="bg-white rounded-lg shadow border border-gray-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-gray-500">Total</span>
              <span className="text-lg font-bold text-gray-900">{totalTickets}</span>
            </div>
            <div className="bg-orange-50 rounded-lg shadow border border-orange-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-orange-600">Open</span>
              <span className="text-lg font-bold text-orange-700">{openTickets}</span>
            </div>
            <div className="bg-yellow-50 rounded-lg shadow border border-yellow-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-yellow-600">In Progress</span>
              <span className="text-lg font-bold text-yellow-700">{inProgressTickets}</span>
            </div>
            <div className="bg-green-50 rounded-lg shadow border border-green-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-green-600">Resolved</span>
              <span className="text-lg font-bold text-green-700">{resolvedTickets}</span>
            </div>
            <div className="bg-gray-50 rounded-lg shadow border border-gray-200 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-gray-600">Closed</span>
              <span className="text-lg font-bold text-gray-700">{closedTickets}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => {
                setActiveTab('live');
                setFiltersApplied(false);
                setFilterProject(['All']);
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'live'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Live Tickets
            </button>
          </nav>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow border border-gray-100">
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Project</label>
          <div className="relative" ref={projectDropdownRef}>
            <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px] text-left" onClick={() => setProjectDropdownOpen(v => !v)}>
              {summarize(filterProject, 'All')}
            </button>
            {projectDropdownOpen && (
              <div className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 p-2 min-w-[180px]">
                <label className="flex items-center text-sm">
                  <input type="checkbox" checked={filterProject.includes('All')} onChange={() => handleCheckboxFilter(filterProject, setFilterProject, 'All')} /> All
                </label>
                {projects.map(project => (
                  <label key={project.id} className="flex items-center text-sm">
                    <input type="checkbox" checked={filterProject.includes(project.name)} onChange={() => handleCheckboxFilter(filterProject, setFilterProject, project.name)} /> {project.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Status</label>
          <div className="relative" ref={statusDropdownRef}>
            <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px] text-left" onClick={() => setStatusDropdownOpen(v => !v)}>
              {summarize(filterStatus, 'All', ['Open', 'In Progress', 'Resolved', 'Closed'])}
            </button>
            {statusDropdownOpen && (
              <div className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 p-2 min-w-[180px]">
                <label className="flex items-center text-sm">
                  <input type="checkbox" checked={filterStatus.includes('All')} onChange={() => handleCheckboxFilter(filterStatus, setFilterStatus, 'All')} /> All
                </label>
                {['Open', 'In Progress', 'Resolved', 'Closed'].map(status => (
                  <label key={status} className="flex items-center text-sm">
                    <input type="checkbox" checked={filterStatus.includes(status)} onChange={() => handleCheckboxFilter(filterStatus, setFilterStatus, status)} /> {status}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Priority</label>
          <div className="relative" ref={priorityDropdownRef}>
            <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px] text-left" onClick={() => setPriorityDropdownOpen(v => !v)}>
              {summarize(filterPriority, 'All', ['High', 'Medium', 'Low'])}
            </button>
            {priorityDropdownOpen && (
              <div className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 p-2 min-w-[180px]">
                <label className="flex items-center text-sm">
                  <input type="checkbox" checked={filterPriority.includes('All')} onChange={() => handleCheckboxFilter(filterPriority, setFilterPriority, 'All')} /> All
                </label>
                {['High', 'Medium', 'Low'].map(priority => (
                  <label key={priority} className="flex items-center text-sm">
                    <input type="checkbox" checked={filterPriority.includes(priority)} onChange={() => handleCheckboxFilter(filterPriority, setFilterPriority, priority)} /> {priority}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search by subject or ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50"
          />
        </div>
        <button
          onClick={() => setFiltersApplied(true)}
          className={`px-4 py-2 text-white rounded-lg transition-colors ${
            activeTab === 'live'
              ? 'bg-orange-600 hover:bg-orange-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          Go
        </button>
        <button
          onClick={() => {
            setFilterStatus(['All']);
            setFilterPriority(['All']);
            setFilterProject(['All']);
            setSearchTerm('');
            setFiltersApplied(false);
          }}
          className="text-xs text-orange-600 hover:underline px-2 py-1 rounded"
        >
          Clear Filters
        </button>
      </div>
      {filtersApplied && filteredTickets.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => handleTicketClick(ticket.id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ticket.ticketNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.subject}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        ticket.status === 'Open' ? 'bg-orange-100 text-orange-800' :
                        ticket.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                        ticket.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.priority}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.assignedTo?.email || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTimestamp(ticket.lastUpdated)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        className="text-orange-600 hover:underline mr-2"
                        onClick={e => { e.stopPropagation(); handleEditTicket(ticket); }}
                      >Edit</button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={e => { e.stopPropagation(); handleDeleteTicket(ticket.id); }}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtersApplied ? (
        <div className="text-center text-gray-500 py-12">
          No live tickets found.
        </div>
      ) : (
        <div className="text-center text-gray-500 py-12">
          Set filters and click "Go" to view live tickets.
        </div>
      )}
      {showEditModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Edit Ticket</h2>
            <form onSubmit={handleUpdateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editFormData.status}
                  onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={editFormData.priority}
                  onChange={e => setEditFormData({ ...editFormData, priority: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={editFormData.category}
                  onChange={e => setEditFormData({ ...editFormData, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={editFormData.subject}
                  onChange={e => setEditFormData({ ...editFormData, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editFormData.description}
                  onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 break-words resize-y max-w-full overflow-x-hidden"
                  style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '100%', overflowX: 'hidden' }}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
 
export default AdminTickets;
 
function formatTimestamp(ts) {
  if (!ts) return '';
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  return '';
}
 