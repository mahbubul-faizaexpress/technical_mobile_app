import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  OVERVIEW_ORDERS_BY_MONTH_QUERY,
  OVERVIEW_PACKAGE_DISTRIBUTION_QUERY,
  OVERVIEW_STATS_QUERY,
  RECENT_ACTIVITIES_QUERY,
} from "@/api/documents";
import type {
  MonthlyOrderPoint,
  OverviewRange,
  OverviewStats,
  PackageDistributionPoint,
  RecentActivityItem,
} from "@/api/types";
import type { MainTabScreenProps } from "@/navigation/types";
import { DonutChart, DONUT_CHART_COLORS } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Badge } from "@/components/common/badge";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Screen } from "@/components/common/screen";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Surface } from "@/components/common/surface";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import { formatCurrency, formatDateTime, formatRelativeTime } from "@/utils/format";
import { useAsyncResource } from "@/utils/use-async-resource";

const rangeOptions = [
  { label: "Today", value: "TODAY" },
  { label: "Yesterday", value: "YESTERDAY" },
  { label: "7 Days", value: "LAST_7_DAYS" },
  { label: "This Month", value: "THIS_MONTH" },
  { label: "Last Month", value: "LAST_MONTH" },
] as const;

type OverviewBundle = {
  activities: RecentActivityItem[];
  monthlyPoints: MonthlyOrderPoint[];
  packageDistribution: PackageDistributionPoint[];
  stats: OverviewStats;
  totalPackageOrders: number;
};

function getRangeReference(range: OverviewRange) {
  const today = new Date();

  if (range === "YESTERDAY") {
    today.setDate(today.getDate() - 1);
  } else if (range === "LAST_MONTH") {
    today.setMonth(today.getMonth() - 1);
  }

  return today;
}

function getActivityTone(title: string) {
  const normalized = title.trim().toLowerCase();

  if (normalized.includes("completed")) {
    return "completed" as const;
  }

  if (normalized.includes("processing")) {
    return "processing" as const;
  }

  if (normalized.includes("pending")) {
    return "pending" as const;
  }

  return "accent" as const;
}

