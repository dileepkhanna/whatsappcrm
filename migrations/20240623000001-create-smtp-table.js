'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables()
      .then(tables => tables.includes('smtp'));
    
    if (tableExists) {
      console.log('⚠️  Table "smtp" already exists, skipping creation');
      return;
    }

    await queryInterface.createTable('smtp', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      host: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      port: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      username: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4'
    });

    console.log('✅ Table "smtp" created successfully');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('smtp');
    console.log('✅ Table "smtp" dropped successfully');
  }
};
