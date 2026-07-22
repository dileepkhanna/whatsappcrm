/**
 * Complete Demo Box Removal - Remove entire container and all styling
 * This script completely removes the demo access box from the application
 */

const fs = require('fs');
const path = require('path');

// Path to the main React bundle
const bundlePath = path.join(__dirname, 'client', 'public', 'static', 'js', 'main.ase-tech.js');

console.log('🔧 Completely removing demo box container and styling...\n');

try {
    // Read the bundle file
    let content = fs.readFileSync(bundlePath, 'utf8');
    const originalSize = content.length;
    
    // More aggressive patterns to remove entire box
    const patterns = [
        // Remove orange color references
        { 
            search: /#[fF][fF][aA]500|#[fF][fF][9900]|orange|rgb\(255,165,0\)|rgb\(255,153,0\)/gi, 
            replace: 'transparent', 
            description: 'Orange color codes' 
        },
        // Remove dashed border styles
        { 
            search: /border[^:]*:[^;]*dashed[^;]*/gi, 
            replace: 'border:none', 
            description: 'Dashed borders' 
        },
        // Remove border styles with 2px, 3px, etc.
        { 
            search: /border[^:]*:[^;]*[0-9]px\s+dashed[^;]*/gi, 
            replace: 'border:none', 
            description: 'Pixel dashed borders' 
        },
        // Remove DEMO ACCESS text
        { 
            search: /DEMO\s+ACCESS/gi, 
            replace: '', 
            description: 'DEMO ACCESS text' 
        },
        // Remove demo credentials
        { 
            search: /admin@admin\.com/gi, 
            replace: '', 
            description: 'Demo email' 
        },
        { 
            search: /Password@123/g, 
            replace: '', 
            description: 'Demo password' 
        },
        // Remove Autofill
        { 
            search: /Autofill/gi, 
            replace: '', 
            description: 'Autofill button' 
        },
        // Remove "or enter manually" text
        { 
            search: /or\s+enter\s+manually/gi, 
            replace: '', 
            description: 'Enter manually text' 
        },
        // Remove lightning bolt emoji and icon
        { 
            search: /⚡|\\u26A1/gi, 
            replace: '', 
            description: 'Lightning emoji' 
        },
        // Remove arrow/play emoji
        { 
            search: /▶|►|\\u25B6/gi, 
            replace: '', 
            description: 'Arrow emoji' 
        },
        // Hide demo container with display:none
        { 
            search: /className:"demo-access"/gi, 
            replace: 'className:"demo-access",style:{display:"none"}', 
            description: 'Hide demo container' 
        },
        // Also try style attribute patterns
        { 
            search: /style:\{[^}]*border[^}]*dashed[^}]*\}/gi, 
            replace: 'style:{display:"none"}', 
            description: 'Hide styled boxes' 
        }
    ];
    
    let changesCount = 0;
    
    patterns.forEach(pattern => {
        const matches = content.match(pattern.search);
        if (matches && matches.length > 0) {
            content = content.replace(pattern.search, pattern.replace);
            changesCount += matches.length;
            console.log(`✅ Processed ${matches.length}x ${pattern.description}`);
        } else {
            console.log(`⚠️  No matches for ${pattern.description}`);
        }
    });
    
    // Additional aggressive cleanup - remove any box with orange styling
    const boxPatterns = [
        // Match any div/box with orange border
        /\{[^}]*border[^}]*"[^"]*dashed[^"]*"[^}]*\}/gi,
        // Match backgroundColor or background with orange/light variants
        /backgroundColor:"[^"]*(?:orange|#[fF][^"]{5}|rgb\([^)]*255[^)]*\))"/gi
    ];
    
    boxPatterns.forEach(pattern => {
        content = content.replace(pattern, '{}');
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
    
    console.log('\n✅ Demo box container completely removed!');
    console.log('🔄 Restart server and clear browser cache.');
    
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
