import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  COMPANY_ACCOUNTS_QUERY,
  COMPANY_PROFILE_DETAILS_QUERY,
  CREATE_TECHNICAL_PAYMENT_MUTATION,
} from "@/api/documents";
import type {
  CompanyAccount,
  CompanyProfileDetails,
  PaymentMethod,
  PaymentStatus,
} from "@/api/types";
import type { RootStackScreenProps } from "@/navigation/types";
import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { EmptyState } from "@/components/common/empty-state";
import { IconButton } from "@/components/common/icon-button";
import { LoadingState } from "@/components/common/loading-state";
import { Screen } from "@/components/common/screen";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Surface } from "@/components/common/surface";
import { TextField } from "@/components/common/text-field";
import { useAppConfig } from "@/providers/app-config-provider";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import { downloadDocument, openDocumentPreview, resolveDocumentFileName } from "@/utils/documents";
import {
  buildManualTransactionId,
  formatCurrency,
  formatDateTime,
  formatDocumentTypeLabel,
  formatEnumLabel,
  formatPaymentMethod,
  formatPaymentStatus,
  normalizeText,
  parseMoney,
} from "@/utils/format";
import { getStatusTone } from "@/utils/orders";
import { useAsyncResource } from "@/utils/use-async-resource";

const tabOptions = [
  { label: "Services", value: "services" },
  { label: "Payment", value: "payments" },
  { label: "Documents", value: "documents" },
  { label: "Profile", value: "profile" },
] as const;

const documentTypeOptions = [
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Received", value: "RECEIVED" },
] as const;

type DetailTab = (typeof tabOptions)[number]["value"];
type DocumentTab = (typeof documentTypeOptions)[number]["value"];
type CompanyAccountsResponse = {
  companyAccounts: {
    items: CompanyAccount[];
  };
};
type CompanyProfileResponse = {
  company: CompanyProfileDetails;
};
type CompanyDetailResource = {
  items: CompanyAccount[];
  profile: CompanyProfileDetails | null;
};

