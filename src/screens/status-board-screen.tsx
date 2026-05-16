import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { STATUS_BOARD_ORDERS_QUERY } from "@/api/documents";
import type { OrderStatus, StatusBoardOrder } from "@/api/types";
import { Badge } from "@/components/common/badge";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { PickerField } from "@/components/common/picker-field";
import { Screen } from "@/components/common/screen";
import { SearchField } from "@/components/common/search-field";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Surface } from "@/components/common/surface";
import { StatusActionModal } from "@/components/status-board/status-action-modal";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import { formatDateTime, formatOrderStatusLabel } from "@/utils/format";
import { getStatusTone } from "@/utils/orders";
import { useAsyncResource } from "@/utils/use-async-resource";

const statusOptions = [
  { label: "Pending", value: "PENDING" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Completed", value: "COMPLETED" },
] as const;

const pageSizeOptions = [
  { label: "20", value: "20" },
  { label: "30", value: "30" },
  { label: "50", value: "50" },
] as const;

type StatusBoardResponse = {
  technicalStatusBoardCategories: Array<{
    serviceCategoryId: number;
    name: string;
  }>;
  technicalStatusBoardOrders: {
    items: StatusBoardOrder[];
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalPages: number;
    totalCount: number;
    categoryCounts: Array<{
      serviceCategoryId: number;
      name: string;
      count: number;
    }>;
  };
};

export function StatusBoardScreen() {
  const { colors } = useAppTheme();
  const { executeAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus>("PENDING");
  const [serviceCategoryId, setServiceCategoryId] = useState<number | null>(null);
  const [activeOrder, setActiveOrder] = useState<StatusBoardOrder | null>(null);
  const compact = width < 390;

  const resource = useAsyncResource(
    () =>
      executeAuthenticated<
        StatusBoardResponse,
        { input: { page: number; pageSize: number; status: OrderStatus; serviceCategoryId?: number } }
      >(STATUS_BOARD_ORDERS_QUERY, {
        input: {
          page,
          pageSize,
          status,
          ...(serviceCategoryId ? { serviceCategoryId } : {}),
        },
      }),
    [executeAuthenticated, page, pageSize, serviceCategoryId, status],
  );

  const pageData = resource.data?.technicalStatusBoardOrders;
  const visibleOrders = useMemo(() => {
    if (!pageData) {
      return [];
    }

    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return pageData.items;
    }

    return pageData.items.filter((order) =>
      [
        order.companyInfo?.name,
        order.serviceName,
        order.packageName,
        order.serviceCategoryName,
        `order ${order.orderId}`,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [pageData, search]);

  return (
    <Screen onRefresh={() => void resource.reload("refresh")} refreshing={resource.refreshing}>
      <View style={styles.stack}>
        <View style={styles.hero}>
          <Text style={[styles.heroEyebrow, { color: colors.accent }]}>Workflow</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Status board</Text>
          <Text style={[styles.heroCopy, { color: colors.textSoft }]}>
            Service-wise pending, processing, and completed workflow across all technical orders.
          </Text>
        </View>

        <SegmentedControl
          options={statusOptions}
          value={status}
          onChange={(value) => {
            setStatus(value as OrderStatus);
            setPage(1);
          }}
        />

        <SearchField
          placeholder="Search order, company, service, package"
          returnKeyType="search"
          value={search}
          onChangeText={setSearch}
        />

        {pageData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryRow}>
              <Pressable
                onPress={() => {
                  setServiceCategoryId(null);
                  setPage(1);
                }}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: serviceCategoryId === null ? colors.accent : colors.cardMuted,
                    borderColor: serviceCategoryId === null ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.categoryLabel,
                    {
                      color: serviceCategoryId === null ? "#042321" : colors.text,
                    },
                  ]}
                >
                  All Categories
                </Text>
              </Pressable>

              {pageData.categoryCounts.map((item) => (
                <Pressable
                  key={`${item.serviceCategoryId}-${item.name}`}
                  onPress={() => {
                    setServiceCategoryId(item.serviceCategoryId);
                    setPage(1);
                  }}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor:
                        serviceCategoryId === item.serviceCategoryId ? colors.accent : colors.cardMuted,
                      borderColor:
                        serviceCategoryId === item.serviceCategoryId ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryLabel,
                      {
                        color:
                          serviceCategoryId === item.serviceCategoryId ? "#042321" : colors.text,
                      },
                    ]}
                  >
                    {item.name} ({item.count})
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {resource.loading && !pageData ? <LoadingState label="Loading status board..." /> : null}
        {resource.error && !pageData ? (
          <EmptyState title="Could not load status board" description={resource.error} />
        ) : null}

        {pageData ? (
          <View style={styles.stack}>
            <Text style={[styles.summary, { color: colors.textSoft }]}>
              {pageData.totalCount} service items in {formatOrderStatusLabel(status)}
            </Text>

            {visibleOrders.length === 0 ? (
              <EmptyState
                title="No matching services"
                description="Try another category or clear your search."
              />
            ) : (
              visibleOrders.map((order) => {
                const isRejectedPending = status === "PENDING" && Boolean(order.lastRejectedAt);

                return (
                  <Pressable
                    key={order.id}
                    onPress={() => setActiveOrder(order)}
                  >
                    <Surface
                      style={[
                        styles.card,
                        isRejectedPending
                          ? {
                              backgroundColor: "rgba(255, 95, 95, 0.08)",
                              borderColor: "rgba(255, 95, 95, 0.2)",
                            }
                          : null,
                      ]}
                    >
                      <View style={styles.cardTop}>
                        <View style={styles.copy}>
                          <Text style={[styles.serviceName, { color: colors.text }]}>
                            {order.serviceName || "Unnamed service"}
                          </Text>
                          <Text style={[styles.companyName, { color: colors.textDim }]}>
                            {order.companyInfo?.name ?? "Unknown company"}
                          </Text>
                        </View>
                        <Badge
                          label={formatOrderStatusLabel(order.status)}
                          tone={getStatusTone(order.status)}
                        />
                      </View>

                      <View style={styles.metaBlock}>
                        <Text style={[styles.meta, { color: colors.textSoft }]}>
                          Order #{order.orderId}
                        </Text>
                        {order.packageName?.trim() ? (
                          <Text style={[styles.meta, { color: colors.textSoft }]}>
                            Package · {order.packageName}
                          </Text>
                        ) : null}
                        <Text style={[styles.meta, { color: colors.textSoft }]}>
                          Category · {order.serviceCategoryName}
                        </Text>
                        <Text style={[styles.meta, { color: colors.textSoft }]}>
                          Updated {formatDateTime(order.updatedAt)}
                        </Text>
                      </View>

                      {isRejectedPending && order.lastRejectedAt ? (
                        <Text style={[styles.rejectedText, { color: colors.danger }]}>
                          Rejected on {formatDateTime(order.lastRejectedAt)}
                        </Text>
                      ) : null}
                    </Surface>
                  </Pressable>
                );
              })
            )}

            <View style={[styles.paginationFooter, compact && styles.paginationFooterCompact]}>
              <PickerField
                containerStyle={styles.pageSizePicker}
                size="compact"
                selectedValue={String(pageSize)}
                options={pageSizeOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              />
              <View style={styles.pagination}>
                <Pressable
                  disabled={!pageData.hasPreviousPage}
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                  style={({ pressed }) => [
                    styles.pageButton,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      opacity: !pageData.hasPreviousPage ? 0.45 : pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.pageButtonLabel, { color: colors.text }]}>Prev</Text>
                </Pressable>
                <Text style={[styles.page, { color: colors.text }]}>
                  {pageData.totalPages === 0 ? 0 : page} / {pageData.totalPages}
                </Text>
                <Pressable
                  disabled={!pageData.hasNextPage}
                  onPress={() => setPage((current) => current + 1)}
                  style={({ pressed }) => [
                    styles.pageButton,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      opacity: !pageData.hasNextPage ? 0.45 : pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.pageButtonLabel, { color: colors.text }]}>Next</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {activeOrder ? (
        <StatusActionModal
          currentStatus={status}
          onClose={() => setActiveOrder(null)}
          onSubmitted={async () => {
            await resource.reload("refresh");
          }}
          order={activeOrder}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  hero: {
    gap: 8,
    paddingTop: 4,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroCopy: {
    fontSize: 14,
    lineHeight: 22,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  categoryChip: {
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  summary: {
    fontSize: 13,
    fontWeight: "700",
  },
  card: {
    gap: 12,
  },
  cardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  copy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  serviceName: {
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  companyName: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaBlock: {
    gap: 4,
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
  },
  rejectedText: {
    fontSize: 13,
    fontWeight: "800",
  },
  paginationFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  paginationFooterCompact: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  pageSizePicker: {
    width: 84,
  },
  pagination: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  pageButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 78,
    paddingHorizontal: 14,
  },
  pageButtonLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  page: {
    fontSize: 13,
    fontWeight: "800",
    minWidth: 66,
    textAlign: "center",
  },
});
