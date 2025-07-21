import emailjs from 'emailjs-com';
 
/**
 * Sends an email using EmailJS
 * @param {Object} params - The template parameters for EmailJS
 * @param {string} templateId - The EmailJS template ID to use
 * @returns {Promise}
 *
 * Recommended EmailJS subject template:
 *   [{{project}}] Ticket #{{request_id}} - {{subject}} ({{status}})
 */
export const sendEmail = async (params, templateId) => {
  const SERVICE_ID = 'service_knwvnzo';
  const PUBLIC_KEY = 'pW77ZZ67pUHwzHIRa';
 
  console.log('[DEBUG] sendEmail called with:', { SERVICE_ID, templateId, params });
 
  // Example of how to build the params object for EmailJS
  // (Fill these fields when calling sendEmail)
  // const emailParams = {
  //   to_email: 'recipient1@example.com,recipient2@example.com',
  //   from_name: 'Articket Support',
  //   reply_to: 'support@yourdomain.com',
  //   subject: ticketSubject, // optional, if your template uses it
  //   request_id: ticketId,
  //   status: ticketStatus,
  //   priority: ticketPriority,
  //   category: ticketCategory,
  //   project: ticketProject,
  //   assigned_to: assignedTo,
  //   created: createdDate,
  //   requester: `${requesterName} (${requesterEmail})`,
  //   description: ticketDescription,
  //   comment: commentText, // Only for comment notification
  //   ticket_link: `https://your-app-domain/tickets/${ticketId}`,
  // };
 
  try {
    await emailjs.send(SERVICE_ID, templateId, params, PUBLIC_KEY);
    console.log('[DEBUG] sendEmail success');
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};