# Support Ticket Management System

A modern, full-featured support ticket management system built with React, Vite, and Firebase. This application provides a seamless experience for both clients and administrators to manage support requests efficiently.

## Features

### Ticketing System

The core of the application is a robust ticketing system that allows:

- **Ticket Creation**
  - Submit detailed support requests with subject, description, and category
  - Set priority levels (Low, Medium, High)
  - Attach relevant files (up to 10MB per file)
  - Specify due dates for resolution
  - Categorize tickets (Technical Issue, Bug Report, Feature Request, etc.)

- **Ticket Management**
  - Real-time ticket status updates
  - Status workflow: Open → In Progress → Resolved → Closed
  - Priority-based organization
  - File attachments support
  - Due date tracking
  - Star/favorite important tickets

- **Communication**
  - Built-in messaging system for ticket updates
  - Real-time notifications
  - Thread-based conversations
  - Support for both admin and client responses

### User Roles

1. **Client Dashboard**
   - View and manage personal tickets
   - Submit new support requests
   - Track ticket status and updates
   - Communicate with support team
   - View ticket history

2. **Admin Dashboard**
   - Comprehensive ticket management
   - Status updates and assignments
   - Priority management
   - Advanced filtering and search
   - Bulk actions
   - Analytics and reporting

### Security

- Role-based access control
- Secure file handling
- Real-time data synchronization
- Protected routes and operations

## Technical Stack

- **Frontend**: React + Vite
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Storage**: Firebase Storage
- **Styling**: Tailwind CSS
- **Icons**: Lucide Icons

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up Firebase configuration
4. Run the development server: `npm run dev`

## Project Structure

```
src/
├── components/
│   ├── pages/
│   │   ├── Admin.jsx        # Admin dashboard
│   │   ├── ClientDashboard.jsx  # Client dashboard
│   │   └── Ticketing.jsx    # Ticket creation form
│   └── ...
├── firebase/
│   └── config.js           # Firebase configuration
└── ...
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
