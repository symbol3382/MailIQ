const express = require('express');
const router = express.Router();
const EmailController = require('../controllers/emailController');
const { authMiddleware } = require('../middlewares/auth');

// Fetch emails from Gmail and store in database
router.post('/sync', authMiddleware, EmailController.syncEmails);

// Get emails from database
router.get('/', authMiddleware, EmailController.getEmails);

// Get single email
router.get('/:id', authMiddleware, EmailController.getSingleEmail);

module.exports = router;

