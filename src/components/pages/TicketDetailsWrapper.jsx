import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TicketDetails from './TicketDetails';
 
const TicketDetailsWrapper = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const handleBack = () => navigate(-1);
  return <TicketDetails ticketId={ticketId} onBack={handleBack} onAssign={() => {}} />;
};
 
export default TicketDetailsWrapper;
 
 