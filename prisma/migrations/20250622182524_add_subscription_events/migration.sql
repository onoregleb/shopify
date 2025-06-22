-- CreateTable
CREATE TABLE "try_on_usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Credits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsageLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 100,
    "planName" TEXT NOT NULL DEFAULT 'Trend',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "try_on_usage_shop_timestamp_idx" ON "try_on_usage"("shop", "timestamp");

-- CreateIndex
CREATE INDEX "subscription_events_shop_timestamp_idx" ON "subscription_events"("shop", "timestamp");

-- CreateIndex
CREATE INDEX "subscription_events_subscriptionId_idx" ON "subscription_events"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Credits_shop_key" ON "Credits"("shop");

-- CreateIndex
CREATE INDEX "Credits_shop_idx" ON "Credits"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLimit_shop_key" ON "UsageLimit"("shop");

-- CreateIndex
CREATE INDEX "UsageLimit_shop_idx" ON "UsageLimit"("shop");
