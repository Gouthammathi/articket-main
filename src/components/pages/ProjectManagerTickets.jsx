import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { Link, useNavigate } from 'react-router-dom';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';
import TicketDetails from './TicketDetails';
import { sendEmail } from '../../utils/sendEmail';
import { fetchProjectMemberEmails } from '../../utils/emailUtils';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
 
// Helper to safely format timestamps
function formatTimestamp(ts) {
  if (!ts) return '';
  if (typeof ts === 'string') {
    return new Date(ts).toLocaleString();
  }
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString();
  }
  return '';
}
 
const ProjectManagerTickets = ({ setActiveTab, selectedProjectId, selectedProjectName, allProjectIds = [], setViewingTicket }) => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState(['All']);
  const [filterPriority, setFilterPriority] = useState(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for Newest, 'asc' for Oldest
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const priorityDropdownRef = useRef(null);
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [quickDate, setQuickDate] = useState('');
 
  useEffect(() => {
    // Guard: skip effect if required props are missing
    if (!selectedProjectName || selectedProjectName.trim() === '' || !selectedProjectId || selectedProjectId.trim() === '') {
      console.warn('selectedProjectName or selectedProjectId is empty or undefined, skipping Firestore queries.', { selectedProjectName, selectedProjectId });
      setLoading(false);
      setTicketsData([]);
      setEmployees([]);
      setClients([]);
      return;
    }
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        console.log('User authenticated in ProjectManagerTickets.jsx', user.email);
        setLoading(true);
        setCurrentUserEmail(user.email);
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUserData(userDocSnap.data());
        }
 
        try {
          const filterData = sessionStorage.getItem('ticketFilter');
          if (filterData) {
            const parsedFilter = JSON.parse(filterData);
            setFilterStatus(parsedFilter.status);
            setFilterPriority(parsedFilter.priority);
            sessionStorage.removeItem('ticketFilter');
          }
        } catch (err) {
          console.error('Error parsing filter data:', err);
        }
 
        // Fetch project members from projects collection (like ClientHeadTickets)
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('name', '==', selectedProjectName));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const projectDoc = snapshot.docs[0].data();
          const members = projectDoc.members || [];
          setEmployees(members.filter(m => m.role === 'employee' || m.role === 'project_manager'));
          setClients(members.filter(m => m.role === 'client' || m.role === 'client_head'));
        } else {
          setEmployees([]);
          setClients([]);
        }
 
        // Set up real-time listener for tickets
        const ticketsCollectionRef = collection(db, 'tickets');
        if (selectedProjectId === 'all' && allProjectIds.length > 0) {
          // Firestore 'in' query limit is 10, so batch if needed
          setTicketsData([]); // Clear before accumulating
          let unsubscribes = [];
          const batchSize = 10;
          for (let i = 0; i < allProjectIds.length; i += batchSize) {
            const batchIds = allProjectIds.slice(i, i + batchSize);
            const q = query(
              ticketsCollectionRef,
              where('projectId', 'in', batchIds)
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
              const tickets = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              // Accumulate tickets from all batches
              setTicketsData(prev => {
                // Remove any tickets from this batch, then add new
                const filtered = prev.filter(t => !batchIds.includes(t.projectId));
                // Avoid duplicates by id
                const ids = new Set(filtered.map(t => t.id));
                const merged = [...filtered, ...tickets.filter(t => !ids.has(t.id))];
                return merged;
              });
              setLoading(false);
            }, (err) => {
              setError('Failed to load tickets for your projects.');
              setLoading(false);
            });
            unsubscribes.push(unsubscribe);
          }
          return () => unsubscribes.forEach(unsub => unsub());
        } else {
          // Listen for both string and array 'project' fields
          const qString = query(ticketsCollectionRef, where('project', '==', selectedProjectName));
          const qArray = query(ticketsCollectionRef, where('project', 'array-contains', selectedProjectName));

          let allTickets = [];
          let unsubString, unsubArray;

          unsubString = onSnapshot(qString, (snapshot) => {
            const stringTickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allTickets = [...stringTickets, ...(allTickets.filter(t => !stringTickets.some(s => s.id === t.id)))];
            setTicketsData(Array.from(new Map(allTickets.map(t => [t.id, t])).values()));
            setLoading(false);
          }, (err) => {
            setError('Failed to load tickets for your project.');
            setLoading(false);
          });

          unsubArray = onSnapshot(qArray, (snapshot) => {
            const arrayTickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allTickets = [...arrayTickets, ...(allTickets.filter(t => !arrayTickets.some(a => a.id === t.id)))];
            setTicketsData(Array.from(new Map(allTickets.map(t => [t.id, t])).values()));
            setLoading(false);
          }, (err) => {
            setError('Failed to load tickets for your project.');
            setLoading(false);
          });

          return () => {
            unsubString && unsubString();
            unsubArray && unsubArray();
          };
        }
      } else {
        console.log('No user authenticated in ProjectManagerTickets.jsx');
        setLoading(false);
        setTicketsData([]);
        setTeamMembers([]);
      }
    });
 
    return () => unsubscribeAuth();
  }, [selectedProjectId, selectedProjectName, allProjectIds]);
 
  useEffect(() => {
    function handleClickOutside(event) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) setStatusDropdownOpen(false);
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target)) setPriorityDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
 
  const summarize = (arr, allLabel, options) => {
    if (arr.includes('All')) return allLabel;
    if (arr.length === 0) return allLabel;
    return arr.join(', ');
  };
 
  const handleTicketClick = (ticketId) => {
    setSelectedTicketId(ticketId);
    if (setViewingTicket) setViewingTicket(true);
  };
 
  const handleBackToTickets = () => {
    setSelectedTicketId(null);
    if (setViewingTicket) setViewingTicket(false);
  };
 
  const handleAssignTicket = async (ticketId, selectedUserEmail) => {
    const ticket = ticketsData.find(t => t.id === ticketId);
    if (!ticketId || !auth.currentUser || !selectedUserEmail || !ticket) return;

    const ticketRef = doc(db, 'tickets', ticketId);
    let assignee = employees.find(emp => emp.email === selectedUserEmail) || clients.find(c => c.email === selectedUserEmail);
    if (!assignee && selectedUserEmail === currentUserEmail) {
      // Assign to self if not in employees/clients list
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        let name = '';
        if (data.firstName && data.lastName) {
          name = `${data.firstName} ${data.lastName}`.trim();
        } else if (data.firstName) {
          name = data.firstName;
        } else if (data.lastName) {
          name = data.lastName;
        } else {
          name = data.email.split('@')[0];
        }
        assignee = {
          name,
          email: data.email
        };
      } else {
        assignee = {
          name: currentUserEmail.split('@')[0],
          email: currentUserEmail
        };
      }
    }
    if (!assignee) return;
    const assignerUsername = currentUserEmail.split('@')[0];

    await updateDoc(ticketRef, {
      assignedTo: { name: assignee.name || assignee.email || 'Unknown', email: assignee.email },
      assignedBy: assignerUsername,
      status: 'In Progress',
      lastUpdated: serverTimestamp()
    });

    const response = {
      message: `Ticket assigned to ${assignee.name} by ${assignerUsername}.`,
      timestamp: new Date().toISOString(),
      authorEmail: 'system',
      authorRole: 'system',
    };
    await updateDoc(ticketRef, {
      customerResponses: arrayUnion(response)
    });

    // Fetch the user object for reportedBy or ticket.email to get the correct recipient name
    let recipientEmail = ticket.reportedBy || ticket.email;
    let recipientName = recipientEmail;
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', recipientEmail));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        recipientName = (userData.firstName && userData.lastName)
          ? `${userData.firstName} ${userData.lastName}`.trim()
          : (userData.firstName || userData.lastName || userData.email);
      }
    } catch (e) { /* fallback to email */ }

    const emailParams = {
      to_email: recipientEmail,
      to_name: recipientName,
      subject: ticket.subject,
      ticket_number: ticket.ticketNumber,
      assigned_to: assignee.name || assignee.email || 'Unknown',
      project: selectedProjectName,
      category: ticket.category,
      priority: ticket.priority,
      ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
    };
    await sendEmail(emailParams, 'template_igl3oxn');
  };
 
  // Add this function to allow unassigning a ticket
  const handleUnassignTicket = async (ticketId) => {
    if (!ticketId || !auth.currentUser) return;
    const ticketRef = doc(db, 'tickets', ticketId);
    try {
      await updateDoc(ticketRef, {
        assignedTo: null,
        assignedBy: null,
        lastUpdated: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error unassigning ticket:', err);
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
 
  // Date filter logic
  const applyQuickDate = (type) => {
    setQuickDate(type);
    let from = '';
    let to = '';
    const now = dayjs();
    if (type === 'this_month') {
      from = now.startOf('month').format('YYYY-MM-DD');
      to = now.endOf('month').format('YYYY-MM-DD');
    } else if (type === 'this_week') {
      from = now.startOf('week').format('YYYY-MM-DD');
      to = now.endOf('week').format('YYYY-MM-DD');
    } else if (type === 'last_2_days') {
      from = now.subtract(2, 'day').format('YYYY-MM-DD');
      to = now.format('YYYY-MM-DD');
    }
    setDateFrom(from);
    setDateTo(to);
  };
  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    setQuickDate('');
  };
 
  // Compute filtered tickets
  const filteredTickets = ticketsData.filter(ticket => {
    const matchesStatus = filterStatus.includes('All') || filterStatus.includes(ticket.status);
    const matchesPriority = filterPriority.includes('All') || filterPriority.includes(ticket.priority);
    const matchesSearch =
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    // Raised By filters (match ClientTickets/ClientHeadTickets logic)
    let matchesRaisedBy = true;
    if (filterRaisedByEmployee === 'all' && filterRaisedByClient === 'all') {
      matchesRaisedBy = true;
    } else if (filterRaisedByEmployee !== 'all') {
      if (filterRaisedByEmployee === 'me') {
        matchesRaisedBy = ticket.email === currentUserEmail;
      } else if (filterRaisedByEmployee === 'any') {
        matchesRaisedBy = employees.some(emp => emp.email === ticket.email);
      } else {
        matchesRaisedBy = ticket.email === filterRaisedByEmployee;
      }
    } else if (filterRaisedByClient !== 'all') {
      if (filterRaisedByClient === 'me') {
        matchesRaisedBy = ticket.email === currentUserEmail;
      } else if (filterRaisedByClient === 'any') {
        matchesRaisedBy = clients.some(client => client.email === ticket.email);
      } else {
        matchesRaisedBy = ticket.email === filterRaisedByClient;
      }
    }

    // Date filter
    let matchesDate = true;
    if (dateFrom) {
      const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
      if (!created || dayjs(created).isBefore(dayjs(dateFrom), 'day')) matchesDate = false;
    }
    if (dateTo) {
      const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
      if (!created || dayjs(created).isAfter(dayjs(dateTo), 'day')) matchesDate = false;
    }

    return matchesStatus && matchesPriority && matchesSearch && matchesRaisedBy && matchesDate;
  });
 
  // Sort tickets by date
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
    const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });
 
  // Ticket counts for cards
  const totalTickets = ticketsData.length;
  const openTickets = ticketsData.filter(t => t.status === 'Open').length;
  const inProgressTickets = ticketsData.filter(t => t.status === 'In Progress').length;
  const resolvedTickets = ticketsData.filter(t => t.status === 'Resolved').length;
  const closedTickets = ticketsData.filter(t => t.status === 'Closed').length;
 
  function calculateTimes(ticket) {
    let responseTime = '';
    let resolutionTime = '';
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    let assigned = null;
    let resolved = null;
    if (ticket.customerResponses && Array.isArray(ticket.customerResponses)) {
      for (const c of ticket.customerResponses) {
        if (!assigned && c.message && /assigned to/i.test(c.message)) {
          assigned = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
        if (!resolved && c.message && /resolution updated/i.test(c.message)) {
          resolved = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
      }
    }
    // Fallback: if status is Resolved and lastUpdated exists
    if (!resolved && ticket.status === 'Resolved' && ticket.lastUpdated) {
      resolved = ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate() : new Date(ticket.lastUpdated);
    }
    if (created && assigned) responseTime = ((assigned - created) / 60000).toFixed(2);
    if (assigned && resolved) resolutionTime = ((resolved - assigned) / 60000).toFixed(2);
    return { responseTime, resolutionTime };
  }
 
  function safeCellValue(val) {
    if (typeof val === 'string') return val.length > 10000 ? val.slice(0, 10000) + '... [truncated]' : val;
    if (Array.isArray(val)) return `[${val.length} items]`;
    if (typeof val === 'object' && val !== null) return '[object]';
    return val ?? '';
  }
 
  function summarizeResponses(responses) {
    if (!Array.isArray(responses) || responses.length === 0) return '';
    // Summarize as count and first/last message
    const first = responses[0]?.message ? responses[0].message.slice(0, 100) : '';
    const last = responses[responses.length - 1]?.message ? responses[responses.length - 1].message.slice(0, 100) : '';
    if (responses.length === 1) return first;
    return `(${responses.length} msgs) First: ${first} | Last: ${last}`;
  }

  function getField(ticket, variants) {
    for (const v of variants) {
      if (ticket[v] !== undefined && ticket[v] !== null && ticket[v] !== '') return ticket[v];
    }
    return '';
  }

  function formatAssignedTo(assignedTo) {
    if (!assignedTo) return '';
    if (typeof assignedTo === 'string') return assignedTo;
    if (typeof assignedTo === 'object') {
      return assignedTo.name || assignedTo.email || JSON.stringify(assignedTo);
    }
    return '';
  }

  function downloadTicketsAsExcel(tickets) {
    if (!tickets || tickets.length === 0) return;
    // Define the export columns and their field mappings
    const exportColumns = [
      { label: 'Ticket Number', key: ['ticketNumber', 'id'] },
      { label: 'Subject', key: ['subject'] },
      { label: 'Module', key: ['module', 'Module'] },
      { label: 'Type of Issue', key: ['typeOfIssue', 'type', 'issueType'] },
      { label: 'Category', key: ['category', 'Category'] },
      { label: 'Sub-Category', key: ['subCategory', 'sub_category', 'subCategoryName'] },
      { label: 'Status', key: ['status'] },
      { label: 'Priority', key: ['priority'] },
      { label: 'Assigned To', key: ['assignedTo'] },
      { label: 'Assigned By', key: ['assignedBy'] },
      { label: 'Created By', key: ['customer', 'createdBy', 'email'] },
      { label: 'Reported By', key: ['reportedBy'] },
      { label: 'Last Updated', key: ['lastUpdated'] },
      { label: 'Customer Responses', key: ['customerResponses'] },
      { label: 'Employee Responses', key: ['employeeResponses'] },
      { label: 'Response Time (min)', key: [] },
      { label: 'Resolution Time (min)', key: [] },
    ];
    const rows = tickets.map(ticket => {
      const times = calculateTimes(ticket);
      return exportColumns.map(col => {
        if (col.label === 'Assigned To') {
          return formatAssignedTo(getField(ticket, col.key));
        }
        if (col.label === 'Last Updated') {
          const val = getField(ticket, col.key);
          return formatTimestamp(val);
        }
        if (col.label === 'Customer Responses') {
          return summarizeResponses(ticket.customerResponses);
        }
        if (col.label === 'Employee Responses') {
          return summarizeResponses(ticket.employeeResponses);
        }
        if (col.label === 'Response Time (min)') {
          return times.responseTime;
        }
        if (col.label === 'Resolution Time (min)') {
          return times.resolutionTime;
        }
        // Truncate large fields
        let val = getField(ticket, col.key);
        if (typeof val === 'string' && val.length > 10000) val = val.slice(0, 10000) + '... [truncated]';
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        return val ?? '';
      });
    });
    // Add header row
    rows.unshift(exportColumns.map(col => col.label));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    XLSX.writeFile(wb, 'tickets_export.xlsx');
  }
 
  // Add handler for checkbox
  const handleCheckboxChange = (ticketId) => {
    setSelectedTicketIds(prev =>
      prev.includes(ticketId) ? prev.filter(id => id !== ticketId) : [...prev, ticketId]
    );
  };
 
  // Add handler for select all
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedTicketIds(sortedTickets.map(t => t.id));
    } else {
      setSelectedTicketIds([]);
    }
  };
 
  const clearFilters = () => {
    setFilterStatus(['All']);
    setFilterPriority(['All']);
    setFilterRaisedByEmployee('all');
    setFilterRaisedByClient('all');
    setSearchTerm('');
    setFiltersApplied(false);
    setDateFrom('');
    setDateTo('');
    setQuickDate('');
  };
 
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
 
  if (selectedTicketId) {
    return <TicketDetails ticketId={selectedTicketId} onBack={handleBackToTickets} onAssign={handleAssignTicket} />;
  }
 
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="flex items-center gap-4 w-full">
          <div className="bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-xl px-6 py-4 flex items-center w-full shadow">
            <h1 className="text-3xl font-bold text-white flex items-center">
              <BsTicketFill className="mr-3 text-white" /> Tickets
            </h1>
            {/* Ticket Stats Cards */}
            <div className="flex gap-2 ml-8">
              <div className="bg-white bg-opacity-80 rounded-lg shadow border border-gray-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
                <span className="text-xs text-gray-700">Total</span>
                <span className="text-lg font-bold text-gray-900">{totalTickets}</span>
              </div>
              <div className="bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-lg shadow border border-orange-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
                <span className="text-xs text-white">Open</span>
                <span className="text-lg font-bold text-white">{openTickets}</span>
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
        {/* {selectedProjectName && (
          <p className="text-gray-700 mt-2">Project: {selectedProjectId === 'all' ? 'All Projects' : selectedProjectName}</p>
        )} */}
      </div>
 
      <div className="flex justify-between items-center mb-8">
        <div>
          <button
            onClick={() => setActiveTab('create')}
            className="bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] hover:from-[#FFB86C] hover:to-[#FFA14A] text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center font-semibold shadow"
          >
            <BsFolderFill className="mr-2 text-white" />
            Create New Ticket
          </button>
        </div>
      </div>
 
      {/* Updated Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow border border-gray-100">
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
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Raised By Employee</label>
          <select
            value={filterRaisedByEmployee}
            onChange={e => {
              setFilterRaisedByEmployee(e.target.value);
              setFilterRaisedByClient('all');
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[140px] text-black"
          >
            <option value="all">All Employees</option>
            <option value="me">Me</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.id} className="text-black">
                {employee.displayName || employee.name || employee.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Raised By Client</label>
          <select
            value={filterRaisedByClient}
            onChange={e => {
              setFilterRaisedByClient(e.target.value);
              setFilterRaisedByEmployee('all');
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[140px] text-black"
          >
            <option value="all">All Clients</option>
            {clients.map(client => (
              <option key={client.id} value={client.id} className="text-black">
                {client.displayName || client.name || client.email}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search by subject or ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Sort by Date</label>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setQuickDate(''); }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setQuickDate(''); }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Quick Date</label>
          <select
            value={quickDate}
            onChange={e => applyQuickDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
          >
            <option value="">Select...</option>
            <option value="this_month">This Month</option>
            <option value="this_week">This Week</option>
            <option value="last_2_days">Last 2 Days</option>
          </select>
        </div>
        <button
          onClick={() => setFiltersApplied(true)}
          className="bg-orange-400 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold ml-2"
          type="button"
        >
          Search
        </button>
        <button
          onClick={clearFilters}
          className="ml-auto text-xs text-orange-600 hover:underline px-2 py-1 rounded"
          type="button"
        >
          Clear Filters
        </button>
        <button
          onClick={() => downloadTicketsAsExcel(sortedTickets.filter(t => selectedTicketIds.includes(t.id)))}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold"
          disabled={selectedTicketIds.length === 0}
        >
          Download
        </button>
      </div>
 
      {/* Only show tickets if filtersApplied is true */}
      {filtersApplied && sortedTickets.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedTicketIds.length === sortedTickets.length}
                      onChange={e => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ticket ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Raised By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reported By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    -
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={e => {
                      // Prevent row click if checkbox is clicked
                      if (e.target.type !== 'checkbox') handleTicketClick(ticket.id);
                    }}
                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-2 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.includes(ticket.id)}
                        onChange={() => handleCheckboxChange(ticket.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.subject}
                    </td>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.priority}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.customer}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.reportedBy || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.assignedBy || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(ticket.lastUpdated)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtersApplied ? (
        <div className="text-gray-400 text-center py-12">No tickets found for selected filters.</div>
      ) : (
        <div className="text-gray-400 text-center py-12">Select filters and click 'Apply Filters' to view tickets.</div>
      )}
    </>
  );
};
 
export default ProjectManagerTickets;