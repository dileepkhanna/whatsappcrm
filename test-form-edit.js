const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500 // Slow down operations to see what's happening
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER LOG] ${msg.type()}: ${msg.text()}`);
  });

  // Capture network requests
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      console.log(`[REQUEST] ${request.method()} ${request.url()}`);
    }
  });

  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      try {
        const body = await response.json();
        console.log(`[RESPONSE BODY]`, JSON.stringify(body, null, 2));
      } catch (e) {
        // Not JSON response
      }
    }
  });

  // Capture errors
  page.on('pageerror', error => {
    console.error(`[PAGE ERROR]`, error.message);
  });

  try {
    console.log('🚀 Starting test...');
    
    // Step 1: Navigate to localhost
    console.log('\n📍 Step 1: Navigating to localhost:3010...');
    await page.goto('http://localhost:3010', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '01-homepage.png' });

    // Step 2: Login
    console.log('\n📍 Step 2: Logging in...');
    await page.fill('input[type="email"]', 'dileeplekkala23@gmail.com');
    await page.fill('input[type="password"]', 'your_password_here'); // Replace with actual password
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '02-after-login.png' });

    // Step 3: Navigate to WhatsApp Forms
    console.log('\n📍 Step 3: Navigating to WhatsApp Forms...');
    await page.goto('http://localhost:3010/user?page=wa-forms', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '03-forms-page.png' });

    // Step 4: Check if forms exist
    console.log('\n📍 Step 4: Checking for existing forms...');
    const forms = await page.$$('[data-form-id]'); // Look for form elements
    
    if (forms.length === 0) {
      console.log('⚠️ No forms found. Let\'s try to find the edit button...');
      
      // Try different selectors
      const editButtons = await page.$$('button:has-text("Edit")');
      console.log(`Found ${editButtons.length} Edit buttons`);
      
      if (editButtons.length > 0) {
        console.log('\n📍 Step 5: Clicking Edit button...');
        await editButtons[0].click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '04-edit-dialog-opened.png' });

        // Step 6: Try to edit dropdown options
        console.log('\n📍 Step 6: Looking for dropdown field...');
        const dropdownFields = await page.$$('[class*="dropdown"], [data-field-type="Dropdown"]');
        console.log(`Found ${dropdownFields.length} dropdown fields`);

        // Step 7: Try to edit "Option 1"
        console.log('\n📍 Step 7: Trying to edit Option 1...');
        const option1Input = await page.$('input[value="Option 1"]');
        
        if (option1Input) {
          console.log('✅ Found Option 1 input field');
          
          // Check if it's readonly or disabled
          const isReadonly = await option1Input.evaluate(el => el.readOnly);
          const isDisabled = await option1Input.evaluate(el => el.disabled);
          console.log(`Readonly: ${isReadonly}, Disabled: ${isDisabled}`);

          // Try to clear and type
          console.log('Attempting to clear and type new value...');
          await option1Input.click({ clickCount: 3 }); // Triple click to select all
          await page.keyboard.press('Backspace');
          await option1Input.type('New Option 1');
          await page.waitForTimeout(1000);
          await page.screenshot({ path: '05-after-typing.png' });

          // Check if value changed
          const newValue = await option1Input.evaluate(el => el.value);
          console.log(`New value: ${newValue}`);

          // Step 8: Look for Save/Update button
          console.log('\n📍 Step 8: Looking for Save/Update button...');
          const saveButton = await page.$('button:has-text("Save"), button:has-text("Update"), button:has-text("Submit")');
          
          if (saveButton) {
            console.log('✅ Found Save button, clicking...');
            await saveButton.click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: '06-after-save.png' });
          } else {
            console.log('❌ No Save button found!');
            
            // List all buttons
            const allButtons = await page.$$('button');
            console.log(`\nAll buttons on page (${allButtons.length}):`);
            for (let i = 0; i < allButtons.length; i++) {
              const text = await allButtons[i].textContent();
              console.log(`  ${i + 1}. "${text}"`);
            }
          }

          // Step 9: Check network tab for API calls
          console.log('\n📍 Step 9: Checking if any API calls were made...');
          console.log('(Check the network logs above)');

        } else {
          console.log('❌ Could not find Option 1 input field');
          
          // Debug: List all inputs on page
          const allInputs = await page.$$('input');
          console.log(`\nAll inputs on page (${allInputs.length}):`);
          for (let i = 0; i < allInputs.length; i++) {
            const type = await allInputs[i].getAttribute('type');
            const value = await allInputs[i].evaluate(el => el.value);
            const placeholder = await allInputs[i].getAttribute('placeholder');
            console.log(`  ${i + 1}. Type: ${type}, Value: "${value}", Placeholder: "${placeholder}"`);
          }
        }

      } else {
        console.log('❌ No Edit buttons found');
      }
    }

    // Step 10: Check browser console for errors
    console.log('\n📍 Step 10: Final check...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '07-final-state.png' });

    console.log('\n✅ Test completed! Check the screenshots in the project folder.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'error-screenshot.png' });
  } finally {
    console.log('\n🔍 Keeping browser open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    await browser.close();
  }
})();
