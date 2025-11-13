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
  const [viewMode, setViewMode] = useState('list'); // 'list', 'domains', 'froms', 'emails'
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [domainsStats, setDomainsStats] = useState([]);
  const [fromsList, setFromsList] = useState([]);
  const [filteredEmails, setFilteredEmails] = useState([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [loadingFroms, setLoadingFroms] = useState(false);
  const [loadingEmailsByFrom, setLoadingEmailsByFrom] = useState(false);
  const [deletingFrom, setDeletingFrom] = useState(null);
  const [markingAsRead, setMarkingAsRead] = useState(null);
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
      const response = await emailAPI.syncEmails();
      
      // Show sync results
      let syncMessage = `Sync completed!\n\n`;
      syncMessage += `✓ New emails synced: ${response.data.synced || 0}\n`;
      syncMessage += `⊘ Already existed: ${response.data.skipped || 0}\n`;
      if (response.data.deleted > 0) {
        syncMessage += `✗ Deleted from database: ${response.data.deleted} (no longer in Gmail)\n`;
      }
      syncMessage += `\nTotal in Gmail: ${response.data.totalInGmail || 0}\n`;
      syncMessage += `Total in database: ${response.data.totalInDatabase || 0}`;
      
      alert(syncMessage);
      
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

  const loadDomainStats = async () => {
    try {
      setLoadingDomains(true);
      const response = await emailAPI.getDomainStats();
      setDomainsStats(response.data.domains || []);
    } catch (err) {
      console.error('Error loading domain stats:', err);
      setError('Failed to load domain statistics');
    } finally {
      setLoadingDomains(false);
    }
  };

  const loadFromsForDomain = async (domain) => {
    try {
      setLoadingFroms(true);
      const response = await emailAPI.getFromsForDomain(domain);
      setFromsList(response.data.froms || []);
    } catch (err) {
      console.error('Error loading froms for domain:', err);
      setError('Failed to load froms for domain');
    } finally {
      setLoadingFroms(false);
    }
  };

  const loadEmailsByFrom = async (fromEmail) => {
    try {
      setLoadingEmailsByFrom(true);
      const response = await emailAPI.getEmailsByFrom(fromEmail);
      setFilteredEmails(response.data.emails || []);
    } catch (err) {
      console.error('Error loading emails by from:', err);
      setError('Failed to load emails');
    } finally {
      setLoadingEmailsByFrom(false);
    }
  };

  const handleDomainClick = (domain) => {
    setSelectedDomain(domain);
    setSelectedFrom(null);
    setViewMode('froms');
    loadFromsForDomain(domain);
  };

  const handleFromClick = (fromEmail) => {
    setSelectedFrom(fromEmail);
    setViewMode('emails');
    loadEmailsByFrom(fromEmail);
  };

  const handleBackToDomains = () => {
    setSelectedDomain(null);
    setSelectedFrom(null);
    setFromsList([]);
    setFilteredEmails([]);
    setViewMode('domains');
  };

  const handleBackToFroms = () => {
    setSelectedFrom(null);
    setFilteredEmails([]);
    setViewMode('froms');
  };

  const handleDomainViewClick = () => {
    setViewMode('domains');
    setSelectedDomain(null);
    setSelectedFrom(null);
    setFromsList([]);
    setFilteredEmails([]);
    loadDomainStats();
  };

  const handleMarkDomainAsRead = async (domain) => {
    try {
      setMarkingAsRead(`domain-${domain}`);
      setError('');
      
      const response = await emailAPI.markDomainAsRead(domain);
      
      // Refresh the domain stats and froms list
      await loadDomainStats();
      if (selectedDomain === domain) {
        await loadFromsForDomain(domain);
      }
      
      alert(`Marked ${response.data.marked} email(s) as read from domain ${domain}`);
      
    } catch (err) {
      console.error('Error marking domain as read:', err);
      setError('Failed to mark domain as read');
    } finally {
      setMarkingAsRead(null);
    }
  };

  const handleMarkFromAsRead = async (fromEmail) => {
    try {
      setMarkingAsRead(`from-${fromEmail}`);
      setError('');
      
      const response = await emailAPI.markFromAsRead(fromEmail);
      
      // Refresh the froms list
      if (selectedDomain) {
        await loadFromsForDomain(selectedDomain);
      }
      
      // Refresh emails if viewing that from
      if (selectedFrom === fromEmail) {
        await loadEmailsByFrom(fromEmail);
      }
      
      alert(`Marked ${response.data.marked} email(s) as read from ${fromEmail}`);
      
    } catch (err) {
      console.error('Error marking from as read:', err);
      setError('Failed to mark from as read');
    } finally {
      setMarkingAsRead(null);
    }
  };

  const handleMarkEmailAsRead = async (emailId) => {
    try {
      setMarkingAsRead(`email-${emailId}`);
      setError('');
      
      await emailAPI.markEmailAsRead(emailId);
      
      // Refresh emails if viewing emails by from
      if (selectedFrom) {
        await loadEmailsByFrom(selectedFrom);
      } else {
        // Refresh current page
        await loadEmails(currentPage);
      }
      
    } catch (err) {
      console.error('Error marking email as read:', err);
      setError('Failed to mark email as read');
    } finally {
      setMarkingAsRead(null);
    }
  };

  const handleDeleteFrom = async (fromEmail, emailCount) => {
    const confirmMessage = `Are you sure you want to delete all ${emailCount} email(s) from ${fromEmail}? This action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setDeletingFrom(fromEmail);
      setError('');
      
      const response = await emailAPI.deleteEmailsByFrom(fromEmail);
      
      // Refresh the froms list after deletion
      if (selectedDomain) {
        await loadFromsForDomain(selectedDomain);
      }
      
      // Refresh domain stats to update counts
      if (viewMode === 'domains' || viewMode === 'froms') {
        await loadDomainStats();
      }
      
      // Show success message
      let successMessage = `Successfully deleted ${response.data.deleted} email(s) from database`;
      
      if (response.data.requiresReauth) {
        successMessage = `Emails deleted from database, but Gmail deletion failed.\n\n${response.data.warning}\n\nPlease log out and log back in to grant delete permissions.`;
        alert(successMessage);
        return;
      }
      
      if (response.data.gmailDeleted !== undefined) {
        successMessage += `\n${response.data.gmailDeleted} email(s) deleted from Gmail`;
        if (response.data.gmailDeleted < response.data.totalGmailIds) {
          successMessage += `\nWarning: ${response.data.totalGmailIds - response.data.gmailDeleted} email(s) could not be deleted from Gmail`;
        }
      }
      if (response.data.warning) {
        successMessage += `\n${response.data.warning}`;
      }
      alert(successMessage);
      
    } catch (err) {
      console.error('Error deleting emails:', err);
      setError('Failed to delete emails');
    } finally {
      setDeletingFrom(null);
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
          <div className="email-controls">
            <p>Total emails: {totalEmails} | Page {currentPage} of {totalPages}</p>
            <div className="view-controls">
              <button onClick={() => { setViewMode('list'); setSelectedDomain(null); setSelectedFrom(null); }}>
                List View
              </button>
              <button onClick={handleDomainViewClick}>
                Domain View
              </button>
              {viewMode === 'froms' && (
                <button onClick={handleBackToDomains}>
                  ← Back to Domains
                </button>
              )}
              {viewMode === 'emails' && (
                <button onClick={handleBackToFroms}>
                  ← Back to Froms
                </button>
              )}
            </div>
          </div>

          {viewMode === 'list' && (
            <table border="1" cellPadding="5" cellSpacing="0">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Date</th>
                  <th>Snippet</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email._id}>
                    <td>{email.isRead ? email.from : <strong>{email.from}</strong>}</td>
                    <td>{email.isRead ? email.subject : <strong>{email.subject}</strong>}</td>
                    <td>{formatDate(email.date)}</td>
                    <td>{email.snippet}</td>
                    <td>
                      {!email.isRead && (
                        <button 
                          onClick={() => handleMarkEmailAsRead(email._id)}
                          disabled={markingAsRead === `email-${email._id}`}
                        >
                          {markingAsRead === `email-${email._id}` ? 'Marking...' : 'Mark as Read'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'domains' && (
            <div className="domain-view">
              <h2>Domains</h2>
              {loadingDomains ? (
                <p>Loading domain statistics...</p>
              ) : (
                <table border="1" cellPadding="5" cellSpacing="0">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Total Emails</th>
                      <th>Unique Froms</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainsStats.length === 0 ? (
                      <tr>
                        <td colSpan="4">No domains found</td>
                      </tr>
                    ) : (
                      domainsStats.map((domainStat) => (
                        <tr key={domainStat.domain}>
                          <td><strong>{domainStat.domain}</strong></td>
                          <td>{domainStat.emailCount}</td>
                          <td>{domainStat.uniqueFromCount}</td>
                          <td>
                            <div className="domain-actions">
                              <button onClick={() => handleDomainClick(domainStat.domain)}>
                                View Froms
                              </button>
                              <button 
                                onClick={() => handleMarkDomainAsRead(domainStat.domain)}
                                disabled={markingAsRead === `domain-${domainStat.domain}`}
                              >
                                {markingAsRead === `domain-${domainStat.domain}` ? 'Marking...' : 'Mark as Read'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {viewMode === 'froms' && selectedDomain && (
            <div className="froms-view">
              <h2>Froms in Domain: {selectedDomain}</h2>
              {loadingFroms ? (
                <p>Loading froms...</p>
              ) : (
                <table border="1" cellPadding="5" cellSpacing="0">
                  <thead>
                    <tr>
                      <th>From Email</th>
                      <th>Email Count</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fromsList.length === 0 ? (
                      <tr>
                        <td colSpan="3">No froms found for this domain</td>
                      </tr>
                    ) : (
                      fromsList.map((fromStat) => (
                        <tr key={fromStat.from}>
                          <td><strong>{fromStat.from}</strong></td>
                          <td>{fromStat.count}</td>
                          <td>
                            <div className="from-actions">
                              <button onClick={() => handleFromClick(fromStat.from)}>
                                View Emails
                              </button>
                              <button 
                                onClick={() => handleMarkFromAsRead(fromStat.from)}
                                disabled={markingAsRead === `from-${fromStat.from}`}
                              >
                                {markingAsRead === `from-${fromStat.from}` ? 'Marking...' : 'Mark as Read'}
                              </button>
                              <button 
                                onClick={() => handleDeleteFrom(fromStat.from, fromStat.count)}
                                disabled={deletingFrom === fromStat.from}
                              >
                                {deletingFrom === fromStat.from ? 'Deleting...' : 'Delete All'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {viewMode === 'emails' && selectedFrom && (
            <div className="emails-view">
              <h2>Emails from: {selectedFrom}</h2>
              {loadingEmailsByFrom ? (
                <p>Loading emails...</p>
              ) : (
                <>
                  <p>Total: {filteredEmails.length} emails</p>
                  {filteredEmails.length === 0 ? (
                    <p>No emails found from this sender</p>
                  ) : (
                    <table border="1" cellPadding="5" cellSpacing="0">
                      <thead>
                        <tr>
                          <th>From</th>
                          <th>Subject</th>
                          <th>Date</th>
                          <th>Snippet</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmails.map((email) => (
                          <tr key={email._id}>
                            <td>{email.isRead ? email.from : <strong>{email.from}</strong>}</td>
                            <td>{email.isRead ? email.subject : <strong>{email.subject}</strong>}</td>
                            <td>{formatDate(email.date)}</td>
                            <td>{email.snippet}</td>
                            <td>
                              {!email.isRead && (
                                <button 
                                  onClick={() => handleMarkEmailAsRead(email._id)}
                                  disabled={markingAsRead === `email-${email._id}`}
                                >
                                  {markingAsRead === `email-${email._id}` ? 'Marking...' : 'Mark as Read'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}
          
          {viewMode === 'list' && totalPages > 1 && (
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

