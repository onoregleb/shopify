import { json } from "@remix-run/node";
import { useNavigate, useSubmit, useActionData, useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, InlineGrid, Button, List, Banner, Loading, Modal } from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";

const PLANS = [
  {
    name: "Trend",
    price: "19.99",
    features: [
      "100 Try Ons per month",
      "Basic analytics",
      "Email support",
      "Standard integration"
    ],
    type: "RECURRING_BILL",
    interval: "EVERY_30_DAYS",
  },
  {
    name: "Runway",
    price: "49.99",
    features: [
      "500 Try Ons per month",
      "Advanced analytics",
      "Priority support",
      "Custom integration options"
    ],
    type: "RECURRING_BILL",
    interval: "EVERY_30_DAYS",
  },
  {
    name: "High Fashion",
    price: "299.99",
    features: [
      "2000 Try Ons per month",
      "Premium analytics",
      "24/7 Priority support",
      "Custom integration & API access",
      "Dedicated account manager"
    ],
    type: "RECURRING_BILL",
    interval: "EVERY_30_DAYS",
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
        mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean!) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            test: $test
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
          test: true
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
  const app = useAppBridge();

  useEffect(() => {
    if (actionData?.error) {
      console.log('Billing component: Error detected', actionData.error);
      setIsLoading(false);
      return;
    }

    if (actionData?.confirmationUrl && actionData?.success) {
      console.log('Billing component: Processing redirect');
      setShowAuthModal(true);
      
      const performRedirect = () => {
        console.log('Billing component: Attempting redirect to:', actionData.confirmationUrl);
        
        try {
          const popupWindow = window.open(actionData.confirmationUrl, '_blank');
          
          if (popupWindow) {
            console.log('Billing component: Opened in new window');
            setShowAuthModal(false);
          } else {
            console.log('Billing component: Popup blocked, trying direct navigation');
            window.location.href = actionData.confirmationUrl;
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
    submit({ planIndex }, { method: "POST" });
  };

  return (
    <Page
      title="Choose Your Plan"
      backAction={{ content: "Back", onAction: () => navigate("/app") }}
    >
      <Layout>
        <Layout.Section>
          {isLoading && <Loading />}
          
          <Modal
            open={showAuthModal}
            title="Переход к оплате"
            onClose={() => setShowAuthModal(false)}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text as="p">
                  Сейчас откроется страница оплаты Shopify в новом окне. 
                  Если окно не открылось автоматически, нажмите кнопку ниже.
                </Text>
                {actionData?.confirmationUrl && (
                  <Button
                    primary
                    onClick={() => window.open(actionData.confirmationUrl, '_blank')}
                  >
                    Открыть страницу оплаты
                  </Button>
                )}
                <Loading />
              </BlockStack>
            </Modal.Section>
          </Modal>

          <BlockStack gap="500">
            {actionData?.error && (
              <Banner status="critical">
                {actionData.error}
              </Banner>
            )}

            <Text as="h2" variant="headingXl">
              Select a plan that fits your business
            </Text>
            
            <InlineGrid columns={3} gap="500">
              {PLANS.map((plan, index) => (
                <Card key={plan.name}>
                  <BlockStack gap="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingLg">
                        {plan.name}
                      </Text>
                      <Text as="p" variant="headingXl">
                        ${plan.price}
                        <Text as="span" variant="bodySm" color="subdued">
                          /month
                        </Text>
                      </Text>
                    </BlockStack>
                    <List>
                      {plan.features.map((feature) => (
                        <List.Item key={feature}>{feature}</List.Item>
                      ))}
                    </List>
                    <Button
                      primary={index === 1}
                      onClick={() => handleSubscribe(index)}
                      loading={isLoading}
                      fullWidth
                    >
                      Choose {plan.name}
                    </Button>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}