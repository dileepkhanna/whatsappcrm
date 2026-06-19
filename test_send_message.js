#!/usr/bin/env node
/**
 * Test Script: Send WhatsApp Message via WhatsCRM API
 * 
 * Usage:
 *   node test_send_message.js
 * 
 * This will send a test message to 919948318650
 */

const https = require('https');

// Configuration
const API_URL = 'https://dileepkhanna.dev';
const LOGIN_EMAIL = 'dileeplekkala23@gmail.com';
const LOGIN_PASSWORD = 'your_password_here'; // ⚠️ UPDATE THIS
const TEST_NUMBER = '919948318650';
const TEST_NAME = 'Dileep';
const TEST_MESSAGE = 'Hello! This is a test message from WhatsCRM API';

// Step 1: Login to get auth token
async function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD
    });

    const options = {
      hostname: 'dileepkhanna.dev',
      port: 443,
      path: '/api/user/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success && response.token) {
            console.log('✅ Login successful');
            console.log('Token:', response.token.substring(0, 20) + '...');
            resolve(response.token);
          } else {
            reject(new Error('Login failed: ' + (response.msg || 'Unknown error')));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Step 2: Send text message
async function sendMessage(token) {
  return new Promise((resolve, reject) => {
    const chatId = `meta_${TEST_NUMBER}`;
    
    const postData = JSON.stringify({
      text: TEST_MESSAGE,
      toNumber: TEST_NUMBER,
      toName: TEST_NAME,
      chatId: chatId
    });

    const options = {
      hostname: 'dileepkhanna.dev',
      port: 443,
      path: '/api/inbox/send_text',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      }
    };

    console.log('\n📤 Sending message...');
    console.log('To:', TEST_NUMBER);
    console.log('Message:', TEST_MESSAGE);
    console.log('Chat ID:', chatId);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('\n📨 Response:', JSON.stringify(response, null, 2));
          
          if (response.success) {
            console.log('\n✅ Message sent successfully!');
            console.log('Check WhatsApp on', TEST_NUMBER);
          } else {
            console.log('\n❌ Message failed:', response.msg);
          }
          
          resolve(response);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Main execution
async function main() {
  try {
    console.log('🚀 WhatsCRM API Test - Send Message\n');
    console.log('='.repeat(50));
    
    if (LOGIN_PASSWORD === 'your_password_here') {
      console.log('\n⚠️  WARNING: Please update LOGIN_PASSWORD in the script');
      console.log('Edit test_send_message.js and set your password\n');
      return;
    }
    
    const token = await login();
    await sendMessage(token);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Test completed');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
