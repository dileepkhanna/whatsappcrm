const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function resetPassword() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '9948318650',
    database: 'whatscrm'
  });

  try {
    const email = 'dileeplekkala1425@gmail.com';
    const newPassword = 'password123';
    
    // Check if user exists
    const [users] = await connection.execute(
      'SELECT uid, email, name FROM user WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      console.log('❌ User not found:', email);
      return;
    }
    
    console.log('✅ User found:', users[0]);
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('\n🔐 New hashed password:', hashedPassword);
    
    // Update the password
    await connection.execute(
      'UPDATE user SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );
    
    console.log('\n✅ Password updated successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', newPassword);
    
    // Verify the update
    const [updated] = await connection.execute(
      'SELECT email, password FROM user WHERE email = ?',
      [email]
    );
    
    console.log('\n🔍 Verification - Password hash in DB:', updated[0].password);
    
    // Test bcrypt comparison
    const testCompare = await bcrypt.compare(newPassword, updated[0].password);
    console.log('✅ Password comparison test:', testCompare ? 'PASSED' : 'FAILED');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

resetPassword();
