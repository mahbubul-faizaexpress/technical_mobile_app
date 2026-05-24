import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  TECHNICAL_REFUND_REQUEST_QUERY,
  TECHNICAL_REFUND_REQUESTS_QUERY,
  UPDATE_REFUND_REQUEST_MUTATION,
} from "@/api/documents";
import type { RefundRequest, RefundRequestStatus } from "@/api/types";
import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { EmptyState } from "@/components/common/empty-state";
import { IconButton } from "@/components/common/icon-button";
import { LoadingState } from "@/components/common/loading-state";
import { PickerField } from "@/components/common/picker-field";
import { Screen } from "@/components/common/screen";
import { SearchField } from "@/components/common/search-field";
import { Surface } from "@/components/common/surface";
import { TextField } from "@/components/common/text-field";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import {
  formatCurrency,
  formatDateTime,
  formatEnumLabel,
  parseMoney,
} from "@/utils/format";
import { useAsyncResource } from "@/utils/use-async-resource";

const PAGE_SIZE = 20;

const statusOptions = [
  { label: "All statuses", value: "ALL" },
  { label: "Requested", value: "REQUESTED" },
  { label: "Under Review", value: "UNDER_REVIEW" },
  { label: "Approved", value: "APPROVED" },
  { label: "Partially Refunded", value: "PARTIALLY_REFUNDED" },
  { label: "Refunded", value: "REFUNDED" },
  { label: "Rejected", value: "REJECTED" },
] as const;

const reviewStatusOptions = statusOptions.filter((option) => option.value !== "ALL");

type RefundRequestsResponse = {
  technicalRefundRequestsPage: {
    items: RefundRequest[];
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalPages: number;
    totalCount: number;
  };
};

type RefundRequestDetailResponse = {
  technicalRefundRequest: RefundRequest;
};

function getRefundTone(status: RefundRequestStatus) {
  if (status === "REFUNDED") {
    return "completed" as const;
  }

  if (status === "PARTIALLY_REFUNDED") {
    return "pending" as const;
  }

  if (status === "UNDER_REVIEW") {
    return "processing" as const;
  }

  if (status === "APPROVED" || status === "REQUESTED") {
    return "accent" as const;
  }

  return "neutral" as const;
}

function buildCustomerName(refund: RefundRequest) {
  const firstName = refund.userInfo?.firstName?.trim() ?? "";
  const lastName = refund.userInfo?.lastName?.trim() ?? "";
  return [firstName, lastName].filter(Boolean).join(" ") || "Unknown customer";
}

function getRemainingAmount(refund: RefundRequest) {
  const fallback =
    parseMoney(refund.requestedAmount) -
    Math.max(parseMoney(refund.refundedAmount), parseMoney(refund.approvedAmount));

  return refund.remainingPaidAmountLabel
    ? formatCurrency(refund.remainingPaidAmountLabel, refund.currency)
    : formatCurrency(Math.max(fallback, 0), refund.currency);
}

