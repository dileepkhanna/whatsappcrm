/**
 * Active Demo Box Remover
 * Continuously removes demo access box from DOM
 */

(function() {
    console.log('🚫 Demo Box Remover: Active');
    
    function removeDemoBox() {
        let removed = false;
        
        // Method 1: Remove by text content
        document.querySelectorAll('*').forEach(el => {
            const text = el.textContent || '';
            
            // Check for demo-related text
            if (
                text.includes('DEMO ACCESS') ||
                text.includes('admin@admin.com') ||
                text.includes('Password@123') ||
                (text.includes('Autofill') && el.tagName === 'BUTTON')
            ) {
                // Find the parent container (usually 2-3 levels up)
                let parent = el.parentElement;
                let attempts = 0;
                
                while (parent && attempts < 5) {
                    const style = window.getComputedStyle(parent);
                    
                    // Look for the orange dashed border container
                    if (
                        style.border.includes('dashed') ||
                        style.borderColor.includes('255') || // Orange colors
                        parent.className.toLowerCase().includes('demo')
                    ) {
                        parent.remove();
                        removed = true;
                        console.log('✅ Demo box removed!');
                        break;
                    }
                    
                    parent = parent.parentElement;
                    attempts++;
                }
            }
        });
        
        // Method 2: Remove elements with orange dashed borders
        document.querySelectorAll('div, section, aside').forEach(el => {
            const style = window.getComputedStyle(el);
            
            if (
                style.borderStyle === 'dashed' &&
                (style.borderColor.includes('rgb(255, 165, 0)') || 
                 style.borderColor.includes('rgb(255, 153, 0)') ||
                 style.borderColor.includes('orange'))
            ) {
                el.remove();
                removed = true;
                console.log('✅ Demo box removed (by style)!');
            }
        });
        
        // Method 3: Hide by innerHTML content
        document.querySelectorAll('div').forEach(el => {
            if (el.innerHTML.includes('DEMO ACCESS') && el.innerHTML.includes('Autofill')) {
                el.style.display = 'none';
                removed = true;
                console.log('✅ Demo box hidden!');
            }
        });
        
        return removed;
    }
    
    // Run immediately
    removeDemoBox();
    
    // Run after delay (for React rendering)
    setTimeout(removeDemoBox, 500);
    setTimeout(removeDemoBox, 1000);
    setTimeout(removeDemoBox, 2000);
    
    // Watch for DOM changes
    const observer = new MutationObserver(() => {
        removeDemoBox();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also run on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(removeDemoBox, 100);
        }
    });
    
    console.log('✅ Demo Box Remover: Watching for demo content...');
})();
