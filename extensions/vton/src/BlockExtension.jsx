import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Icon,
  Banner,
  TextField,
  Badge,
  Box,
  Image,
  Select,
} from '@shopify/ui-extensions-react/admin';
import { useState, useEffect } from 'react';

const TARGET = 'admin.product-details.block.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  const {i18n, data, storage, sessionToken} = useApi(TARGET);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [notification, setNotification] = useState(null);
  const [settings, setSettings] = useState({
    buttonText: 'Try On Virtually',
    buttonPosition: 'below_add_to_cart'
  });

  useEffect(() => {
    checkSubscriptionStatus();
    loadButtonSettings();
  }, []);

  const showNotification = (message, status = 'info') => {
    setNotification({ message, status });
    setTimeout(() => setNotification(null), 3000);
  };

  const checkSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/subscription-status', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      const data = await response.json();
      setHasActiveSubscription(data.isActive);
    } catch (error) {
      console.error('Error checking subscription:', error);
      showNotification('Failed to verify subscription status', 'critical');
    }
  };

  const loadButtonSettings = async () => {
    try {
      setIsLoading(true);
      // Fetch settings from API
      const response = await fetch('/api/button-settings', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load settings');
      }
      
      const data = await response.json();
      setSettings({
        buttonText: data.buttonText || 'Try On Virtually',
        buttonPosition: data.buttonPosition || 'below_add_to_cart'
      });
      setIsEnabled(data.isEnabled);
    } catch (error) {
      console.error('Error loading settings:', error);
      // Fall back to local storage if API fails
      try {
        const savedSettings = await storage.get('vtonSettings');
        const enabled = await storage.get('virtualTryOnEnabled');
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
        setIsEnabled(!!enabled);
      } catch (storageError) {
        console.error('Error loading from storage:', storageError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleVirtualTryOn = async () => {
    if (!hasActiveSubscription) {
      showNotification('Please subscribe to enable Virtual Try-On', 'warning');
      return;
    }

    try {
      const newEnabledState = !isEnabled;
      
      // Update API
      const response = await fetch('/api/button-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          ...settings,
          isEnabled: newEnabledState
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update settings');
      }
      
      // Also update local storage as fallback
      await storage.set('virtualTryOnEnabled', newEnabledState);
      await storage.set('vtonSettings', JSON.stringify(settings));
      
      setIsEnabled(newEnabledState);
      showNotification(i18n.translate(isEnabled ? 'disabled_message' : 'success_message'), 'success');
    } catch (error) {
      console.error('Error toggling Virtual Try-On:', error);
      showNotification(i18n.translate('error_message'), 'critical');
    }
  };

  // New method to track usage when a customer uses the try-on feature
  const trackTryOnUsage = async (productId) => {
    try {
      const response = await fetch('/api/usage-tracker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          productId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Usage tracking error:', errorData);
      }
    } catch (error) {
      console.error('Error tracking usage:', error);
    }
  };
  
  // Method to simulate a customer using the try-on feature (for demo purposes)
  const handleTryOnClick = async () => {
    // Get the current product ID from data
    const productId = data?.product?.id;
    
    if (!productId) {
      showNotification('Could not identify product', 'warning');
      return;
    }
    
    // Track the usage
    await trackTryOnUsage(productId);
    
    // Show a success notification
    showNotification('Virtual Try-On experience launched!', 'success');
  };

  const handleSettingChange = async (key, value) => {
    const newSettings = {
      ...settings,
      [key]: value
    };
    
    setSettings(newSettings);
    
    try {
      // Update API
      await fetch('/api/button-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          ...newSettings,
          isEnabled
        })
      });
      
      // Update local storage as fallback
      await storage.set('vtonSettings', JSON.stringify(newSettings));
      showNotification('Settings updated', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const buttonPositionOptions = [
    {label: 'Below Add to Cart', value: 'below_add_to_cart'},
    {label: 'Above Add to Cart', value: 'above_add_to_cart'},
    {label: 'In Product Description', value: 'product_description'}
  ];

  return (
    <AdminBlock title={i18n.translate('title')}>
      <BlockStack gap="400">
        {notification && (
          <Banner status={notification.status}>
            {notification.message}
          </Banner>
        )}

        <InlineStack align="space-between">
          <Text>{i18n.translate('description')}</Text>
          {hasActiveSubscription ? (
            <Badge status="success">Subscription Active</Badge>
          ) : (
            <Badge status="attention">Subscription Required</Badge>
          )}
        </InlineStack>

        {isEnabled && (
          <Box
            padding="400"
            borderWidth="025"
            borderRadius="200"
            borderColor="border"
            background="bg-surface"
          >
            <BlockStack gap="300">
              <Text variant="headingMd">Try-On Button Settings</Text>
              <TextField
                label="Button Text"
                value={settings.buttonText}
                onChange={(value) => handleSettingChange('buttonText', value)}
              />
              <Select
                label="Button Position"
                options={buttonPositionOptions}
                selected={settings.buttonPosition}
                onChange={(value) => handleSettingChange('buttonPosition', value)}
              />
            </BlockStack>
          </Box>
        )}

        <Box
          padding="400"
          borderWidth="025"
          borderRadius="200"
          borderColor="border"
          background="bg-surface"
        >
          <BlockStack gap="300">
            <Text variant="headingMd">Preview</Text>
            <Image source="https://cdn.shopify.com/shopifycloud/shopify_app/assets/default-banner-image.jpg" alt="Preview" />
            {isEnabled && (
              <Button
                variant="secondary"
                icon={<Icon source="camera" />}
                disabled={false}
                onPress={handleTryOnClick}
              >
                {settings.buttonText}
              </Button>
            )}
          </BlockStack>
        </Box>

        <InlineStack gap="200" align="start">
          <Button
            variant="primary"
            onPress={handleToggleVirtualTryOn}
            loading={isLoading}
            icon={<Icon source="camera" />}
          >
            {i18n.translate(isEnabled ? 'disable_button' : 'enable_button')}
          </Button>
        </InlineStack>
      </BlockStack>
    </AdminBlock>
  );
}