export function RefundScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { executeAuthenticated } = useAuth();
  const compact = width < 390;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RefundRequestStatus | "ALL">("ALL");
  const [selectedRefundId, setSelectedRefundId] = useState<number | null>(null);
  const [editingRefundId, setEditingRefundId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<RefundRequestStatus>("REQUESTED");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [refundedAmount, setRefundedAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const listResource = useAsyncResource(
    () =>
      executeAuthenticated<
        RefundRequestsResponse,
        {
          input: {
            page: number;
            pageSize: number;
            search?: string;
            status?: RefundRequestStatus;
          };
        }
      >(TECHNICAL_REFUND_REQUESTS_QUERY, {
        input: {
          page,
          pageSize: PAGE_SIZE,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(status !== "ALL" ? { status } : {}),
        },
      }),
    [executeAuthenticated, page, search, status],
  );

  const detailsResource = useAsyncResource<RefundRequest | null>(
    async () => {
      if (!selectedRefundId) {
        return null;
      }

      const response = await executeAuthenticated<
        RefundRequestDetailResponse,
        { refundRequestId: number }
      >(TECHNICAL_REFUND_REQUEST_QUERY, {
        refundRequestId: selectedRefundId,
      });

      return response.technicalRefundRequest;
    },
    [executeAuthenticated, selectedRefundId],
  );

  const reviewResource = useAsyncResource<RefundRequest | null>(
    async () => {
      if (!editingRefundId) {
        return null;
      }

      const response = await executeAuthenticated<
        RefundRequestDetailResponse,
        { refundRequestId: number }
      >(TECHNICAL_REFUND_REQUEST_QUERY, {
        refundRequestId: editingRefundId,
      });

      return response.technicalRefundRequest;
    },
    [executeAuthenticated, editingRefundId],
  );

  const pageData = listResource.data?.technicalRefundRequestsPage;
  const selectedRefund = detailsResource.data;
  const reviewRefund = reviewResource.data;

  useEffect(() => {
    if (!reviewRefund) {
      return;
    }

    setReviewStatus(reviewRefund.status);
    setApprovedAmount(reviewRefund.approvedAmount ?? "");
    setRefundedAmount(reviewRefund.refundedAmount ?? "");
    setAdminNote(reviewRefund.adminNote ?? "");
  }, [reviewRefund]);

  const handleUpdateRefund = async () => {
    if (!editingRefundId) {
      return;
    }

    const approved = approvedAmount.trim();
    const refunded = refundedAmount.trim();
    const approvedValue = approved ? Number.parseFloat(approved) : undefined;
    const refundedValue = refunded ? Number.parseFloat(refunded) : undefined;

    if (approved && !Number.isFinite(approvedValue)) {
      Alert.alert("Invalid amount", "Approved amount must be a valid number.");
      return;
    }

    if (refunded && !Number.isFinite(refundedValue)) {
      Alert.alert("Invalid amount", "Refunded amount must be a valid number.");
      return;
    }

    if ((approvedValue ?? 0) < 0 || (refundedValue ?? 0) < 0) {
      Alert.alert("Invalid amount", "Amounts cannot be negative.");
      return;
    }

    try {
      setSubmitting(true);

      await executeAuthenticated<
        { updateRefundRequest: { id: number } },
        {
          refundRequestId: number;
          input: {
            status: RefundRequestStatus;
            approvedAmount?: number;
            refundedAmount?: number;
            adminNote?: string;
          };
        }
      >(UPDATE_REFUND_REQUEST_MUTATION, {
        refundRequestId: editingRefundId,
        input: {
          status: reviewStatus,
          ...(approved ? { approvedAmount: approvedValue } : {}),
          ...(refunded ? { refundedAmount: refundedValue } : {}),
          ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
        },
      });

      await Promise.all([
        listResource.reload("refresh"),
        reviewResource.reload("refresh"),
        selectedRefundId === editingRefundId ? detailsResource.reload("refresh") : Promise.resolve(),
      ]);

      setEditingRefundId(null);
      Alert.alert("Refund updated", "Refund review has been saved successfully.");
    } catch (error) {
      Alert.alert(
        "Update failed",
        error instanceof Error ? error.message : "Could not update this refund request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      onRefresh={() => {
        void listResource.reload("refresh");
      }}
      refreshing={listResource.refreshing}
    >
      <View style={styles.stack}>
        <SearchField
          placeholder="Search refund, order, payment, or customer"
          returnKeyType="search"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <PickerField
          label="Refund status"
          selectedValue={status}
          options={statusOptions}
          onValueChange={(value) => {
            setStatus(value as RefundRequestStatus | "ALL");
            setPage(1);
          }}
        />

        {listResource.loading && !pageData ? <LoadingState label="Loading refunds..." /> : null}
        {listResource.error && !pageData ? (
          <EmptyState title="Could not load refunds" description={listResource.error} />
        ) : null}

        {pageData ? (
          <View style={styles.stack}>
            <Text style={[styles.summary, { color: colors.textSoft }]}>
              {pageData.totalCount} refund requests found
            </Text>

            {pageData.items.length === 0 ? (
              <EmptyState
                title="No refund requests"
                description="Try another search or choose a different status filter."
              />
            ) : (
              pageData.items.map((refund) => (
                <Surface key={refund.id} style={styles.card}>
                  <View style={[styles.rowBetween, compact && styles.rowStack]}>
                    <View style={styles.copy}>
                      <Text style={[styles.refundId, { color: colors.text }]}>
                        Refund #{refund.id}
                      </Text>
                      <Text style={[styles.meta, { color: colors.textSoft }]}>
                        Order #{refund.orderId}
                        {refund.paymentId ? ` | Payment #${refund.paymentId}` : ""}
                      </Text>
                    </View>
                    <Badge
                      label={formatEnumLabel(refund.status)}
                      tone={getRefundTone(refund.status)}
                    />
                  </View>

                  <View style={[styles.infoGrid, compact && styles.infoGridStack]}>
                    <View style={styles.infoCell}>
                      <Text style={[styles.label, { color: colors.textSoft }]}>Customer</Text>
                      <Text style={[styles.value, { color: colors.text }]}>
                        {buildCustomerName(refund)}
                      </Text>
                      <Text style={[styles.subtle, { color: colors.textDim }]}>
                        {refund.userInfo?.email ?? "-"}
                      </Text>
                    </View>

                    <View style={styles.infoCell}>
                      <Text style={[styles.label, { color: colors.textSoft }]}>Amounts</Text>
                      <Text style={[styles.value, { color: colors.text }]}>
                        Requested: {formatCurrency(refund.requestedAmount, refund.currency)}
                      </Text>
                      <Text style={[styles.subtle, { color: colors.textDim }]}>
                        Approved: {formatCurrency(refund.approvedAmount, refund.currency)}
                      </Text>
                      <Text style={[styles.subtle, { color: colors.textDim }]}>
                        Refunded: {formatCurrency(refund.refundedAmount, refund.currency)}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.reason, { color: colors.textDim }]}>{refund.reason}</Text>

                  <View style={styles.detailBlock}>
                    <Text style={[styles.subtle, { color: colors.textDim }]}>
                      Company: {refund.orderInfo?.companyInfo?.name ?? "-"}
                    </Text>
                    <Text style={[styles.subtle, { color: colors.textDim }]}>
                      Created: {formatDateTime(refund.createdAt)}
                    </Text>
                    <Text style={[styles.subtle, { color: colors.textDim }]}>
                      Reviewed: {refund.reviewedAt ? formatDateTime(refund.reviewedAt) : "-"}
                    </Text>
                  </View>

                  <View style={styles.actions}>
                    <Button
                      label="View"
                      tone="secondary"
                      onPress={() => setSelectedRefundId(refund.id)}
                      style={styles.actionButton}
                    />
                    <Button
                      label="Review"
                      onPress={() => setEditingRefundId(refund.id)}
                      style={styles.actionButton}
                    />
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

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(selectedRefundId)}
        onRequestClose={() => setSelectedRefundId(null)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.flexCopy}>
                <Text style={[styles.modalEyebrow, { color: colors.accent }]}>Refund</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {selectedRefund ? `Refund #${selectedRefund.id}` : "Refund details"}
                </Text>
              </View>
              <IconButton onPress={() => setSelectedRefundId(null)}>
                <Ionicons color={colors.text} name="close" size={18} />
              </IconButton>
            </View>

            {detailsResource.loading && !selectedRefund ? (
              <LoadingState label="Loading refund details..." />
            ) : detailsResource.error && !selectedRefund ? (
              <EmptyState title="Could not load refund" description={detailsResource.error} />
            ) : selectedRefund ? (
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={[styles.breakdown, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
                  <Text style={[styles.breakdownLine, { color: colors.text }]}>
                    Requested: {formatCurrency(selectedRefund.requestedAmount, selectedRefund.currency)}
                  </Text>
                  <Text style={[styles.breakdownLine, { color: colors.text }]}>
                    Approved: {formatCurrency(selectedRefund.approvedAmount, selectedRefund.currency)}
                  </Text>
                  <Text style={[styles.breakdownLine, { color: colors.text }]}>
                    Refunded: {formatCurrency(selectedRefund.refundedAmount, selectedRefund.currency)}
                  </Text>
                  <Text style={[styles.breakdownLine, { color: colors.danger }]}>
                    Remaining: {getRemainingAmount(selectedRefund)}
                  </Text>
                </View>

                <Surface muted style={styles.detailSurface}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Customer</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {buildCustomerName(selectedRefund)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Email</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedRefund.userInfo?.email ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Phone</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedRefund.userInfo?.phone ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Company</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedRefund.orderInfo?.companyInfo?.name ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Order status</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedRefund.orderInfo?.status ? formatEnumLabel(selectedRefund.orderInfo.status) : "-"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Transaction</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedRefund.paymentInfo?.transactionId ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textSoft }]}>Payment method</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedRefund.paymentInfo?.paymentMethod
                        ? formatEnumLabel(selectedRefund.paymentInfo.paymentMethod)
                        : "-"}
                    </Text>
                  </View>
                </Surface>

                <View style={styles.copyBlock}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Reason</Text>
                  <Text style={[styles.sectionCopy, { color: colors.textDim }]}>
                    {selectedRefund.reason}
                  </Text>
                </View>

                {selectedRefund.details?.trim() ? (
                  <View style={styles.copyBlock}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>
                    <Text style={[styles.sectionCopy, { color: colors.textDim }]}>
                      {selectedRefund.details.trim()}
                    </Text>
                  </View>
                ) : null}

                {selectedRefund.adminNote?.trim() ? (
                  <View style={styles.copyBlock}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Admin note</Text>
                    <Text style={[styles.sectionCopy, { color: colors.textDim }]}>
                      {selectedRefund.adminNote.trim()}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.copyBlock}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Timeline</Text>
                  <Text style={[styles.sectionCopy, { color: colors.textDim }]}>
                    Created: {formatDateTime(selectedRefund.createdAt)}
                  </Text>
                  <Text style={[styles.sectionCopy, { color: colors.textDim }]}>
                    Reviewed: {selectedRefund.reviewedAt ? formatDateTime(selectedRefund.reviewedAt) : "-"}
                  </Text>
                  <Text style={[styles.sectionCopy, { color: colors.textDim }]}>
                    Refunded: {selectedRefund.refundedAt ? formatDateTime(selectedRefund.refundedAt) : "-"}
                  </Text>
                </View>
              </ScrollView>
            ) : null}
          </Surface>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(editingRefundId)}
        onRequestClose={() => {
          if (submitting) {
            return;
          }
          setEditingRefundId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.flexCopy}>
                <Text style={[styles.modalEyebrow, { color: colors.accent }]}>Refund</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {reviewRefund ? `Review #${reviewRefund.id}` : "Review refund"}
                </Text>
              </View>
              <IconButton disabled={submitting} onPress={() => setEditingRefundId(null)}>
                <Ionicons color={colors.text} name="close" size={18} />
              </IconButton>
            </View>

            {reviewResource.loading && !reviewRefund ? (
              <LoadingState label="Loading refund review..." />
            ) : reviewResource.error && !reviewRefund ? (
              <EmptyState title="Could not load refund" description={reviewResource.error} />
            ) : reviewRefund ? (
              <>
                <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                  <View style={[styles.breakdown, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
                    <Text style={[styles.breakdownLine, { color: colors.text }]}>
                      Requested: {formatCurrency(reviewRefund.requestedAmount, reviewRefund.currency)}
                    </Text>
                    <Text style={[styles.breakdownLine, { color: colors.text }]}>
                      Original paid: {formatCurrency(reviewRefund.originalPaidAmountLabel, reviewRefund.currency)}
                    </Text>
                    <Text style={[styles.breakdownLine, { color: colors.danger }]}>
                      Remaining paid: {getRemainingAmount(reviewRefund)}
                    </Text>
                  </View>

                  <PickerField
                    label="Status"
                    selectedValue={reviewStatus}
                    options={reviewStatusOptions}
                    onValueChange={(value) => setReviewStatus(value as RefundRequestStatus)}
                  />

                  <View style={[styles.formGrid, compact && styles.formGridStack]}>
                    <TextField
                      containerStyle={styles.formField}
                      keyboardType="decimal-pad"
                      label="Approved amount"
                      placeholder="0.00"
                      value={approvedAmount}
                      onChangeText={setApprovedAmount}
                    />
                    <TextField
                      containerStyle={styles.formField}
                      keyboardType="decimal-pad"
                      label="Refunded amount"
                      placeholder="0.00"
                      value={refundedAmount}
                      onChangeText={setRefundedAmount}
                    />
                  </View>

                  <TextField
                    label="Admin note"
                    multiline
                    numberOfLines={5}
                    placeholder="Add review notes or refund handling details"
                    style={styles.textArea}
                    textAlignVertical="top"
                    value={adminNote}
                    onChangeText={setAdminNote}
                  />
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Button
                    label="Cancel"
                    tone="ghost"
                    disabled={submitting}
                    onPress={() => setEditingRefundId(null)}
                    style={styles.modalButton}
                  />
                  <Button
                    label="Update refund"
                    loading={submitting}
                    onPress={() => void handleUpdateRefund()}
                    style={styles.modalButton}
                  />
                </View>
              </>
            ) : null}
          </Surface>
        </View>
      </Modal>
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
  card: {
    gap: 14,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  rowStack: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  copy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  refundId: {
    fontSize: 18,
    fontWeight: "800",
  },
  meta: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 12,
  },
  infoGridStack: {
    flexDirection: "column",
  },
  infoCell: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 15,
    fontWeight: "700",
  },
  subtle: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  reason: {
    fontSize: 14,
    lineHeight: 20,
  },
  detailBlock: {
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
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
  modalOverlay: {
    backgroundColor: "rgba(2, 8, 23, 0.7)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  modalSheet: {
    gap: 16,
    maxHeight: "84%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  flexCopy: {
    flex: 1,
    gap: 4,
  },
  modalEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  modalContent: {
    gap: 14,
  },
  breakdown: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  breakdownLine: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  detailSurface: {
    gap: 12,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  detailKey: {
    flex: 0.9,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
  },
  detailValue: {
    flex: 1.1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "right",
  },
  copyBlock: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  sectionCopy: {
    fontSize: 14,
    lineHeight: 21,
  },
  formGrid: {
    flexDirection: "row",
    gap: 12,
  },
  formGridStack: {
    flexDirection: "column",
  },
  formField: {
    flex: 1,
  },
  textArea: {
    minHeight: 132,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
  },
});
