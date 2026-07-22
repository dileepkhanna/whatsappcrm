/**
 * Active Demo Box Remover
 * Continuously removes demo access box from DOM
 */

(function() {
    console.log('🚫 Demo Box Remover: Active');
    
    function removeDemoBox() {
        let removed = false;
        
        // SAFE Method: Only hide, don't remove from DOM
        // This prevents React errors
        
        // Method 1: Find and hide demo box by text content
        document.querySelectorAll('div, section, aside').forEach(el => {
            const text = el.textContent || '';
            
            // Only target elements that specifically contain demo content
            if (
                text.includes('DEMO ACCESS') && 
                text.includes('Autofill') &&
                text.length < 500 // Small elements only, not the whole page
            ) {
                // Hide instead of remove
                if (el.style.display !== 'none') {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.opacity = '0';
                    el.style.pointerEvents = 'none';
                    el.setAttribute('aria-hidden', 'true');
                    removed = true;
                    console.log('✅ Demo box hidden!');
                }
            }
        });
        
        // Method 2: Hide elements with orange dashed borders
        document.querySelectorAll('div, section, aside').forEach(el => {
            const style = window.getComputedStyle(el);
            
            if (
                style.borderStyle === 'dashed' &&
                (style.borderColor.includes('rgb(255, 165, 0)') || 
                 style.borderColor.includes('rgb(255, 153, 0)') ||
                 style.borderColor.includes('orange'))
            ) {
                if (el.style.display !== 'none') {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.opacity = '0';
                    el.style.pointerEvents = 'none';
                    removed = true;
                    console.log('✅ Demo box hidden (by style)!');
                }
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
