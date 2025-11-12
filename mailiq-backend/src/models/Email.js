const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  gmailId: {
    type: String,
    required: true,
    unique: true
  },
  threadId: {
    type: String,
    required: true
  },
  from: {
    type: String,
    required: true
  },
  to: {
    type: String
  },
  subject: {
    type: String,
    default: '(No Subject)'
  },
  snippet: {
    type: String
  },
  body: {
    type: String
  },
  date: {
    type: Date,
    required: true
  },
  labels: [{
    type: String
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  isStarred: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster queries
emailSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Email', emailSchema);

