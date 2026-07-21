'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists
    const tableDescription = await queryInterface.describeTable('beta_conversation');
    
    if (tableDescription.sentBy) {
      console.log('⚠️  Column "sentBy" already exists in beta_conversation, skipping');
      return;
    }

    await queryInterface.addColumn('beta_conversation', 'sentBy', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'user',
      after: 'origin' // MySQL specific - place column after 'origin'
    });

    console.log('✅ Column "sentBy" added to beta_conversation table');
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('beta_conversation');
    
    if (tableDescription.sentBy) {
      await queryInterface.removeColumn('beta_conversation', 'sentBy');
      console.log('✅ Column "sentBy" removed from beta_conversation table');
    }
  }
};
