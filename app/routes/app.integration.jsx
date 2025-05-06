import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useNavigate, useLoaderData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  Box,
  List,
  Banner,
  Select,
  TextField,
  InlineStack,
  Icon,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  console.log("Integration loader: Starting with URL", request.url);
  
  try {
    // Проверка наличия параметра shop в URL
    const url = new URL(request.url);
    const shopParam = url.searchParams.get("shop");
    
    console.log("Integration loader: Shop parameter from URL:", shopParam);
    
    // Более детальный подход к аутентификации
    const authOptions = {
      shop: shopParam,
      isLogin: true,
      checkAuth: true,
      fallback: true
    };
    
    console.log("Integration loader: Using auth options:", JSON.stringify(authOptions));
    
    try {
      const { admin, session } = await authenticate.admin(request, authOptions);
      console.log("Integration loader: Authentication successful for shop:", session?.shop);
      
      // Получаем charge_id из URL
      const chargeId = url.searchParams.get("charge_id");
      console.log("Integration loader: Charge ID from URL:", chargeId);
      
      if (chargeId) {
        try {
          // Активируем подписку
          console.log("Integration loader: Activating subscription with ID:", chargeId);
          
          const activateResponse = await admin.graphql(
            `#graphql
              mutation activateSubscription($id: ID!) {
                appSubscriptionActivate(id: $id) {
                  appSubscription {
                    id
                    status
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            {
              variables: {
                id: chargeId
              }
            }
          );

          const activateData = await activateResponse.json();
          console.log("Integration loader: Subscription activation response:", JSON.stringify(activateData));
          
          const userErrors = activateData.data?.appSubscriptionActivate?.userErrors;
          
          if (userErrors?.length > 0) {
            console.error("Integration loader: Subscription activation errors:", JSON.stringify(userErrors));
            return json({ error: userErrors[0].message }, { status: 400 });
          }
          
          console.log("Integration loader: Subscription activated successfully");
        } catch (error) {
          console.error("Integration loader: Error activating subscription:", error);
          return json({ error: "Failed to activate subscription" }, { status: 500 });
        }
      }

      // Проверяем текущую подписку
      console.log("Integration loader: Checking current subscription");
      
      const response = await admin.graphql(
        `#graphql
          query {
            currentAppInstallation {
              activeSubscriptions {
                status
                lineItems {
                  plan {
                    pricingDetails {
                      ... on AppRecurringPricing {
                        price {
                          amount
                          currencyCode
                        }
                        interval
                      }
                    }
                  }
                }
              }
            }
          }
        `
      );

      const data = await response.json();
      console.log("Integration loader: Current subscription data:", JSON.stringify(data.data));
      
      // Attempt to load saved button settings
      let buttonSettings = {
        buttonText: 'Try On Virtually',
        buttonPosition: 'below_add_to_cart'
      };
      
      try {
        // Try to load settings from the API
        const settingsResponse = await fetch(`${process.env.SHOPIFY_APP_URL || ''}/api/button-settings`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          }
        });
        
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData) {
            buttonSettings = settingsData;
          }
        }
      } catch (error) {
        console.error("Integration loader: Could not load button settings:", error);
      }
      
      console.log("Integration loader: Returning successful response");
      return json({
        shop: session.shop,
        hasActiveSubscription: data?.data?.currentAppInstallation?.activeSubscriptions?.length > 0,
        subscriptionStatus: data?.data?.currentAppInstallation?.activeSubscriptions?.[0]?.status,
        buttonSettings,
        // Add a flag to indicate this is a new subscription
        isNewSubscription: !!chargeId
      });
      
    } catch (authError) {
      // Специальная обработка ошибки аутентификации 302
      console.log("Integration loader: Authentication error (possibly 302):", authError);
      
      if (authError.status === 302) {
        console.log("Integration loader: Handling 302 redirect");
        
        // Get the redirect location from the auth error
        const location = authError.headers?.get("Location");
        
        // Устанавливаем шоп из URL параметра
        if (shopParam) {
          return json({
            redirectToAuth: true,
            shop: shopParam,
            location: location || "/auth/login",
            error: "Authentication required. Please log in to continue.",
            isAuthError: true
          });
        }
      }
      
      throw authError; // Пробрасываем дальше если это не 302 или нет shopParam
    }
  } catch (error) {
    console.error("Integration loader: Unhandled error:", error.stack || error);
    return json({
      error: "Authentication error. Please make sure you're logged in to your Shopify store.",
      isAuthError: true
    });
  }
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "configure_theme") {
    // Save the button settings
    const buttonText = formData.get("buttonText");
    const buttonPosition = formData.get("buttonPosition");
    
    // Here you would save these settings to your storage
    // For now, we'll just return success
    
    return json({ success: true, message: "Button settings saved successfully" });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function Integration() {
  const navigate = useNavigate();
  const loaderData = useLoaderData();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [buttonText, setButtonText] = useState(loaderData.buttonSettings?.buttonText || 'Try On Virtually');
  const [buttonPosition, setButtonPosition] = useState(loaderData.buttonSettings?.buttonPosition || 'below_add_to_cart');
  const [saved, setSaved] = useState(false);

  // Handle authentication errors by redirecting
  useEffect(() => {
    if (loaderData.isAuthError && loaderData.redirectToAuth && loaderData.shop) {
      const redirectUrl = loaderData.location || `/auth/login?shop=${loaderData.shop}`;
      console.log("Integration component: Redirecting to auth due to auth error:", redirectUrl);
      window.location.href = redirectUrl;
    }
  }, [loaderData]);

  // Show success message if coming from a new subscription
  useEffect(() => {
    if (loaderData.isNewSubscription) {
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    }
  }, [loaderData.isNewSubscription]);

  const buttonPositionOptions = [
    {label: 'Below Add to Cart', value: 'below_add_to_cart'},
    {label: 'Above Add to Cart', value: 'above_add_to_cart'},
    {label: 'In Product Description', value: 'product_description'}
  ];

  const handleConfigure = async (e) => {
    e.preventDefault();
    setIsConfiguring(true);
    
    // Submit the form to save settings
    const form = e.target;
    const formData = new FormData(form);
    formData.append("action", "configure_theme");
    
    try {
      const response = await fetch('/app/integration', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleComplete = () => {
    // После завершения настройки возвращаемся на главную страницу
    navigate("/app");
  };

  return (
    <Page
      title="Final Setup"
      backAction={{ content: "Back", onAction: () => navigate(-1) }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {saved && (
              <Banner status="success">
                Settings saved successfully!
              </Banner>
            )}
            
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Add Virtual Try-On to Your Store
                </Text>
                <Text as="p">
                  We'll help you integrate the virtual try-on experience into your store's product pages.
                </Text>
                
                <Form method="post" onSubmit={handleConfigure}>
                  <BlockStack gap="400">
                    <Box
                      padding="400"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      background="bg-surface"
                    >
                      <BlockStack gap="300">
                        <Text variant="headingMd">Theme App Extension</Text>
                        <Text variant="bodyMd">
                          To display the Virtual Try-On button on your product pages, you need to activate our Theme App Extension:
                        </Text>
                        <List type="number">
                          <List.Item>
                            Go to your Shopify admin → <strong>Online Store</strong> → <strong>Themes</strong>
                          </List.Item>
                          <List.Item>
                            Click <strong>Customize</strong> on your active theme
                          </List.Item>
                          <List.Item>
                            In the theme editor, click on <strong>Theme settings</strong> (bottom left corner)
                          </List.Item>
                          <List.Item>
                            Select <strong>App embeds</strong>
                          </List.Item>
                          <List.Item>
                            Find the <strong>Virtual Try-On Button</strong> and toggle it ON
                          </List.Item>
                          <List.Item>
                            Customize the button settings (position, colors, etc.)
                          </List.Item>
                          <List.Item>
                            Click <strong>Save</strong> to activate
                          </List.Item>
                        </List>
                        <Box paddingBlockStart="300">
                          <Button
                            onClick={() => {
                              const shop = loaderData.shop;
                              // This is a placeholder URL - in real implementation, you would need to fetch the theme ID
                              const url = `https://${shop}/admin/themes/current/editor?context=apps-embed-blocks&activate=virtual-try-on-button`;
                              window.open(url, '_blank');
                            }}
                          >
                            Open Theme Editor
                          </Button>
                        </Box>
                      </BlockStack>
                    </Box>
                    
                    <BlockStack gap="300">
                      <Button
                        onClick={handleComplete}
                      >
                        Complete Setup
                      </Button>
                    </BlockStack>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}