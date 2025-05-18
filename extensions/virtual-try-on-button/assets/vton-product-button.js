(() => {
  const VTON_API_URL = "https://api.modera.fashion/api/v2/vton";
  const SEGMENTATION_API_URL = "http://api.modera.fashion/api/v2/segmentation/run";
  const SEGMENTATION_STATUS_API_URL = "http://api.modera.fashion/api/v2/segmentation/status";
  const TRYON_API_URL = "https://api.modera.fashion/api/v2/tryon/run";
  const TRYON_STATUS_API_URL = "https://api.modera.fashion/api/v2/tryon/status";
  const USER_ID = "096271a3-6e2e-4cba-96db-e2f20987f27c";
  const SHOP_DOMAIN = Shopify.shop;

  // Check if we're on a product page
  const isProductPage = window.location.pathname.includes('/products/');
  if (!isProductPage) return;

  // Get current product ID
  let productId = null;
  try {
    // Try multiple methods to get the product ID
    // Method 1: Check if window.meta is available
    if (window.meta && window.meta.product && window.meta.product.id) {
      // Convert to string first to handle both numeric and string IDs
      const idStr = String(window.meta.product.id);
      // Check if it's a Shopify GID format that needs splitting
      productId = idStr.includes('/') ? idStr.split('/').pop() : idStr;
    }
    
    // Method 2: Try ShopifyAnalytics.meta
    if (!productId && window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
      productId = window.ShopifyAnalytics.meta.product?.id;
    }
    
    // Method 3: Look for product JSON in the DOM
    if (!productId) {
      const productJsonScript = document.querySelector('script[type="application/json"][data-product-json]');
      if (productJsonScript) {
        try {
          const productData = JSON.parse(productJsonScript.textContent);
          productId = productData.id;
        } catch (e) {
          console.log('Error parsing product JSON', e);
        }
      }
    }
    
    // Method 4: Extract from form
    if (!productId) {
      const productForm = document.querySelector('form[action*="/cart/add"], form[action="/cart"], form[action^="/cart" i]');
      if (productForm) {
        const idInput = productForm.querySelector('input[name="id"]');
        if (idInput) {
          productId = idInput.value;
        }
      }
    }
    
    // Method 5: Extract from URL if all else fails
    if (!productId) {
      const pathParts = window.location.pathname.split('/');
      const productsIndex = pathParts.indexOf('products');
      if (productsIndex >= 0 && pathParts.length > productsIndex + 1) {
        // This gives us the handle, not the ID, but it's better than nothing
        const handle = pathParts[productsIndex + 1];
        console.log('Using product handle from URL:', handle);
        // We'll use the handle as a fallback
        productId = handle;
      }
    }
  } catch (error) {
    console.error("Error getting product ID:", error);
    return;
  }

  if (!productId) {
    console.error("Could not find product ID");
    return;
  }

  // Default settings
  const defaultSettings = {
    position: 'below-buy-buttons',
    text: 'Try On Virtually',
    useThemeColor: true,
    buttonColor: '#008060',
    textColor: '#FFFFFF'
  };

  // Retrieve settings from hidden div injected by block or global variable
  function getButtonSettings() {
    // 1. Hidden div with class vton-settings
    const settingsEl = document.querySelector('.vton-settings');
    if (settingsEl) {
      console.log('Found settings element with data:', {
        position: settingsEl.dataset.buttonPosition,
        text: settingsEl.dataset.buttonText,
        useThemeColor: settingsEl.dataset.useThemeColor,
        buttonColor: settingsEl.dataset.buttonColor,
        textColor: settingsEl.dataset.textColor
      });
      
      return {
        position: settingsEl.dataset.buttonPosition || defaultSettings.position,
        text: settingsEl.dataset.buttonText || defaultSettings.text,
        useThemeColor: settingsEl.dataset.useThemeColor === 'true',
        buttonColor: settingsEl.dataset.buttonColor || defaultSettings.buttonColor,
        textColor: settingsEl.dataset.textColor || defaultSettings.textColor
      };
    }

    // 2. Global variable injected inline
    if (window.__vtonButtonConfig) {
      return { ...defaultSettings, ...window.__vtonButtonConfig };
    }

    // 3. Dataset on current script tag (if configured)
    const scriptTag = document.currentScript;
    if (scriptTag) {
      return {
        position: scriptTag.dataset.buttonPosition || defaultSettings.position,
        text: scriptTag.dataset.buttonText || defaultSettings.text,
        useThemeColor: scriptTag.dataset.useThemeColor === 'true',
        buttonColor: scriptTag.dataset.buttonColor || defaultSettings.buttonColor,
        textColor: scriptTag.dataset.textColor || defaultSettings.textColor
      };
    }

    // 4. Fallback to defaults
    return defaultSettings;
  }

  const buttonSettings = getButtonSettings();

  // Detect theme accent color
  function getThemeColor() {
    // Try to find theme accent color from CSS variables
    const themeAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent') ||
                             getComputedStyle(document.documentElement).getPropertyValue('--color-primary') ||
                             getComputedStyle(document.documentElement).getPropertyValue('--color-button') ||
                             getComputedStyle(document.documentElement).getPropertyValue('--color-button-primary') ||
                             getComputedStyle(document.documentElement).getPropertyValue('--color-link') ||
                             '#008060'; // Default Shopify green as fallback
    return themeAccentColor.trim();
  }

  // Global flag to track if the button has been added
  window.__vtonButtonAdded = false;

  // Create try-on button
  function createTryOnButton() {
    // Check if button already exists to prevent duplicates
    if (document.getElementById('vton-product-button')) {
      console.log('VTON: Button already exists, not adding again');
      return;
    }

    // Use a wider set of selectors to find the buy button area
    const buyButtonSelectors = [
      // Form selectors
      'form[action*="/cart/add"]',
      // Common button container selectors across various themes
      '.product-form__buttons',
      '.product-form__controls-group--submit',
      '.product__actions',
      '.product-form__submit-container',
      '.product-form__payment-container',
      '.product-single__purchase-options',
      '.product-single__add-to-cart',
      '.add-to-cart-wrapper',
      '.product-form__submit',
      // Dawn theme and similar
      'product-form[data-type="add-to-cart-form"]',
      // Fallback to main product area
      '.product__info-container',
      '.product__meta',
      '.product-single__meta',
      '[data-product-information]',
      // Additional common selectors
      '.product-form',
      '[data-product-form]',
      '#product-form',
      // Theme editor specific
      '.product-form-container',
      '.product-form-product-template'
    ];

    // Try each selector until we find a match
    let buyButtonContainer = null;
    for (const selector of buyButtonSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Use the last matching element as it's more likely to be the main one
        // in case there are multiple matching elements (like in theme editor)
        buyButtonContainer = elements[elements.length - 1];
        console.log("Found buy button container with selector:", selector);
        break;
      }
    }

    if (!buyButtonContainer) {
      console.warn('VTON: buy button container not found, observing DOM for changes');
      if (!window.__vtonDomObserver) {
        window.__vtonDomObserver = new MutationObserver((mutations) => {
          // Only check if we haven't added the button yet
          if (window.__vtonButtonAdded || document.getElementById('vton-product-button')) {
            window.__vtonDomObserver.disconnect();
            window.__vtonDomObserver = null;
            return;
          }
          
          // Try again whenever DOM changes
          for (const selector of buyButtonSelectors) {
            if (document.querySelector(selector)) {
              window.__vtonDomObserver.disconnect();
              window.__vtonDomObserver = null;
              setTimeout(createTryOnButton, 100); // Small delay to ensure DOM is stable
              return;
            }
          }
        });
        window.__vtonDomObserver.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }

    // Try to find the payment buttons section which usually comes after the add to cart button
    const paymentButtons = buyButtonContainer.querySelector('.shopify-payment-button, .product-form__payment-container');
    
    if (paymentButtons) {
      // Insert after payment buttons
      insertButton(paymentButtons, false);
    } else {
      // Find the main buy button
      const addToCartButton = buyButtonContainer.querySelector('button[name="add"], button.add-to-cart, button[data-add-to-cart], .product-form__cart-submit, [data-testid="Checkout-button"]');
      
      if (addToCartButton) {
        // If there's a direct button, insert after its parent container
        const buttonContainer = addToCartButton.closest('.shopify-payment-button, .product-form__buttons, .add-to-cart, .product-form__submit');
        if (buttonContainer) {
          insertButton(buttonContainer, false);
        } else {
          // Insert after the button itself
          insertButton(addToCartButton, false);
        }
      } else {
        // If no specific elements found, append to the end of the container
        insertButton(buyButtonContainer, true);
      }
    }
    
    // Set flag that button has been added
    window.__vtonButtonAdded = true;
    
    // Log success
    console.log("Successfully added Product Try-On button");

    // We don't need to observe for changes anymore since we've added the button
    // If we need to handle dynamic theme changes, we can use a more targeted approach
  }

  function insertButton(container, insertInside) {
    // Create button wrapper to maintain consistent styling with theme
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'vton-button-wrapper';
    buttonWrapper.style.marginTop = '10px';
    buttonWrapper.style.marginBottom = '10px';
    buttonWrapper.style.width = '100%';

    // Get the button color, either from theme or settings
    let buttonColor = buttonSettings.buttonColor;
    if (buttonSettings.useThemeColor) {
      buttonColor = getThemeColor();
    }

    // Create the button
    const button = document.createElement('button');
    button.id = 'vton-product-button';
    button.textContent = buttonSettings.text;
    button.style.backgroundColor = buttonColor;
    button.style.color = buttonSettings.textColor;
    button.style.padding = '12px 20px';
    button.style.borderRadius = '4px';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.width = '100%';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.maxWidth = '100%';
    

    // Add click handler
    button.addEventListener('click', openTryOnModal);
    
    // Add to page based on settings
    buttonWrapper.appendChild(button);
    
    // Handle insertion based on position setting
    if (buttonSettings.position === 'above-buy-buttons') {
      console.log("Positioning button above buy buttons");
      
      if (insertInside) {
        container.insertBefore(buttonWrapper, container.firstChild);
      } else {
        container.parentNode.insertBefore(buttonWrapper, container);
      }
    } else {
      // Default is 'below-buy-buttons'
      console.log("Positioning button below buy buttons");
      
      if (insertInside) {
        container.appendChild(buttonWrapper);
      } else {
        container.parentNode.insertBefore(buttonWrapper, container.nextSibling);
      }
    }
  }

  // Create modal for the try-on experience
  function createModal() {
    const modal = document.createElement('div');
    modal.id = 'vton-modal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    modal.style.zIndex = '10000';
    modal.style.overflow = 'auto';
    
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.margin = '5% auto';
    modalContent.style.padding = '20px';
    modalContent.style.width = '90%';
    modalContent.style.maxWidth = '800px';
    modalContent.style.borderRadius = '8px';
    modalContent.style.position = 'relative';
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.border = 'none';
    closeButton.style.background = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = closeModal;
    
    const title = document.createElement('h2');
    title.textContent = 'Virtual Try-On';
    title.style.marginBottom = '20px';
    
    const content = document.createElement('div');
    content.id = 'vton-content';
    
    // Create drag and drop area
    const dropArea = document.createElement('div');
    dropArea.id = 'vton-drop-area';
    dropArea.style.border = '2px dashed #ccc';
    dropArea.style.borderRadius = '8px';
    dropArea.style.padding = '40px';
    dropArea.style.textAlign = 'center';
    dropArea.style.marginBottom = '20px';
    dropArea.style.backgroundColor = '#f9f9f9';
    dropArea.style.transition = 'all 0.3s ease';
    
    const dropText = document.createElement('p');
    dropText.textContent = 'Drag & drop your image here or click to select';
    dropText.style.fontSize = '16px';
    dropText.style.color = '#666';
    dropText.style.marginBottom = '10px';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'vton-file-input';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    // Create body part selection dropdown with improved UI
    const bodyPartLabel = document.createElement('h3');
    bodyPartLabel.textContent = 'Step 1: Select Garment Type';
    bodyPartLabel.style.fontSize = '16px';
    bodyPartLabel.style.color = '#333';
    bodyPartLabel.style.marginTop = '15px';
    bodyPartLabel.style.marginBottom = '10px';
    bodyPartLabel.style.textAlign = 'center';
    
    const bodyPartDescription = document.createElement('p');
    bodyPartDescription.textContent = 'Choose the type of garment you want to try on:';
    bodyPartDescription.style.fontSize = '14px';
    bodyPartDescription.style.color = '#666';
    bodyPartDescription.style.marginBottom = '15px';
    bodyPartDescription.style.textAlign = 'center';
    
    // Create a container for the category options
    const categoryContainer = document.createElement('div');
    categoryContainer.style.display = 'flex';
    categoryContainer.style.justifyContent = 'center';
    categoryContainer.style.gap = '10px';
    categoryContainer.style.marginBottom = '20px';
    categoryContainer.style.flexWrap = 'wrap';
    
    // Hidden select element for storing the selected value
    const bodyPartSelect = document.createElement('select');
    bodyPartSelect.id = 'vton-body-part';
    bodyPartSelect.style.display = 'none';
    
    // Add options to the dropdown and create visual buttons
    const options = [
      { value: 'upper_body', text: 'Upper Body', icon: '👚', description: 'Shirts, tops, jackets' },
      { value: 'lower_body', text: 'Lower Body', icon: '👖', description: 'Pants, skirts, shorts' },
      { value: 'full_body', text: 'Full Body', icon: '👗', description: 'Dresses, jumpsuits' }
    ];
    
    options.forEach(option => {
      // Add to hidden select
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      bodyPartSelect.appendChild(optionElement);
      
      // Create visual category button
      const categoryButton = document.createElement('div');
      categoryButton.className = 'vton-category-button';
      categoryButton.dataset.value = option.value;
      categoryButton.style.border = '2px solid #ccc';
      categoryButton.style.borderRadius = '8px';
      categoryButton.style.padding = '15px';
      categoryButton.style.width = '120px';
      categoryButton.style.cursor = 'pointer';
      categoryButton.style.textAlign = 'center';
      categoryButton.style.transition = 'all 0.2s ease';
      categoryButton.style.backgroundColor = '#fff';  // Начальный белый фон
      
      const categoryIcon = document.createElement('div');
      categoryIcon.textContent = option.icon;
      categoryIcon.style.fontSize = '28px';
      categoryIcon.style.marginBottom = '8px';
      
      const categoryTitle = document.createElement('div');
      categoryTitle.textContent = option.text;
      categoryTitle.style.fontWeight = 'bold';
      categoryTitle.style.marginBottom = '5px';
      
      const categoryDesc = document.createElement('div');
      categoryDesc.textContent = option.description;
      categoryDesc.style.fontSize = '12px';
      categoryDesc.style.color = '#666';
      
      categoryButton.appendChild(categoryIcon);
      categoryButton.appendChild(categoryTitle);
      categoryButton.appendChild(categoryDesc);
      
      // Add click handler
      categoryButton.addEventListener('click', () => {
        // Update hidden select
        bodyPartSelect.value = option.value;
        
        // Update UI - делаем невыбранные плашки более серыми
        document.querySelectorAll('.vton-category-button').forEach(btn => {
          btn.style.border = '2px solid #ccc';
          btn.style.backgroundColor = '#f0f0f0'; // Серый фон для невыбранных
          btn.style.opacity = '0.7'; // Уменьшаем непрозрачность
          btn.style.filter = 'grayscale(30%)'; // Добавляем эффект серого
        });
        
        // Выбранная плашка выделяется цветом и яркостью
        categoryButton.style.border = `2px solid ${getThemeColor()}`;
        categoryButton.style.backgroundColor = '#fff'; // Белый фон для выбранной
        categoryButton.style.opacity = '1'; // Полная непрозрачность
        categoryButton.style.filter = 'grayscale(0%)'; // Без эффекта серого
        categoryButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; // Добавляем тень
      });
      
      categoryContainer.appendChild(categoryButton);
    });
    
    // Set default selected category
    setTimeout(() => {
      const defaultCategory = categoryContainer.querySelector('.vton-category-button');
      if (defaultCategory) {
        defaultCategory.click();
      }
    }, 100);
    
    const browseButton = document.createElement('button');
    browseButton.textContent = 'Browse Files';
    browseButton.style.backgroundColor = getThemeColor();
    browseButton.style.color = '#fff';
    browseButton.style.border = 'none';
    browseButton.style.borderRadius = '4px';
    browseButton.style.padding = '10px 20px';
    browseButton.style.cursor = 'pointer';
    browseButton.style.fontSize = '14px';
    browseButton.style.marginTop = '5px';
    browseButton.onclick = () => fileInput.click();
    
    const previewArea = document.createElement('div');
    previewArea.id = 'vton-preview-area';
    previewArea.style.marginTop = '20px';
    previewArea.style.display = 'none';
    
    const previewImage = document.createElement('img');
    previewImage.id = 'vton-preview-image';
    previewImage.style.maxWidth = '100%';
    previewImage.style.maxHeight = '400px';
    previewImage.style.borderRadius = '4px';
    previewImage.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    
    const tryOnButton = document.createElement('button');
    tryOnButton.id = 'vton-process-button';
    tryOnButton.textContent = 'Process Image';
    tryOnButton.style.backgroundColor = getThemeColor();
    tryOnButton.style.color = '#fff';
    tryOnButton.style.border = 'none';
    tryOnButton.style.borderRadius = '4px';
    tryOnButton.style.padding = '10px 20px';
    tryOnButton.style.cursor = 'pointer';
    tryOnButton.style.fontSize = '14px';
    tryOnButton.style.marginTop = '15px';
    tryOnButton.style.display = 'none';
    
    const resultArea = document.createElement('div');
    resultArea.id = 'vton-result-area';
    resultArea.style.marginTop = '20px';
    
    // Add event listeners for drag and drop
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.style.backgroundColor = '#e9e9e9';
      dropArea.style.borderColor = getThemeColor();
    });
    
    dropArea.addEventListener('dragleave', () => {
      dropArea.style.backgroundColor = '#f9f9f9';
      dropArea.style.borderColor = '#ccc';
    });
    
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.style.backgroundColor = '#f9f9f9';
      dropArea.style.borderColor = '#ccc';
      
      const files = e.dataTransfer.files;
      handleFiles(files);
    });
    
    dropArea.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', () => {
      handleFiles(fileInput.files);
    });
    
    tryOnButton.addEventListener('click', processImage);
    
    // Create a step indicator for image upload
    const uploadLabel = document.createElement('h3');
    uploadLabel.textContent = 'Step 2: Upload Your Photo';
    uploadLabel.style.fontSize = '16px';
    uploadLabel.style.color = '#333';
    uploadLabel.style.marginTop = '25px';
    uploadLabel.style.marginBottom = '10px';
    uploadLabel.style.textAlign = 'center';
    
    const uploadDescription = document.createElement('p');
    uploadDescription.textContent = 'Upload a full-body photo of yourself to try on the selected garment:';
    uploadDescription.style.fontSize = '14px';
    uploadDescription.style.color = '#666';
    uploadDescription.style.marginBottom = '15px';
    uploadDescription.style.textAlign = 'center';
    
    // Update drop area text
    dropText.textContent = 'Drag & drop your photo here or click to select';
    
    // Add elements to the DOM
    dropArea.appendChild(dropText);
    dropArea.appendChild(browseButton);
    dropArea.appendChild(fileInput);
    
    // Update preview area
    const previewLabel = document.createElement('h3');
    previewLabel.textContent = 'Your Photo';
    previewLabel.style.fontSize = '16px';
    previewLabel.style.marginBottom = '10px';
    previewLabel.style.textAlign = 'center';
    previewLabel.style.display = 'none'; // Initially hidden
    
    tryOnButton.textContent = 'Start Virtual Try-On';
    tryOnButton.style.marginTop = '15px';
    tryOnButton.style.padding = '12px 24px';
    tryOnButton.style.fontSize = '16px';
    
    previewArea.appendChild(previewLabel);
    previewArea.appendChild(previewImage);
    previewArea.appendChild(tryOnButton);
    
    // Create a container for the body part selection
    const bodyPartContainer = document.createElement('div');
    bodyPartContainer.style.marginBottom = '20px';
    bodyPartContainer.style.textAlign = 'center';
    
    bodyPartContainer.appendChild(bodyPartLabel);
    bodyPartContainer.appendChild(bodyPartDescription);
    bodyPartContainer.appendChild(categoryContainer);
    bodyPartContainer.appendChild(bodyPartSelect); // Hidden select
    
    // Create a container for the upload section
    const uploadContainer = document.createElement('div');
    uploadContainer.style.marginBottom = '20px';
    uploadContainer.style.textAlign = 'center';
    
    uploadContainer.appendChild(uploadLabel);
    uploadContainer.appendChild(uploadDescription);
    uploadContainer.appendChild(dropArea);
    
    // Add all sections to the content
    content.appendChild(bodyPartContainer);
    content.appendChild(uploadContainer);
    content.appendChild(previewArea);
    content.appendChild(resultArea);
    
    // Update the handleFiles function to show the preview label
    const originalHandleFiles = window.handleFiles;
    window.handleFiles = function(files) {
      originalHandleFiles(files);
      previewLabel.style.display = 'block';
    };

    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(content);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }

  // Open the try-on modal
  function openTryOnModal(e) {
    e.preventDefault();
    e.stopPropagation(); // Stop event propagation to prevent cart from opening
    
    const modal = document.getElementById('vton-modal');
    if (!modal) {
      createModal();
    }
    
    // Reset the modal content
    resetModalContent();
    
    document.getElementById('vton-modal').style.display = 'block';
    
    // Track usage
    const trackUrl = `${VTON_API_URL}/track-usage`;
    const trackData = {
      shop: SHOP_DOMAIN,
      productId: productId
    };
    
    console.log('Tracking usage - URL:', trackUrl);
    console.log('Tracking usage - Data:', trackData);
    
    fetch(trackUrl, {
      method: 'POST',
      mode: 'no-cors', // Добавляем режим no-cors для обхода ограничений CORS
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shop: SHOP_DOMAIN,
        productId: productId
      })
    }).catch(err => console.error('Error tracking usage:', err));
  }

  // Close the modal
  function closeModal() {
    document.getElementById('vton-modal').style.display = 'none';
    resetModalContent();
  }
  
  // Reset modal content
  function resetModalContent() {
    const previewArea = document.getElementById('vton-preview-area');
    const resultArea = document.getElementById('vton-result-area');
    const tryOnButton = document.getElementById('vton-process-button');
    const fileInput = document.getElementById('vton-file-input');
    const bodyPartSelect = document.getElementById('vton-body-part');
    
    previewArea.style.display = 'none';
    resultArea.innerHTML = '';
    tryOnButton.style.display = 'none';
    fileInput.value = '';
    
    // Reset body part selection to default (first option)
    if (bodyPartSelect) {
      bodyPartSelect.selectedIndex = 0;
    }
  }
  
  // Handle files selected by user
  function handleFiles(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    if (!file.type.match('image.*')) {
      alert('Please select an image file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const previewArea = document.getElementById('vton-preview-area');
      const previewImage = document.getElementById('vton-preview-image');
      const tryOnButton = document.getElementById('vton-process-button');
      
      previewImage.src = e.target.result;
      previewArea.style.display = 'block';
      tryOnButton.style.display = 'block';
    };
    
    reader.readAsDataURL(file);
  }
  
  // Process the uploaded image
  function processImage() {
    const previewImage = document.getElementById('vton-preview-image');
    const resultArea = document.getElementById('vton-result-area');
    const bodyPartSelect = document.getElementById('vton-body-part');
    
    // Show loading state with animation
    resultArea.innerHTML = `
      <div style="text-align: center;">
        <p>Segmenting garment...</p>
        <div style="width: 100%; max-width: 300px; height: 20px; background-color: #f0f0f0; border-radius: 10px; margin: 10px auto;">
          <div id="vton-progress-bar" style="width: 0%; height: 100%; background-color: ${getThemeColor()}; border-radius: 10px; transition: width 0.3s;"></div>
        </div>
        <div id="vton-animation" style="margin: 20px auto;">
          <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
            <style>
              .spinner { 
                transform-origin: center;
                animation: spin 1s linear infinite;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
            <circle class="spinner" cx="25" cy="25" r="20" fill="none" stroke="${getThemeColor()}" stroke-width="5" stroke-dasharray="60 30" />
          </svg>
        </div>
      </div>
    `;
    
    // Get the product image URL
    let productImageUrl = '';
    const productImages = document.querySelectorAll('.product__media img, .product-single__photo img, .product-featured-media img, .product__image, [data-product-featured-image]');
    if (productImages.length > 0) {
      // Get the highest resolution image by removing size parameters
      productImageUrl = productImages[0].src.split('?')[0];
    }
    
    if (!productImageUrl) {
      resultArea.innerHTML = '<p style="color: red; text-align: center;">Error: Could not find product image</p>';
      return;
    }
    
    // Get selected body part and map to API category
    const bodyPart = bodyPartSelect.value;
    let objectName = '';
    
    // Map the selected value to the appropriate object_name for segmentation
    switch(bodyPart) {
      case 'upper_body':
        objectName = 'upper_cloth';
        break;
      case 'lower_body':
        objectName = 'bottom_cloth';
        break;
      case 'full_body':
        objectName = 'dress';
        break;
      default:
        objectName = 'upper_cloth';
    }
    
    // Step 1: Run segmentation on the product image
    // Используем точно такой же формат данных, как в рабочем Python-примере
    const segmentationData = {
      user_id: USER_ID,
      image: productImageUrl,
      object_name: objectName
    };
    
    console.log('Starting segmentation with data:', segmentationData);
    console.log('Sending request to URL:', SEGMENTATION_API_URL);
    console.log('Request body:', JSON.stringify(segmentationData, null, 2));
    
    // Start progress animation
    let progressValue = 0;
    const progressBar = document.getElementById('vton-progress-bar');
    const progressInterval = setInterval(() => {
      if (progressValue < 40) { // Cap at 40% for segmentation phase
        progressValue += 1;
        progressBar.style.width = progressValue + '%';
      }
    }, 500);
    
    console.log('Full request details:', {
      url: SEGMENTATION_API_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(segmentationData)
    });
    
    // Добавляем режим no-cors для обхода ограничений CORS в браузере
    // Это может помочь с ошибкой подключения, но ответ будет непрозрачным (opaque)
    fetch(SEGMENTATION_API_URL, {
      method: 'POST',
      mode: 'no-cors', // Пробуем обойти ограничения CORS
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(segmentationData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Segmentation API response was not ok: ' + response.status);
      }
      return response.json();
    })
    .then(segmentationResult => {
      console.log('Segmentation initiated:', segmentationResult);
      
      if (!segmentationResult.process_id) {
        throw new Error('No process ID received from segmentation API');
      }
      
      // Update status message
      resultArea.querySelector('p').textContent = 'Segmentation in progress...';
      
      // Poll for segmentation status
      return pollSegmentationStatus(segmentationResult.process_id, previewImage.src, bodyPart, progressInterval);
    })
    .then(segmentationData => {
      // Once segmentation is complete, start the try-on process
      startTryOn(segmentationData);
    })
    .catch(error => {
      clearInterval(progressInterval);
      console.error('Error in segmentation process:', error);
      resultArea.innerHTML = `<p style="color: red; text-align: center;">Error during segmentation: ${error.message}</p>`;
    });
  }
  
  // Poll for segmentation status
  function pollSegmentationStatus(processId, userImageSrc, bodyPart, progressInterval) {
    const resultArea = document.getElementById('vton-result-area');
    const progressBar = document.getElementById('vton-progress-bar');
    
    return new Promise((resolve, reject) => {
      const statusInterval = setInterval(() => {
        fetch(SEGMENTATION_STATUS_API_URL, {
          method: 'POST',  // Changed to POST as per API documentation
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ process_id: processId })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Segmentation status API response was not ok: ' + response.status);
          }
          return response.json();
        })
        .then(statusData => {
          console.log('Segmentation status:', statusData);
          
          if (statusData.status === 'done') {
            clearInterval(statusInterval);
            clearInterval(progressInterval);
            
            // Set progress to 50% after segmentation is done
            progressBar.style.width = '50%';
            resultArea.querySelector('p').textContent = 'Segmentation complete. Starting virtual try-on...';
            
            // The output contains the root folder with object.jpg and mask.jpg
            const segmentedImageUrl = statusData.output + '/object.jpg';
            
            // Resolve with the segmented image URL
            resolve({
              segmentedImageUrl: segmentedImageUrl,
              userImageSrc: userImageSrc,
              bodyPart: bodyPart
            });
          } else if (statusData.status === 'failed') {
            clearInterval(statusInterval);
            clearInterval(progressInterval);
            reject(new Error(statusData.output || 'Segmentation process failed'));
          }
          // Continue polling if status is 'in_progress'
        })
        .catch(error => {
          clearInterval(statusInterval);
          clearInterval(progressInterval);
          reject(error);
        });
      }, 1000);
    });
  }
  
  // Start the try-on process after segmentation is complete
  function startTryOn(segmentationResult) {
    const resultArea = document.getElementById('vton-result-area');
    const progressBar = document.getElementById('vton-progress-bar');
    
    // Update UI to show try-on is starting
    resultArea.querySelector('p').textContent = 'Starting virtual try-on process...';
    
    // Start progress animation for try-on phase
    let progressValue = 50; // Start from 50% (after segmentation)
    const progressInterval = setInterval(() => {
      if (progressValue < 90) { // Cap at 90% until complete
        progressValue += 1;
        progressBar.style.width = progressValue + '%';
      }
    }, 500);
    
    // Prepare try-on data
    const tryOnData = {
      user_id: USER_ID,
      model_image: segmentationResult.userImageSrc,
      garment_image: segmentationResult.segmentedImageUrl,
      category: segmentationResult.bodyPart
    };
    
    console.log('Starting try-on with data:', tryOnData);
    console.log('Sending request to URL:', TRYON_API_URL);
    console.log('Request body:', JSON.stringify(tryOnData, null, 2));
    
    // Call the try-on API
    console.log('Full try-on request details:', {
      url: TRYON_API_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tryOnData)
    });
    
    fetch(TRYON_API_URL, {
      method: 'POST',
      mode: 'no-cors', // Добавляем режим no-cors для обхода ограничений CORS
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tryOnData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Try-on API response was not ok: ' + response.status);
      }
      return response.json();
    })
    .then(tryOnResult => {
      console.log('Try-on initiated:', tryOnResult);
      
      if (!tryOnResult.process_id) {
        throw new Error('No process ID received from try-on API');
      }
      
      // Poll for try-on status
      pollTryOnStatus(tryOnResult.process_id, progressInterval);
    })
    .catch(error => {
      clearInterval(progressInterval);
      console.error('Error in try-on process:', error);
      resultArea.innerHTML = `<p style="color: red; text-align: center;">Error during try-on: ${error.message}</p>`;
    });
  }
  
  // Poll for try-on status
  function pollTryOnStatus(processId, progressInterval) {
    const resultArea = document.getElementById('vton-result-area');
    const progressBar = document.getElementById('vton-progress-bar');
    
    const statusInterval = setInterval(() => {
      fetch(TRYON_STATUS_API_URL, {
        method: 'POST',
        mode: 'no-cors', // Добавляем режим no-cors для обхода ограничений CORS
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ process_id: processId })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Try-on status API response was not ok: ' + response.status);
        }
        return response.json();
      })
      .then(statusData => {
        console.log('Try-on status:', statusData);
        
        if (statusData.status === 'done') {
          clearInterval(statusInterval);
          clearInterval(progressInterval);
          
          // Set progress to 100% when try-on is done
          progressBar.style.width = '100%';
          
          // Display the result
          setTimeout(() => {
            resultArea.innerHTML = '';
            
            const resultImage = document.createElement('img');
            resultImage.src = statusData.output; // URL to the generated image
            resultImage.style.maxWidth = '100%';
            resultImage.style.maxHeight = '400px';
            resultImage.style.borderRadius = '4px';
            resultImage.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
            resultImage.style.display = 'block';
            resultImage.style.margin = '0 auto';
            
            const resultText = document.createElement('p');
            resultText.textContent = 'Virtual try-on complete!';
            resultText.style.textAlign = 'center';
            resultText.style.marginTop = '15px';
            resultText.style.fontWeight = 'bold';
            
            const downloadButton = document.createElement('button');
            downloadButton.textContent = 'Download Image';
            downloadButton.style.backgroundColor = getThemeColor();
            downloadButton.style.color = '#fff';
            downloadButton.style.border = 'none';
            downloadButton.style.borderRadius = '4px';
            downloadButton.style.padding = '10px 20px';
            downloadButton.style.cursor = 'pointer';
            downloadButton.style.fontSize = '14px';
            downloadButton.style.margin = '15px auto';
            downloadButton.style.display = 'block';
            downloadButton.onclick = () => {
              // Create a temporary link to download the image
              const a = document.createElement('a');
              a.href = statusData.output;
              a.download = 'virtual-try-on.jpg';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            };
            
            resultArea.appendChild(resultImage);
            resultArea.appendChild(resultText);
            resultArea.appendChild(downloadButton);
          }, 500);
        } else if (statusData.status === 'failed') {
          clearInterval(statusInterval);
          clearInterval(progressInterval);
          resultArea.innerHTML = `<p style="color: red; text-align: center;">Error: ${statusData.output || 'Try-on process failed'}</p>`;
        }
        // Continue polling if status is 'in_progress'
      })
      .catch(error => {
        clearInterval(statusInterval);
        clearInterval(progressInterval);
        console.error('Error checking try-on status:', error);
        resultArea.innerHTML = `<p style="color: red; text-align: center;">Error checking try-on status: ${error.message}</p>`;
      });
    }, 1000);
  }
  
  // Helper function to convert Data URL to Blob
  function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    
    return new Blob([uInt8Array], { type: contentType });
  }

  // Function to handle settings changes and update button if needed
  function handleSettingsChange() {
    const button = document.getElementById('vton-product-button');
    if (!button) return;
    
    const settings = getButtonSettings();
    
    // Update button text
    const cameraIcon = button.querySelector('span');
    if (cameraIcon) {
      button.textContent = settings.text;
      button.prepend(cameraIcon);
    } else {
      button.textContent = settings.text;
    }
    
    // Update button color
    let buttonColor = settings.buttonColor;
    if (settings.useThemeColor) {
      buttonColor = getThemeColor();
    }
    button.style.backgroundColor = buttonColor;
    button.style.color = settings.textColor;
    
    console.log('Updated button with new settings:', settings);
  }
  
  // Watch for changes to the settings element
  function observeSettingsChanges() {
    const settingsEl = document.querySelector('.vton-settings');
    if (settingsEl) {
      const settingsObserver = new MutationObserver((mutations) => {
        handleSettingsChange();
      });
      
      settingsObserver.observe(settingsEl, {
        attributes: true,
        attributeFilter: ['data-button-position', 'data-button-text', 'data-use-theme-color', 'data-button-color', 'data-text-color']
      });
    }
  }

  // Initialize the button when DOM is ready
  function initialize() {
    createTryOnButton();
    observeSettingsChanges();
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 100); // Small delay to ensure DOM is fully ready
  }
})(); 