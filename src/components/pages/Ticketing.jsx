import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Paperclip,
  CheckCircle,
  File,
  FileText,
  Image,
  Video,
  Loader2,
  X,
  AlertCircle
} from 'lucide-react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { sendEmail } from '../../utils/sendEmail';
import { fetchProjectMemberEmails } from '../../utils/emailUtils';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import PropTypes from 'prop-types';

function PriorityDropdown({ value, onChange, options }) {
  console.log('PriorityDropdown rendered', options);
  const [open, setOpen] = useState(false);
  // Filter out empty/placeholder options
  const filteredOptions = (options || []).filter(opt => opt.value && opt.value !== 'Select Priority');
  const selected = filteredOptions.find(opt => opt.value === value);

  const handleOpen = () => {
    setOpen(o => {
      if (!o) {
        // Only log when opening
        console.log('PriorityDropdown received options:', options);
      }
      return !o;
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="w-full px-4 py-3 border-2 rounded-xl bg-white text-gray-700 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-200 hover:border-gray-300"
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {selected && (
            <span
              className="inline-block w-4 h-4 rounded-full border border-gray-300 shadow-sm mr-1"
              style={{ backgroundColor: selected.color || '#888' }}
            ></span>
          )}
          {selected ? selected.value : 'Select Priority'}
        </span>
        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <ul
          tabIndex={-1}
          className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto focus:outline-none"
          role="listbox"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-4 py-2 text-gray-400">No priority options available</li>
          ) : filteredOptions.map(opt => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-blue-50 ${value === opt.value ? 'bg-blue-100' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { onChange(opt.value); setOpen(false); } }}
              tabIndex={0}
            >
              <span
                className="inline-block w-4 h-4 rounded-full border border-gray-300 shadow-sm mr-2"
                style={{ backgroundColor: opt.color || '#888' }}
              ></span>
              {opt.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

PriorityDropdown.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired
};

// Custom dropdown for Reported by (not mandatory, opens on click)
function ReportedByDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(opt => opt.email === value);
  return (
    <div className="relative">
      <button
        type="button"
        className="w-full px-4 py-3 border-2 rounded-xl bg-white text-gray-700 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-200 hover:border-gray-300"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected ? (selected.name || selected.email) : 'Select member '}</span>
        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <ul
          tabIndex={-1}
          className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto focus:outline-none"
          role="listbox"
        >
          {options.length === 0 ? (
            <li className="px-4 py-2 text-gray-400">No client members available</li>
          ) : options.map(opt => (
            <li
              key={opt.email}
              role="option"
              aria-selected={value === opt.email}
              className={`px-4 py-2 cursor-pointer hover:bg-blue-50 ${value === opt.email ? 'bg-blue-100' : ''}`}
              onClick={() => { onChange(opt.email); setOpen(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { onChange(opt.email); setOpen(false); } }}
              tabIndex={0}
            >
              {opt.name ? opt.name : opt.email}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Client({ selectedProjectId, selectedProjectName }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    project: 'General',
    subject: '',
    priority: 'Medium',
    description: '',
    category: 'Technical Issue',
    subCategory: ''
  });
 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [ticketId, setTicketId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null);
  const navigate = useNavigate();
  const [attachmentError, setAttachmentError] = useState('');
  const [formConfig, setFormConfig] = useState(null);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [clientMembers, setClientMembers] = useState([]);
  const [reportedBy, setReportedBy] = useState('');
 
  // Fetch form config from Firestore for dynamic dropdowns
  useEffect(() => {
    const fetchFormConfig = async () => {
      setDropdownsLoading(true);
      try {
        const configRef = doc(db, 'config', 'formConfig');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setFormConfig(configSnap.data());
        }
      } catch (err) {
        console.error('Failed to fetch form config', err);
      } finally {
        setDropdownsLoading(false);
      }
    };
    fetchFormConfig();
  }, []);
 
  // Fetch cascading options from formConfig
  const moduleOptions = formConfig?.moduleOptions || [];
  const categoryOptions = formConfig?.categoryOptions || {};
  const subCategoryOptions = formConfig?.subCategoryOptions || {};
 
  // Fetch user data on mount and when selectedProjectName changes
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          let name = '';
          let email = '';
          let userProject = 'General';
          let userRole = '';
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.firstName || data.lastName) {
              name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            }
            if (!name) {
              name = (data.email || currentUser.email || '').split('@')[0];
            }
            name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            email = data.email || currentUser.email || '';
            userProject = data.project || 'General';
            userRole = data.role || '';
          } else {
            name = currentUser.displayName || (currentUser.email?.split('@')[0] || '');
            name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            email = currentUser.email || '';
          }
          // If client or client_head, force project to user's project, but preserve name/email
          setFormData(prev => ({
            ...prev,
            name: name,
            email: email,
            project: (userRole === 'client' || userRole === 'client_head') ? userProject : (selectedProjectName || 'General'),
            subject: '',
            priority: 'Medium',
            description: '',
            category: 'Technical Issue',
            subCategory: ''
          }));
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
    setAttachments([]);
    setErrors({});
    setReportedBy('');
  }, [selectedProjectName]);
 
  // Fetch client-side members from the selected project's members array
  useEffect(() => {
    console.log('Ticketing: useEffect ran');
    console.log('Ticketing: formData =', formData);
    if (!formData.project) {
      setClientMembers([]);
      return;
    }
    console.log('Ticketing: formData.project =', formData.project);
    const fetchProjectMembers = async () => {
      try {
        const projectsRef = collection(db, 'projects');
        const projectName = Array.isArray(formData.project) ? formData.project[0] : formData.project;
        const q = query(projectsRef, where('name', '==', projectName));
        const projectSnapshot = await getDocs(q);
        console.log('Ticketing: projectSnapshot.empty =', projectSnapshot.empty);
        if (!projectSnapshot.empty) {
          const projectDoc = projectSnapshot.docs[0];
          console.log('Ticketing: projectDoc =', projectDoc.data());
          const members = projectDoc.data().members || [];
          console.log('Ticketing: members array =', members);
          // Only client-side roles
          const clientSideMembers = members.filter(m => m.role === 'client' || m.role === 'client_head');
          setClientMembers(clientSideMembers);
        } else {
          setClientMembers([]);
        }
      } catch (err) {
        console.error('Failed to fetch project members from projects collection', err);
        setClientMembers([]);
      }
    };
    fetchProjectMembers();
  }, [formData.project]);

  // Remove auto-select for reportedBy when clientMembers are loaded
  useEffect(() => {
    // Do not set reportedBy automatically
  }, [clientMembers, reportedBy]);

  const validateForm = async () => {
    const newErrors = {};
   
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    else if (formData.description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';

    // Sub-category required only if options exist for selected category
    if (
      formData.category &&
      Array.isArray(subCategoryOptions[formData.category]) &&
      subCategoryOptions[formData.category].length > 0 &&
      !formData.subCategory
    ) {
      console.log('Validation failed: subCategory value is', formData.subCategory);
      newErrors.subCategory = 'Sub-Category is required';
    } else {
      console.log('Validation passed: subCategory value is', formData.subCategory);
    }
 
    // Check for duplicate tickets
    if (formData.subject.trim() && formData.email.trim()) {
      const isDuplicate = await checkDuplicateTicket(formData.subject, formData.email);
      if (isDuplicate) {
        newErrors.submit = 'A similar ticket was submitted in the last 24 hours. Please check your email for updates.';
        console.log('Duplicate ticket detected for subject:', formData.subject, 'and email:', formData.email);
      }
    }
 
    setErrors(newErrors);
    console.log('validateForm errors:', newErrors);
    return Object.keys(newErrors).length === 0;
  };
 
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 1 * 1024 * 1024; // 1MB
    let tooLarge = false;
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        tooLarge = true;
        return false;
      }
      return true;
    });
    if (tooLarge) {
      setAttachmentError('Each attachment must be less than 1MB.');
    } else {
      setAttachmentError('');
    }
    // Read each file as Data URL and add to attachments
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments(prev => ([
          ...prev,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            data: event.target.result
          }
        ]));
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
 
  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };
 
  const getFileIcon = (file) => {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'application':
        if (file.type.includes('pdf')) {
          return <FileText className="w-4 h-4" />;
        }
        return <File className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };
 
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
 
  // Helper to get the next ticket number for a category
  const getNextTicketNumber = async (category) => {
    let prefix, counterDocId, startValue;
    // Remove spaces and make lowercase for robust matching
    const cat = (category || '').replace(/\s+/g, '').toLowerCase();
    if (cat === 'incident') {
      prefix = 'IN';
      counterDocId = 'incident_counter';
      startValue = 100000;
    } else if (cat === 'servicerequest') {
      prefix = 'SR';
      counterDocId = 'service_counter';
      startValue = 200000;
    } else if (cat === 'changerequest') {
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
        console.log(`Fetched current value from counters/${counterDocId}:`, current);
      } else {
        console.log(`Counter document counters/${counterDocId} does not exist, starting at:`, startValue);
      }
      const newValue = current + 1;
      transaction.set(counterRef, { value: newValue });
      return newValue;
    });
    console.log(`Returning ticket number: ${prefix}${nextNumber}`);
    return `${prefix}${nextNumber}`;
  };
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Log the typeOfIssue value immediately on submit
    console.log('Type of Issue value at submit:', formData.typeOfIssue, typeof formData.typeOfIssue);
    console.log('Submitting ticket with formData:', formData);
    console.log('Reported by:', reportedBy);
    if (attachmentError) {
      console.log('Attachment error:', attachmentError);
      return;
    }
    const isValid = await validateForm();
    console.log('Form valid?', isValid);
    if (!isValid) {
      console.log('Validation errors:', errors);
      return;
    }
    setIsSubmitting(true);
    setErrors({});
    try {
      // Process attachments (ensure all are base64 Data URLs)
      const processedFiles = await Promise.all(
        attachments.map(async (file) => {
          if (file.data) return file; // Already processed
          const reader = new FileReader();
          return new Promise((resolve) => {
            reader.onload = (e) => {
              resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );
      console.log('Processed attachments:', processedFiles);
      // Use typeOfIssue for ticket number series
      const ticketNumber = await getNextTicketNumber(formData.typeOfIssue);
      console.log('Generated ticket number:', ticketNumber);
      // Fetch the projectId (Firestore document ID) by project name
      let projectId = null;
      if (formData.project) {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('name', '==', formData.project));
        const projectSnapshot = await getDocs(q);
        if (!projectSnapshot.empty) {
          projectId = projectSnapshot.docs[0].id;
        }
      }
      console.log('Resolved projectId:', projectId, 'for project:', formData.project);
      // Build the ticket data
      const ticketData = {
        subject: formData.subject,
        customer: formData.name,
        email: formData.email,
        project: formData.project,
        projectId: projectId || '',
        module: formData.module || '',
        category: formData.category || '',
        subCategory: formData.subCategory || '',
        typeOfIssue: formData.typeOfIssue || '',
        priority: formData.priority,
        description: formData.description,
        status: 'Open',
        created: serverTimestamp(),
        starred: false,
        attachments: processedFiles,
        ticketNumber,
        lastUpdated: serverTimestamp(),
        userId: auth.currentUser?.uid || null,
        reportedBy: reportedBy
      };
      console.log('Final ticketData to submit:', ticketData);
      // Add to Firestore
      const docRef = await addDoc(collection(db, 'tickets'), ticketData);
      setTicketId(ticketNumber);
      console.log('Ticket created in Firestore with docRef:', docRef.id);
      // Update the ticket with its Firestore doc ID
      await updateDoc(docRef, { ticketId: docRef.id });
      // Fetch project members' emails for ticket creation notification
      console.log('DEBUG: ticketData.project =', ticketData.project);
      const projectName = Array.isArray(ticketData.project) ? ticketData.project[0] : ticketData.project;
      const memberEmails = await fetchProjectMemberEmails(projectName);
      console.log('DEBUG: memberEmails returned =', memberEmails);
      let toEmail = '';
      if (memberEmails && memberEmails.length) {
        toEmail = memberEmails.join(',');
      } else if (reportedBy) {
        toEmail = reportedBy;
      } else if (ticketData.email) {
        toEmail = ticketData.email;
      }
      console.log('DEBUG: Final toEmail for notification:', toEmail);
      if (toEmail) {
        const emailParams = {
          to_email: toEmail,
          name: ticketData.customer || '',
          email: ticketData.email,
          project: ticketData.project,
          module: ticketData.module,
          category: ticketData.category,
          subCategory: ticketData.subCategory,
          typeOfIssue: ticketData.typeOfIssue,
          priority: ticketData.priority,
          description: ticketData.description,
          attachments: ticketData.attachments?.map(a => a.name).join(', ') || '',
          ticket_link: `https://articket-master.vercel.app/login`,
          ticket_number: ticketNumber,
          subject: ` # ${ticketNumber} - ${ticketData.subject}`,
          reportedBy: ticketData.reportedBy || '',
        };
        console.log('Sending email with params:', emailParams);
        try {
          await sendEmail(emailParams, 'template_502okf2');
          console.log('Email sent successfully');
        } catch (emailErr) {
          console.error('Failed to send email:', emailErr);
        }
      }
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setAttachments([]);
    } catch (error) {
      console.error('Error adding ticket:', error);
      setIsSubmitting(false);
      setErrors({ submit: error.message || 'Failed to submit ticket. Please try again.' });
    }
  };
 
  // Add a function to check for duplicate tickets
  const checkDuplicateTicket = async (subject, email) => {
    const q = query(
      collection(db, 'tickets'),
      where('email', '==', email)
    );
   
    const querySnapshot = await getDocs(q);
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
   
    return querySnapshot.docs.some(doc => {
      const data = doc.data();
      const createdTime = data.created?.toDate?.() || new Date(data.created);
      return data.subject === subject && createdTime >= last24Hours;
    });
  };
 
  const priorityField = formConfig?.fields?.find(f => f.id === 'priority' && f.type === 'dropdown');
  let priorityOptions = [];
  if (priorityField && Array.isArray(priorityField.options)) {
    console.log('Raw priority field.options from config:', priorityField.options);
    priorityOptions = priorityField.options.map(opt =>
      typeof opt === 'object'
        ? { value: opt.value || '', color: opt.color || '#888' }
        : { value: opt || '', color: '#888' }
    );
    console.log('Mapped priorityOptions for dropdown:', priorityOptions);
  }

  useEffect(() => {
    if (submitSuccess) {
      const timer = setTimeout(() => {
        navigate('/clientdashboard?tab=tickets');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [submitSuccess, navigate]);

  if (isLoading || dropdownsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your information...</p>
        </div>
      </div>
    );
  }
 
  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-xl text-center border border-gray-100">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ticket Created!</h2>
          <p className="text-gray-600 mb-6 text-lg">
            Your support ticket has been successfully created. Our team will get back to you soon.
          </p>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-6 border border-blue-100">
            <p className="text-sm text-gray-600 mb-2">Ticket ID</p>
            <p className="font-mono text-xl font-bold text-blue-600">{ticketId}</p>
          </div>
         
          <p className="text-xs text-gray-400 mt-4">Redirecting to tickets page in 5 seconds...</p>
        </div>
      </div>
    );
  }
 
  console.log('All field ids:', (formConfig?.fields || []).map(f => f.id));
  console.log('formConfig:', formConfig);
  console.log('priorityField:', priorityField);
  console.log('priorityOptions:', priorityOptions);
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 w-full">
      <div className="w-full mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-0 overflow-hidden">
          <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-10">
            <div className="space-y-6">
                 {/* Project field */}
          <div className="mb-4">
                <label className="block text-gray-700 font-semibold mb-2">Project</label>
            <input
              type="text"
              className="w-full px-4 py-3 border-2 rounded-xl bg-gray-100 text-gray-700 border-gray-200 cursor-not-allowed"
              value={formData.project}
              disabled
              readOnly
            />
          </div>
              {/* Module Dropdown */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Module *</label>
                <select
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                  value={formData.module || ''}
                  onChange={e => setFormData(prev => ({ ...prev, module: e.target.value, category: '', subCategory: '' }))}
                  required
                >
                  <option value="">Select Module</option>
                  {moduleOptions.map(mod => (
                    <option key={mod} value={mod}>{mod}</option>
                  ))}
                </select>
              </div>
              {/* Category Dropdown (depends on module) */}
          <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                <select
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                  value={formData.category || ''}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value, subCategory: '' }))}
                >
                  {!formData.module && <option value="">Please select the module</option>}
                  {formData.module && (categoryOptions[formData.module] || []).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
          </div>
              {/* Sub-Category Dropdown (depends on category) */}
              {formData.category && Array.isArray(subCategoryOptions[formData.category]) && subCategoryOptions[formData.category].length > 0 && (
          <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Sub-Category</label>
                  <select
                    className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                    value={formData.subCategory || ''}
                    onChange={e => {
                      const value = e.target.value;
                      console.log('Dropdown selected subCategory:', value);
                      setFormData(prev => ({ ...prev, subCategory: value }));
                      if (value) setErrors(prev => ({ ...prev, subCategory: undefined }));
                    }}
                  >
                    <option value="">Select Sub-Category</option>
                    {(subCategoryOptions[formData.category] || []).map(sub => (
                      <option key={typeof sub === 'object' ? sub.value : sub} value={typeof sub === 'object' ? sub.value : sub}>
                        {typeof sub === 'object' ? (sub.label || sub.value) : sub}
                      </option>
                    ))}
                  </select>
                  {errors.subCategory && <p className="text-red-600 text-sm flex items-center mt-1"><AlertCircle className="w-4 h-4 mr-1" />{errors.subCategory}</p>}
                </div>
              )}
              {/* Priority Dropdown */}
              {priorityField && (
                <div key={priorityField.id}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{priorityField.label}{priorityField.required && ' *'}</label>
                  <PriorityDropdown
                    value={formData[priorityField.id] || ''}
                    onChange={val => setFormData(prev => ({ ...prev, [priorityField.id]: val }))}
                    options={priorityOptions}
            />
          </div>
              )}
           
              {/* Debug log for clientMembers at render time */}
              {console.log('Dropdown clientMembers:', clientMembers)}
              {console.log('clientMembers for dropdown:', clientMembers)}
              {/* Reported by dropdown (custom, not mandatory) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reported by</label>
                <ReportedByDropdown
                  value={reportedBy}
                  onChange={setReportedBy}
                  options={clientMembers.filter(m => m.role === 'client' || m.role === 'client_head')}
                />
              </div>
              {/* Rest of the form fields */}
              {formConfig?.fields?.filter(f => !['module','category','subCategory','priority'].includes(f.id)).map(field => {
                if (field.id === 'reportedBy') {
                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}{field.required && ' *'}</label>
                      <select
                        value={reportedBy}
                        onChange={e => setReportedBy(e.target.value)}
                      >
                        <option value="">Select member</option>
                        {clientMembers.map(member => (
                          <option key={member.email} value={member.email}>{member.name || member.email}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (field.id === 'description') {
                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}{field.required && ' *'}</label>
                      <ReactQuill
                        value={formData.description || ''}
                        onChange={value => setFormData(prev => ({ ...prev, description: value }))}
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
                        className="bg-white rounded-xl border-2 border-gray-200 focus:border-blue-500 min-h-[120px] break-words w-full max-w-full overflow-x-hidden"
                        style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '100%', overflowX: 'hidden' }}
                        placeholder={`Please provide detailed information about your issue...`}
                      />
                      {errors.description && <p className="text-red-600 text-sm flex items-center mt-1"><AlertCircle className="w-4 h-4 mr-1" />{errors.description}</p>}
                      <p className="text-gray-400 text-xs mt-2">You can paste images/screenshots directly into the box above.</p>
                    </div>
                  );
                }
                if (field.type === 'dropdown') {
                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}{field.required && ' *'}</label>
                      <select
                        className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                        value={formData[field.id] || ''}
                        onChange={e => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                      >
                        <option value="">Select {field.label}</option>
                        {(Array.isArray(field.options) ? field.options : []).map(opt => (
                          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
                            {typeof opt === 'object' ? (opt.value || '') : opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (field.type === 'textarea') {
                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}{field.required && ' *'}</label>
                      <textarea
                        className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700 break-words resize-y max-w-full overflow-x-hidden"
                        style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '100%', overflowX: 'hidden' }}
                        value={formData[field.id] || ''}
                        onChange={e => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.label}
                      />
                    </div>
                  );
                }
                // Default to text input
                return (
                  <div key={field.id}>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}{field.required && ' *'}</label>
              <input
                type="text"
                      className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                value={formData[field.id] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                placeholder={field.label}
              />
                  </div>
                );
              })}
              {/* Attachments field stays as is */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-gray-600">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-sm font-medium">Attachments (Optional)</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.avi,.mov"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Add Files
                </button>
              </div>
              {attachments.length > 0 && (
                <div className="space-y-3 mt-4">
                  {attachments.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 shadow-sm"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          {getFileIcon(file)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
          </div>
        ))}
                </div>
              )}
              {attachmentError && (
                <div className="text-red-600 text-sm mt-2">{attachmentError}</div>
              )}
              </div>
            </div>

        {/* Error Message */}
        {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-2">
                <p className="text-red-600 text-sm flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              {errors.submit}
            </p>
          </div>
        )}

        {/* Submit Button */}
            <div className="flex justify-end mt-4">
          <button
            type="submit"
            disabled={isSubmitting}
                className={`px-8 py-4 rounded-xl font-semibold text-lg flex items-center space-x-3 transition-all duration-200 transform hover:scale-105 shadow-lg ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
            } text-white`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating Ticket...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Create Ticket</span>
              </>
            )}
          </button>
        </div>
      </form>
        </div>
      {/* Modal for image preview */}
      {previewFile && previewFile.type.startsWith('image/') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full relative flex flex-col items-center">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500"
              onClick={() => setPreviewFile(null)}
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewFile.data}
              alt={previewFile.name}
              className="max-h-[60vh] w-auto mx-auto rounded-lg border border-gray-200 bg-gray-100"
              onError={e => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                const fallback = document.getElementById('img-fallback');
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <div id="img-fallback" style={{display:'none'}} className="text-red-500 text-center mt-8">
              Unable to preview this image.<br/>Please make sure the file is a valid image.
            </div>
            <div className="mt-4 text-center text-gray-700 text-sm break-all">{previewFile.name}</div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
 
Client.defaultProps = {
  selectedProjectId: '',
  selectedProjectName: '',
};

Client.propTypes = {
  selectedProjectId: PropTypes.string,
  selectedProjectName: PropTypes.string,
  onTicketCreated: PropTypes.func,
};
 
export default Client;
 