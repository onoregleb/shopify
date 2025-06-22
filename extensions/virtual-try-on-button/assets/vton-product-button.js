(() => {
  const VTON_API_RUN_URL = "/apps/tryon/run";
  const VTON_API_STATUS_URL = "/apps/tryon/status";
  const SHOP_DOMAIN = Shopify.shop;

  // Check if we're on a product page
  const isProductPage = window.location.pathname.includes('/products/');
  if (!isProductPage) return;

  // Get current product ID
  let productId = null;
  try {
    // Try multiple methods to get the product ID
    if (window.meta && window.meta.product && window.meta.product.id) {
      const idStr = String(window.meta.product.id);
      productId = idStr.includes('/') ? idStr.split('/').pop() : idStr;
    }
    
    if (!productId && window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
      productId = window.ShopifyAnalytics.meta.product?.id;
    }
    
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
        const handle = pathParts[productsIndex + 1];
        console.log('Using product handle from URL:', handle);
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

  // Функция для конвертации изображения в base64
  async function imageToBase64(imageUrl) {
    try {
      // Validate image URL
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Invalid image URL provided');
      }

      // Handle data URLs directly
      if (imageUrl.startsWith('data:')) {
        return imageUrl.split(',')[1];
      }

      // Handle blob URLs
      if (imageUrl.startsWith('blob:')) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      // Handle regular URLs
      const response = await fetch(imageUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
          'Accept': 'image/*'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw new Error(`Failed to convert image: ${error.message}`);
    }
  }

  // Функция для получения изображения товара
  async function getProductImage() {
    try {
      const productImage = document.querySelector('.product__media img, .product-single__media img, [data-product-image] img');
      if (!productImage) {
        throw new Error('Product image not found');
      }
      return productImage.src;
    } catch (error) {
      console.error('Error getting product image:', error);
      throw error;
    }
  }

  // Функция для обработки загруженного файла
  async function handleFiles(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    if (!file.type.match('image.*')) {
      alert('Please select an image file');
      return;
    }
    
    const previewArea = document.getElementById('vton-preview-area');
    const previewImage = document.getElementById('vton-preview-image');
    const tryOnButton = document.getElementById('vton-process-button');
    const resultArea = document.getElementById('vton-result-area');
    
    // Показываем превью
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImage.src = e.target.result;
      previewArea.style.display = 'block';
      tryOnButton.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  // Функция для обработки изображения
  async function processImage() {
    const tryOnButton = document.getElementById('vton-process-button');
    const resultArea = document.getElementById('vton-result-area');
    const bodyPartSelect = document.getElementById('vton-body-part');
    const previewImage = document.getElementById('vton-preview-image');
    
    if (!tryOnButton || !resultArea || !bodyPartSelect || !previewImage) {
      console.error('Required elements not found');
      return;
    }

    const modelImageUrl = previewImage.src;
    const selectedBodyPart = bodyPartSelect.value;

    if (!modelImageUrl) {
      resultArea.innerHTML = '<p style="color: red; text-align: center;">Error: No image found</p>';
      return;
    }

    // Показываем индикатор загрузки
    resultArea.innerHTML = `
      <div style="text-align: center;">
        <p>Processing image...</p>
        <div style="width: 100%; max-width: 300px; height: 20px; background-color: #f0f0f0; border-radius: 10px; margin: 10px auto;">
          <div id="vton-progress-bar" style="width: 0%; height: 100%; background-color: ${getThemeColor()}; border-radius: 10px; transition: width 0.3s;"></div>
        </div>
      </div>
    `;

    try {
      // Получаем изображение товара
      const productImageUrl = await getProductImage();

      // Маппинг категорий
      let category = 'tshirt';
      if (selectedBodyPart === 'upper_body') category = 'tshirt';
      else if (selectedBodyPart === 'lower_body') category = 'pants';
      else if (selectedBodyPart === 'full_body') category = 'dress';

      // Подготавливаем данные для API
      const data = {
        user_id: 'test_user',
        model_image: modelImageUrl,
        garment_image: productImageUrl,
        category: category,
        step: 30,
        scale: 2.5,
        seed: Math.floor(Math.random() * 10000)
      };

      // Отправляем запрос к API /run
      const response = await fetch(VTON_API_RUN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('API /run request failed');
      }

      const runResult = await response.json();
      if (!runResult.process_id) {
        throw new Error('No process_id returned from API');
      }

      // Функция для опроса статуса
      async function pollStatus(processId, maxAttempts = 60, interval = 2000) {
        let attempts = 0;
        while (attempts < maxAttempts) {
          const statusResp = await fetch(VTON_API_STATUS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ process_id: processId })
          });
          if (!statusResp.ok) throw new Error('API /status request failed');
          const statusData = await statusResp.json();
          if (statusData.status === 'done' && statusData.output) {
            return statusData.output;
          } else if (statusData.status === 'failed') {
            throw new Error('Processing failed');
          }
          // Update progress bar
          const progressBar = document.getElementById('vton-progress-bar');
          if (progressBar) progressBar.style.width = `${Math.min(100, (attempts / maxAttempts) * 100)}%`;
          await new Promise(res => setTimeout(res, interval));
          attempts++;
        }
        throw new Error('Timeout waiting for result');
      }

      // Poll for result
      const outputImageUrl = await pollStatus(runResult.process_id);

      // Показываем результат
      resultArea.innerHTML = '';
      const resultImage = document.createElement('img');
      resultImage.src = outputImageUrl;
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
      downloadButton.style.backgroundColor = '#333333';
      downloadButton.style.color = '#FFFFFF';
      downloadButton.style.border = 'none';
      downloadButton.style.borderRadius = '4px';
      downloadButton.style.padding = '10px 20px';
      downloadButton.style.cursor = 'pointer';
      downloadButton.style.fontSize = '14px';
      downloadButton.style.margin = '15px auto';
      downloadButton.style.display = 'block';
      downloadButton.style.fontWeight = 'bold';
      downloadButton.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
      downloadButton.onclick = () => {
        const a = document.createElement('a');
        a.href = outputImageUrl;
        a.download = 'virtual-try-on.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      resultArea.appendChild(resultImage);
      resultArea.appendChild(resultText);
      resultArea.appendChild(downloadButton);
    } catch (error) {
      console.error('Error in processImage:', error);
      resultArea.innerHTML = `<p style="color: red; text-align: center;">Error processing image: ${error.message}</p>`;
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
      categoryButton.style.backgroundColor = '#fff';
      
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
        
        // Update UI
        document.querySelectorAll('.vton-category-button').forEach(btn => {
          btn.style.border = '2px solid #ccc';
          btn.style.backgroundColor = '#f0f0f0';
          btn.style.opacity = '0.7';
          btn.style.filter = 'grayscale(30%)';
        });
        
        categoryButton.style.border = `2px solid ${getThemeColor()}`;
        categoryButton.style.backgroundColor = '#fff';
        categoryButton.style.opacity = '1';
        categoryButton.style.filter = 'grayscale(0%)';
        categoryButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
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
    browseButton.style.backgroundColor = '#333333';
    browseButton.style.color = '#FFFFFF';
    browseButton.style.border = 'none';
    browseButton.style.borderRadius = '4px';
    browseButton.style.padding = '10px 20px';
    browseButton.style.cursor = 'pointer';
    browseButton.style.fontSize = '14px';
    browseButton.style.marginTop = '5px';
    browseButton.style.fontWeight = 'bold';
    browseButton.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
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
    tryOnButton.textContent = 'Start Virtual Try-On';
    tryOnButton.style.backgroundColor = '#333333';
    tryOnButton.style.color = '#FFFFFF';
    tryOnButton.style.border = 'none';
    tryOnButton.style.borderRadius = '4px';
    tryOnButton.style.padding = '10px 20px';
    tryOnButton.style.cursor = 'pointer';
    tryOnButton.style.fontSize = '14px';
    tryOnButton.style.marginTop = '15px';
    tryOnButton.style.display = 'none';
    tryOnButton.style.fontWeight = 'bold';
    tryOnButton.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
    tryOnButton.style.width = '100%';
    tryOnButton.style.maxWidth = '100%';
    tryOnButton.onclick = processImage;
    
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
    previewLabel.style.display = 'none';
    
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
    bodyPartContainer.appendChild(bodyPartSelect);
    
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
    
    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(content);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }

  // Open the try-on modal
  function openTryOnModal(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const modal = document.getElementById('vton-modal');
    if (!modal) {
      createModal();
    }
    
    resetModalContent();
    
    document.getElementById('vton-modal').style.display = 'block';
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
    
    if (bodyPartSelect) {
      bodyPartSelect.selectedIndex = 0;
    }
  }
})(); 