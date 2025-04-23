import { json } from "@remix-run/node";
import { useNavigate, useSubmit, useActionData } from "@remix-run/react";
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
  await authenticate.admin(request);
  return null;
};

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const planIndex = Number(formData.get("planIndex"));
  const plan = PLANS[planIndex];

  try {
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
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app/integration`,
        },
      }
    );

    const responseJson = await response.json();
    const confirmationUrl = responseJson.data?.appSubscriptionCreate?.confirmationUrl;
    
    return json({ confirmationUrl });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

export default function Billing() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (actionData?.confirmationUrl) {
      setIsRedirecting(true);
      // Используем setTimeout чтобы дать время состоянию обновиться
      setTimeout(() => {
        window.location.assign(actionData.confirmationUrl);
      }, 100);
    }
  }, [actionData]);

  const handleSubscribe = (planIndex) => {
    submit({ planIndex }, { method: "POST" });
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