#!/usr/bin/env node

/**
 * WhatsApp Forms Bulk Send API Test
 * Tests the new bulk send endpoint
 */

const BASE_URL = 'http://localhost:3010';

// Test credentials
const TEST_USER = {
  email: 'dileeplekkala23@gmail.com',
  password: 'your_password_here' // UPDATE THIS
};

// Test phone numbers (use your own numbers for testing)
const TEST_NUMBERS = [
  '919876543210', // Replace with real test numbers
  '919876543211',
  '919876543212'
];

console.log('🧪 WhatsApp Forms Bulk Send API Test\n');
console.log('============================================\n');

async function runTest() {
  let authToken = null;
  
  try {
    // Step 1: Login
    console.log('📝 Step 1: Logging in...');
    const loginRes = await fetch(`${BASE_URL}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });
    
    const loginData = await loginRes.json();
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.msg);
      return;
    }
    
    authToken = loginData.token;
    console.log('✅ Logged in successfully\n');
    
    // Step 2: Get available forms
    console.log('📋 Step 2: Fetching available forms...');
    const formsRes = await fetch(`${BASE_URL}/api/waform/get-forms`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const formsData = await formsRes.json();
    if (!formsData.success || !formsData.data || formsData.data.length === 0) {
      console.error('❌ No forms found. Please create a form first.');
      return;
    }
    
    console.log(`✅ Found ${formsData.data.length} form(s)`);
    formsData.data.forEach((form, i) => {
      console.log(`   ${i+1}. ${form.name} (ID: ${form.id}, Status: ${form.flow_status})`);
    });
    console.log('');
    
    const testForm = formsData.data[0];
    console.log(`🎯 Using form: "${testForm.name}" (ID: ${testForm.id})\n`);
    
    // Step 3: Get phonebooks (optional)
    console.log('📚 Step 3: Checking phonebooks...');
    const phonebooksRes = await fetch(`${BASE_URL}/api/phonebook/get_by_uid`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const phonebooksData = await phonebooksRes.json();
    if (phonebooksData.success && phonebooksData.data && phonebooksData.data.length > 0) {
      console.log(`✅ Found ${phonebooksData.data.length} phonebook(s)`);
      phonebooksData.data.forEach((pb, i) => {
        console.log(`   ${i+1}. ${pb.name} (ID: ${pb.id}, Contacts: ${pb.contactCount || 0})`);
      });
    } else {
      console.log('⚠️  No phonebooks found');
    }
    console.log('');
    
    // Step 4: Test bulk send with phone numbers array
    console.log('🚀 Step 4: Testing bulk send with phone numbers array...');
    console.log(`   Sending to ${TEST_NUMBERS.length} numbers:`);
    TEST_NUMBERS.forEach((num, i) => {
      console.log(`   ${i+1}. ${num}`);
    });
    console.log('');
    
    const bulkSendRes = await fetch(`${BASE_URL}/api/waform/send-form-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        id: testForm.id,
        phoneNumbers: TEST_NUMBERS
      })
    });
    
    const bulkSendData = await bulkSendRes.json();
    
    if (bulkSendData.success) {
      console.log('✅ Bulk send completed!');
      console.log(`   Total: ${bulkSendData.results.total}`);
      console.log(`   Success: ${bulkSendData.results.success}`);
      console.log(`   Failed: ${bulkSendData.results.failed}`);
      
      if (bulkSendData.results.errors && bulkSendData.results.errors.length > 0) {
        console.log('\n❌ Errors:');
        bulkSendData.results.errors.forEach(err => {
          console.log(`   - ${err.phone}: ${err.error}`);
        });
      }
    } else {
      console.error('❌ Bulk send failed:', bulkSendData.msg);
      if (bulkSendData.error) {
        console.error('   Error:', bulkSendData.error);
      }
    }
    
    console.log('\n============================================');
    console.log('✅ TEST COMPLETE\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Test with phonebook (if you have one)
async function testWithPhonebook() {
  let authToken = null;
  
  try {
    console.log('\n============================================');
    console.log('🧪 Testing Bulk Send with Phonebook\n');
    
    // Step 1: Login
    console.log('📝 Logging in...');
    const loginRes = await fetch(`${BASE_URL}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });
    
    const loginData = await loginRes.json();
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.msg);
      return;
    }
    
    authToken = loginData.token;
    console.log('✅ Logged in\n');
    
    // Step 2: Get phonebooks
    console.log('📚 Fetching phonebooks...');
    const phonebooksRes = await fetch(`${BASE_URL}/api/phonebook/get_by_uid`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const phonebooksData = await phonebooksRes.json();
    if (!phonebooksData.success || !phonebooksData.data || phonebooksData.data.length === 0) {
      console.log('⚠️  No phonebooks found. Skipping phonebook test.');
      return;
    }
    
    const testPhonebook = phonebooksData.data[0];
    console.log(`✅ Using phonebook: "${testPhonebook.name}" (ID: ${testPhonebook.id}, Contacts: ${testPhonebook.contactCount || 0})\n`);
    
    // Step 3: Get forms
    const formsRes = await fetch(`${BASE_URL}/api/waform/get-forms`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const formsData = await formsRes.json();
    if (!formsData.success || !formsData.data || formsData.data.length === 0) {
      console.error('❌ No forms found');
      return;
    }
    
    const testForm = formsData.data[0];
    console.log(`🎯 Using form: "${testForm.name}" (ID: ${testForm.id})\n`);
    
    // Step 4: Bulk send to phonebook
    console.log('🚀 Sending form to all contacts in phonebook...\n');
    const bulkSendRes = await fetch(`${BASE_URL}/api/waform/send-form-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        id: testForm.id,
        phonebookId: testPhonebook.id
      })
    });
    
    const bulkSendData = await bulkSendRes.json();
    
    if (bulkSendData.success) {
      console.log('✅ Bulk send completed!');
      console.log(`   Total: ${bulkSendData.results.total}`);
      console.log(`   Success: ${bulkSendData.results.success}`);
      console.log(`   Failed: ${bulkSendData.results.failed}`);
      
      if (bulkSendData.results.errors && bulkSendData.results.errors.length > 0) {
        console.log('\n❌ Errors:');
        bulkSendData.results.errors.forEach(err => {
          console.log(`   - ${err.phone} (${err.name}): ${err.error}`);
        });
      }
    } else {
      console.error('❌ Bulk send failed:', bulkSendData.msg);
    }
    
    console.log('\n============================================');
    console.log('✅ PHONEBOOK TEST COMPLETE\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
  }
}

// Run tests
(async () => {
  await runTest();
  // Uncomment to test with phonebook:
  // await testWithPhonebook();
})();
