const express = require('express');
const router = express.Router();
const EmailController = require('../controllers/emailController');
const { authMiddleware } = require('../middlewares/auth');

// Fetch emails from Gmail and store in database
router.post('/sync', authMiddleware, EmailController.syncEmails);

// Get emails from database
router.get('/', authMiddleware, EmailController.getEmails);

// Get domain statistics from all emails
router.get('/stats/domains', authMiddleware, EmailController.getDomainStats);

// Get froms for a specific domain
router.get('/stats/domains/:domain/froms', authMiddleware, EmailController.getFromsForDomain);

// Get all emails from a specific from address
router.get('/from/:fromEmail', authMiddleware, EmailController.getEmailsByFrom);

// Delete all emails from a specific from address
router.delete('/from/:fromEmail', authMiddleware, EmailController.deleteEmailsByFrom);

// Mark all emails from a specific from address as read
router.post('/from/:fromEmail/mark-read', authMiddleware, EmailController.markFromAsRead);

// Mark all emails from a domain as read
router.post('/domain/:domain/mark-read', authMiddleware, EmailController.markDomainAsRead);

// Mark single email as read
router.post('/:id/mark-read', authMiddleware, EmailController.markEmailAsRead);

// Get single email (must be last to avoid route conflicts)
router.get('/:id', authMiddleware, EmailController.getSingleEmail);

module.exports = router;

