import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, getDocs, runTransaction, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import {
  ArrowLeft,
  User,
  Tag,
  Clock,
  Hash,
  Info,
  Briefcase,
  Send,
  CheckCircle,
  Paperclip,
  Link,
  Menu,
  LogOut,
  Home,
  FileText,
  MessageSquare,
  FolderOpen

} from 'lucide-react';
import { sendEmail } from '../../utils/sendEmail';
import { fetchProjectMemberEmails } from '../../utils/emailUtils';
import parse from 'html-react-parser';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Priority options for dropdowns
const priorities = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
];

// Status options for dropdowns
const statusOptions = [
  { value: 'Open', label: 'Open' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Closed', label: 'Closed' },
];

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

// Helper to render Quill HTML with image preview overlays
const renderQuillWithPreview = (html) => {
  return parse(html, {
    replace: domNode => {
      if (domNode.name === 'img' && domNode.attribs && domNode.attribs.src) {
        return (
          <img
            {...domNode.attribs}
            style={{
              maxWidth: 40,
              maxHeight: 40,
              width: 40,
              height: 40,
              objectFit: 'cover',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: 'inline-block',
              verticalAlign: 'middle',
              margin: '0 4px',
              border: '2px solid #d1d5db'
            }}
            onClick={() => setPreviewImageSrc(domNode.attribs.src)}
            alt={domNode.attribs.alt || 'image'}
          />
        );
      }
    }
  });
};

// Add this helper function near the top of the file (outside the component):
function makeImagesClickable(html) {
  if (!html) return '';
  // Add inline style for small thumbnail
  return html.replace(
    /<img([^>]+)src=["']([^"']+)["']([^>]*)>/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer"><img$1src="$2"$3 style="width:80px;height:80px;object-fit:cover;display:inline-block;margin:4px 0;vertical-align:middle;cursor:pointer;" /></a>'
  );
}

// Helper to sanitize HTML and remove base64 images
function stripBase64Images(html) {
  if (!html) return '';
  // Remove <img src="data:image..."> tags (robust, covers single/double quotes, whitespace, and any attributes)
  return html.replace(/<img[^>]*src=['"]data:image\/[a-zA-Z0-9+\/;=]+['"][^>]*>/gi, '');
}

// Helper to check if a user is still a member of a project
async function isUserStillProjectMember(email, projectId) {
  const projectDoc = await getDoc(doc(db, 'projects', projectId));
  if (!projectDoc.exists()) return false;
  const members = projectDoc.data().members || [];
  return members.some(m => m.email === email);
}

const TicketDetails = ({ ticketId, onBack, onAssign }) => {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newResponse, setNewResponse] = useState('');
  const [isSendingResponse, setIsSendingResponse] = useState(false);
  const [activeTab, setActiveTab] = useState('Commentbox');
  const [currentUserName, setCurrentUserName] = useState('');
  const commentsEndRef = useRef(null);
  // Add state for editing fields
  const [editFields, setEditFields] = useState({ priority: '', status: '', category: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionStatus, setResolutionStatus] = useState('');
  const [isSavingResolution, setIsSavingResolution] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState([]);
  const [resolutionAttachments, setResolutionAttachments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCommentIndex, setEditingCommentIndex] = useState(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const [isSavingCommentEdit, setIsSavingCommentEdit] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [formConfig, setFormConfig] = useState(null);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const [editSubCategory, setEditSubCategory] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editModule, setEditModule] = useState('');
  const [selectedRequester, setSelectedRequester] = useState('');
  const [clientMembers, setClientMembers] = useState([]);
  const [editReportedBy, setEditReportedBy] = useState(ticket?.reportedBy || '');
  const [editTypeOfIssue, setEditTypeOfIssue] = useState('');
  // Add a ref for ReactQuill to access the editor
  const quillRef = useRef(null);

  // Extract typeOfIssue options from formConfig.fields
  const typeOfIssueField = formConfig?.fields?.find(f => f.id === 'typeOfIssue');
  const typeOfIssueOptions = typeOfIssueField?.options || [];

  // Dynamic moduleOptions from formConfig
  const moduleOptions = formConfig?.moduleOptions
    ? formConfig.moduleOptions.map(opt => typeof opt === 'object' ? opt : { value: opt, label: opt })
    : [
        { value: '', label: 'Select Module' },
        { value: 'EWM', label: 'EWM' },
        { value: 'BTP', label: 'BTP' },
        { value: 'TM', label: 'TM' },
        { value: 'Yl', label: 'Yl' },
        { value: 'MFS', label: 'MFS' },
      ];

  // Toast helper
  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type }), 2500);
  };

  useEffect(() => {
      if (!ticketId) {
        setError('No ticket ID provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
    // Set up real-time listener for ticket
        const ticketRef = doc(db, 'tickets', ticketId);
    const unsubscribe = onSnapshot(ticketRef, (ticketSnap) => {
        if (!ticketSnap.exists()) {
          setError('Ticket not found.');
          setLoading(false);
          return;
        }
        const ticketData = { id: ticketSnap.id, ...ticketSnap.data() };
        // Merge old responses for display if comments array is missing
        let comments = [];
        if (ticketData.comments && Array.isArray(ticketData.comments)) {
          comments = ticketData.comments;
        } else {
          // Migrate old responses for display only
          if (ticketData.adminResponses) {
            comments = comments.concat(ticketData.adminResponses.map(r => ({ ...r, authorRole: 'admin' })));
          }
          if (ticketData.customerResponses) {
            comments = comments.concat(ticketData.customerResponses.map(r => ({ ...r, authorRole: 'customer' })));
          }
        }
        // Sort comments by timestamp
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      setLoading(false);
    }, (err) => {
        setError('Failed to load ticket details or users.');
        setLoading(false);
    });
    return () => unsubscribe();
  }, [ticketId]);

  // Scroll to bottom when comments change
  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticket?.comments?.length]);

  // Add state for editing fields
  useEffect(() => {
    if (ticket) {
      setEditFields({
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
      });
      setResolutionText(ticket.resolution || '');
      setResolutionStatus(ticket.status || '');
    }
  }, [ticket]);

  useEffect(() => {
    const fetchEmployees = async () => {
      if (!ticket?.project) return;
      const usersRef = collection(db, 'users');
      let q;
      if (Array.isArray(ticket.project)) {
        // If ticket.project is an array, fetch users whose project contains any of these
        q = query(usersRef, where('project', 'array-contains-any', ticket.project), where('role', 'in', ['employee', 'project_manager']));
        const snapshot = await getDocs(q);
        const emps = snapshot.docs.map(doc => {
          const data = doc.data();
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
          if (data.role === 'project_manager') {
            name += ' (Project Manager)';
          }
          return {
            id: doc.id,
            email: data.email,
            name,
            role: data.role
          };
        });
        setEmployees(emps);
      } else {
        // If ticket.project is a string, fetch users whose project is string or array containing this
        const q1 = query(usersRef, where('project', '==', ticket.project), where('role', 'in', ['employee', 'project_manager']));
        const q2 = query(usersRef, where('project', 'array-contains', ticket.project), where('role', 'in', ['employee', 'project_manager']));
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const emps1 = snap1.docs.map(doc => doc.data());
        const emps2 = snap2.docs.map(doc => doc.data());
        const allEmps = [...emps1, ...emps2].filter((v, i, a) => a.findIndex(t => t.email === v.email) === i);
        setEmployees(allEmps.map(data => ({
          id: data.id,
          email: data.email,
          name: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : (data.firstName || data.lastName || data.email.split('@')[0]),
          role: data.role
        })));
      }
    };
    const fetchCurrentUserRole = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        setCurrentUserEmail(currentUser.email);
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUserRole(userDocSnap.data().role);
        }
      }
    };
    if (ticket) {
      fetchEmployees();
      setSelectedAssignee(ticket.assignedTo?.email || '');
      fetchCurrentUserRole();
      setSelectedRequester(ticket.email || '');
    }
  }, [ticket]);

  useEffect(() => {
    const fetchClients = async () => {
      if (!ticket?.project) return;
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('project', '==', ticket.project), where('role', '==', 'client'));
      const snapshot = await getDocs(q);
      const clients = snapshot.docs.map(doc => {
        const data = doc.data();
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
        return {
          id: doc.id,
          email: data.email,
          name,
        };
      });
      setClientMembers(clients);
    };
    fetchClients();
  }, [ticket]);

  // Helper to get next ticket number for a category
  const getNextTicketNumber = async (typeOfIssue) => {
    let prefix, counterDocId, startValue;
    // Remove spaces and make lowercase for robust matching
    const type = (typeOfIssue || '').replace(/\s+/g, '').toLowerCase();
    if (type === 'incident') {
      prefix = 'IN';
      counterDocId = 'incident_counter';
      startValue = 100000;
    } else if (type === 'servicerequest') {
      prefix = 'SR';
      counterDocId = 'service_counter';
      startValue = 200000;
    } else if (type === 'changerequest') {
      prefix = 'CR';
      counterDocId = 'change_counter';
      startValue = 300000;
    } else {
      prefix = 'IN';
      counterDocId = 'incident_counter';
      startValue = 100000;
    }
    const counterRef = doc(db, 'counters', counterDocId);
    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let current = startValue - 1;
      if (counterDoc.exists()) {
        current = counterDoc.data().value;
      }
      const newValue = current + 1;
      transaction.set(counterRef, { value: newValue });
      return newValue;
    });
    return `${prefix}${nextNumber}`;
  };

  // Helper to convert files to base64
  const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      size: file.size,
      data: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // File input handler for comment attachments
  const handleCommentAttachmentChange = (e) => {
    const files = Array.from(e.target.files);
    console.log('[DEBUG] Files selected:', files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileObj = {
          name: file.name,
          type: file.type,
          data: event.target.result,
        };
        console.log('[DEBUG] File read as base64:', fileObj);
        setCommentAttachments(prev => {
          const updated = [...prev, fileObj];
          console.log('[DEBUG] Updated commentAttachments after file input:', updated);
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleResolutionAttachmentChange = async (e) => {
    const files = Array.from(e.target.files);
    const base64Files = await Promise.all(files.map(fileToBase64));
    setResolutionAttachments(base64Files);
  };

  const handleAssignChange = (e) => {
    setSelectedAssignee(e.target.value);
  };

  // Modified status dropdown handler
  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    if ((newStatus === 'Resolved' || newStatus === 'Closed') && !resolutionText.trim()) {
      setActiveTab('Resolution');
      showToast('Please fill the resolution in resolution section', 'error');
      return; // Do not update the field
    }
    setEditFields(f => ({ ...f, status: newStatus }));
  };

  // Handler for saving edits
  const handleSaveDetails = async () => {
    if (!ticket) return;
    setDetailsError('');
    setIsSaving(true);
    try {
      const ticketRef = doc(db, 'tickets', ticket.id);
      let updates = {};
      let commentMsg = [];
      // Module
      if (editModule !== ticket.module) {
        updates.module = editModule;
        commentMsg.push(`Module changed to ${editModule}`);
      }
      // Type of Issue
      if (editTypeOfIssue !== ticket.typeOfIssue) {
        updates.typeOfIssue = editTypeOfIssue;
        // Generate new ticket number for the new type of issue
        const newTicketNumber = await getNextTicketNumber(editTypeOfIssue);
        updates.ticketNumber = newTicketNumber;
        commentMsg.push(`Type of Issue changed to ${editTypeOfIssue} and Ticket ID updated to ${newTicketNumber}`);
      }
      // Category (and ticket number)
      if (editCategory !== ticket.category) {
        updates.category = editCategory;
        const newTicketNumber = await getNextTicketNumber(editTypeOfIssue);
        updates.ticketNumber = newTicketNumber;
        commentMsg.push(`Category changed to ${editCategory} and Ticket ID updated to ${newTicketNumber}`);
      }
      // Sub-Category
      if (editSubCategory !== ticket.subCategory) {
        updates.subCategory = editSubCategory;
        commentMsg.push(`Sub-Category changed to ${editSubCategory}`);
      }
      // Priority
      if (editFields.priority !== ticket.priority) {
        updates.priority = editFields.priority;
        commentMsg.push(`Priority changed to ${editFields.priority}`);
      }
      // Status
      if (editFields.status !== ticket.status) {
        updates.status = editFields.status;
        commentMsg.push(`Status changed to ${editFields.status}`);
        // If status is being set to Resolved, always add a resolution comment for KPI
        if (editFields.status === 'Resolved') {
          await updateDoc(ticketRef, {
            comments: arrayUnion({
              message: `Resolution updated`,
              timestamp: new Date(),
              authorEmail: auth.currentUser?.email,
              authorName: currentUserName,
              authorRole: 'resolver',
            })
          });
        }
      }
      // Assignment
      let assignee = null;
      if (selectedAssignee && (!ticket.assignedTo || ticket.assignedTo.email !== selectedAssignee)) {
        assignee = employees.find(emp => emp.email === selectedAssignee);
        if (!assignee && selectedAssignee === currentUserEmail) {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const userDocRef = doc(db, 'users', currentUser.uid);
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
                email: data.email,
                name,
                role: data.role || 'project_manager',
              };
            }
          }
        }
        if (assignee) {
          updates.assignedTo = {
            email: assignee.email,
            name: assignee.name || assignee.email || 'Unknown',
            role: assignee.role,
            assignedAt: new Date()
          };
          commentMsg.push(`Assigned to ${assignee.name || assignee.email || 'Unknown'}`);
          // Always add an assignment comment for KPI
          await updateDoc(ticketRef, {
            comments: arrayUnion({
              message: `Assigned to ${assignee.name || assignee.email || 'Unknown'}`,
              timestamp: new Date(),
              authorEmail: auth.currentUser?.email,
              authorName: currentUserName,
              authorRole: 'system',
            })
          });
          // Update UI state immediately
          setSelectedAssignee(assignee.email);
        }
      }
      // If only the assignee changed, call handleAssignTicket and do not send a comment email
      const onlyAssigneeChanged = (
        Object.keys(updates).length === 1 && updates.assignedTo
      );
      // Debug log for assignment
      if (onlyAssigneeChanged) {
        console.log('[DEBUG] handleSaveDetails: onlyAssigneeChanged', { ticketId: ticket.id, updates, selectedAssignee });
        await onAssign(ticket.id, updates.assignedTo.email);
        setIsSaving(false);
        return;
      }
      if (Object.keys(updates).length > 0) {
        updates.lastUpdated = serverTimestamp();
        await updateDoc(ticketRef, updates);
        // Add comment
        const currentUser = auth.currentUser;
        let authorName = currentUserName;
        if (!authorName) authorName = currentUser?.displayName || (currentUser?.email?.split('@')[0] || '');
        const comment = {
          message: commentMsg.join('; '),
          timestamp: new Date(),
          authorEmail: currentUser?.email,
          authorName,
          authorRole: 'user',
        };
        await updateDoc(ticketRef, { comments: arrayUnion(comment) });
        // Refresh ticket (always after any update)
        const updatedTicketSnap = await getDoc(ticketRef);
        if (updatedTicketSnap.exists()) {
          const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
          let comments = ticketData.comments || [];
          comments.sort((a, b) => {
            const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
            const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
            return ta - tb;
          });
          setTicket({ ...ticketData, comments });
          // Also update selectedAssignee to match new assignment
          setSelectedAssignee(ticketData.assignedTo?.email || '');
        }
        // Send email to the other party (comment)
        let notifyEmail = null;
        const isClient = currentUserEmail === ticket.reportedBy || currentUserEmail === ticket.email;
        const isEmployee = ticket.assignedTo && currentUserEmail === ticket.assignedTo.email;
        if (isClient) {
          notifyEmail = ticket.assignedTo?.email || null;
        } else {
          notifyEmail = ticket.reportedBy || ticket.email || null;
        }
        if (notifyEmail === currentUserEmail) notifyEmail = null; // never send to self
        if (notifyEmail) {
          try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', notifyEmail));
            const snapshot = await getDocs(q);
            let notifyName = notifyEmail;
            if (!snapshot.empty) {
              const userData = snapshot.docs[0].data();
              notifyName = (userData.firstName && userData.lastName)
                ? `${userData.firstName} ${userData.lastName}`.trim()
                : (userData.firstName || userData.lastName || userData.email);
            }
            let messageToSend = commentMsg.join('; ');
            if (!messageToSend && commentAttachments && commentAttachments.length > 0) {
              messageToSend = '[Attachment sent]';
            }
            const emailParams = {
              to_email: notifyEmail,
              to_name: notifyName,
              subject: ticket.subject,
              ticket_number: ticket.ticketNumber,
              message: messageToSend,
              is_comment: true,
              ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
            };
            console.log('[DEBUG] About to send comment email:', emailParams);
            try {
              await sendEmail(emailParams, 'template_igl3oxn');
            } catch (e) {
              console.error('Failed to send comment email:', e);
              showToast('Failed to send notification email', 'error');
            }
          } catch (e) { /* fallback to email */ }
        }
      }
      if (editReportedBy !== ticket.reportedBy) {
        updates.reportedBy = editReportedBy;
        commentMsg.push(`Reported by changed to ${editReportedBy}`);
      }
    } catch (err) {
      console.error('Error saving details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // In handleAddResponse, log commentAttachments before submission
  const handleAddResponse = async () => {
    console.log('[DEBUG] handleAddResponse called');
    if (!newResponse.trim() || !ticketId || !auth.currentUser) return;
    setIsSendingResponse(true);
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const currentUser = auth.currentUser;
      // Get user name
      let authorName = currentUserName;
      if (!authorName) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          authorName = data.firstName || data.lastName ? `${data.firstName || ''} ${data.lastName || ''}`.trim() : currentUser.email;
        }
      }
      // Log attachments before saving
      console.log('[DEBUG] handleAddResponse - commentAttachments at submit:', commentAttachments);
      // Strip base64 images before saving
      const cleanedMessage = stripBase64Images(newResponse);
      const comment = {
        authorName,
        authorEmail: currentUser.email,
        authorRole: currentUserRole,
        message: cleanedMessage,
        timestamp: new Date(),
        attachments: commentAttachments.length > 0 ? [...commentAttachments] : [],
      };
      console.log('[DEBUG] Submitting comment:', comment);
      await updateDoc(ticketRef, {
        comments: arrayUnion(comment),
        lastUpdated: serverTimestamp()
      });
      setNewResponse('');
      setCommentAttachments([]);
      // Send email to the other party (comment)
      let notifyEmail = null;
      const isClient = currentUserEmail === ticket.reportedBy || currentUserEmail === ticket.email;
      const isEmployee = ticket.assignedTo && currentUserEmail === ticket.assignedTo.email;
      if (isClient) {
        notifyEmail = ticket.assignedTo?.email || null;
      } else {
        notifyEmail = ticket.reportedBy || ticket.email || null;
      }
      if (notifyEmail === currentUserEmail) notifyEmail = null; // never send to self
      if (notifyEmail) {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', notifyEmail));
          const snapshot = await getDocs(q);
          let notifyName = notifyEmail;
          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            notifyName = (userData.firstName && userData.lastName)
              ? `${userData.firstName} ${userData.lastName}`.trim()
              : (userData.firstName || userData.lastName || userData.email);
          }
          let messageToSend = cleanedMessage;
          if (!messageToSend && commentAttachments && commentAttachments.length > 0) {
            messageToSend = '[Attachment sent]';
          }
          const emailParams = {
            to_email: notifyEmail,
            to_name: notifyName,
            subject: ticket.subject,
            ticket_number: ticket.ticketNumber,
            message: messageToSend,
            is_comment: true,
            ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
          };
          console.log('[DEBUG] About to send comment email:', emailParams);
          try {
            await sendEmail(emailParams, 'template_igl3oxn');
          } catch (e) {
            console.error('Failed to send comment email:', e);
            showToast('Failed to send notification email', 'error');
          }
        } catch (e) { /* fallback to email */ }
      }
      // Re-fetch ticket to update UI
      const updatedTicketSnap = await getDoc(ticketRef);
      if (updatedTicketSnap.exists()) {
        const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
        let comments = ticketData.comments || [];
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setIsSendingResponse(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-100 text-blue-800';
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Resolved':
        return 'bg-green-100 text-green-800';
      case 'Closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSaveResolution = async () => {
    if (!ticket) return;
    setIsSavingResolution(true);
    try {
      const ticketRef = doc(db, 'tickets', ticket.id);
      const currentUser = auth.currentUser;
      let authorName = currentUserName;
      if (!authorName) authorName = currentUser?.displayName || (currentUser?.email?.split('@')[0] || '');
      await updateDoc(ticketRef, {
        resolution: resolutionText,
        status: resolutionStatus,
        lastUpdated: serverTimestamp(),
        resolutionAttachments: resolutionAttachments,
        comments: arrayUnion({
          message: `Resolution updated by ${authorName}:\n${resolutionText}`,
          timestamp: new Date(),
          authorEmail: currentUser?.email,
          authorName,
          authorRole: 'resolver',
          attachments: resolutionAttachments
        }),
        customerResponses: arrayUnion({
          message: `Resolution updated`,
          timestamp: new Date(),
          authorEmail: currentUser?.email,
          authorName,
          authorRole: 'resolver',
        })
      });
      // Refresh ticket
      const updatedTicketSnap = await getDoc(ticketRef);
      if (updatedTicketSnap.exists()) {
        const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
        let comments = ticketData.comments || [];
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      }
      setResolutionAttachments([]);
      // Send email to the other party (resolution)
      let notifyEmail = null;
      const isClient = currentUserEmail === ticket.reportedBy || currentUserEmail === ticket.email;
      const isEmployee = ticket.assignedTo && currentUserEmail === ticket.assignedTo.email;
      if (isClient) {
        notifyEmail = ticket.assignedTo?.email || null;
      } else {
        notifyEmail = ticket.reportedBy || ticket.email || null;
      }
      if (notifyEmail === currentUserEmail) notifyEmail = null; // never send to self
      if (notifyEmail) {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', notifyEmail));
          const snapshot = await getDocs(q);
          let notifyName = notifyEmail;
          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            notifyName = (userData.firstName && userData.lastName)
              ? `${userData.firstName} ${userData.lastName}`.trim()
              : (userData.firstName || userData.lastName || userData.email);
          }
          let messageToSend = resolutionText;
          if (!messageToSend && resolutionAttachments && resolutionAttachments.length > 0) {
            messageToSend = '[Attachment sent]';
          }
          const emailParams = {
            to_email: notifyEmail,
            to_name: notifyName,
            subject: ticket.subject,
            ticket_number: ticket.ticketNumber,
            message: messageToSend,
            is_resolution: true,
            ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
          };
          console.log('[DEBUG] About to send resolution email:', emailParams);
          try {
            await sendEmail(emailParams, 'template_igl3oxn');
          } catch (e) {
            console.error('Failed to send resolution email:', e);
            showToast('Failed to send notification email', 'error');
          }
        } catch (e) { /* fallback to email */ }
      }
    } catch (err) {
      console.error('Error saving resolution:', err);
    } finally {
      setIsSavingResolution(false);
    }
  };

  // Add a function to reset edit fields
  const resetEditFields = () => {
    if (ticket) {
      setEditFields({
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
      });
      setSelectedAssignee(ticket.assignedTo?.email || '');
    }
  };

  // Edit comment handler
  const handleEditComment = (index, message) => {
    setEditingCommentIndex(index);
    setEditingCommentValue(message);
  };
  const handleCancelEditComment = () => {
    setEditingCommentIndex(null);
    setEditingCommentValue('');
  };
  const handleSaveEditComment = async (comment, index) => {
    if (!ticket) return;
    setIsSavingCommentEdit(true);
    try {
      const ticketRef = doc(db, 'tickets', ticket.id);
      // Prepare new comments array
      const updatedComments = [...ticket.comments];
      // Strip base64 images before saving
      const cleanedMessage = stripBase64Images(editingCommentValue);
      updatedComments[index] = {
        ...comment,
        message: cleanedMessage,
        lastEditedAt: new Date(),
        lastEditedBy: currentUserName,
      };
      await updateDoc(ticketRef, { comments: updatedComments });
      // Refresh ticket
      const updatedTicketSnap = await getDoc(ticketRef);
      if (updatedTicketSnap.exists()) {
        const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
        let comments = ticketData.comments || [];
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      }
      setEditingCommentIndex(null);
      setEditingCommentValue('');
    } catch (err) {
      console.error('Error editing comment:', err);
    } finally {
      setIsSavingCommentEdit(false);
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const configRef = doc(db, 'config', 'formConfig');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setFormConfig(configSnap.data());
        }
      } catch (err) {
        // ignore
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (ticket && formConfig) {
      setEditModule(ticket.module || '');
      setEditCategory(ticket.category || '');
      setEditSubCategory(ticket.subCategory || '');
      setEditTypeOfIssue(ticket.typeOfIssue || '');
    }
  }, [ticket, formConfig]);

  useEffect(() => {
    const fetchClientMembers = async () => {
      if (!ticket?.project) return;
      const projectsRef = collection(db, 'projects');
      const q = query(projectsRef, where('name', '==', ticket.project));
      const projectSnapshot = await getDocs(q);
      if (!projectSnapshot.empty) {
        const projectDoc = projectSnapshot.docs[0];
        const members = projectDoc.data().members || [];
        const clients = members.filter(m => m.userType === 'client');
        setClientMembers(clients);
      } else {
        setClientMembers([]);
      }
    };
    fetchClientMembers();
  }, [ticket?.project]);

  // Paste handler for images in ReactQuill
  useEffect(() => {
    const quill = quillRef.current && quillRef.current.getEditor && quillRef.current.getEditor();
    if (!quill) return;
    function handlePaste(e) {
      let foundImage = false;
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1) {
            foundImage = true;
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const fileObj = {
                  name: file.name,
                  type: file.type,
                  data: event.target.result,
                };
                setCommentAttachments(prev => [...prev, fileObj]);
              };
              reader.readAsDataURL(file);
            }
          }
        }
        if (foundImage) {
          e.preventDefault();
          // Remove any base64 images that might have been inserted by Quill
          setTimeout(() => {
            const quill = quillRef.current && quillRef.current.getEditor && quillRef.current.getEditor();
            if (quill) {
              const html = quill.root.innerHTML;
              const cleaned = stripBase64Images(html);
              if (html !== cleaned) {
                quill.root.innerHTML = cleaned;
              }
            }
          }, 0);
        }
      }
    }
    quill.root.addEventListener('paste', handlePaste);
    return () => {
      quill.root.removeEventListener('paste', handlePaste);
    };
  }, [quillRef]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
          <button
            onClick={onBack}
            className="ml-4 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-200 hover:bg-red-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded max-w-md">
          <strong className="font-bold">Information: </strong>
          <span className="block sm:inline">Ticket data is not available.</span>
          <button
            onClick={onBack}
            className="ml-4 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-yellow-700 bg-yellow-200 hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 p-4 rounded-xl shadow-lg transition-all duration-300 z-[9999] ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
        >
          <div className="flex items-center space-x-2 text-white">
            <span>{toast.message}</span>
          </div>
        </div>
      )}
      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Go Back Button */}
        <div className="mb-2 flex items-center">
          <button
            onClick={onBack}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </button>
        </div>
        {/* Ticket Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 px-2">
          <div>
            <div className="text-2xl font-bold text-gray-900">{ticket.subject || 'No Subject'}</div>
            <div className="text-gray-500 text-sm mt-1">Ticket ID: <span className="font-mono">{ticket.ticketNumber}</span></div>
          </div>
        </div>
        {/* Tabs */}
        <div className="border-b mb-8 px-2">
          <nav className="flex flex-wrap gap-2">
            {['Details','Commentbox','Resolution'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all duration-150 focus:outline-none ${activeTab === tab ? 'border-blue-600 text-blue-700 bg-white shadow-sm' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                style={{marginBottom: activeTab === tab ? '-2px' : 0}}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        {/* Tab Content */}
        <div className="px-2 pb-2 sm:px-1 xs:px-0">
          {activeTab === 'Commentbox' && (
            <>
              {/* Comments List */}
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 shadow-sm mb-10 max-h-96 overflow-y-auto">
                <div className="mb-4 text-base text-gray-700 font-semibold">Comment Box</div>
                <div className="space-y-6">
                  {ticket.comments && ticket.comments.length > 0 ? (
                    ticket.comments.map((comment, index) => {
                      const isEditing = editingCommentIndex === index;
                      console.log('[DEBUG] Rendering comment:', comment);
                      if (comment.attachments) {
                        console.log('[DEBUG] Comment attachments:', comment.attachments);
                      }
                      return (
                      <div key={index} className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-700 text-lg shadow-sm">
                          {comment.authorName ? comment.authorName.charAt(0).toUpperCase() : (comment.authorEmail ? comment.authorEmail.charAt(0).toUpperCase() : '?')}
                        </div>
                        <div className="flex-1">
                          <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-blue-700">{comment.authorName || comment.authorEmail}</span>
                              <span className="text-xs text-gray-400">{formatTimestamp(comment.timestamp)}</span>
                            </div>
                              {isEditing ? (
                                <>
                                  <textarea
                                    className="w-full border border-gray-300 rounded p-2 mb-2"
                                    value={editingCommentValue}
                                    onChange={e => setEditingCommentValue(e.target.value)}
                                    rows={3}
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-semibold"
                                      onClick={() => handleSaveEditComment(comment, index)}
                                      disabled={isSavingCommentEdit || !editingCommentValue.trim()}
                                    >
                                      {isSavingCommentEdit ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-1.5 rounded font-semibold"
                                      onClick={handleCancelEditComment}
                                      disabled={isSavingCommentEdit}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                            <div className="text-gray-900 whitespace-pre-wrap leading-relaxed">{
                              parse(stripBase64Images(comment.message))
                            }</div>
                            {/* Show image and other attachments as thumbnails or links below the comment */}
                            {comment.attachments && comment.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {comment.attachments.map((file, idx) => {
                                  if (file.type && file.type.startsWith('image/')) {
                                    return (
                                      <img
                                        key={idx}
                                        src={file.data}
                                        alt={file.name || 'attachment'}
                                        className="w-16 h-16 object-cover rounded cursor-pointer border border-gray-200"
                                        style={{ maxWidth: '4rem', maxHeight: '4rem', width: '4rem', height: '4rem' }}
                                        onClick={() => setPreviewImageSrc(file.data)}
                                        onError={e => {
                                          e.target.onerror = null;
                                          e.target.style.display = 'none';
                                          const fallback = document.createElement('div');
                                          fallback.innerText = 'Image failed to load';
                                          fallback.style.color = 'red';
                                          e.target.parentNode.appendChild(fallback);
                                        }}
                                      />
                                    );
                                  } else {
                                    return (
                                      <a
                                        key={idx}
                                        href={file.data}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline text-xs block"
                                      >
                                        {file.name || 'Download attachment'}
                                      </a>
                                    );
                                  }
                                })}
                              </div>
                            )}
                                  {comment.lastEditedAt && comment.lastEditedBy && (
                                    <div className="mt-1 text-xs text-gray-500 italic">Last edited by {comment.lastEditedBy} at {formatTimestamp(comment.lastEditedAt)}</div>
                                  )}
                                  <button
                                    className="text-blue-600 hover:underline text-xs mt-2"
                                    onClick={() => handleEditComment(index, comment.message)}
                                  >
                                    Edit
                                  </button>
                                </>
                                    )}
                                  </div>
                        </div>
                      </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-400 text-center py-12">No comments yet.</div>
                  )}
                  <div ref={commentsEndRef} />
                </div>
              </div>
              {/* Add Comment Section */}
              <div className="bg-white rounded-2xl p-8 shadow border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add a comment</h3>
                <div className="flex flex-col space-y-4">
                  <ReactQuill
                    ref={quillRef}
                    value={newResponse}
                    onChange={setNewResponse}
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                      ]
                    }}
                    formats={['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link', 'image']}
                    className="bg-white rounded-xl border-2 border-gray-200 focus:border-blue-500 min-h-[120px]"
                    placeholder="Type your comment here..."
                  />
                  {/* Preview selected/pasted image attachments as thumbnails */}
                  {commentAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-4 mb-2 mt-2">
                      {commentAttachments.filter(file => file.type && file.type.startsWith('image/')).map((file, idx) => (
                        <div key={idx} className="relative flex flex-col items-center border rounded p-2 bg-gray-50">
                          <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                          <button
                            type="button"
                            className="absolute top-0 right-0 text-gray-400 hover:text-red-500 bg-white rounded-full p-1"
                            onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                            aria-label="Remove image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Error message for empty comment */}
                  {toast.show && !newResponse.trim() && (
                    <p className="text-red-600 text-sm flex items-center mt-1">Comment is required</p>
                  )}
                  <input
                    id="comment-attachment-input"
                    type="file"
                    multiple
                    accept="image/*,application/pdf,video/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                    onChange={handleCommentAttachmentChange}
                    className="hidden"
                  />
                  <label htmlFor="comment-attachment-input" className="inline-flex items-center cursor-pointer text-blue-600 hover:text-blue-800 mb-2">
                    <Paperclip className="w-5 h-5 mr-1" />
                    <span>Choose file(s)</span>
                  </label>
                  {/* Preview selected attachments */}
                  {commentAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-4 mb-2">
                      {commentAttachments.map((file, idx) => (
                        <div key={idx} className="flex flex-col items-center border rounded p-2 bg-gray-50">
                          {file.type.startsWith('image/') ? (
                            <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                          ) : file.type === 'application/pdf' ? (
                            <span className="text-red-600">PDF: {file.name}</span>
                          ) : file.type.startsWith('video/') ? (
                            <video src={file.data} controls className="w-16 h-16 mb-1" />
                          ) : (
                            <span className="text-gray-600">{file.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        console.log('[DEBUG] Add Comment button clicked. newResponse:', newResponse, 'commentAttachments:', commentAttachments);
                        handleAddResponse();
                      }}
                      disabled={isSendingResponse}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow"
                    >
                      {isSendingResponse ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          <span>Add Comment</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'Details' && (
            <div className="space-y-8">
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div className="text-lg font-semibold text-gray-800">Ticket Details</div>
                  {!isEditMode ? (
                    <button
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-100 rounded px-4 py-1.5 transition"
                      onClick={() => {
                        setEditTypeOfIssue(ticket.typeOfIssue || '');
                        setIsEditMode(true);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
                <div className="space-y-4">
                  <div>
                    <span className="font-semibold text-gray-700">Module:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editModule}
                        onChange={e => { setEditModule(e.target.value); setEditCategory(''); setEditSubCategory(''); }}
                        disabled={isSaving}
                      >
                        {(formConfig?.moduleOptions || []).map(opt => (
                          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
                            {typeof opt === 'object' ? opt.label : opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.module || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Type of Issue:</span>
                    {isEditMode ? (
                      <>
                        {console.log('typeOfIssueOptions', typeOfIssueOptions)}
                        <select
                          className="ml-2 border border-gray-300 rounded px-2 py-1"
                          value={editTypeOfIssue}
                          onChange={e => setEditTypeOfIssue(e.target.value)}
                          disabled={isSaving || typeOfIssueOptions.length === 0}
                        >
                          <option value="">Select Type of Issue</option>
                          {typeOfIssueOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label || opt.value}
                            </option>
                          ))}
                          {typeOfIssueOptions.length === 0 && (
                            <option disabled>No type of issue options configured</option>
                          )}
                        </select>
                      </>
                    ) : (
                      <span className="ml-2">{ticket.typeOfIssue || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Category:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editCategory}
                        onChange={e => { setEditCategory(e.target.value); setEditSubCategory(''); }}
                        disabled={isSaving || !editModule}
                      >
                        {!editModule && <option value="">Please select the module</option>}
                        {(formConfig?.categoryOptions?.[editModule] || []).map(opt => (
                          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
                            {typeof opt === 'object' ? opt.label : opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.category || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Sub-Category:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editSubCategory}
                        onChange={e => setEditSubCategory(e.target.value)}
                        disabled={isSaving || !editCategory}
                      >
                        {!editCategory && <option value="">Please select the category</option>}
                        {(formConfig?.subCategoryOptions?.[editCategory] || []).map(opt => (
                          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
                            {typeof opt === 'object' ? opt.label : opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.subCategory || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Status:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editFields.status}
                        onChange={handleStatusChange}
                        disabled={isSaving}
                      >
                        {statusOptions.map(opt => (
                          <option key={opt.value} value={opt.value} disabled={opt.value === 'Resolved' && !(ticket.assignedTo && ticket.assignedTo.email)}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{editFields.status}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Priority:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editFields.priority}
                        onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))}
                        disabled={isSaving}
                      >
                        {priorities.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{editFields.priority}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Assigned To:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={selectedAssignee}
                        onChange={handleAssignChange}
                        disabled={isSaving || employees.length === 0}
                      >
                        <option value="">Unassigned</option>
                        {/* Always show 'Assign to Me' if current user is not in employees list */}
                        {currentUserEmail && !employees.some(emp => emp.email === currentUserEmail) && (
                          <option value={currentUserEmail}>Assign to Me</option>
                        )}
                        {employees.map(emp => (
                          <option key={emp.email} value={emp.email}>{emp.name} ({emp.role})</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Created By:</span>
                      <span className="ml-2">{ticket.customer} ({ticket.email})</span>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Reported by</label>
                    {!isEditMode ? (
                      <div className="text-gray-900 text-base min-h-[1.5em]">{ticket?.reportedBy || <span className="text-gray-400">(none)</span>}</div>
                    ) : (
                      <select
                        className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-200 bg-white text-gray-700"
                        value={editReportedBy}
                        onChange={e => setEditReportedBy(e.target.value)}
                      >
                        <option value="">Select member</option>
                        {clientMembers.map(member => (
                          <option key={member.email} value={member.email}>{member.name || member.email}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              {/* Restore Description section below the details grid */}
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                <div className="font-semibold text-gray-700 mb-2">Description</div>
                <div
                  className="whitespace-pre-wrap break-words text-gray-900 border border-gray-100 rounded-lg p-4 bg-gray-50"
                  style={{ fontFamily: 'inherit', fontSize: '1rem', minHeight: '80px' }}
                  dangerouslySetInnerHTML={{ __html: makeImagesClickable(ticket.description) }}
                />
              </div>
              {isEditMode && (
                <div className="flex justify-end mt-6 gap-2">
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
                    onClick={async () => {
                      await handleSaveDetails();
                      setIsEditMode(false);
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-semibold"
                    onClick={() => { resetEditFields(); setIsEditMode(false); }}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {activeTab === 'Resolution' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
              <div className="font-bold text-lg text-gray-900 mb-4">Resolution</div>
              <div className="mb-2 text-gray-700">Explain the problem, steps taken, and how the issue was resolved:</div>
              <ReactQuill
                value={resolutionText}
                onChange={setResolutionText}
                modules={{
                  toolbar: [
                    [{ 'header': [1, 2, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                  ]
                }}
                formats={['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link', 'image']}
                className="bg-white rounded-xl border-2 border-gray-200 focus:border-blue-500 min-h-[120px]"
                placeholder="Add a resolution... (You can paste screenshots directly here)"
                readOnly={!(ticket.assignedTo && ticket.assignedTo.email)}
              />
              {/* Render preview thumbnails for images in the resolution */}
              {resolutionText && (
                <div className="mt-2 prose prose-sm max-w-none">
                  {renderQuillWithPreview(resolutionText)}
                </div>
              )}
              <input
                id="resolution-attachment-input"
                type="file"
                multiple
                accept="image/*,application/pdf,video/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                onChange={handleResolutionAttachmentChange}
                className="hidden"
                disabled={!(ticket.assignedTo && ticket.assignedTo.email)}
              />
              <label htmlFor="resolution-attachment-input" className={`inline-flex items-center cursor-pointer text-blue-600 hover:text-blue-800 mb-2 ${!(ticket.assignedTo && ticket.assignedTo.email) ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <Paperclip className="w-5 h-5 mr-1" />
                <span>Choose file(s)</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
                  onClick={handleSaveResolution}
                  disabled={isSavingResolution || !resolutionText.trim() || !resolutionStatus || !(ticket.assignedTo && ticket.assignedTo.email)}
                >
                  {isSavingResolution ? 'Saving...' : 'Submit'}
                </button>
              </div>
              {ticket.resolution && (
                <div className="mt-4 text-gray-600 text-sm">
                  <span className="font-semibold">Last Resolution:</span> {renderQuillWithPreview(ticket.resolution)}
                </div>
              )}
              {/* Show previous resolution attachments if any */}
              {ticket.resolutionAttachments && ticket.resolutionAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {ticket.resolutionAttachments.map((file, idx) => (
                    <div key={idx} className="flex flex-col items-center border rounded p-1 bg-gray-50">
                      {file.type.startsWith('image/') ? (
                        <a href={file.data} target="_blank" rel="noopener noreferrer">
                          <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                        </a>
                      ) : file.type === 'application/pdf' ? (
                        <a href={file.data} target="_blank" rel="noopener noreferrer" className="text-red-600 underline">PDF: {file.name}</a>
                      ) : file.type.startsWith('video/') ? (
                        <video src={file.data} controls className="w-16 h-16 mb-1" />
                      ) : (
                        <a href={file.data} download={file.name} className="text-gray-600 underline">{file.name}</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
 
         
        </div>
      </div>
      {/* Sidebar */}
      <div className="w-full lg:w-80 space-y-6">
        {/* Fields Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fields</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Start date</p>
              <p className="text-sm font-medium text-gray-900">
                {ticket.created ? formatTimestamp(ticket.created).split(',')[0] : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Priority</p>
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  ticket.priority === 'High' ? 'bg-red-500' :
                  ticket.priority === 'Medium' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}></span>
                <p className="text-sm font-medium text-gray-900">{ticket.priority || 'Low'}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">Reporter</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {ticket.customer || ticket.email?.split('@')[0] || 'N/A'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">Assignee</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email?.split('@')[0]) : 'Unassigned'}
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* Attachments Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Attachments</h3>
          <div className="space-y-3">
            {ticket.attachments && ticket.attachments.length > 0 ? (
              ticket.attachments.map((file, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <Paperclip className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {file.type && file.type.startsWith('image/') ? (
                      <a href={file.data} target="_blank" rel="noopener noreferrer">
                        <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                        <span className="text-sm font-medium text-blue-700 underline">{file.name}</span>
                      </a>
                    ) : (
                      <a href={file.data} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-700 underline">
                        {file.name}
                      </a>
                    )}
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB • {formatTimestamp(file.uploadedAt || new Date())}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-4">
                <p className="text-sm text-gray-500">No attachments</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Modal for image preview */}
      {previewImageSrc && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black bg-opacity-70" onClick={() => setPreviewImageSrc('')}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={previewImageSrc} alt="Preview" className="max-w-[90vw] max-h-[80vh] rounded shadow-lg" />
            <button
              className="absolute top-2 right-2 bg-white bg-opacity-80 rounded-full p-1 hover:bg-opacity-100 transition"
              onClick={() => setPreviewImageSrc('')}
              aria-label="Close preview"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-700">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

TicketDetails.propTypes = {
  ticketId: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired,
  onAssign: PropTypes.func.isRequired
};

export default TicketDetails;