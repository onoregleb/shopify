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
    loadProductSettings();
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

  const loadProductSettings = async () => {
    try {
      const savedSettings = await storage.get('vtonSettings');
      const enabled = await storage.get('virtualTryOnEnabled');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
      setIsEnabled(!!enabled);
    } catch (error) {
      console.error('Error loading settings:', error);
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
      await storage.set('virtualTryOnEnabled', !isEnabled);
      await storage.set('vtonSettings', JSON.stringify(settings));
      setIsEnabled(!isEnabled);
      showNotification(i18n.translate(isEnabled ? 'disabled_message' : 'success_message'), 'success');
    } catch (error) {
      console.error('Error toggling Virtual Try-On:', error);
      showNotification(i18n.translate('error_message'), 'critical');
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

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
              <select
                value={settings.buttonPosition}
                onChange={(e) => handleSettingChange('buttonPosition', e.target.value)}
                style={{padding: '8px', width: '100%'}}
              >
                <option value="below_add_to_cart">Below Add to Cart</option>
                <option value="above_add_to_cart">Above Add to Cart</option>
                <option value="product_description">In Product Description</option>
              </select>
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
                disabled
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