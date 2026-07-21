require('dotenv').config();
module.exports = {
  development: {
    username: process.env.DBUSER || 'root',
    password: process.env.DBPASS || '',
    database: process.env.DBNAME || 'whatscrm',
    host: process.env.DBHOST || 'localhost',
    port: process.env.DBPORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      bigNumberStrings: true,
      decimalNumbers: true,
    },
    define: {
      timestamps: false,
      underscored: false,
      freezeTableName: true,
    },
  },
  production: {
    username: process.env.DBUSER || 'root',
    password: process.env.DBPASS || '',
    database: process.env.DBNAME || 'whatscrm',
    host: process.env.DBHOST || 'localhost',
    port: process.env.DBPORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: { 
      bigNumberStrings: true,
      decimalNumbers: true,
    },
    define: {
      timestamps: false,
      underscored: false,
      freezeTableName: true,
    },
  },
  test: {
    username: process.env.DBUSER || 'root',
    password: process.env.DBPASS || '',
    database: process.env.DBNAME + '_test' || 'whatscrm_test',
    host: process.env.DBHOST || 'localhost',
    port: process.env.DBPORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      bigNumberStrings: true,
      decimalNumbers: true,
    },
    define: {
      timestamps: false,
      underscored: false,
      freezeTableName: true,
    },
  },
};
