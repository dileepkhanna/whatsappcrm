const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function deepDebug() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '9948318650',
    database: 'whatscrm'
  });

  try {
    const email = 'dileeplekkala1425@gmail.com';
    const testPassword = 'password123';
    
    console.log('🔍 Deep Investigation: dileeplekkala1425@gmail.com');
    console.log('='.repeat(70));
    
    // Get the user
    const [users] = await connection.execute(
      'SELECT uid, email, name, password FROM user WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      console.log('❌ User not found in database');
      return;
    }
    
    const user = users[0];
    console.log('\n✅ User found in database:');
    console.log('   UID:', user.uid);
    console.log('   Email:', user.email);
    console.log('   Name:', user.name);
    console.log('   Password Hash:', user.password);
    console.log('   Hash starts with:', user.password.substring(0, 7));
    console.log('   Hash length:', user.password.length);
    
    // Test bcrypt comparison
    console.log('\n' + '='.repeat(70));
    console.log('🧪 Testing bcrypt.compare() with "password123"...');
    
    const compareResult = await bcrypt.compare(testPassword, user.password);
    console.log('   Result:', compareResult ? '✅ MATCH' : '❌ NO MATCH');
    
    if (!compareResult) {
      console.log('\n⚠️  PASSWORD DOES NOT MATCH!');
      console.log('   Possible reasons:');
      console.log('   1. Password was changed by another process after our reset');
      console.log('   2. Database was modified by the other project you mentioned');
      console.log('   3. There might be special characters or encoding issues');
      
      // Try to set it again right now
      console.log('\n🔄 Attempting to reset password RIGHT NOW...');
      const freshHash = await bcrypt.hash(testPassword, 10);
      
      await connection.execute(
        'UPDATE user SET password = ? WHERE email = ?',
        [freshHash, email]
      );
      
      console.log('✅ Password reset complete');
      console.log('   New hash:', freshHash);
      
      // Verify immediately
      const [updatedUsers] = await connection.execute(
        'SELECT password FROM user WHERE email = ?',
        [email]
      );
      
      const immediateTest = await bcrypt.compare(testPassword, updatedUsers[0].password);
      console.log('   Immediate verification:', immediateTest ? '✅ WORKS' : '❌ STILL BROKEN');
      
    } else {
      console.log('\n✅ Password matches in database!');
      console.log('   This means the database is correct.');
      console.log('\n🤔 But login still fails? Possible reasons:');
      console.log('   1. Server not properly restarted (old code still running)');
      console.log('   2. Server might be using a DIFFERENT database');
      console.log('   3. Server might be using different bcrypt rounds');
      console.log('   4. Middleware or JWT issue');
      console.log('   5. Server environment variable DBNAME might be wrong');
    }
    
    // Check if server is connecting to the right database
    console.log('\n' + '='.repeat(70));
    console.log('🔍 Checking database connection configuration...');
    console.log('   Current database:', 'whatscrm');
    console.log('   Server .env file should have: DBNAME=whatscrm');
    
    // Check if there are other databases
    const [databases] = await connection.query('SHOW DATABASES');
    console.log('\n📊 Available databases on MySQL server:');
    databases.forEach((db) => {
      if (db.Database !== 'information_schema' && 
          db.Database !== 'mysql' && 
          db.Database !== 'performance_schema' &&
          db.Database !== 'sys') {
        console.log('   -', db.Database);
      }
    });
    
    console.log('\n⚠️  If you see multiple databases with user data,');
    console.log('   the server might be connecting to a different one!');
    
    // Final recommendation
    console.log('\n' + '='.repeat(70));
    console.log('📝 RECOMMENDATION:');
    console.log('   1. Stop ALL node processes: taskkill /F /IM node.exe');
    console.log('   2. Verify .env has: DBNAME=whatscrm');
    console.log('   3. Start server fresh: node server.js');
    console.log('   4. Try login again');
    console.log('\n   OR just use the working account: dileeplekkala14@gmail.com');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

deepDebug();
