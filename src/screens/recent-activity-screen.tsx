import { useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { RECENT_ACTIVITIES_QUERY } from "@/api/documents";
import type { RecentActivityCounts, RecentActivityItem, RecentActivityType } from "@/api/types";
import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Screen } from "@/components/common/screen";
import { SearchField } from "@/components/common/search-field";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Surface } from "@/components/common/surface";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import {
  formatActivityTypeLabel,
  formatDateTime,
  formatRelativeTime,
} from "@/utils/format";
import { useAsyncResource } from "@/utils/use-async-resource";

const activityOptions = [
  { label: "All", value: "ALL" },
  { label: "Orders", value: "ORDER" },
  { label: "Docs", value: "DOCUMENT" },
  { label: "Company", value: "COMPANY" },
] as const;

type RecentActivityResponse = {
  recentActivities: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalCount: number;
    totalPages: number;
    items: RecentActivityItem[];
    counts: RecentActivityCounts;
  };
};

function getCountForActivityOption(
  counts: RecentActivityCounts | undefined,
  value: RecentActivityType | "ALL",
) {
  if (!counts) {
    return undefined;
  }

  if (value === "ALL") {
    return counts.all;
  }

  if (value === "DOCUMENT") {
    return counts.documents;
  }

  if (value === "ORDER") {
    return counts.orders;
  }

  return counts.company;
}

function getActivityBadgeTone(item: RecentActivityItem) {
  const normalizedBadge = item.badgeLabel?.trim().toLowerCase() ?? "";
  const normalizedChips = item.chips.map((chip) => chip.trim().toLowerCase());

  if (item.activityType === "DOCUMENT") {
    return normalizedBadge === "received" ? "completed" : "pending";
  }

  if (item.activityType === "ORDER") {
    return "processing";
  }

  if (item.activityType === "COMPANY") {
    return "accent";
  }

  if (normalizedChips.includes("completed") || normalizedChips.includes("paid")) {
    return "completed";
  }

  if (normalizedChips.includes("processing")) {
    return "processing";
  }

  return "accent";
}

function buildEmptyStateDescription(type: RecentActivityType | "ALL") {
  if (type === "DOCUMENT") {
    return "এই ফিল্টারে এখন কোনো document activity নেই।";
  }

  if (type === "ORDER") {
    return "এই ফিল্টারে এখন কোনো order activity নেই।";
  }

  if (type === "COMPANY") {
    return "এই ফিল্টারে এখন কোনো company activity নেই।";
  }

  return "অন্য filter try করো বা search clear করে আবার দেখো।";
}

export function RecentActivityScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { executeAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [type, setType] = useState<RecentActivityType | "ALL">("ALL");
  const compact = width < 390;

  const resource = useAsyncResource(
    () =>
      executeAuthenticated<
        RecentActivityResponse,
        { input: { page: number; pageSize: number; search?: string; activityType?: RecentActivityType } }
      >(RECENT_ACTIVITIES_QUERY, {
        input: {
          page,
          pageSize: 20,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(type !== "ALL" ? { activityType: type } : {}),
        },
      }),
    [executeAuthenticated, page, search, type],
  );

  const pageData = resource.data?.recentActivities;
  const countSummary = pageData?.counts;
  const segmentedOptions = useMemo(
    () =>
      activityOptions.map((option) => ({
        ...option,
        meta:
          getCountForActivityOption(countSummary, option.value)?.toString() ?? undefined,
      })),
    [countSummary],
  );
  const activeFilterLabel = formatActivityTypeLabel(type);

  return (
    <Screen
      onRefresh={() => {
        void resource.reload("refresh");
      }}
      refreshing={resource.refreshing}
    >
      <View style={styles.stack}>
        <SearchField
          placeholder="Search company, order, or activity"
          returnKeyType="search"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <SegmentedControl
          options={segmentedOptions}
          value={type}
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
        />

        {resource.loading && !pageData ? (
          <LoadingState label="Loading recent activity..." />
        ) : null}
        {resource.error && !pageData ? (
          <EmptyState title="Could not load activity" description={resource.error} />
        ) : null}

        {pageData ? (
          <View style={styles.stack}>
            <Text style={[styles.summary, { color: colors.textSoft }]}>
              {pageData.totalCount} activities found
            </Text>
            {countSummary ? (
              <Text style={[styles.summaryMeta, { color: colors.textDim }]}>
                {activeFilterLabel} feed | All {countSummary.all} | Docs {countSummary.documents} | Orders{" "}
                {countSummary.orders} | Company {countSummary.company}
              </Text>
            ) : null}
            {pageData.items.length === 0 ? (
              <EmptyState
                title="No recent activity"
                description={buildEmptyStateDescription(type)}
              />
            ) : (
              pageData.items.map((item) => (
                <Surface key={item.id} style={styles.card}>
                  <View style={[styles.rowBetween, compact && styles.rowStack]}>
                    <Badge
                      label={item.badgeLabel?.trim() || formatActivityTypeLabel(item.activityType)}
                      tone={getActivityBadgeTone(item)}
                      size="compact"
                    />
                    <Text style={[styles.meta, { color: colors.textSoft }]}>
                      {formatRelativeTime(item.occurredAt)}
                    </Text>
                  </View>
                  <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.description, { color: colors.textDim }]}>
                    {item.description}
                  </Text>
                  {item.chips.length ? (
                    <View style={styles.chipsRow}>
                      {item.chips.map((chip, index) => (
                        <Badge key={`${item.id}-${chip}-${index}`} label={chip} tone="neutral" size="compact" />
                      ))}
                    </View>
                  ) : null}
                  <View style={[styles.rowBetween, compact && styles.rowStack]}>
                    <Text style={[styles.meta, { color: colors.textSoft }]}>
                      Company: {item.companyName}
                      {item.orderNumber ? ` | ${item.orderNumber}` : ""}
                    </Text>
                    {item.actorName?.trim() ? (
                      <Text style={[styles.meta, { color: colors.textSoft }]}>
                        By: {item.actorName.trim()}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.rowBetween, compact && styles.rowStack]}>
                    <Badge label={item.laneLabel} tone="neutral" size="compact" />
                    <Text style={[styles.meta, { color: colors.textSoft }]}>
                      {formatDateTime(item.occurredAt)}
                    </Text>
                  </View>
                </Surface>
              ))
            )}
            <View style={[styles.pagination, compact && styles.paginationCompact]}>
              <Button
                disabled={!pageData.hasPreviousPage}
                label="Prev"
                tone="secondary"
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                style={compact ? styles.paginationButton : undefined}
              />
              <Text style={[styles.page, compact && styles.pageCompact, { color: colors.text }]}>
                {pageData.totalPages === 0 ? 0 : page} / {pageData.totalPages}
              </Text>
              <Button
                disabled={!pageData.hasNextPage}
                label="Next"
                tone="secondary"
                onPress={() => setPage((current) => current + 1)}
                style={compact ? styles.paginationButton : undefined}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
    marginTop: 8,
  },
  summary: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryMeta: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    gap: 12,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  rowStack: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  pagination: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  paginationCompact: {
    justifyContent: "space-between",
  },
  paginationButton: {
    flexGrow: 1,
    minWidth: 112,
  },
  page: {
    fontSize: 14,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "center",
  },
  pageCompact: {
    minWidth: 64,
    width: "100%",
  },
});
