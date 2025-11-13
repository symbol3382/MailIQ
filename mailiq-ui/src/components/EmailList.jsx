import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailAPI, authAPI } from '../services/api';

function EmailList() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [limit] = useState(50);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadEmails(currentPage);
    }
  }, [currentPage, user]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/');
        return;
      }

      const response = await authAPI.verifyToken();
      setUser(response.data.user);
    } catch (err) {
      console.error('Auth check failed:', err);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/');
    }
  };

  const loadEmails = async (page = 1) => {
    try {
      setLoading(true);
      const response = await emailAPI.getEmails(page, limit);
      setEmails(response.data.emails);
      setTotalPages(response.data.totalPages);
      setTotalEmails(response.data.total);
      setCurrentPage(parseInt(response.data.currentPage));
      setError('');
    } catch (err) {
      console.error('Error loading emails:', err);
      setError('Failed to load emails');
    } finally {
      setLoading(false);
    }
  };

  const syncEmails = async () => {
    try {
      setSyncing(true);
      setError('');
      await emailAPI.syncEmails();
      await loadEmails(1); // Reset to first page after sync
      setCurrentPage(1);
    } catch (err) {
      console.error('Error syncing emails:', err);
      setError('Failed to sync emails');
    } finally {
      setSyncing(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="email-list-container">
      <header className="email-header">
        <div>
          <h1>MailIQ</h1>
          {user && <p>Logged in as: {user.email}</p>}
        </div>
        <div className="button-group">
          <button onClick={syncEmails} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Emails'}
          </button>
          <button onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="loading-message">
          <p>Loading emails...</p>
        </div>
      )}

      {!loading && emails.length === 0 && (
        <div className="empty-state">
          <h2>No emails found</h2>
          <p>Click "Sync Emails" to fetch your emails from Gmail</p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div className="emails-content">
          <p>Total emails: {totalEmails} | Page {currentPage} of {totalPages}</p>
          <table border="1" cellPadding="5" cellSpacing="0">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Snippet</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr key={email._id}>
                  <td>{email.isRead ? email.from : <strong>{email.from}</strong>}</td>
                  <td>{email.isRead ? email.subject : <strong>{email.subject}</strong>}</td>
                  <td>{formatDate(email.date)}</td>
                  <td>{email.snippet}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                First
              </button>
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
              <button 
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EmailList;

