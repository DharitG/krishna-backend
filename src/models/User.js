const { DataTypes } = require('sequelize');
const db = require('../services/database');

const User = db.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  auth0Id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  picture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Service authentication tokens (encrypted in the database)
  serviceTokens: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  // User preferences
  preferences: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      theme: 'dark',
      useTools: true,
      enabledTools: []
    }
  }
}, {
  timestamps: true
});

module.exports = User;