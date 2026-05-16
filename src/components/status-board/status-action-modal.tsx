import * as DocumentPicker from "expo-document-picker";
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
} from "react-native";
import { uploadDocumentToCloudinary } from "@/api/cloudinary";
import { SUBMIT_ORDER_DOCUMENTS_MUTATION } from "@/api/documents";
import type { OrderStatus, StatusBoardOrder } from "@/api/types";
import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { IconButton } from "@/components/common/icon-button";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Surface } from "@/components/common/surface";
import { TextField } from "@/components/common/text-field";
import { useAppConfig } from "@/providers/app-config-provider";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import { downloadDocument, openDocumentPreview, resolveDocumentFileName } from "@/utils/documents";
import { formatDateTime, formatOrderStatusLabel } from "@/utils/format";

type WorkflowFile = {
  id: string;
  attachmentUrl: string;
  extension: string;
  isUploading: boolean;
  originalName: string;
  sizeLabel: string;
  title: string;
};

type StatusActionModalProps = {
  currentStatus: OrderStatus;
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
  order: StatusBoardOrder;
};

type ProcessingDecision = "approve" | "reject";

const processingDecisionOptions = [
  { label: "Approve", value: "approve" },
  { label: "Reject", value: "reject" },
] as const;

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(size?: number | null) {
  if (!size || size <= 0) {
    return "Unknown size";
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function splitFileName(value: string) {
  const trimmed = value.trim();
  const lastDot = trimmed.lastIndexOf(".");

  if (lastDot <= 0) {
    return {
      extension: "",
      title: trimmed || "document",
    };
  }

  return {
    extension: trimmed.slice(lastDot),
    title: trimmed.slice(0, lastDot) || "document",
  };
}

function getTargetStatus(status: OrderStatus, isRejectDecision: boolean) {
  if (status === "PENDING") {
    return "PROCESSING" as const;
  }

  if (status === "PROCESSING") {
    return isRejectDecision ? ("PENDING" as const) : ("COMPLETED" as const);
  }

  return null;
}

function getLatestDocumentNote(order: StatusBoardOrder, documentId: number) {
  const targetDocument = order.serviceDocuments?.find((document) => document?.id === documentId);
  const notes =
    targetDocument?.documentNotes?.filter((note): note is NonNullable<typeof note> => Boolean(note)) ?? [];

  if (notes.length === 0) {
    return null;
  }

  return notes.sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
}

export function StatusActionModal({
  currentStatus,
  onClose,
  onSubmitted,
  order,
}: Readonly<StatusActionModalProps>) {
  const { colors } = useAppTheme();
  const { config } = useAppConfig();
  const { executeAuthenticated } = useAuth();
  const [files, setFiles] = useState<WorkflowFile[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processingDecision, setProcessingDecision] = useState<ProcessingDecision>("approve");

  const isCompletedFlow = currentStatus === "COMPLETED";
  const canReject = currentStatus === "PROCESSING" && Boolean(order.allowsRejection);
  const isRejectDecision = canReject && processingDecision === "reject";
  const targetStatus = getTargetStatus(currentStatus, isRejectDecision);

  const canSubmit = useMemo(
    () =>
      files.every((file) => !file.isUploading && file.attachmentUrl.trim().length > 0) &&
      !submitting,
    [files, submitting],
  );

  const completedDocuments = useMemo(
    () =>
      (order.serviceDocuments ?? [])
        .filter((document): document is NonNullable<typeof document> => Boolean(document))
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
    [order.serviceDocuments],
  );

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ["application/pdf", "image/*"],
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const provisionalFiles = result.assets.map((asset) => {
      const parsed = splitFileName(asset.name);

      return {
        id: createLocalId(),
        attachmentUrl: "",
        extension: parsed.extension,
        isUploading: true,
        originalName: asset.name,
        sizeLabel: formatFileSize(asset.size),
        title: parsed.title,
      } satisfies WorkflowFile;
    });

    setFiles((current) => [...current, ...provisionalFiles]);

    for (const [index, asset] of result.assets.entries()) {
      const fileId = provisionalFiles[index]?.id;

      if (!fileId) {
        continue;
      }

      try {
        const uploadResult = await uploadDocumentToCloudinary({
          asset,
          cloudinaryCloudName: config.cloudinaryCloudName,
          cloudinaryUploadPreset: config.cloudinaryUploadPreset,
          webAppUrl: config.webAppUrl,
        });

        setFiles((current) =>
          current.map((file) =>
            file.id === fileId
              ? {
                  ...file,
                  attachmentUrl: uploadResult.secureUrl,
                  isUploading: false,
                  originalName: uploadResult.originalFileName,
                }
              : file,
          ),
        );
      } catch (error) {
        setFiles((current) => current.filter((file) => file.id !== fileId));

        Alert.alert(
          "Upload failed",
          error instanceof Error ? error.message : "Could not upload file.",
        );
      }
    }
  };

  const handleSubmit = async () => {
    if (!targetStatus || !order.serviceId) {
      onClose();
      return;
    }

    try {
      setSubmitting(true);

      await executeAuthenticated<
        { submitTechnicalOrderDocuments: { orderId: number; orderStatus: OrderStatus } },
        {
          input: {
            decision?: "APPROVE" | "REJECT";
            documents?: Array<{
              attachment: string;
              documentName: string;
              serviceId: number;
            }>;
            note?: string;
            orderId: number;
            statusOnlyServiceIds?: number[];
            workflowStatus: OrderStatus;
          };
        }
      >(SUBMIT_ORDER_DOCUMENTS_MUTATION, {
        input: {
          ...(canReject
            ? {
                decision: isRejectDecision ? "REJECT" : "APPROVE",
              }
            : {}),
          ...(files.length
            ? {
                documents: files.map((file) => ({
                  attachment: file.attachmentUrl.trim(),
                  documentName: `${file.title.trim() || "document"}${file.extension}`,
                  serviceId: order.serviceId ?? 0,
                })),
              }
            : {}),
          ...(note.trim().length ? { note: note.trim() } : {}),
          orderId: order.orderId,
          statusOnlyServiceIds: [order.serviceId],
          workflowStatus: currentStatus,
        },
      });

      await onSubmitted();
      onClose();
    } catch (error) {
      Alert.alert(
        "Update failed",
        error instanceof Error ? error.message : "Could not update this service.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Surface style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.text }]}>
                {order.serviceName || "Service"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSoft }]}>
                Order #{order.orderId} · {order.companyInfo?.name ?? "Unknown company"}
              </Text>
              {order.packageName?.trim() ? (
                <Text style={[styles.subtitle, { color: colors.textSoft }]}>
                  Package · {order.packageName}
                </Text>
              ) : null}
            </View>
            <IconButton onPress={onClose}>
              <Ionicons color={colors.text} name="close" size={18} />
            </IconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.infoRow}>
              <Badge label={formatOrderStatusLabel(currentStatus)} tone="processing" />
              {targetStatus ? (
                <Badge
                  label={
                    currentStatus === "PROCESSING" && isRejectDecision
                      ? "Back to Pending"
                      : `Move to ${formatOrderStatusLabel(targetStatus)}`
                  }
                  tone={isRejectDecision ? "pending" : "accent"}
                />
              ) : null}
            </View>

            {order.lastRejectedAt && currentStatus === "PENDING" ? (
              <Surface muted style={styles.rejectedNotice}>
                <Text style={[styles.rejectedTitle, { color: colors.danger }]}>
                  Rejected on {formatDateTime(order.lastRejectedAt)}
                </Text>
                <Text style={[styles.rejectedCopy, { color: colors.textSoft }]}>
                  This service was returned to pending. You can resubmit it any time.
                </Text>
              </Surface>
            ) : null}

            {canReject ? (
              <SegmentedControl
                options={processingDecisionOptions}
                value={processingDecision}
                onChange={(value) => setProcessingDecision(value as ProcessingDecision)}
              />
            ) : null}

            {isCompletedFlow ? (
              completedDocuments.length ? (
                completedDocuments.map((document) => {
                  const noteItem = getLatestDocumentNote(order, document.id);
                  const hasAttachment = Boolean(document.attachment?.trim());
                  const fileName = resolveDocumentFileName({
                    title: document.description,
                    attachment: document.attachment ?? "",
                    fallback: `document-${document.id}.pdf`,
                  });

                  return (
                    <Surface key={document.id} muted style={styles.documentCard}>
                      <View style={styles.documentHeader}>
                        <View style={styles.documentCopy}>
                          <Text style={[styles.documentName, { color: colors.text }]}>
                            {document.description}
                          </Text>
                          <Text style={[styles.documentMeta, { color: colors.textSoft }]}>
                            {formatDateTime(document.createdAt)} · {document.uploadedBy}
                          </Text>
                          <Text style={[styles.documentNote, { color: colors.accentStrong }]}>
                            <Text style={styles.documentNoteStrong}>Note: </Text>
                            <Text style={styles.documentNoteStrong}>
                              {noteItem?.message?.trim() || "-"}
                            </Text>
                          </Text>
                        </View>

                        {hasAttachment ? (
                          <View style={styles.documentActions}>
                            <IconButton
                              onPress={() => {
                                void openDocumentPreview(
                                  config,
                                  document.attachment ?? "",
                                  fileName,
                                ).catch((error) => {
                                  Alert.alert(
                                    "Preview failed",
                                    error instanceof Error
                                      ? error.message
                                      : "Could not open document.",
                                  );
                                });
                              }}
                            >
                              <Ionicons color={colors.text} name="eye-outline" size={18} />
                            </IconButton>
                            <IconButton
                              onPress={() => {
                                void downloadDocument(
                                  config,
                                  document.attachment ?? "",
                                  fileName,
                                ).catch((error) => {
                                  Alert.alert(
                                    "Download failed",
                                    error instanceof Error
                                      ? error.message
                                      : "Could not download document.",
                                  );
                                });
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
                <Surface muted style={styles.rejectedNotice}>
                  <Text style={[styles.rejectedTitle, { color: colors.text }]}>
                    No documents available
                  </Text>
                  <Text style={[styles.rejectedCopy, { color: colors.textSoft }]}>
                    This completed service does not have uploaded documents or notes yet.
                  </Text>
                </Surface>
              )
            ) : (
              <>
                <View style={styles.rowBetween}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Documents</Text>
                  <Button
                    label="Choose Files"
                    tone="secondary"
                    onPress={() => void pickFiles()}
                  />
                </View>

                {files.length ? (
                  files.map((file) => (
                    <Surface key={file.id} muted style={styles.fileCard}>
                      <View style={styles.documentHeader}>
                        <View style={styles.documentCopy}>
                          <Text style={[styles.documentName, { color: colors.text }]}>
                            {file.title}
                            {file.extension}
                          </Text>
                          <Text style={[styles.documentMeta, { color: colors.textSoft }]}>
                            {file.sizeLabel} · {file.isUploading ? "Uploading..." : "Ready"}
                          </Text>
                        </View>
                        <IconButton
                          onPress={() => {
                            setFiles((current) => current.filter((item) => item.id !== file.id));
                          }}
                        >
                          <Ionicons color={colors.text} name="trash-outline" size={18} />
                        </IconButton>
                      </View>
                    </Surface>
                  ))
                ) : (
                  <Text style={[styles.emptyHint, { color: colors.textSoft }]}>
                    You can submit with files, note only, or status only.
                  </Text>
                )}

                <TextField
                  label="Note"
                  multiline
                  placeholder="Write a note for this update"
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                />
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button label="Close" tone="ghost" onPress={onClose} style={styles.footerButton} />
            {!isCompletedFlow ? (
              <Button
                disabled={!canSubmit || !targetStatus}
                label={
                  submitting
                    ? "Saving..."
                    : currentStatus === "PROCESSING" && isRejectDecision
                      ? "Reject to Pending"
                      : targetStatus
                        ? formatOrderStatusLabel(targetStatus)
                        : "Save"
                }
                loading={submitting}
                onPress={() => void handleSubmit()}
                style={styles.footerButton}
              />
            ) : null}
          </View>
        </Surface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(2, 8, 23, 0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    gap: 16,
    maxHeight: "90%",
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  content: {
    gap: 14,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rejectedNotice: {
    gap: 6,
  },
  rejectedTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  rejectedCopy: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  fileCard: {
    gap: 0,
  },
  documentCard: {
    gap: 0,
  },
  documentHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  documentCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  documentName: {
    fontSize: 14,
    fontWeight: "800",
  },
  documentMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  documentNote: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  documentNoteStrong: {
    fontWeight: "800",
  },
  documentActions: {
    flexDirection: "row",
    gap: 8,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 20,
  },
  noteInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
  },
  footerButton: {
    flex: 1,
  },
});
