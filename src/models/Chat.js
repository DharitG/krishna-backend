const { DataTypes } = require('sequelize');
const db = require('../services/database');

const Chat = db.define('Chat', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'New Chat'
  },
  messages: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  useTools: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  enabledTools: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  authStatus: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  timestamps: true
});

module.exports = Chat;