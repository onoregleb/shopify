(() => {
  const VTON_API_URL = "https://api.modera-fashion.com/vton";
  const SHOP_DOMAIN = Shopify.shop;

  // Check if we're on a product page
  const isProductPage = window.location.pathname.includes('/products/');
  if (!isProductPage) return;

  // Get current product ID
  let productId = null;
  try {
    productId = meta.product?.id?.split('/').pop();
    if (!productId) {
      const productForm = document.querySelector('form[action*="/cart/add"]');
      if (productForm) {
        const idInput = productForm.querySelector('input[name="id"]');
        if (idInput) {
          productId = idInput.value;
        }
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

  // Get button settings from the app embed block
  const buttonSettings = {
    position: "{{ block.settings.button_position }}",
    text: "{{ block.settings.button_text }}",
    useThemeColor: "{{ block.settings.use_theme_color }}" === "true",
    buttonColor: "{{ block.settings.button_color }}",
    textColor: "{{ block.settings.text_color }}"
  };

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

  // Create try-on button
  function createTryOnButton() {
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
      '[data-product-information]'
    ];

    // Try each selector until we find a match
    let buyButtonContainer = null;
    for (const selector of buyButtonSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        buyButtonContainer = element;
        console.log("Found buy button container with selector:", selector);
        break;
      }
    }

    if (!buyButtonContainer) {
      console.error("Could not find buy button container, using fallback");
      createFloatingButton();
      return;
    }

    // Get the button color, either from theme or settings
    let buttonColor = buttonSettings.buttonColor;
    if (buttonSettings.useThemeColor) {
      buttonColor = getThemeColor();
    }

    // Create button wrapper to maintain consistent styling with theme
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'vton-button-wrapper';
    buttonWrapper.style.marginTop = '10px';
    buttonWrapper.style.marginBottom = '10px';
    buttonWrapper.style.width = '100%';

    // Create the button
    const button = document.createElement('button');
    button.id = 'vton-button';
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
    
    // Camera icon
    const cameraIcon = document.createElement('span');
    cameraIcon.innerHTML = '📷';
    cameraIcon.style.marginRight = '8px';
    button.prepend(cameraIcon);

    // Add click handler
    button.addEventListener('click', openTryOnModal);
    
    // Add to page based on settings
    buttonWrapper.appendChild(button);
    
    // Handle insertion based on position setting
    if (buttonSettings.position === 'above-buy-buttons') {
      console.log("Positioning button above buy buttons");
      
      // First try to find the buy button element itself
      const addToCartButton = buyButtonContainer.querySelector('button[name="add"], button.add-to-cart, button[data-add-to-cart], .product-form__cart-submit, [data-testid="Checkout-button"]');
      
      if (addToCartButton) {
        // If there's a direct button, insert before its parent container
        const buttonContainer = addToCartButton.closest('.shopify-payment-button, .product-form__buttons, .add-to-cart, .product-form__submit');
        if (buttonContainer) {
          buttonContainer.parentNode.insertBefore(buttonWrapper, buttonContainer);
        } else {
          // Insert before the button itself
          addToCartButton.parentNode.insertBefore(buttonWrapper, addToCartButton);
        }
      } else {
        // If no direct button found, insert at the beginning of the buy button container
        buyButtonContainer.insertBefore(buttonWrapper, buyButtonContainer.firstChild);
      }
    } else {
      // Default is 'below-buy-buttons'
      console.log("Positioning button below buy buttons");
      
      // Try to find the payment buttons section which usually comes after the add to cart button
      const paymentButtons = buyButtonContainer.querySelector('.shopify-payment-button, .product-form__payment-container');
      
      if (paymentButtons) {
        // Insert after payment buttons
        paymentButtons.parentNode.insertBefore(buttonWrapper, paymentButtons.nextSibling);
      } else {
        // Find the main buy button
        const addToCartButton = buyButtonContainer.querySelector('button[name="add"], button.add-to-cart, button[data-add-to-cart], .product-form__cart-submit, [data-testid="Checkout-button"]');
        
        if (addToCartButton) {
          // If there's a direct button, insert after its parent container
          const buttonContainer = addToCartButton.closest('.shopify-payment-button, .product-form__buttons, .add-to-cart, .product-form__submit');
          if (buttonContainer) {
            buttonContainer.parentNode.insertBefore(buttonWrapper, buttonContainer.nextSibling);
          } else {
            // Insert after the button itself
            addToCartButton.parentNode.insertBefore(buttonWrapper, addToCartButton.nextSibling);
          }
        } else {
          // If no specific elements found, append to the end of the container
          buyButtonContainer.appendChild(buttonWrapper);
        }
      }
    }
    
    // Log success
    console.log("Successfully added Try-On button with position:", buttonSettings.position);
  }

  // Fallback to create a floating button if we can't find the buy button container
  function createFloatingButton() {
    const button = document.createElement('button');
    button.id = 'vton-button';
    button.textContent = buttonSettings.text;
    
    // Get the button color, either from theme or settings
    let buttonColor = buttonSettings.buttonColor;
    if (buttonSettings.useThemeColor) {
      buttonColor = getThemeColor();
    }
    
    button.style.backgroundColor = buttonColor;
    button.style.color = buttonSettings.textColor;
    button.style.padding = '12px 20px';
    button.style.borderRadius = '4px';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.position = 'fixed';
    button.style.zIndex = '9999';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    
    // Camera icon
    const cameraIcon = document.createElement('span');
    cameraIcon.innerHTML = '📷';
    cameraIcon.style.marginRight = '8px';
    button.prepend(cameraIcon);

    // Position at bottom right by default
    button.style.bottom = '20px';
    button.style.right = '20px';

    // Add click handler
    button.addEventListener('click', openTryOnModal);
    
    // Add to page
    document.body.appendChild(button);
    console.log("Added floating Try-On button as fallback");
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

    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(content);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }

  // Open the try-on modal
  function openTryOnModal() {
    const modal = document.getElementById('vton-modal');
    if (!modal) {
      createModal();
    }
    
    const content = document.getElementById('vton-content');
    content.innerHTML = '<p>Loading virtual try-on experience...</p>';
    
    // You would typically load an iframe here pointing to your app's try-on page
    const iframe = document.createElement('iframe');
    iframe.src = `https://${SHOP_DOMAIN}/apps/modera-fashion/try-on?productId=${productId}`;
    iframe.style.width = '100%';
    iframe.style.height = '600px';
    iframe.style.border = 'none';
    
    content.innerHTML = '';
    content.appendChild(iframe);
    
    document.getElementById('vton-modal').style.display = 'block';
    
    // Track usage
    fetch(`${VTON_API_URL}/track-usage`, {
      method: 'POST',
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
  }

  // Initialize the button when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createTryOnButton);
  } else {
    createTryOnButton();
  }
})(); 