export function OverviewScreen({ navigation }: MainTabScreenProps<"Overview">) {
  const { colors } = useAppTheme();
  const { executeAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<OverviewRange>("THIS_MONTH");
  const referenceDate = useMemo(() => getRangeReference(range), [range]);
  const isWide = width >= 780;
  const statWidth = isWide ? "31.6%" : "48.2%";

  const resource = useAsyncResource<OverviewBundle>(
    async () => {
      const year = referenceDate.getFullYear();
      const month = referenceDate.getMonth() + 1;

      const [statsResponse, monthlyResponse, distributionResponse, activityResponse] =
        await Promise.all([
          executeAuthenticated<
            { technicalOverviewStats: OverviewStats },
            { input: { range: OverviewRange } }
          >(OVERVIEW_STATS_QUERY, { input: { range } }),
          executeAuthenticated<
            { overviewOrdersByMonth: { items: MonthlyOrderPoint[] } },
            { input: { year: number; month?: number } }
          >(OVERVIEW_ORDERS_BY_MONTH_QUERY, { input: { year, month } }),
          executeAuthenticated<
            {
              overviewPackageDistribution: {
                totalOrders: number;
                items: PackageDistributionPoint[];
              };
            },
            { input: { year: number; month?: number } }
          >(OVERVIEW_PACKAGE_DISTRIBUTION_QUERY, { input: { year, month } }),
          executeAuthenticated<
            { recentActivities: { items: RecentActivityItem[] } },
            { input: { page: number; pageSize: number } }
          >(RECENT_ACTIVITIES_QUERY, {
            input: {
              page: 1,
              pageSize: 5,
            },
          }),
        ]);

      return {
        activities: activityResponse.recentActivities.items,
        monthlyPoints: monthlyResponse.overviewOrdersByMonth.items,
        packageDistribution: distributionResponse.overviewPackageDistribution.items,
        stats: statsResponse.technicalOverviewStats,
        totalPackageOrders: distributionResponse.overviewPackageDistribution.totalOrders,
      };
    },
    [executeAuthenticated, range, referenceDate.getFullYear(), referenceDate.getMonth()],
  );
  const overviewData = resource.data;

  const statCards = useMemo(() => {
    if (!overviewData) {
      return [];
    }

    return [
      { label: "Companies", tone: "accent" as const, value: overviewData.stats.totalCompanies },
      { label: "Pending", tone: "pending" as const, value: overviewData.stats.pendingOrders },
      {
        label: "Processing",
        tone: "processing" as const,
        value: overviewData.stats.processingOrders,
      },
      {
        label: "Completed",
        tone: "completed" as const,
        value: overviewData.stats.completedOrders,
      },
      {
        label: "Packages Amount",
        tone: "accent" as const,
        value: formatCurrency(overviewData.stats.totalPayments),
      },
      {
        label: "Paid Amount",
        tone: "accent" as const,
        value: formatCurrency(overviewData.stats.totalPartialPayment),
      },
      {
        label: "Due",
        tone: "pending" as const,
        value: formatCurrency(overviewData.stats.totalDue),
      },
    ];
  }, [overviewData]);

  return (
    <Screen onRefresh={() => void resource.reload("refresh")} refreshing={resource.refreshing}>
      <View style={styles.stack}>
        <View style={styles.hero}>
          <Text style={[styles.heroEyebrow, { color: colors.accent }]}>Operations</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Technical overview</Text>
          <Text style={[styles.heroCopy, { color: colors.textSoft }]}>
            Orders, payments, package movement, and recent workflow activity in one mobile view.
          </Text>
        </View>

        <SegmentedControl
          options={rangeOptions}
          value={range}
          onChange={(value) => setRange(value as OverviewRange)}
        />

        {resource.loading && !resource.data ? <LoadingState label="Loading overview..." /> : null}
        {resource.error && !resource.data ? (
          <EmptyState title="Could not load overview" description={resource.error} />
        ) : null}

        {overviewData ? (
          <View style={styles.stack}>
            <View style={styles.statGrid}>
              {statCards.map((card) => (
                <Surface
                  key={card.label}
                  muted
                  style={[
                    styles.statCard,
                    {
                      width: statWidth,
                    },
                  ]}
                >
                  <Text style={[styles.statLabel, { color: colors.textSoft }]}>{card.label}</Text>
                  <View style={styles.statFooter}>
                    <Text style={[styles.statValue, { color: colors.text }]}>{card.value}</Text>
                    <Badge label={card.label} size="compact" tone={card.tone} />
                  </View>
                </Surface>
              ))}
            </View>

            <Surface style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>Orders by month</Text>
                  <Text style={[styles.panelCopy, { color: colors.textSoft }]}>
                    {referenceDate.toLocaleString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </View>
              <BarChart
                barColor={colors.accent}
                data={overviewData.monthlyPoints}
                height={126}
                labelColor={colors.textSoft}
                radius={8}
              />
            </Surface>

            <Surface style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>
                    Package distribution
                  </Text>
                  <Text style={[styles.panelCopy, { color: colors.textSoft }]}>
                    {overviewData.totalPackageOrders} total orders
                  </Text>
                </View>
              </View>

              <View style={styles.distributionLayout}>
                <DonutChart
                  data={overviewData.packageDistribution}
                  labelColor={colors.textSoft}
                  size={112}
                  total={overviewData.totalPackageOrders}
                  totalColor={colors.text}
                  trackColor={colors.border}
                />
                <View style={styles.distributionLegend}>
                  {overviewData.packageDistribution.map((item, index) => (
                    <View key={item.label} style={styles.legendRow}>
                      <View style={styles.legendCopy}>
                        <View
                          style={[
                            styles.legendDot,
                            {
                              backgroundColor:
                                DONUT_CHART_COLORS[index % DONUT_CHART_COLORS.length],
                            },
                          ]}
                        />
                        <Text numberOfLines={1} style={[styles.legendLabel, { color: colors.text }]}>
                          {item.label}
                        </Text>
                      </View>
                      <Text style={[styles.legendCount, { color: colors.textSoft }]}>
                        {item.count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Surface>

            <Surface style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>Recent activity</Text>
                  <Text style={[styles.panelCopy, { color: colors.textSoft }]}>
                    Latest operational updates
                  </Text>
                </View>
                <Pressable
                  onPress={() => navigation.navigate("Activity")}
                  style={({ pressed }) => [styles.feedButton, pressed ? styles.feedButtonPressed : null]}
                >
                  <Text style={[styles.feedButtonLabel, { color: colors.text }]}>Open feed</Text>
                </Pressable>
              </View>

              <View style={styles.activityStack}>
                {overviewData.activities.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.activityRow,
                      {
                        borderBottomColor:
                          index === overviewData.activities.length - 1 ? "transparent" : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.activityTop}>
                      <Text style={[styles.activityTitle, { color: colors.text }]}>{item.title}</Text>
                      <Badge label={item.laneLabel} size="compact" tone={getActivityTone(item.laneLabel)} />
                    </View>
                    <Text style={[styles.activityDescription, { color: colors.textDim }]}>
                      {item.description}
                    </Text>
                    <Text style={[styles.activityMeta, { color: colors.textSoft }]}>
                      {item.companyName}
                    </Text>
                    <Text style={[styles.activityMeta, { color: colors.textSoft }]}>
                      {formatRelativeTime(item.occurredAt)} · {formatDateTime(item.occurredAt)}
                    </Text>
                  </View>
                ))}
              </View>
            </Surface>
          </View>
        ) : null}
      </View>
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
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  statCard: {
    gap: 10,
    minHeight: 108,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statFooter: {
    flex: 1,
    gap: 10,
    justifyContent: "space-between",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  panel: {
    gap: 16,
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  panelHeaderCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  panelCopy: {
    fontSize: 13,
    lineHeight: 19,
  },
  distributionLayout: {
    gap: 16,
  },
  distributionLegend: {
    gap: 10,
  },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  legendCopy: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  legendDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  legendCount: {
    fontSize: 12,
    fontWeight: "700",
  },
  feedButton: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedButtonPressed: {
    opacity: 0.76,
  },
  feedButtonLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  activityStack: {
    gap: 0,
  },
  activityRow: {
    borderBottomWidth: 1,
    gap: 6,
    paddingVertical: 12,
  },
  activityTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  activityTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  activityDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  activityMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
});
