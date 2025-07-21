import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';
 
// Utility to compute KPIs for tickets
function computeKPIsForTickets(tickets) {
  let totalResponse = 0, totalResolution = 0, count = 0, resolvedCount = 0;
  const details = tickets.map(ticket => {
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
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
    if (!resolved && ticket.status === 'Resolved' && ticket.lastUpdated) {
      resolved = ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate() : new Date(ticket.lastUpdated);
    }
    if (ticket.assignedTo && ticket.assignedTo.email) {
      count++;
      let responseTime = assigned && created ? (assigned - created) : null;
      let resolutionTime = resolved && assigned ? (resolved - assigned) : null;
      if (responseTime) totalResponse += responseTime;
      if (resolutionTime) totalResolution += resolutionTime;
      if (ticket.status === 'Resolved') resolvedCount++;
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
    resolutionRate: count ? (resolvedCount / count) * 100 : 0,
    details
  };
}
 
const EmployeeKPIDashboard = () => {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [kpi, setKpi] = useState(null);
  const chartRef = useRef();
 
  useEffect(() => {
    const fetchData = async () => {
      // Fetch employee info
      const userDoc = await getDoc(doc(db, 'users', id));
      if (userDoc.exists()) setEmployee(userDoc.data());
      // Fetch tickets assigned to this employee
      const ticketsRef = collection(db, 'tickets');
      const q = query(ticketsRef, where('assignedTo.email', '==', userDoc.data().email));
      const snapshot = await getDocs(q);
      const ticketList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(ticketList);
      setKpi(computeKPIsForTickets(ticketList));
    };
    fetchData();
  }, [id]);
 
  // Excel export (table + chart as image if possible)
  const handleExportExcel = async () => {
    // Table data
    const wsData = [
      ['Ticket #', 'Subject', 'Response Time (min)', 'Resolution Time (min)', 'Status'],
      ...(kpi?.details || []).map(row => [
        row.ticketNumber,
        row.subject,
        row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
        row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
        row.status
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Report');
    // Try to add chart as image (if possible)
    if (chartRef.current) {
      try {
        const svg = chartRef.current.container.children[0];
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new window.Image();
        img.src = 'data:image/svg+xml;base64,' + window.btoa(svgData);
        await new Promise(res => { img.onload = res; });
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imgData = canvas.toDataURL('image/png');
        // Add as a new sheet (as a workaround, not embedded in table)
        const imgSheet = XLSX.utils.aoa_to_sheet([["KPI Chart (see attached image)"]]);
        XLSX.utils.book_append_sheet(wb, imgSheet, 'Chart');
        // Note: true embedding of images in Excel requires more advanced libs (like xlsx-populate)
      } catch (e) {
        // Fallback: skip image
      }
    }
    XLSX.writeFile(wb, `KPI_Report_${employee?.firstName||''}_${employee?.lastName||''}.xlsx`);
  };
 
  if (!employee || !kpi) return <div style={{ padding: 32 }}>Loading...</div>;
 
  // Prepare bar chart data
  const chartData = kpi.details.map(row => ({
    name: row.ticketNumber,
    'Response Time (min)': row.responseTime ? (row.responseTime/1000/60) : 0,
    'Resolution Time (min)': row.resolutionTime ? (row.resolutionTime/1000/60) : 0,
  }));
 
  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
        KPI Dashboard for {employee.firstName} {employee.lastName}
      </h2>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
        <div style={{ flex: 1, background: '#f5f7fa', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#888' }}>Total Tickets</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{kpi.count}</div>
        </div>
        <div style={{ flex: 1, background: '#f5f7fa', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#888' }}>Avg. Response (min)</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{kpi.avgResponse ? (kpi.avgResponse/1000/60).toFixed(2) : 'N/A'}</div>
        </div>
        <div style={{ flex: 1, background: '#f5f7fa', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#888' }}>Avg. Resolution (min)</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{kpi.avgResolution ? (kpi.avgResolution/1000/60).toFixed(2) : 'N/A'}</div>
        </div>
        <div style={{ flex: 1, background: '#f5f7fa', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#888' }}>Resolution %</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{kpi.resolutionRate.toFixed(1)}%</div>
        </div>
      </div>
      {/* Bar chart */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 8px #0001' }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>KPI Bar Chart</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} ref={chartRef}>
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
      {/* KPI Table */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 8px #0001' }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>KPI Table</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f7fa' }}>
              <th style={{ padding: 8, border: '1px solid #eee' }}>Ticket #</th>
              <th style={{ padding: 8, border: '1px solid #eee' }}>Subject</th>
              <th style={{ padding: 8, border: '1px solid #eee' }}>Response Time (min)</th>
              <th style={{ padding: 8, border: '1px solid #eee' }}>Resolution Time (min)</th>
              <th style={{ padding: 8, border: '1px solid #eee' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {kpi.details.map((row, idx) => (
              <tr key={idx}>
                <td style={{ padding: 8, border: '1px solid #eee' }}>{row.ticketNumber}</td>
                <td style={{ padding: 8, border: '1px solid #eee' }}>{row.subject}</td>
                <td style={{ padding: 8, border: '1px solid #eee' }}>{row.responseTime ? (row.responseTime/1000/60).toFixed(2) : 'N/A'}</td>
                <td style={{ padding: 8, border: '1px solid #eee' }}>{row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : 'N/A'}</td>
                <td style={{ padding: 8, border: '1px solid #eee' }}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Excel Export Button */}
      <button
        style={{ background: '#2563eb', color: '#fff', padding: '12px 32px', borderRadius: 8, fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }}
        onClick={handleExportExcel}
      >
        Export to Excel
      </button>
    </div>
  );
};
 
export default EmployeeKPIDashboard;
 