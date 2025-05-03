import { json } from "@remix-run/node";
import { useNavigate, useSubmit, useActionData, useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, InlineGrid, Button, List, Banner, Loading, Modal, Box } from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";

const PLANS = [
  {
    name: "Trend",
    price: "19.99",
    subtitle: "For small businesses starting out",
    features: [
      "100 Try Ons per month",
      "Basic analytics",
      "Email support",
      "Standard integration"
    ],
    type: "RECURRING_BILL",
    interval: "EVERY_30_DAYS",
    trialDays: 3,
    usageLimit: 100,
    color: "#AEC9EB", // Light blue
    recommended: false
  },
  {
    name: "Runway",
    price: "49.99",
    subtitle: "Our most popular plan",
    features: [
      "500 Try Ons per month",
      "Advanced analytics",
      "Priority support",
      "Custom integration options"
    ],
    type: "RECURRING_BILL",
    interval: "EVERY_30_DAYS",
    trialDays: 3,
    usageLimit: 500,
    color: "#008060", // Shopify green
    recommended: true
  },
  {
    name: "High Fashion",
    price: "299.99",
    subtitle: "For enterprise needs",
    features: [
      "2000 Try Ons per month",
      "Premium analytics",
      "24/7 Priority support",
      "Custom integration & API access",
      "Dedicated account manager"
    ],
    type: "RECURRING_BILL",
    interval: "EVERY_30_DAYS",
    trialDays: 3,
    usageLimit: 2000,
    color: "#5C6AC4", // Shopify purple
    recommended: false
  },
];

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
        query getSubscriptions {
          currentAppInstallation {
            activeSubscriptions {
              id
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
    return json({
      shop: session.shop,
      hasActiveSubscription: data?.data?.currentAppInstallation?.activeSubscriptions?.length > 0,
      currentSubscription: data?.data?.currentAppInstallation?.activeSubscriptions?.[0],
      isAuthenticated: true
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    return json({
      error: "Failed to check subscription status",
      shop: session.shop,
      isAuthenticated: true
    });
  }
};

export async function action({ request }) {
  console.log('Billing Action: Starting subscription creation');
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ error: "Invalid session" }, { status: 401 });
  }

  const formData = await request.formData();
  const planIndex = Number(formData.get("planIndex"));
  const plan = PLANS[planIndex];

  const shop = session.shop;
  const baseUrl = process.env.SHOPIFY_APP_URL;
  const returnUrl = `${baseUrl}/app/billing/callback?shop=${shop}`;

  try {
    const response = await admin.graphql(
      `#graphql
        mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean!, $trialDays: Int) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            test: $test
            trialDays: $trialDays
          ) {
            appSubscription {
              id
              status
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          name: plan.name,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: plan.price, currencyCode: "USD" },
                  interval: plan.interval,
                },
              },
            },
          ],
          returnUrl,
          test: true,
          trialDays: plan.trialDays
        },
      }
    );

    const responseJson = await response.json();
    console.log('Billing Action: GraphQL response:', responseJson);

    const confirmationUrl = responseJson.data?.appSubscriptionCreate?.confirmationUrl;
    const userErrors = responseJson.data?.appSubscriptionCreate?.userErrors;

    if (userErrors?.length > 0) {
      console.error('Billing Action: User errors:', userErrors);
      return json({ error: userErrors[0].message }, { status: 400 });
    }
    
    if (!confirmationUrl) {
      console.error('Billing Action: No confirmation URL received');
      return json({ error: "Failed to create subscription" }, { status: 500 });
    }

    // Добавляем параметры для восстановления сессии к URL подтверждения
    const finalConfirmationUrl = new URL(confirmationUrl);
    finalConfirmationUrl.searchParams.set('shop', shop);

    console.log('Billing Action: Success. Final confirmation URL:', finalConfirmationUrl.toString());
    return json({ 
      confirmationUrl: finalConfirmationUrl.toString(),
      shop,
      success: true 
    });
  } catch (error) {
    console.error("Billing Action: Error creating subscription:", error);
    return json({ 
      error: "Failed to create subscription. Please try again.",
      details: error.message 
    }, { status: 500 });
  }
}

export default function Billing() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();
  const loaderData = useLoaderData();
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loadingPlanIndex, setLoadingPlanIndex] = useState(null);
  const app = useAppBridge();

  useEffect(() => {
    if (actionData?.error) {
      console.log('Billing component: Error detected', actionData.error);
      setIsLoading(false);
      setLoadingPlanIndex(null);
      return;
    }

    if (actionData?.confirmationUrl && actionData?.success) {
      console.log('Billing component: Processing redirect');
      setShowAuthModal(true);
      
      const performRedirect = () => {
        console.log('Billing component: Attempting redirect to:', actionData.confirmationUrl);
        
        try {
          // Make sure the URL includes the shop parameter
          let confirmationUrl = actionData.confirmationUrl;
          if (!confirmationUrl.includes('shop=')) {
            const separator = confirmationUrl.includes('?') ? '&' : '?';
            confirmationUrl = `${confirmationUrl}${separator}shop=${actionData.shop}`;
          }
          
          const popupWindow = window.open(confirmationUrl, '_blank');
          
          if (popupWindow) {
            console.log('Billing component: Opened in new window');
            setShowAuthModal(false);
          } else {
            console.log('Billing component: Popup blocked, trying direct navigation');
            window.location.href = confirmationUrl;
          }
        } catch (error) {
          console.error('Billing component: Redirect failed:', error);
          window.location.href = actionData.confirmationUrl;
        }
      };

      const timer = setTimeout(performRedirect, 1000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  const handleSubscribe = (planIndex) => {
    setIsLoading(true);
    setLoadingPlanIndex(planIndex);
    submit({ planIndex }, { method: "POST" });
  };

  return (
    <Page
      title="Choose Your Plan"
      titleMetadata={<Text variant="bodyMd" as="span" color="subdued">All plans include a 3-day free trial</Text>}
      backAction={{ content: "Back", onAction: () => navigate("/app") }}
      divider
    >
      <Layout>
        <Layout.Section>
          {isLoading && <Loading />}
          
          <Modal
            open={showAuthModal}
            title="Proceeding to Payment"
            onClose={() => setShowAuthModal(false)}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text as="p">
                  Shopify's payment page will open in a new window.
                  If it doesn't open automatically, please click the button below.
                </Text>
                {actionData?.confirmationUrl && (
                  <Button
                    primary
                    onClick={() => window.open(actionData.confirmationUrl, '_blank')}
                  >
                    Open Payment Page
                  </Button>
                )}
                <Loading />
              </BlockStack>
            </Modal.Section>
          </Modal>

          <BlockStack gap="800">
            {actionData?.error && (
              <Banner status="critical">
                {actionData.error}
              </Banner>
            )}

            <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto', padding: '20px 0' }}>
              <Text as="h2" variant="heading2xl" fontWeight="bold">
                Choose the Right Plan for Your Business
              </Text>
              <Box paddingBlockStart="400">
                <Text as="p" variant="bodyLg" color="subdued">
                  Select a plan that matches your needs. All plans include a 3-day free trial,
                  and you can upgrade or downgrade at any time.
                </Text>
              </Box>
            </div>
            
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="500">
              {PLANS.map((plan, index) => (
                <div key={plan.name} style={{ height: '100%' }}>
                  <Card 
                    padding="400"
                    style={{ 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column',
                      position: 'relative',
                      border: plan.recommended ? `2px solid ${plan.color}` : undefined,
                      boxShadow: plan.recommended ? '0 4px 16px rgba(0, 0, 0, 0.08)' : undefined,
                      minHeight: '680px'
                    }}
                  >
                    {plan.recommended && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '-12px', 
                        left: '50%', 
                        transform: 'translateX(-50%)',
                        backgroundColor: plan.color,
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)'
                      }}>
                        MOST POPULAR
                      </div>
                    )}
                    <BlockStack gap="300" style={{ height: '100%' }}>
                      <BlockStack gap="200">
                        <Text as="h3" variant="headingLg" alignment="center">
                          {plan.name}
                        </Text>
                        <Text variant="bodyMd" color="subdued" alignment="center">
                          {plan.subtitle}
                        </Text>
                        <div style={{ textAlign: 'center', marginTop: '8px' }}>
                          <Text as="p" variant="heading2xl" fontWeight="bold">
                            ${plan.price}
                            <Text as="span" variant="bodyMd" color="subdued">
                              /month
                            </Text>
                          </Text>
                        </div>
                      </BlockStack>
                      
                      <div style={{ 
                        height: '1px', 
                        background: 'rgba(0, 0, 0, 0.07)', 
                        width: '100%',
                        margin: '12px 0'
                      }}></div>
                      
                      <div style={{ flex: 1, padding: '8px 0' }}>
                        <BlockStack gap="300">
                          {plan.features.map((feature) => (
                            <div key={feature} style={{ 
                              display: 'flex', 
                              alignItems: 'flex-start', 
                              gap: '8px',
                              marginBottom: '6px'
                            }}>
                              <div style={{ 
                                color: plan.color, 
                                fontWeight: 'bold', 
                                fontSize: '18px',
                                minWidth: '18px',
                                marginTop: '0'
                              }}>
                                ✓
                              </div>
                              <div style={{ 
                                color: '#202223', 
                                fontWeight: 'medium', 
                                fontSize: '14px',
                                lineHeight: '20px'
                              }}>
                                {feature}
                              </div>
                            </div>
                          ))}
                        </BlockStack>
                      </div>
                      
                      <div style={{ marginTop: 'auto' }}>
                        <Button
                          primary={plan.recommended}
                          onClick={() => handleSubscribe(index)}
                          loading={isLoading && loadingPlanIndex === index}
                          fullWidth
                          size="large"
                        >
                          {isLoading && loadingPlanIndex === index ? 
                            "Processing..." : 
                            `Choose ${plan.name}`
                          }
                        </Button>
                        <div style={{ 
                          textAlign: 'center', 
                          fontSize: '12px', 
                          color: '#637381',
                          marginTop: '8px' 
                        }}>
                          3-day free trial, then ${plan.price}/month
                        </div>
                      </div>
                    </BlockStack>
                  </Card>
                </div>
              ))}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}