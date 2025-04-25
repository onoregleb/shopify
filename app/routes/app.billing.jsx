import { json } from "@remix-run/node";
import { useNavigate, useSubmit, useActionData, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  Button,
  List,
  Banner,
  Loading,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";

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
  console.log('Billing loader: Starting authentication');
  const { admin, session } = await authenticate.admin(request);
  console.log('Billing loader: Authentication successful, shop:', session.shop);
  return json({
    shop: session.shop
  });
};

export async function action({ request }) {
  console.log('Billing action: Starting subscription creation');
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planIndex = Number(formData.get("planIndex"));
  const plan = PLANS[planIndex];
  
  console.log('Billing action: Processing plan:', { 
    planName: plan.name, 
    price: plan.price,
    shopDomain: session.shop 
  });

  try {
    console.log('Billing action: Sending GraphQL mutation');
    const response = await admin.graphql(
      `#graphql
        mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            test: true
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
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app/integration`
        },
      }
    );

    const responseJson = await response.json();
    console.log('Billing action: GraphQL response:', responseJson);
    
    const confirmationUrl = responseJson.data?.appSubscriptionCreate?.confirmationUrl;
    const userErrors = responseJson.data?.appSubscriptionCreate?.userErrors;

    if (userErrors?.length > 0) {
      console.error('Billing action: User errors:', userErrors);
      return json({ error: userErrors[0].message }, { status: 400 });
    }
    
    if (!confirmationUrl) {
      console.error('Billing action: No confirmation URL in response');
      return json({ error: "Failed to create subscription: No confirmation URL received" }, { status: 500 });
    }

    console.log('Billing action: Success, confirmation URL:', confirmationUrl);
    return json({ confirmationUrl });
  } catch (error) {
    console.error("Billing action: Error creating subscription:", error);
    console.error("Error stack:", error.stack);
    return json({ error: "Failed to create subscription: " + error.message }, { status: 500 });
  }
}

export default function Billing() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();
  const loaderData = useLoaderData();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    console.log('Billing component: Mounted');
    if (actionData?.confirmationUrl) {
      console.log('Billing component: Redirecting to:', actionData.confirmationUrl);
      setIsRedirecting(true);
      // Используем window.open вместо window.location.href
      const confirmWindow = window.open(actionData.confirmationUrl, '_blank');
      if (!confirmWindow) {
        console.error('Popup was blocked. Falling back to direct navigation.');
        window.location.href = actionData.confirmationUrl;
      }
    }
  }, [actionData]);

  const handleSubscribe = (planIndex) => {
    console.log('Billing component: Subscribing to plan index:', planIndex);
    submit({ planIndex }, { method: "POST", replace: true });
  };

  return (
    <Page
      title="Choose Your Plan"
      backAction={{ content: "Back", onAction: () => navigate("/app") }}
    >
      <Layout>
        <Layout.Section>
          {isRedirecting && <Loading />}
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