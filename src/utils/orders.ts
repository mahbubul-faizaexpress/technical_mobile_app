import type { OrderStatus, OrdersPageItem, StatusBoardOrder } from "@/api/types";
import { parseMoney, uniqueValues } from "./format";

export function getStatusTone(status: OrderStatus) {
  if (status === "PROCESSING") {
    return "processing" as const;
  }

  if (status === "COMPLETED" || status === "REFUNDED") {
    return "completed" as const;
  }

  return "pending" as const;
}

export function collectOrderServiceNames(order: OrdersPageItem | StatusBoardOrder) {
  return uniqueValues(order.orderServices?.map((item) => item?.service?.name ?? null) ?? []);
}

export function collectOrderPackageNames(order: OrdersPageItem | StatusBoardOrder) {
  return uniqueValues(order.orderPackages?.map((item) => item?.package?.name ?? null) ?? []);
}

export function buildOrderSummary(order: OrdersPageItem | StatusBoardOrder) {
  if ("serviceName" in order || "packageName" in order) {
    return {
      packageLabel:
        "packageName" in order && order.packageName?.trim().length
          ? order.packageName.trim()
          : "Single service",
      serviceLabel:
        "serviceName" in order && order.serviceName?.trim().length
          ? order.serviceName.trim()
          : "No service",
    };
  }

  const packageNames = collectOrderPackageNames(order);
  const serviceNames = collectOrderServiceNames(order);

  return {
    packageLabel: packageNames.length ? packageNames.join(", ") : "Single services",
    serviceLabel: serviceNames.length
      ? serviceNames.join(", ")
      : packageNames.length
        ? "No extra services"
        : "No services",
  };
}

export function buildOrderFinancialSummary(order: OrdersPageItem) {
  const priceAmount = parseMoney(order.price);
  const paidAmount = (order.paymentOrders ?? []).reduce((total, paymentOrder) => {
    const payment = paymentOrder?.payment;

    if (!payment) {
      return total;
    }

    if (payment.status === "PAID" || payment.status === "PARTIALLY_PAID") {
      return total + parseMoney(payment.amount);
    }

    return total;
  }, 0);

  return {
    priceAmount,
    paidAmount,
    dueAmount: Math.max(priceAmount - paidAmount, 0),
  };
}

export function collectOrderCategoryTags(order: StatusBoardOrder) {
  if (order.serviceCategoryName?.trim()) {
    return uniqueValues([order.serviceCategoryName]);
  }

  const directCategories =
    order.availableServiceCategories?.map((item) => item.name ?? null) ?? [];

  return uniqueValues(directCategories);
}
