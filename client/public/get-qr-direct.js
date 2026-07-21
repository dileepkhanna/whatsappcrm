// Get QR Code Directly - Bypass Socket.IO Issues
console.log("🔧 Direct QR Retrieval - Starting...\n");

(async function() {
  try {
    const token = localStorage.getItem('wacrm_user');
    if (!token) {
      console.log("❌ Not logged in!");
      return;
    }

    // The instance was created: test_qr_1782383076950
    // But QR wasn't delivered via Socket.IO
    // Let's try to regenerate or create a new one

    console.log("💡 Socket.IO has conflicts with React app");
    console.log("💡 Let's use the UI method instead\n");
    
    console.log("📋 ALTERNATIVE METHOD (Recommended):");
    console.log("=" + "=".repeat(59));
    console.log("\n1. Go to WhatsCRM Dashboard");
    console.log("2. Look for one of these pages:");
    console.log("   - 'QR Instances'");
    console.log("   - 'WhatsApp Instances'");
    console.log("   - 'Instances' menu");
    console.log("   - Or sidebar menu for QR/WhatsApp");
    console.log("\n3. Click 'Add New Instance' or 'Create QR' button");
    console.log("4. QR will appear in the UI (bypassing Socket.IO)");
    console.log("5. Scan with your phone");
    console.log("\n" + "=".repeat(60));

    // Check current instances
    console.log("\n🔍 Checking your current instances...");
    const response = await fetch('/api/qr/get_all', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const result = await response.json();
    
    if (result.success && result.data) {
      console.log(`\n✅ Found ${result.data.length} QR instance(s):\n`);
      result.data.forEach((inst, i) => {
        console.log(`${i + 1}. ${inst.title}`);
        console.log(`   Status: ${inst.status}`);
        console.log(`   Number: ${inst.number || 'Not connected yet'}`);
        console.log(`   ID: ${inst.uniqueId}\n`);
      });
      
      if (result.data.length > 0) {
        const latest = result.data[result.data.length - 1];
        console.log(`💡 Your latest instance: "${latest.title}"`);
        console.log(`   Status: ${latest.status}`);
        
        if (latest.status === 'GENERATING') {
          console.log("\n⚠️  QR is generating but not displayed due to Socket.IO conflict");
          console.log("💡 Best solution: Use the UI page to see QR code");
        } else if (latest.status === 'connected' || latest.status === 'ACTIVE') {
          console.log(`\n✅ Already connected! Number: ${latest.number}`);
          console.log("💡 You can start sending messages now!");
        }
      }
    }
    
    // Provide direct instructions
    console.log("\n🎯 WHAT TO DO NOW:");
    console.log("=" + "=".repeat(59));
    console.log("\nOption 1: Use UI (EASIEST - Recommended)");
    console.log("   1. Find 'QR Instances' or similar page in menu");
    console.log("   2. Click 'Add New' or look for existing instance");
    console.log("   3. QR code will show in the UI");
    console.log("   4. Scan and connect!");
    console.log("\nOption 2: Check Server Terminal");
    console.log("   1. Look at your server terminal (where npm start runs)");
    console.log("   2. You should see QR code generation logs");
    console.log("   3. QR data might be logged there");
    console.log("\nOption 3: Restart & Try Again");
    console.log("   1. Delete the GENERATING instance (if exists)");
    console.log("   2. Hard refresh browser (Ctrl+Shift+R)");
    console.log("   3. Use UI to create QR instance");
    console.log("\n💡 The Socket.IO conflict is preventing QR delivery to browser");
    console.log("   But the backend is working fine!");
    console.log("   Use the UI method to bypass this issue.\n");
    
  } catch (error) {
    console.error("Error:", error.message);
  }
})();
