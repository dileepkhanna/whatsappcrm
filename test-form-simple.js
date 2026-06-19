const { chromium } = require('playwright');

(async () => {
  console.log('🔍 WhatsApp Forms Edit Issue Debugger\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000
  });
  
  const page = await browser.newPage();

  // Track all network calls
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiCalls.push({
        method: req.method(),
        url: req.url(),
        postData: req.postData()
      });
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      try {
        const json = await res.json();
        console.log(`\n📡 API Response: ${res.url()}`);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {}
    }
  });

  // Track console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`\n❌ Console Error: ${msg.text()}`);
    }
  });

  try {
    // Navigate to forms page (assuming already logged in)
    console.log('📍 Navigating to forms page...');
    await page.goto('http://localhost:3010/user?page=wa-forms');
    await page.waitForTimeout(3000);

    console.log('\n📍 Looking for edit functionality...');
    
    // Method 1: Look for any clickable edit elements
    const editSelectors = [
      'button:has-text("Edit")',
      '[aria-label*="edit" i]',
      '[title*="edit" i]',
      '.edit-btn',
      '[class*="edit"]',
      'svg[class*="edit"]'
    ];

    let editElement = null;
    for (const selector of editSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} element(s) with selector: ${selector}`);
        editElement = elements[0];
        break;
      }
    }

    if (editElement) {
      console.log('\n📍 Clicking edit button...');
      await editElement.click();
      await page.waitForTimeout(2000);

      // Look for the dialog/modal
      console.log('\n📍 Checking for edit dialog...');
      const dialog = await page.$('[role="dialog"], .modal, [class*="modal"]');
      
      if (dialog) {
        console.log('✅ Edit dialog opened');

        // Take screenshot of the dialog
        await page.screenshot({ path: 'edit-dialog.png', fullPage: true });
        console.log('📸 Screenshot saved: edit-dialog.png');

        // Find all input fields in the dialog
        const inputs = await dialog.$$('input, textarea');
        console.log(`\n📝 Found ${inputs.length} input fields in dialog:`);

        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i];
          const type = await input.getAttribute('type');
          const value = await input.evaluate(el => el.value);
          const placeholder = await input.getAttribute('placeholder');
          const name = await input.getAttribute('name');
          const isDisabled = await input.evaluate(el => el.disabled);
          const isReadonly = await input.evaluate(el => el.readOnly);
          
          console.log(`\n  Input ${i + 1}:`);
          console.log(`    Type: ${type}`);
          console.log(`    Name: ${name}`);
          console.log(`    Value: "${value}"`);
          console.log(`    Placeholder: "${placeholder}"`);
          console.log(`    Disabled: ${isDisabled}`);
          console.log(`    Readonly: ${isReadonly}`);
        }

        // Try to edit the first option field
        console.log('\n📍 Attempting to edit Option 1...');
        const optionInput = await dialog.$('input[value*="Option"]');
        
        if (optionInput) {
          console.log('✅ Found option input');
          
          // Try to edit it
          await optionInput.click();
          await page.keyboard.press('Control+A'); // Select all
          await page.keyboard.type('Modified Option');
          await page.waitForTimeout(1000);

          const newValue = await optionInput.evaluate(el => el.value);
          console.log(`New value after edit: "${newValue}"`);

          // Look for save button
          const saveButtons = await dialog.$$('button');
          console.log(`\n📍 Found ${saveButtons.length} buttons in dialog:`);
          
          for (let i = 0; i < saveButtons.length; i++) {
            const text = await saveButtons[i].textContent();
            const isDisabled = await saveButtons[i].evaluate(el => el.disabled);
            console.log(`  ${i + 1}. "${text.trim()}" (disabled: ${isDisabled})`);
          }

          // Try to click save/submit button
          const saveBtn = await dialog.$('button[type="submit"], button:has-text("Save"), button:has-text("Update"), button:has-text("Submit")');
          
          if (saveBtn) {
            const btnText = await saveBtn.textContent();
            console.log(`\n📍 Clicking "${btnText.trim()}" button...`);
            
            // Clear API calls log
            apiCalls.length = 0;
            
            await saveBtn.click();
            await page.waitForTimeout(3000);

            // Check what API calls were made
            console.log('\n📡 API Calls Made After Save:');
            if (apiCalls.length === 0) {
              console.log('❌ NO API CALLS MADE! This is the problem.');
            } else {
              apiCalls.forEach((call, i) => {
                console.log(`\n  Call ${i + 1}:`);
                console.log(`    Method: ${call.method}`);
                console.log(`    URL: ${call.url}`);
                if (call.postData) {
                  console.log(`    Data: ${call.postData}`);
                }
              });
            }

            // Check if dialog closed
            const dialogStillOpen = await page.$('[role="dialog"], .modal, [class*="modal"]');
            if (dialogStillOpen) {
              console.log('\n⚠️ Dialog is still open (possible validation error or failed save)');
            } else {
              console.log('\n✅ Dialog closed (may indicate success)');
            }

          } else {
            console.log('\n❌ No save button found!');
          }

        } else {
          console.log('❌ Could not find option input to edit');
        }

      } else {
        console.log('❌ No edit dialog found');
      }

    } else {
      console.log('❌ No edit button found on page');
      
      // Debug: Show page structure
      console.log('\n📋 Page structure:');
      const bodyHTML = await page.evaluate(() => document.body.innerHTML);
      console.log(bodyHTML.substring(0, 1000) + '...');
    }

    console.log('\n\n🔍 DIAGNOSIS:');
    console.log('═══════════════════════════════════════');
    console.log('Check the console output above to identify:');
    console.log('1. Whether edit button was found');
    console.log('2. Whether dialog opened');
    console.log('3. Whether input fields are editable');
    console.log('4. What happens when Save is clicked');
    console.log('5. Whether any API calls are made');
    console.log('═══════════════════════════════════════\n');

    // Keep browser open for manual inspection
    console.log('⏸️  Browser will stay open for 60 seconds for manual inspection...\n');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
