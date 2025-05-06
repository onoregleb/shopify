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
    buttonColor: "{{ block.settings.button_color }}",
    textColor: "{{ block.settings.text_color }}"
  };

  // Create try-on button
  function createTryOnButton() {
    const button = document.createElement('button');
    button.id = 'vton-button';
    button.textContent = buttonSettings.text;
    button.style.backgroundColor = buttonSettings.buttonColor;
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

    // Set button position based on settings
    switch(buttonSettings.position) {
      case 'top-right':
        button.style.top = '20px';
        button.style.right = '20px';
        break;
      case 'top-left':
        button.style.top = '20px';
        button.style.left = '20px';
        break;
      case 'bottom-right':
        button.style.bottom = '20px';
        button.style.right = '20px';
        break;
      case 'bottom-left':
        button.style.bottom = '20px';
        button.style.left = '20px';
        break;
      default:
        button.style.bottom = '20px';
        button.style.right = '20px';
    }

    // Add click handler
    button.addEventListener('click', openTryOnModal);
    
    // Add to page
    document.body.appendChild(button);
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