export function CompanyDetailScreen({ route }: RootStackScreenProps<"CompanyDetail">) {
  const { colors } = useAppTheme();
  const { executeAuthenticated } = useAuth();
  const { config } = useAppConfig();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<DetailTab>("services");
  const [documentTab, setDocumentTab] = useState<DocumentTab>("SUBMITTED");
  const [collectingPaymentId, setCollectingPaymentId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const isWide = width >= 780;
  const summaryCardWidth = isWide ? "31.6%" : "48.2%";

  const resource = useAsyncResource<CompanyDetailResource>(
    async () => {
      const accountsResponse = await executeAuthenticated<
        CompanyAccountsResponse,
        { input: { page: number; pageSize: number } }
      >(COMPANY_ACCOUNTS_QUERY, {
        input: {
          page: 1,
          pageSize: 250,
        },
      });

      let profile: CompanyProfileDetails | null = null;

      try {
        const profileResponse = await executeAuthenticated<
          CompanyProfileResponse,
          { companyId: number }
        >(COMPANY_PROFILE_DETAILS_QUERY, {
          companyId: route.params.companyId,
        });

        profile = profileResponse.company;
      } catch {
        profile = null;
      }

      return {
        items: accountsResponse.companyAccounts.items,
        profile,
      };
    },
    [executeAuthenticated, route.params.companyId],
  );

  const company = useMemo(
    () => resource.data?.items.find((item) => item.id === route.params.companyId) ?? null,
    [resource.data?.items, route.params.companyId],
  );
  const companyProfile = resource.data?.profile ?? null;

  const summaryCards = useMemo(() => {
    if (!company) {
      return [];
    }

    const packagesAmount = company.payments.reduce(
      (sum, payment) => sum + parseMoney(payment.totalAmount),
      0,
    );
    const paidAmount = company.payments.reduce(
      (sum, payment) => sum + parseMoney(payment.paidAmount),
      0,
    );
    const dueAmount = company.payments.reduce(
      (sum, payment) => sum + parseMoney(payment.dueAmount),
      0,
    );
    const currency = company.payments.find((payment) => payment.currency)?.currency ?? "USD";

    return [
      { label: "Completed Orders", value: String(company.completedOrdersCount) },
      {
        label: "Pending Orders",
        value: String(company.pendingOrdersCount + company.processingOrdersCount),
      },
      { label: "Packages Amount", value: formatCurrency(packagesAmount, currency) },
      { label: "Paid Amount", value: formatCurrency(paidAmount, currency) },
      { label: "Due", value: formatCurrency(dueAmount, currency), danger: dueAmount > 0 },
    ];
  }, [company]);

  const visibleDocuments = useMemo(
    () => company?.documents.filter((document) => document.documentType === documentTab) ?? [],
    [company?.documents, documentTab],
  );

  const activeCollectPayment = useMemo(
    () => company?.payments.find((payment) => payment.id === collectingPaymentId) ?? null,
    [collectingPaymentId, company?.payments],
  );

  const profileRows = useMemo(
    () => [
      {
        label: "Owner",
        value:
          `${companyProfile?.user?.firstName ?? ""} ${companyProfile?.user?.lastName ?? ""}`.trim() ||
          company?.ownerName ||
          "Not available",
      },
      { label: "Email", value: companyProfile?.user?.email ?? company?.email ?? "Not available" },
      { label: "Phone", value: companyProfile?.user?.phone ?? company?.phone ?? "Not available" },
      { label: "Address", value: companyProfile?.user?.address ?? "Not available" },
      {
        label: "Role",
        value: companyProfile?.user?.role
          ? formatEnumLabel(companyProfile.user.role)
          : "Not available",
      },
      {
        label: "Status",
        value: companyProfile?.user?.status
          ? formatEnumLabel(companyProfile.user.status)
          : "Not available",
      },
      { label: "EIN", value: companyProfile?.companyDetails?.ein ?? "Not available" },
      {
        label: "Notification Email",
        value: companyProfile?.companyDetails?.notificationEmail ?? "Not available",
      },
      {
        label: "EIN Address",
        value: companyProfile?.companyDetails?.address ?? "Not available",
      },
    ],
    [company?.email, company?.ownerName, company?.phone, companyProfile],
  );

  const openCollectModal = (paymentId: string, dueAmount: string) => {
    setCollectingPaymentId(paymentId);
    setCollectAmount(String(parseMoney(dueAmount) || ""));
    setCollectNote("");
  };

  const handleCollectDue = async () => {
    if (!activeCollectPayment?.canCollectDue || !activeCollectPayment.collectDueOrderId) {
      Alert.alert("Unavailable", "This due payment cannot be collected from mobile right now.");
      return;
    }

    const dueAmount = parseMoney(activeCollectPayment.dueAmount);
    const amount = parseMoney(collectAmount);

    if (amount <= 0) {
      Alert.alert("Enter amount", "Enter a valid payment amount.");
      return;
    }

    if (amount > dueAmount) {
      Alert.alert("Amount too high", "Collected amount cannot be more than the current due.");
      return;
    }

    try {
      setSubmittingPayment(true);

      await executeAuthenticated<
        { createTechnicalPayment: { id: number } },
        {
          input: {
            amount: number;
            currency: string;
            note?: string;
            orderId: number;
            paymentMethod: PaymentMethod;
            status: PaymentStatus;
            transactionId: string;
          };
        }
      >(CREATE_TECHNICAL_PAYMENT_MUTATION, {
        input: {
          amount,
          currency: activeCollectPayment.currency,
          ...(normalizeText(collectNote).length ? { note: normalizeText(collectNote) } : {}),
          orderId: activeCollectPayment.collectDueOrderId,
          paymentMethod: "MAIN_BALANCE",
          status: amount >= dueAmount ? "PAID" : "PARTIALLY_PAID",
          transactionId: buildManualTransactionId(activeCollectPayment.collectDueOrderId),
        },
      });

      setCollectingPaymentId(null);
      setCollectAmount("");
      setCollectNote("");
      await resource.reload("refresh");
      Alert.alert("Payment collected", "Due payment has been recorded successfully.");
    } catch (error) {
      Alert.alert(
        "Collection failed",
        error instanceof Error ? error.message : "Could not collect due payment.",
      );
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <Screen onRefresh={() => void resource.reload("refresh")} refreshing={resource.refreshing}>
      {resource.loading && !company ? <LoadingState label="Loading company..." /> : null}
      {resource.error && !company ? (
        <EmptyState title="Could not load company" description={resource.error} />
      ) : null}

      {company ? (
        <View style={styles.stack}>
          <Surface style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroCopy}>
                <Text style={[styles.companyName, { color: colors.text }]}>{company.companyName}</Text>
                <Text style={[styles.owner, { color: colors.textDim }]}>{company.ownerName}</Text>
              </View>
              <Badge label={company.country} tone="accent" />
            </View>

            <Text style={[styles.meta, { color: colors.textSoft }]}>{company.email}</Text>
            <Text style={[styles.meta, { color: colors.textSoft }]}>{company.phone}</Text>

            <View style={styles.summaryGrid}>
              {summaryCards.map((card) => (
                <Surface
                  key={card.label}
                  muted
                  style={[
                    styles.summaryCard,
                    {
                      width: summaryCardWidth,
                    },
                  ]}
                >
                  <Text style={[styles.summaryLabel, { color: colors.textSoft }]}>{card.label}</Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: card.danger ? colors.danger : colors.text },
                    ]}
                  >
                    {card.value}
                  </Text>
                </Surface>
              ))}
            </View>

            <Text style={[styles.meta, { color: colors.textSoft }]}>
              Created {formatDateTime(company.createdAt)}
            </Text>
          </Surface>

          <SegmentedControl options={tabOptions} value={tab} onChange={(value) => setTab(value as DetailTab)} />

          {tab === "services" ? (
            company.services.length ? (
              company.services.map((service) => (
                <Surface key={service.id} style={styles.listCard}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flexCopy}>
                      <Text style={[styles.value, { color: colors.text }]}>{service.serviceName}</Text>
                      <Text style={[styles.meta, { color: colors.textSoft }]}>
                        Submitted {formatDateTime(service.submitDate)}
                      </Text>
                    </View>
                    <Badge label={formatEnumLabel(service.status)} tone={getStatusTone(service.status)} />
                  </View>
                </Surface>
              ))
            ) : (
              <EmptyState
                title="No active services"
                description="This company does not have any tracked services yet."
              />
            )
          ) : null}

          {tab === "payments" ? (
            company.payments.length ? (
              company.payments.map((payment) => {
                const dueAmount = parseMoney(payment.dueAmount);

                return (
                  <Surface key={payment.id} style={styles.listCard}>
                    <View style={styles.paymentHeader}>
                      <View style={styles.flexCopy}>
                        <Text style={[styles.value, { color: colors.text }]}>
                          {payment.referenceLabel || payment.description || `Payment ${payment.id}`}
                        </Text>
                        <Text style={[styles.meta, { color: colors.textSoft }]}>
                          {payment.description}
                        </Text>
                      </View>
                      <Badge label={formatEnumLabel(payment.status)} tone={dueAmount > 0 ? "pending" : "completed"} />
                    </View>

                    <View style={[styles.breakdown, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
                      <Text style={[styles.breakdownLine, { color: colors.text }]}>
                        Total: {formatCurrency(payment.totalAmount, payment.currency)}
                      </Text>
                      <Text style={[styles.breakdownLine, { color: colors.text }]}>
                        Paid: {formatCurrency(payment.paidAmount, payment.currency)}
                      </Text>
                      <Text style={[styles.breakdownLine, { color: colors.danger }]}>
                        Due: {formatCurrency(payment.dueAmount, payment.currency)}
                      </Text>
                    </View>

                    <Text style={[styles.meta, { color: colors.textSoft }]}>
                      Method {formatPaymentMethod(payment.latestPaymentMethod)} · Status{" "}
                      {formatPaymentStatus(payment.latestTransactionStatus)}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSoft }]}>
                      Last activity {formatDateTime(payment.latestActivityAt)} · {payment.transactionCount} transaction
                      {payment.transactionCount === 1 ? "" : "s"}
                    </Text>

                    {payment.transactions.length ? (
                      <View style={styles.transactionList}>
                        {payment.transactions.map((transaction) => (
                          <View
                            key={transaction.id}
                            style={[styles.transactionRow, { borderBottomColor: colors.border }]}
                          >
                            <View style={styles.flexCopy}>
                              <Text style={[styles.transactionAmount, { color: colors.text }]}>
                                {formatCurrency(transaction.amount, transaction.currency)}
                              </Text>
                              <Text style={[styles.transactionMeta, { color: colors.textSoft }]}>
                                {formatPaymentMethod(transaction.paymentMethod)} ·{" "}
                                {formatPaymentStatus(transaction.status)}
                              </Text>
                            </View>
                            <Text style={[styles.transactionMeta, { color: colors.textSoft }]}>
                              {formatDateTime(transaction.createdAt)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {payment.canCollectDue && dueAmount > 0 && payment.collectDueOrderId ? (
                      <Button
                        label="Collect Due"
                        onPress={() => openCollectModal(payment.id, payment.dueAmount)}
                      />
                    ) : null}
                  </Surface>
                );
              })
            ) : (
              <EmptyState
                title="No payments yet"
                description="Payment records for this company will appear here."
              />
            )
          ) : null}

          {tab === "documents" ? (
            <View style={styles.documentsStack}>
              <SegmentedControl
                options={documentTypeOptions}
                value={documentTab}
                onChange={(value) => setDocumentTab(value as DocumentTab)}
              />
              {visibleDocuments.length ? (
                visibleDocuments.map((document) => {
                  const hasAttachment = Boolean(document.attachment?.trim());
                  const fileName = resolveDocumentFileName({
                    title: document.description,
                    attachment: document.attachment ?? "",
                    fallback: `document-${document.id}.pdf`,
                  });

                  return (
                    <Surface key={document.id} style={styles.listCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.flexCopy}>
                          <Text style={[styles.value, { color: colors.text }]}>{document.description}</Text>
                          <Text style={[styles.meta, { color: colors.textSoft }]}>
                            {formatDocumentTypeLabel(document.documentType)} · Order #{document.orderId}
                          </Text>
                          <Text style={[styles.meta, { color: colors.textSoft }]}>
                            {document.uploadedByName} · {formatDateTime(document.createdAt)}
                          </Text>
                          {document.note?.trim() ? (
                            <Text style={[styles.note, { color: colors.accentStrong }]}>
                              <Text style={styles.noteStrong}>Note: </Text>
                              <Text style={styles.noteStrong}>{document.note.trim()}</Text>
                            </Text>
                          ) : null}
                        </View>
                        {hasAttachment ? (
                          <View style={styles.documentActions}>
                            <IconButton
                              onPress={() => {
                                void openDocumentPreview(config, document.attachment ?? "", fileName).catch(
                                  (error) => {
                                    Alert.alert(
                                      "Preview failed",
                                      error instanceof Error
                                        ? error.message
                                        : "Could not open document.",
                                    );
                                  },
                                );
                              }}
                            >
                              <Ionicons color={colors.text} name="eye-outline" size={18} />
                            </IconButton>
                            <IconButton
                              onPress={() => {
                                void downloadDocument(config, document.attachment ?? "", fileName).catch(
                                  (error) => {
                                    Alert.alert(
                                      "Download failed",
                                      error instanceof Error
                                        ? error.message
                                        : "Could not download document.",
                                    );
                                  },
                                );
                              }}
                            >
                              <Ionicons color={colors.text} name="download-outline" size={18} />
                            </IconButton>
                          </View>
                        ) : null}
                      </View>
                    </Surface>
                  );
                })
              ) : (
                <EmptyState
                  title={`No ${documentTab === "SUBMITTED" ? "submitted" : "received"} files`}
                  description="Documents for this company will appear here."
                />
              )}
            </View>
          ) : null}

          {tab === "profile" ? (
            <Surface style={styles.listCard}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile details</Text>
              <View style={styles.profileRows}>
                {profileRows.map((row, index) => (
                  <View
                    key={row.label}
                    style={[
                      styles.profileRow,
                      {
                        borderBottomColor:
                          index === profileRows.length - 1 ? "transparent" : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.profileKey, { color: colors.textSoft }]}>{row.label}</Text>
                    <Text style={[styles.profileValue, { color: colors.text }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </Surface>
          ) : null}
        </View>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(activeCollectPayment)}
        onRequestClose={() => {
          if (submittingPayment) {
            return;
          }

          setCollectingPaymentId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.flexCopy}>
                <Text style={[styles.modalEyebrow, { color: colors.accent }]}>Payment</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Collect due</Text>
              </View>
              <IconButton
                disabled={submittingPayment}
                onPress={() => setCollectingPaymentId(null)}
              >
                <Ionicons color={colors.text} name="close" size={18} />
              </IconButton>
            </View>

            {activeCollectPayment ? (
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View
                  style={[
                    styles.breakdown,
                    { backgroundColor: colors.cardMuted, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.breakdownLine, { color: colors.text }]}>
                    Reference: {activeCollectPayment.referenceLabel}
                  </Text>
                  <Text style={[styles.breakdownLine, { color: colors.text }]}>
                    Paid: {formatCurrency(activeCollectPayment.paidAmount, activeCollectPayment.currency)}
                  </Text>
                  <Text style={[styles.breakdownLine, { color: colors.danger }]}>
                    Due: {formatCurrency(activeCollectPayment.dueAmount, activeCollectPayment.currency)}
                  </Text>
                </View>

                <TextField
                  keyboardType="decimal-pad"
                  label="Amount to collect"
                  value={collectAmount}
                  onChangeText={setCollectAmount}
                />
                <TextField
                  label="Note"
                  placeholder="Optional payment note"
                  value={collectNote}
                  onChangeText={setCollectNote}
                />

                <Button
                  label="Use full due"
                  tone="secondary"
                  onPress={() => setCollectAmount(String(parseMoney(activeCollectPayment.dueAmount)))}
                />
              </ScrollView>
            ) : null}

            <View style={styles.modalFooter}>
              <Button
                label="Cancel"
                tone="ghost"
                disabled={submittingPayment}
                onPress={() => setCollectingPaymentId(null)}
                style={styles.modalButton}
              />
              <Button
                label="Collect Payment"
                loading={submittingPayment}
                onPress={() => void handleCollectDue()}
                style={styles.modalButton}
              />
            </View>
          </Surface>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  hero: {
    gap: 14,
  },
  heroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  heroCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  companyName: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
  },
  owner: {
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  summaryCard: {
    gap: 8,
    minHeight: 98,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  documentsStack: {
    gap: 12,
  },
  listCard: {
    gap: 12,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  flexCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  value: {
    fontSize: 15,
    fontWeight: "800",
  },
  paymentHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  breakdown: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  breakdownLine: {
    fontSize: 13,
    fontWeight: "700",
  },
  transactionList: {
    gap: 0,
  },
  transactionRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  transactionAmount: {
    fontSize: 13,
    fontWeight: "800",
  },
  transactionMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  documentActions: {
    flexDirection: "row",
    gap: 8,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  noteStrong: {
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  profileRows: {
    gap: 0,
  },
  profileRow: {
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 12,
  },
  profileKey: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  profileValue: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  modalOverlay: {
    backgroundColor: "rgba(2, 8, 23, 0.7)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  modalSheet: {
    gap: 16,
    maxHeight: "82%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
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
  modalFooter: {
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
  },
});
