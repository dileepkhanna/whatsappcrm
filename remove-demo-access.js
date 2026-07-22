/**
 * Remove Demo Access Box from Login/Admin Panels
 * This script removes the demo credentials display from the application
 */

const fs = require('fs');
const path = require('path');

// Path to the main React bundle
const bundlePath = path.join(__dirname, 'client', 'public', 'static', 'js', 'main.ase-tech.js');

console.log('🔧 Removing DEMO ACCESS box from login panels...\n');

try {
    // Read the bundle file
    let content = fs.readFileSync(bundlePath, 'utf8');
    const originalSize = content.length;
    
    // Patterns to remove/replace
    const patterns = [
        // Remove "DEMO ACCESS" text
        { 
            search: /DEMO\s+ACCESS/gi, 
            replace: '', 
            description: 'DEMO ACCESS text' 
        },
        // Remove admin@admin.com
        { 
            search: /admin@admin\.com/gi, 
            replace: '', 
            description: 'admin@admin.com email' 
        },
        // Remove Password@123
        { 
            search: /Password@123/g, 
            replace: '', 
            description: 'Password@123 text' 
        },
        // Remove "Autofill" button text
        { 
            search: /Autofill/gi, 
            replace: '', 
            description: 'Autofill button' 
        },
        // Remove demo credentials box variations
        { 
            search: /"demo-access"|'demo-access'/gi, 
            replace: '""', 
            description: 'demo-access class' 
        },
        // Remove demo box styling
        { 
            search: /border[^;]*dashed[^;]*orange[^;]*/gi, 
            replace: '', 
            description: 'orange dashed border' 
        }
    ];
    
    let changesCount = 0;
    
    patterns.forEach(pattern => {
        const matches = content.match(pattern.search);
        if (matches && matches.length > 0) {
            content = content.replace(pattern.search, pattern.replace);
            changesCount += matches.length;
            console.log(`✅ Removed ${matches.length}x ${pattern.description}`);
        } else {
            console.log(`⚠️  No matches found for ${pattern.description}`);
        }
    });
    
    // Write the modified content back
    fs.writeFileSync(bundlePath, content, 'utf8');
    
    const newSize = content.length;
    const savings = originalSize - newSize;
    
    console.log('\n📊 Summary:');
    console.log(`   Original size: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`   New size: ${(newSize / 1024).toFixed(2)} KB`);
    console.log(`   Removed: ${savings} bytes`);
    console.log(`   Total changes: ${changesCount}`);
    
    if (changesCount > 0) {
        console.log('\n✅ DEMO ACCESS box removed successfully!');
        console.log('🔄 Restart your server and clear browser cache to see changes.');
        console.log('\n💡 Commands to run:');
        console.log('   pm2 restart whatscrm');
        console.log('   Clear browser cache: Ctrl+Shift+Delete');
    } else {
        console.log('\n⚠️  No changes made. Demo access may already be removed or patterns not found.');
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
