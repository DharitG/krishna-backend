const sequelize = require('../services/database');
const User = require('./User');
const Chat = require('./Chat');

// Define relationships
User.hasMany(Chat, {
  foreignKey: 'userId',
  as: 'chats'
});

Chat.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

const initDatabase = async (force = false) => {
  try {
    // Sync all models with database
    await sequelize.sync({ force });
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Error syncing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  User,
  Chat,
  initDatabase
};