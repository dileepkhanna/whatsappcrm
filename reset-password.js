const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '9948318650',
      database: 'whatscrm'
    });

    const email = 'dileeplekkala1425@gmail.com';
    const newPassword = 'password123'; // Change this to your desired password
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password
    await conn.query('UPDATE user SET password = ? WHERE email = ?', [hashedPassword, email]);
    
    console.log('✅ Password reset successful!');
    console.log('Email:', email);
    console.log('New Password:', newPassword);
    console.log('\n⚠️  Please change this password after logging in!');

    await conn.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
