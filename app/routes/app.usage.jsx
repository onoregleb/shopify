import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { 
  Page, 
  Layout, 
  Card, 
  Text, 
  ProgressBar, 
  BlockStack, 
  InlineGrid, 
  Banner,
  Box,
  Badge,
  ButtonGroup,
  Button,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Calculate current month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usageCount = await prisma.tryOnUsage.count({
      where: {
        shop,
        timestamp: {
          gte: startOfMonth
        }
      }
    });
    
    // Get active subscription details
    const response = await admin.graphql(
      `#graphql
        query getSubscription {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              currentPeriodEnd
            }
          }
        }
      `
    );
    
    const data = await response.json();
    const activeSubscription = data?.data?.currentAppInstallation?.activeSubscriptions?.[0];
    
    // Determine usage limit based on plan name
    let usageLimit = 100; // Default to lowest tier
    let planName = "No active subscription";
    let planColor = "#AEC9EB"; // Default color
    
    if (activeSubscription) {
      planName = activeSubscription.name;
      if (activeSubscription.name.includes("Runway")) {
        usageLimit = 500;
        planColor = "#008060"; // Green
      } else if (activeSubscription.name.includes("High Fashion")) {
        usageLimit = 2000;
        planColor = "#5C6AC4"; // Purple
      }
    }
    
    // Get monthly usage breakdown (last 30 days by day)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyUsage = await prisma.$queryRaw`
      SELECT 
        DATE(timestamp) as date, 
        COUNT(*) as count 
      FROM try_on_usage 
      WHERE shop = ${shop} AND timestamp >= ${thirtyDaysAgo} 
      GROUP BY DATE(timestamp) 
      ORDER BY date ASC
    `;

    // Get recent usage records for activity feed
    const recentActivity = await prisma.tryOnUsage.findMany({
      where: {
        shop
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5
    });

    return json({
      usageCount,
      usageLimit,
      percentageUsed: (usageCount / usageLimit) * 100,
      planName,
      planColor,
      currentPeriodEnd: activeSubscription?.currentPeriodEnd,
      dailyUsage,
      recentActivity,
      statusMessage: getStatusMessage(usageCount, usageLimit)
    });
  } catch (error) {
    console.error("Error loading usage data:", error);
    return json({ error: "Failed to load usage data" }, { status: 500 });
  }
};

function getStatusMessage(count, limit) {
  const percentageUsed = (count / limit) * 100;
  
  if (percentageUsed < 50) {
    return {
      status: "success",
      message: "Your usage is within normal limits.",
      icon: "✓"
    };
  } else if (percentageUsed < 80) {
    return {
      status: "warning",
      message: "You're approaching your monthly usage limit.",
      icon: "⚠️"
    };
  } else {
    return {
      status: "critical",
      message: "You're close to your monthly usage limit. Consider upgrading your plan.",
      icon: "⛔"
    };
  }
}

export default function UsageDashboard() {
  const loaderData = useLoaderData();
  
  const {
    usageCount,
    usageLimit,
    percentageUsed,
    planName,
    planColor,
    currentPeriodEnd,
    dailyUsage,
    recentActivity,
    statusMessage,
    error
  } = loaderData;

  if (error) {
    return (
      <Page title="Usage Dashboard">
        <Layout>
          <Layout.Section>
            <Banner status="critical">
              An error occurred while loading your usage data: {error}
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const renewalDate = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : "N/A";
  const daysLeft = currentPeriodEnd ? 
    Math.max(0, Math.ceil((new Date(currentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

  // Get status icon component
  const getStatusIcon = () => {
    if (percentageUsed < 50) {
      return <span style={{ color: "var(--p-color-bg-success)" }}>✓</span>;
    } else if (percentageUsed < 80) {
      return <span style={{ color: "var(--p-color-bg-warning)" }}>⚠️</span>;
    } else {
      return <span style={{ color: "var(--p-color-bg-critical)" }}>⛔</span>;
    }
  };

  return (
    <Page
      title="Usage Dashboard"
      subtitle="Monitor your virtual try-on usage and activity"
      divider
    >
      <Layout>
        {/* Summary Cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="500">
            {/* Current Plan Card */}
            <Card padding="500">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Current Plan</Text>
                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="heading2xl" fontWeight="bold" as="p">
                      {planName}
                    </Text>
                    <Badge tone={daysLeft < 5 ? "warning" : "info"}>
                      Renews in {daysLeft} days ({renewalDate})
                    </Badge>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>

            {/* Usage Overview Card */}
            <Card padding="500">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Monthly Usage</Text>
                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text variant="heading2xl" fontWeight="bold" as="p">
                        {usageCount}
                      </Text>
                      <Text variant="bodyLg" color="subdued" as="p">
                        of {usageLimit}
                      </Text>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <ProgressBar 
                        progress={Math.min(percentageUsed, 100)} 
                        size="large" 
                        color={
                          percentageUsed < 50 ? "success" : 
                          percentageUsed < 80 ? "warning" : "critical"
                        }
                      />
                    </div>
                    <Text variant="bodyMd" color="subdued">
                      {Math.round(percentageUsed)}% of your monthly limit
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>

            {/* Status Card */}
            <Card padding="500">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Status</Text>
                <Box paddingBlockStart="200">
                  <BlockStack gap="300">
                    <Box paddingBlockStart="100">
                      {getStatusIcon()}
                    </Box>
                    <Box paddingBlockStart="100">
                      <Text variant="headingLg" as="p">
                        {statusMessage.status === "success" ? "Good Standing" : 
                          statusMessage.status === "warning" ? "Approaching Limit" : 
                          "Near Limit"}
                      </Text>
                    </Box>
                    <Text variant="bodyMd" as="p">
                      {statusMessage.message}
                    </Text>
                    {percentageUsed > 80 && (
                      <Box paddingBlockStart="300">
                        <Button primary>Upgrade Plan</Button>
                      </Box>
                    )}
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Usage Chart Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Box padding="500">
                <BlockStack gap="300">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="headingLg" as="h2">
                      Usage History
                    </Text>
                    <ButtonGroup segmented>
                      <Button pressed>Last 30 Days</Button>
                      <Button>This Month</Button>
                    </ButtonGroup>
                  </div>
                </BlockStack>
              </Box>

              <div style={{ padding: '0 20px 20px 20px' }}>
                {/* Chart container */}
                <div style={{ height: '300px', position: 'relative' }}>
                  {/* Y-axis label */}
                  <div style={{ position: 'absolute', left: '0', top: '0', bottom: '30px', width: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 10px 0 0' }}>
                    <Text variant="bodySm" color="subdued">Max</Text>
                    <Text variant="bodySm" color="subdued">Mid</Text> 
                    <Text variant="bodySm" color="subdued">0</Text>
                  </div>
                  
                  {/* Chart area */}
                  <div style={{ position: 'absolute', left: '50px', right: '0', top: '0', bottom: '30px', borderLeft: '1px solid #e4e5e7', borderBottom: '1px solid #e4e5e7' }}>
                    {/* Horizontal grid lines */}
                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', height: '1px', backgroundColor: '#f1f1f1' }}></div>
                    <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '1px', backgroundColor: '#f1f1f1' }}></div>
                    
                    {/* Bar chart */}
                    <div style={{ display: 'flex', position: 'absolute', bottom: '0', left: '0', right: '0', top: '0', alignItems: 'flex-end', padding: '0 10px' }}>
                      {dailyUsage.map((day, index) => {
                        const heightPercent = (day.count / (usageLimit / 30)) * 100;
                        return (
                          <div key={index} style={{ 
                            flex: '1',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            padding: '0 2px'
                          }}>
                            <div style={{ 
                              width: '100%',
                              height: `${Math.min(heightPercent, 100)}%`,
                              backgroundColor: day.count > (usageLimit / 30) * 0.8 
                                ? '#DE3618' 
                                : day.count > (usageLimit / 30) * 0.5 
                                  ? '#FFC058' 
                                  : planColor,
                              borderRadius: '2px 2px 0 0',
                              minHeight: day.count > 0 ? '4px' : '0'
                            }}></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* X-axis labels */}
                  <div style={{ position: 'absolute', left: '50px', right: '0', bottom: '0', height: '30px', display: 'flex' }}>
                    {dailyUsage.length > 0 && [0, Math.floor(dailyUsage.length / 2), dailyUsage.length - 1].map((idx) => (
                      <div key={idx} style={{ 
                        position: 'absolute', 
                        left: `${(idx / (dailyUsage.length - 1)) * 100}%`,
                        transform: 'translateX(-50%)',
                        textAlign: 'center'
                      }}>
                        <Text variant="bodySm" color="subdued">
                          {dailyUsage[idx] ? new Date(dailyUsage[idx].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <Text variant="bodyMd" color="subdued">
                    Daily virtual try-on usage over the last 30 days
                  </Text>
                </div>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Tips and Recent Activity */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="500">
            {/* Usage Tips */}
            <Card>
              <BlockStack gap="400">
                <Box padding="500">
                  <BlockStack gap="300">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Text variant="headingMd" as="h3">
                        Tips to Maximize Your Plan
                      </Text>
                    </div>
                    
                    <List type="bullet">
                      <List.Item>Place the try-on button prominently on your product pages</List.Item>
                      <List.Item>Promote the try-on feature in your marketing campaigns</List.Item>
                      <List.Item>Use try-on images in your social media to drive engagement</List.Item>
                      <List.Item>Add the try-on feature to your best-selling products first</List.Item>
                    </List>
                    
                    <div style={{ marginTop: '8px' }}>
                      <Button plain>Learn more about optimizing virtual try-ons</Button>
                    </div>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
            
            {/* Recent Activity */}
            <Card>
              <BlockStack gap="400">
                <Box padding="500">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Recent Activity
                    </Text>
                    
                    {recentActivity && recentActivity.length > 0 ? (
                      <div>
                        {recentActivity.map((activity, index) => (
                          <div key={index} style={{ 
                            padding: '12px 0', 
                            borderBottom: index < recentActivity.length - 1 ? '1px solid #e4e5e7' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}>
                            <div style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              backgroundColor: planColor 
                            }}></div>
                            <div>
                              <Text variant="bodyMd">
                                Try-on for product {activity.productId.split('/').pop()}
                              </Text>
                              <Text variant="bodySm" color="subdued">
                                {new Date(activity.timestamp).toLocaleString()}
                              </Text>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Text color="subdued">No recent activity to display</Text>
                    )}
                    
                    <div style={{ marginTop: '8px' }}>
                      <Button plain>View all activity</Button>
                    </div>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 