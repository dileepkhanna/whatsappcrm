/**
 * Customize Loading Screen Animation
 * Modifies the loading screen appearance and text
 * V1.0
 */

(function() {
  'use strict';
  
  console.log('🎨 Loading Screen Customizer Active');
  
  // Configuration - CUSTOMIZE THESE VALUES
  const CONFIG = {
    // Change loading step texts
    STEP_1_TEXT: 'Authenticating workspace',
    STEP_2_TEXT: 'Syncing WhatsApp contacts',
    STEP_3_TEXT: 'Loading...',
    
    // Change app title and tagline
    APP_TITLE: 'WhatsCRM',
    APP_TAGLINE: 'WHATSAPP MARKETING PLATFORM',
    
    // Custom logo path
    CUSTOM_LOGO: '/assets/ase_logo.png', // Your custom logo
    
    // Animation speed (milliseconds)
    STEP_DURATION: 1500, // Time for each step
    
    // Custom CSS
    CUSTOM_STYLES: `
      /* Loading screen container */
      .loading-screen-custom {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      }
      
      /* Animated circles */
      .loading-circles-custom {
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.05);
          opacity: 0.8;
        }
      }
      
      /* Progress bar */
      .loading-progress-custom {
        background: linear-gradient(90deg, #00c851 0%, #25d366 100%) !important;
        box-shadow: 0 2px 10px rgba(37, 211, 102, 0.5);
        border-radius: 10px;
        height: 6px !important;
      }
      
      /* Loading steps */
      .loading-step-custom {
        font-size: 16px;
        color: #666;
        transition: all 0.3s ease;
      }
      
      .loading-step-active {
        color: #25d366 !important;
        font-weight: 600;
      }
      
      .loading-step-completed {
        color: #25d366 !important;
      }
      
      /* Custom logo styling */
      .whatsapp-icon-custom {
        animation: rotate-pulse 3s ease-in-out infinite;
        max-width: 150px !important;
        max-height: 150px !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
      }
      
      @keyframes rotate-pulse {
        0%, 100% {
          transform: rotate(0deg) scale(1);
        }
        25% {
          transform: rotate(-5deg) scale(1.05);
        }
        75% {
          transform: rotate(5deg) scale(1.05);
        }
      }
    `
  };
  
  // Inject custom styles
  const styleElement = document.createElement('style');
  styleElement.textContent = CONFIG.CUSTOM_STYLES;
  document.head.appendChild(styleElement);
  
  // Function to customize loading screen elements
  function customizeLoadingScreen() {
    // Find loading screen elements
    const loadingScreen = document.querySelector('[class*="loading"]');
    const appTitle = document.querySelector('h1, h2, h3');
    const appTagline = document.querySelector('[class*="tagline"]');
    
    // Apply custom classes
    if (loadingScreen) {
      loadingScreen.classList.add('loading-screen-custom');
    }
    
    // Find and replace WhatsApp icon with custom logo
    const whatsappIcon = document.querySelector('img[src*="whatsapp"], img[alt*="whatsapp"], img[alt*="WhatsApp"]');
    if (whatsappIcon && CONFIG.CUSTOM_LOGO) {
      console.log('🎨 Replacing WhatsApp icon with custom logo:', CONFIG.CUSTOM_LOGO);
      whatsappIcon.src = CONFIG.CUSTOM_LOGO;
      whatsappIcon.alt = 'Logo';
      whatsappIcon.classList.add('whatsapp-icon-custom');
      whatsappIcon.style.objectFit = 'contain'; // Ensure logo scales properly
    }
    
    // Also check for logo in different locations
    const allImages = document.querySelectorAll('img');
    allImages.forEach(img => {
      // If image is in a loading screen context and looks like the main logo
      const isLoadingLogo = img.closest('[class*="loading"]') && 
                           (img.width > 50 || img.height > 50) &&
                           !img.src.includes('background');
      
      if (isLoadingLogo && CONFIG.CUSTOM_LOGO && !img.src.includes('ase_logo')) {
        console.log('🎨 Found loading screen logo, replacing with:', CONFIG.CUSTOM_LOGO);
        img.src = CONFIG.CUSTOM_LOGO;
        img.alt = 'Logo';
        img.classList.add('whatsapp-icon-custom');
        img.style.objectFit = 'contain';
      }
    });
    
    // Find progress bar
    const progressBar = document.querySelector('[role="progressbar"], [class*="progress"]');
    if (progressBar) {
      progressBar.classList.add('loading-progress-custom');
    }
    
    // Find loading steps
    const steps = document.querySelectorAll('[class*="step"]');
    steps.forEach(step => {
      step.classList.add('loading-step-custom');
    });
  }
  
  // Function to replace loading text dynamically
  function replaceLoadingText() {
    // Replace text content
    const textElements = document.querySelectorAll('*');
    textElements.forEach(el => {
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
        const text = el.textContent.trim();
        
        // Replace specific texts
        if (text === 'Authenticating workspace') {
          el.textContent = CONFIG.STEP_1_TEXT;
        } else if (text === 'Syncing WhatsApp contacts') {
          el.textContent = CONFIG.STEP_2_TEXT;
        } else if (text === 'Loading...') {
          el.textContent = CONFIG.STEP_3_TEXT;
        } else if (text === 'WhatsCRM') {
          el.textContent = CONFIG.APP_TITLE;
        } else if (text === 'WHATSAPP MARKETING PLATFORM') {
          el.textContent = CONFIG.APP_TAGLINE;
        }
      }
    });
  }
  
  // Function to enhance loading animation
  function enhanceAnimation() {
    // Add smooth fade-in effect
    const loadingScreen = document.querySelector('[class*="loading"]');
    if (loadingScreen) {
      loadingScreen.style.animation = 'fadeIn 0.5s ease-in';
    }
    
    // Add CSS for fade-in
    const fadeInStyle = document.createElement('style');
    fadeInStyle.textContent = `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(fadeInStyle);
  }
  
  // Observer to watch for loading screen
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(() => {
      // Check if loading screen is present
      const hasLoadingScreen = document.querySelector('[class*="loading"]') ||
                               document.body.textContent.includes('Authenticating workspace');
      
      if (hasLoadingScreen) {
        console.log('🎨 Loading screen detected - Applying customizations');
        customizeLoadingScreen();
        replaceLoadingText();
        enhanceAnimation();
      }
    });
  });
  
  // Start observing
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  // Apply immediately if loading screen already exists
  setTimeout(() => {
    customizeLoadingScreen();
    replaceLoadingText();
    enhanceAnimation();
  }, 100);
  
  // Re-apply every 500ms for first 5 seconds (to catch React render)
  let attempts = 0;
  const intervalId = setInterval(() => {
    customizeLoadingScreen();
    replaceLoadingText();
    attempts++;
    
    if (attempts >= 10) {
      clearInterval(intervalId);
      console.log('✅ Loading screen customization complete');
    }
  }, 500);
  
  console.log('✅ Loading Screen Customizer Loaded');
  console.log('📝 To customize: Edit CONFIG object in customize-loading-screen.js');
  
})();
