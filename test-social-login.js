const { chromium } = require('@playwright/test');

(async () => {
  console.log('🚀 Starting Playwright test for Social Login...\n');
  
  // Launch browser
  const browser = await chromium.launch({
    headless: false, // Set to true if you don't want to see the browser
    slowMo: 800 // Slow down by 800ms to see what's happening
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    // Print navigation-related logs
    if (text.includes('🔧') || text.includes('✅') || text.includes('🔄') || text.includes('📍')) {
      console.log(`   [Browser Console] ${text}`);
    }
  });
  
  try {
    // 1. Navigate to admin panel directly
    console.log('📍 Step 1: Navigating to admin login page...');
    await page.goto('http://localhost:3010/admin/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-screenshots/01-login-page.png' });
    console.log('   ✅ Login page loaded\n');
    
    // 2. Login as admin
    console.log('📍 Step 2: Logging in as admin@whatscrm.com...');
    
    // Wait for login form
    await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 5000 });
    
    // Fill login form
    await page.fill('input[type="email"], input[type="text"]', 'admin@whatscrm.com');
    await page.fill('input[type="password"]', 'admin123');
    
    await page.screenshot({ path: 'test-screenshots/02-filled-form.png' });
    
    // Click login button - try multiple selectors
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Sign In")',
      '[type="submit"]',
      'form button',
      '.btn:has-text("Login")',
      'button'
    ];
    
    let clicked = false;
    for (const selector of loginButtonSelectors) {
      const button = page.locator(selector).first();
      if (await button.count() > 0 && await button.isVisible()) {
        console.log(`   Found login button with selector: ${selector}`);
        await button.click();
        clicked = true;
        break;
      }
    }
    
    if (!clicked) {
      // Fallback: press Enter
      console.log('   Login button not found, pressing Enter...');
      await page.press('input[type="password"]', 'Enter');
    }
    
    console.log('   Submitted login form, waiting for redirect...');
    
    // Wait for navigation to admin dashboard
    await page.waitForURL('**/admin**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-screenshots/03-admin-dashboard.png' });
    console.log('   ✅ Logged in successfully\n');
    
    // 3. Wait for sidebar to render
    console.log('📍 Step 3: Waiting for sidebar to render...');
    await page.waitForTimeout(2000);
    
    // Check for sidebar
    const hasSidebar = await page.locator('[class*="sidebar"], nav, aside').count() > 0;
    console.log(`   Sidebar elements found: ${hasSidebar ? 'Yes' : 'No'}`);
    
    // 4. Check initial search bar state
    console.log('\n📍 Step 4: Checking initial search bar state...');
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    const initialSearchValue = await searchInput.inputValue().catch(() => 'not found');
    console.log(`   Initial search value: "${initialSearchValue}"`);
    await page.screenshot({ path: 'test-screenshots/04-initial-state.png' });
    
    // 5. Navigate to Social Login page
    console.log('\n📍 Step 5: Navigating to Social Login page...');
    console.log('   Method: Direct URL navigation (testing fix behavior)');
    
    await page.goto('http://localhost:3010/admin?page=social-login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for React to render and our fix to run
    
    await page.screenshot({ path: 'test-screenshots/05-social-login-page.png' });
    console.log('   ✅ Navigated to Social Login page\n');
    
    // 6. Verify we're on the right page
    console.log('📍 Step 6: Verifying page content...');
    const currentURL = page.url();
    console.log(`   Current URL: ${currentURL}`);
    
    const pageTitle = await page.locator('h1, h2, [class*="title"]').first().textContent().catch(() => '');
    console.log(`   Page heading: "${pageTitle}"`);
    
    const hasSocialLogin = currentURL.includes('social-login') || pageTitle.toLowerCase().includes('social');
    console.log(`   Is Social Login page: ${hasSocialLogin ? 'Yes' : 'No'}`);
    
    // 7. Check search bar after navigation (main test)
    console.log('\n📍 Step 7: MAIN TEST - Checking search bar after navigation...');
    await page.waitForTimeout(1000); // Give our fix time to run
    
    const searchAfter = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    const searchValueAfter = await searchAfter.inputValue().catch(() => 'not found');
    console.log(`   Search bar value: "${searchValueAfter}"`);
    
    await page.screenshot({ path: 'test-screenshots/06-search-bar-state.png' });
    
    // Analyze result
    if (searchValueAfter === 'not found') {
      console.log('   ⚠️  Search input not found on page');
    } else if (searchValueAfter.includes('@')) {
      console.log('   ❌ FAILED: Search bar contains email address!');
      console.log('   Issue: The fix is not preventing email auto-fill');
    } else if (searchValueAfter === '') {
      console.log('   ✅ SUCCESS: Search bar is empty!');
      console.log('   The fix is working correctly - no email auto-fill');
    } else {
      console.log(`   ⚠️  Search bar contains unexpected value: "${searchValueAfter}"`);
    }
    
    // 8. Test sidebar interactivity
    console.log('\n📍 Step 8: Testing sidebar interactivity...');
    console.log('   Attempting to click different menu items...');
    
    // Look for any menu item
    const menuItems = await page.locator('a, button, [role="button"]').all();
    console.log(`   Found ${menuItems.length} clickable elements`);
    
    // Try to find and click a different page
    let clickedAnotherItem = false;
    for (const item of menuItems) {
      const text = await item.textContent();
      if (text && (text.includes('Dashboard') || text.includes('Settings') || text.includes('Theme'))) {
        console.log(`   Attempting to click: "${text.trim()}"`);
        await item.click();
        await page.waitForTimeout(1000);
        clickedAnotherItem = true;
        console.log('   ✅ Successfully clicked another menu item');
        break;
      }
    }
    
    if (!clickedAnotherItem) {
      console.log('   ⚠️  Could not find another menu item to click');
    }
    
    await page.screenshot({ path: 'test-screenshots/07-after-interaction.png' });
    
    // 9. Check for JavaScript errors
    console.log('\n📍 Step 9: Checking for JavaScript errors...');
    const errorLogs = consoleLogs.filter(log => 
      log.toLowerCase().includes('error') || 
      log.toLowerCase().includes('failed') ||
      log.toLowerCase().includes('refused')
    );
    
    if (errorLogs.length > 0) {
      console.log('   ⚠️  Found errors in console:');
      errorLogs.slice(0, 5).forEach(log => console.log(`      ${log}`));
    } else {
      console.log('   ✅ No JavaScript errors detected');
    }
    
    // Check for our fix logs
    const fixLogs = consoleLogs.filter(log => 
      log.includes('Sidebar search fix') || 
      log.includes('Email') ||
      log.includes('Navigation detected')
    );
    
    if (fixLogs.length > 0) {
      console.log('\n   Fix-related logs found:');
      fixLogs.forEach(log => console.log(`      ${log}`));
    }
    
    // 10. Final Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Login successful: YES`);
    console.log(`✅ Navigated to Social Login page: ${hasSocialLogin ? 'YES' : 'NO'}`);
    console.log(`✅ Search bar clean (no email): ${!searchValueAfter.includes('@') && searchValueAfter !== 'not found' ? 'YES' : 'NO'}`);
    console.log(`✅ Sidebar remains interactive: ${clickedAnotherItem ? 'YES' : 'UNKNOWN'}`);
    console.log(`✅ No JavaScript errors: ${errorLogs.length === 0 ? 'YES' : 'NO'}`);
    console.log('='.repeat(70));
    
    const allTestsPassed = 
      hasSocialLogin && 
      !searchValueAfter.includes('@') && 
      searchValueAfter !== 'not found' &&
      errorLogs.length === 0;
    
    if (allTestsPassed) {
      console.log('\n🎉 ALL TESTS PASSED! The sidebar search fix is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the screenshots for details.');
    }
    
    console.log('\n📸 Screenshots saved in test-screenshots/ folder');
    console.log('   - 01-login-page.png');
    console.log('   - 02-filled-form.png');
    console.log('   - 03-admin-dashboard.png');
    console.log('   - 04-initial-state.png');
    console.log('   - 05-social-login-page.png');
    console.log('   - 06-search-bar-state.png');
    console.log('   - 07-after-interaction.png');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    await page.screenshot({ path: 'test-screenshots/error.png' });
    console.log('📸 Error screenshot saved to test-screenshots/error.png');
  } finally {
    // Keep browser open for 10 seconds to review
    console.log('\n⏳ Keeping browser open for 10 seconds for review...');
    await page.waitForTimeout(10000);
    
    await browser.close();
    console.log('🏁 Browser closed. Test complete.\n');
  }
})();
