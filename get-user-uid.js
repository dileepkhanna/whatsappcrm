const mysql = require('mysql2/promise');

async function getUID() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '9948318650',
    database: 'whatscrm'
  });

  try {
    const email = 'dileeplekkala14@gmail.com';
    
    const [users] = await connection.execute(
      'SELECT uid, name, email FROM user WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = users[0];
    
    console.log('✅ User Details:');
    console.log('   Name:', user.name);
    console.log('   Email:', user.email);
    console.log('   UID:', user.uid);
    console.log('\n' + '='.repeat(70));
    console.log('📝 WhatsApp Webhook Configuration:');
    console.log('\n1. Callback URL:');
    console.log(`   https://eswarigroup.in/api/inbox/embed/webhook/${user.uid}`);
    console.log(`   OR (for ngrok testing):`);
    console.log(`   https://your-ngrok-url.ngrok-free.dev/api/inbox/embed/webhook/${user.uid}`);
    console.log('\n2. Verify Token:');
    console.log(`   ${user.uid}`);
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  IMPORTANT: The UID in the URL and the Verify Token MUST be the same!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

getUID();
