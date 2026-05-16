import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  ADD_ORDER_FORM_DATA_QUERY,
  CREATE_TECHNICAL_ORDER_MUTATION,
  TECHNICAL_ORDER_RESTRICTIONS_QUERY,
} from "@/api/documents";
import { uploadDocumentToCloudinary } from "@/api/cloudinary";
import type { AddOrderFormData, PaymentStatus, TechnicalOrderRestrictions } from "@/api/types";
import type { RootStackScreenProps } from "@/navigation/types";
import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { PickerField } from "@/components/common/picker-field";
import { Screen } from "@/components/common/screen";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Surface } from "@/components/common/surface";
import { TextField } from "@/components/common/text-field";
import { useAppConfig } from "@/providers/app-config-provider";
import { useAuth } from "@/providers/auth-provider";
import { useAppTheme } from "@/theme/theme-provider";
import {
  buildOrderDates,
  formatCurrency,
  normalizePhone,
  normalizeText,
  parseMoney,
} from "@/utils/format";
import { useAsyncResource } from "@/utils/use-async-resource";

type OrderMode = "package" | "services";
type PaymentCollectionStatus = "paid" | "partial_paid";
type CompanyMemberType = "SINGLE" | "MULTIPLE";

type OrderUserForm = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  address: string;
};

type InitialDocumentRow = {
  id: string;
  attachmentUrl: string;
  documentName: string;
  serviceId: string;
  uploadedFileName: string;
  isUploading: boolean;
};

const orderModeOptions = [
  { label: "Package", value: "package" },
  { label: "Services", value: "services" },
] as const;

const paymentStatusOptions = [
  { label: "Paid", value: "paid" },
  { label: "Partial Paid", value: "partial_paid" },
] as const;

const memberTypeOptions = [
  { label: "Single Member", value: "SINGLE" },
  { label: "Multiple Member", value: "MULTIPLE" },
] as const;

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createUserForm(input?: Partial<OrderUserForm>): OrderUserForm {
  return {
    id: createLocalId(),
    firstName: input?.firstName ?? "",
    lastName: input?.lastName ?? "",
    email: input?.email ?? "",
    password: input?.password ?? "",
    phone: input?.phone ?? "",
    address: input?.address ?? "",
  };
}

function isValidManualPhoneNumber(value: string) {
  const compactValue = value.trim().replace(/[\s().-]/g, "");

  if (!compactValue) {
    return false;
  }

  if (compactValue.startsWith("+")) {
    return /^\+\d{5,20}$/.test(compactValue);
  }

  return /^\d{5,20}$/.test(compactValue);
}

function getMatchingCompanyCountryProfile(
  company: AddOrderFormData["companies"][number] | null,
  countryId?: string,
) {
  if (!company?.countryProfiles?.length || !countryId) {
    return null;
  }

  const profiles = company.countryProfiles.filter(
    (profile): profile is NonNullable<NonNullable<typeof company.countryProfiles>[number]> =>
      profile != null,
  );

  return profiles.find((profile) => String(profile.countryId) === countryId) ?? null;
}

function createInitialDocumentRow(): InitialDocumentRow {
  return {
    id: createLocalId(),
    attachmentUrl: "",
    documentName: "",
    serviceId: "",
    uploadedFileName: "",
    isUploading: false,
  };
}

export function AddOrderScreen({ navigation }: RootStackScreenProps<"AddOrder">) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { config } = useAppConfig();
  const { executeAuthenticated } = useAuth();
  const [orderMode, setOrderMode] = useState<OrderMode>("package");
  const [paymentStatus, setPaymentStatus] = useState<PaymentCollectionStatus>("paid");
  const [submitting, setSubmitting] = useState(false);
  const [selectedExistingCompanyId, setSelectedExistingCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [stateId, setStateId] = useState("");
  const [companyTypeId, setCompanyTypeId] = useState("");
  const [companyServiceTypeId, setCompanyServiceTypeId] = useState("");
  const [companyMemberType, setCompanyMemberType] = useState<CompanyMemberType>("SINGLE");
  const [packageId, setPackageId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [paidAmount, setPaidAmount] = useState("");
  const [orderUsers, setOrderUsers] = useState<OrderUserForm[]>([createUserForm()]);
  const [initialDocuments, setInitialDocuments] = useState<InitialDocumentRow[]>([]);

  const compact = width < 420;
  const stackedFields = width < 760;

  const resource = useAsyncResource(
    () =>
      executeAuthenticated<
        { technicalOrderFormData: AddOrderFormData },
        Record<string, never>
      >(ADD_ORDER_FORM_DATA_QUERY),
    [executeAuthenticated],
  );

  const formData = resource.data?.technicalOrderFormData;
  const restrictionsResource = useAsyncResource(
    async () => {
      if (!selectedExistingCompanyId || !countryId) {
        return {
          technicalOrderRestrictions: null,
        };
      }

      return executeAuthenticated<
        { technicalOrderRestrictions: TechnicalOrderRestrictions | null },
        { input: { companyId: number; countryId: number; stateId?: number } }
      >(TECHNICAL_ORDER_RESTRICTIONS_QUERY, {
        input: {
          companyId: Number(selectedExistingCompanyId),
          countryId: Number(countryId),
          ...(stateId ? { stateId: Number(stateId) } : {}),
        },
      });
    },
    [countryId, executeAuthenticated, selectedExistingCompanyId, stateId],
  );
  const existingCompany =
    formData?.companies.find((item) => item.id === Number(selectedExistingCompanyId)) ?? null;
  const existingCompanyProfile = useMemo(
    () => getMatchingCompanyCountryProfile(existingCompany, countryId),
    [countryId, existingCompany],
  );
  const isExistingCompanySelected = Boolean(existingCompany);
  const activeCountries = formData?.countries.filter((item) => item.isActive) ?? [];
  const selectedCountry = activeCountries.find((item) => item.id === Number(countryId)) ?? null;
  const stateOptions =
    (selectedCountry?.states ?? [])
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.isActive))
      .map((item) => ({
        id: item.id,
        name: item.name,
        fee: item.fee,
      })) ?? [];
  const selectedState = stateOptions.find((item) => item.id === Number(stateId)) ?? null;
  const activePackages = (formData?.packages ?? []).filter((item) => item.isActive);
  const activeServices = (formData?.services ?? []).filter((item) => item.isActive);
  const technicalOrderRestrictions = restrictionsResource.data?.technicalOrderRestrictions ?? null;
  const selectedExistingCompanyOrderedPackageIds = useMemo(
    () => new Set(technicalOrderRestrictions?.blockedPackageIds ?? []),
    [technicalOrderRestrictions?.blockedPackageIds],
  );
  const selectedExistingCompanyOrderedServiceIds = useMemo(
    () => new Set(technicalOrderRestrictions?.blockedServiceIds ?? []),
    [technicalOrderRestrictions?.blockedServiceIds],
  );
  const selectedExistingCompanyPackageServiceIds = useMemo(() => {
    if (
      !existingCompany ||
      !technicalOrderRestrictions?.hasPackageOrderInScope ||
      selectedExistingCompanyOrderedPackageIds.size === 0
    ) {
      return new Set<number>();
    }

    return new Set(
      activePackages
        .filter((pkg) => selectedExistingCompanyOrderedPackageIds.has(pkg.id))
        .flatMap((pkg) =>
          (pkg.packageServices ?? [])
            .map((item) => item?.serviceId)
            .filter((serviceId): serviceId is number => Number.isInteger(serviceId)),
        ),
    );
  }, [
    activePackages,
    existingCompany,
    selectedExistingCompanyOrderedPackageIds,
    technicalOrderRestrictions?.hasPackageOrderInScope,
  ]);
  const hasExistingCompanyPackageOrder = Boolean(
    isExistingCompanySelected && technicalOrderRestrictions?.hasPackageOrderInScope,
  );

  const packageOptions = useMemo(
    () =>
      activePackages.filter(
        (item) =>
          item.countryId === Number(countryId) &&
          (!isExistingCompanySelected || !selectedExistingCompanyOrderedPackageIds.has(item.id)),
      ) ?? [],
    [activePackages, countryId, isExistingCompanySelected, selectedExistingCompanyOrderedPackageIds],
  );

  const selectedPackage = useMemo(
    () => packageOptions.find((item) => item.id === Number(packageId)) ?? null,
    [packageId, packageOptions],
  );

  const packageIncludedServices = useMemo(
    () =>
      (selectedPackage?.packageServices ?? [])
        .map((item) => item?.service)
        .filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? [],
    [selectedPackage],
  );

  const serviceOptions = useMemo(() => {
    if (!countryId) {
      return [];
    }

    const countryServices = activeServices.filter((service) => service.countryId === Number(countryId));

    if (orderMode === "package") {
      if (!selectedPackage) {
        return [];
      }

      const packageServiceIds = new Set(
        (selectedPackage.packageServices ?? [])
          .map((item) => item?.serviceId)
          .filter((serviceId): serviceId is number => Number.isInteger(serviceId)),
      );

      return countryServices.filter(
        (service) =>
          !packageServiceIds.has(service.id) &&
          !selectedExistingCompanyOrderedServiceIds.has(service.id),
      );
    }

    return countryServices.filter(
      (service) =>
        !selectedExistingCompanyOrderedServiceIds.has(service.id) &&
        !selectedExistingCompanyPackageServiceIds.has(service.id),
    );
  }, [
    activeServices,
    countryId,
    orderMode,
    selectedExistingCompanyOrderedServiceIds,
    selectedExistingCompanyPackageServiceIds,
    selectedPackage,
  ]);

  const selectedServices = useMemo(
    () => serviceOptions.filter((service) => selectedServiceIds.includes(service.id)),
    [selectedServiceIds, serviceOptions],
  );

  const documentServiceOptions = useMemo(() => {
    const baseServices =
      orderMode === "package" ? [...packageIncludedServices, ...selectedServices] : selectedServices;

    return baseServices.filter(
      (service, index, current) => current.findIndex((item) => item.id === service.id) === index,
    );
  }, [orderMode, packageIncludedServices, selectedServices]);

  const selectedCompanyType = useMemo(
    () => (formData?.companyTypes ?? []).find((item) => item.id === Number(companyTypeId)) ?? null,
    [companyTypeId, formData?.companyTypes],
  );

  const resolvedMemberType = isExistingCompanySelected
    ? (existingCompany?.users && existingCompany.users.length > 1 ? "MULTIPLE" : "SINGLE")
    : selectedCompanyType?.memberType ?? companyMemberType;

  const stateFee = parseMoney(selectedState?.fee);
  const packagePrice = parseMoney(selectedPackage?.currentPrice);
  const selectedServicesPrice = selectedServices.reduce(
    (sum, service) => sum + parseMoney(service.currentPrice),
    0,
  );
  const hasSelectedServiceWithStateFee = selectedServices.some((service) => service.requiresStateFee);
  const shouldApplyStateFee = orderMode === "package" || hasSelectedServiceWithStateFee;
  const totalAmount = (shouldApplyStateFee ? stateFee : 0) + (orderMode === "package" ? packagePrice : 0) + selectedServicesPrice;

  useEffect(() => {
    if (!hasExistingCompanyPackageOrder) {
      return;
    }

    if (orderMode !== "services") {
      setOrderMode("services");
    }

    if (packageId) {
      setPackageId("");
    }
  }, [hasExistingCompanyPackageOrder, orderMode, packageId]);

  useEffect(() => {
    const validServiceIds = new Set(serviceOptions.map((item) => item.id));
    setSelectedServiceIds((current) => current.filter((serviceId) => validServiceIds.has(serviceId)));
  }, [serviceOptions]);

  useEffect(() => {
    const validDocumentServiceIds = new Set(documentServiceOptions.map((item) => String(item.id)));
    setInitialDocuments((current) =>
      current.map((row) =>
        row.serviceId && !validDocumentServiceIds.has(row.serviceId)
          ? { ...row, serviceId: "" }
          : row,
      ),
    );
  }, [documentServiceOptions]);

  const applyExistingCompany = (companyId: string) => {
    setSelectedExistingCompanyId(companyId);
    const company = formData?.companies.find((item) => item.id === Number(companyId));

    if (!company) {
      return;
    }

    const defaultProfile =
      company.countryProfiles?.find(
        (profile): profile is NonNullable<NonNullable<typeof company.countryProfiles>[number]> =>
          Boolean(profile),
      ) ?? null;
    setCompanyName(company.name);
    setCountryId(
      defaultProfile?.countryId
        ? String(defaultProfile.countryId)
        : String(company.state?.countryId ?? ""),
    );
    setStateId(
      defaultProfile?.stateId
        ? String(defaultProfile.stateId)
        : String(company.stateId ?? ""),
    );
    setCompanyTypeId(
      defaultProfile?.companyTypeId
        ? String(defaultProfile.companyTypeId)
        : String(company.companyTypeId ?? ""),
    );
    setCompanyServiceTypeId(
      defaultProfile?.serviceTypeId
        ? String(defaultProfile.serviceTypeId)
        : String(company.serviceTypeId ?? ""),
    );
    const companyUsers =
      company.users?.filter((user): user is NonNullable<typeof user> => Boolean(user)) ??
      (company.user ? [company.user] : []);
    setOrderUsers(
      companyUsers.length
        ? companyUsers.map((user) =>
            createUserForm({
              firstName: user.firstName ?? "",
              lastName: user.lastName ?? "",
              email: user.email ?? "",
              password: "",
              phone: user.phone ?? "",
              address: user.address ?? "",
            }),
          )
        : [createUserForm()],
    );
    setPackageId("");
    setSelectedServiceIds([]);
    setInitialDocuments([]);
  };

  const resetExistingCompanySelection = () => {
    setSelectedExistingCompanyId("");
    setCountryId("");
    setStateId("");
    setCompanyTypeId("");
    setCompanyServiceTypeId("");
    setCompanyMemberType("SINGLE");
    setPackageId("");
    setSelectedServiceIds([]);
    setInitialDocuments([]);
    setOrderUsers([createUserForm()]);
  };

  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);

    if (
      existingCompany &&
      normalizeText(value).toLowerCase() !== existingCompany.name.trim().toLowerCase()
    ) {
      resetExistingCompanySelection();
      setCompanyName(value);
    }
  };

  const companySuggestions = useMemo(() => {
    const normalizedSearch = normalizeText(companyName).toLowerCase();

    if (!normalizedSearch || isExistingCompanySelected) {
      return [];
    }

    return (formData?.companies ?? [])
      .filter((company) => company.name.trim().toLowerCase().includes(normalizedSearch))
      .slice(0, 6);
  }, [companyName, formData?.companies, isExistingCompanySelected]);

  useEffect(() => {
    if (!existingCompany) {
      return;
    }

    if (!countryId) {
      setStateId("");
      setCompanyTypeId("");
      setCompanyServiceTypeId("");
      return;
    }

    const matchingProfile = getMatchingCompanyCountryProfile(existingCompany, countryId);

    if (matchingProfile) {
      setStateId(String(matchingProfile.stateId));
      setCompanyTypeId(String(matchingProfile.companyTypeId));
      setCompanyServiceTypeId(String(matchingProfile.serviceTypeId));
      return;
    }

    setStateId("");
    setCompanyTypeId(existingCompany.companyTypeId ? String(existingCompany.companyTypeId) : "");
    setCompanyServiceTypeId(existingCompany.serviceTypeId ? String(existingCompany.serviceTypeId) : "");
  }, [countryId, existingCompany]);

  const addUser = () => {
    setOrderUsers((current) => [...current, createUserForm()]);
  };

  const removeUser = (userId: string) => {
    setOrderUsers((current) => (current.length > 1 ? current.filter((user) => user.id !== userId) : current));
  };

  const toggleService = (serviceId: number) => {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((item) => item !== serviceId)
        : [...current, serviceId],
    );
  };

  const addDocumentRow = () => {
    if (documentServiceOptions.length === 0) {
      return;
    }

    setInitialDocuments((current) => [...current, createInitialDocumentRow()]);
  };

  const removeDocumentRow = (rowId: string) => {
    setInitialDocuments((current) => current.filter((item) => item.id !== rowId));
  };

  const pickDocumentForRow = async (rowId: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["application/pdf", "image/*"],
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    setInitialDocuments((current) =>
      current.map((item) =>
        item.id === rowId
          ? {
              ...item,
              isUploading: true,
              uploadedFileName: asset.name,
            }
          : item,
      ),
    );

    try {
      const uploadResult = await uploadDocumentToCloudinary({
        asset,
        cloudinaryCloudName: config.cloudinaryCloudName,
        cloudinaryUploadPreset: config.cloudinaryUploadPreset,
        webAppUrl: config.webAppUrl,
      });

      setInitialDocuments((current) =>
        current.map((item) =>
          item.id === rowId
            ? {
                ...item,
                attachmentUrl: uploadResult.secureUrl,
                uploadedFileName: uploadResult.originalFileName,
                isUploading: false,
              }
            : item,
        ),
      );
    } catch (error) {
      setInitialDocuments((current) =>
        current.map((item) =>
          item.id === rowId
            ? {
                ...item,
                isUploading: false,
              }
            : item,
        ),
      );

      Alert.alert(
        "Upload failed",
        error instanceof Error ? error.message : "Could not upload file.",
      );
    }
  };

  const validate = () => {
    if (
      !normalizeText(companyName) ||
      !countryId ||
      !stateId ||
      (!isExistingCompanySelected && !companyTypeId) ||
      (!isExistingCompanySelected && !companyServiceTypeId)
    ) {
      return "Complete all company fields.";
    }

    if (!isExistingCompanySelected) {
      for (const user of orderUsers) {
        const normalizedPhone = normalizePhone(user.phone);

        if (
          !normalizeText(user.firstName) ||
          !normalizeText(user.lastName) ||
          !normalizeText(user.email) ||
          !normalizeText(user.phone) ||
          !normalizeText(user.address)
        ) {
          return "Complete all required user information fields.";
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email.trim())) {
          return "Enter a valid email address for each user.";
        }

        if (!user.password.trim()) {
          return "Password is required for each new user.";
        }

        if (user.password.trim().length < 8) {
          return "Password must be at least 8 characters.";
        }

        if (!isValidManualPhoneNumber(normalizedPhone)) {
          return "Enter a valid phone number for each user.";
        }
      }
    }

    if (orderMode === "package" && !packageId) {
      return "Choose a package.";
    }

    if (orderMode === "services" && selectedServiceIds.length === 0) {
      return "Choose at least one service.";
    }

    if (paymentStatus === "partial_paid") {
      const partialAmount = parseMoney(paidAmount);

      if (partialAmount <= 0) {
        return "Enter a valid partial paid amount.";
      }

      if (partialAmount >= totalAmount) {
        return "Partial paid amount must be less than the total amount.";
      }
    }

    for (const row of initialDocuments) {
      const hasAnyValue =
        row.documentName.trim() || row.serviceId.trim() || row.attachmentUrl.trim() || row.uploadedFileName.trim();

      if (!hasAnyValue) {
        continue;
      }

      if (!row.serviceId || !row.documentName.trim() || !row.attachmentUrl.trim()) {
        return "Complete every initial document row before submitting.";
      }

      if (row.isUploading) {
        return "Wait until all document uploads finish.";
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();

    if (validationError) {
      Alert.alert("Cannot create order", validationError);
      return;
    }

    try {
      setSubmitting(true);

      const orderDates = buildOrderDates();
      const preparedUsers = orderUsers.map((user) => ({
        firstName: normalizeText(user.firstName),
        lastName: normalizeText(user.lastName),
        email: user.email.trim().toLowerCase(),
        password: user.password.trim(),
        phone: normalizePhone(user.phone),
        ...(normalizeText(user.address).length ? { address: normalizeText(user.address) } : {}),
      }));
      const paymentAmount = paymentStatus === "paid" ? totalAmount : parseMoney(paidAmount);

      await executeAuthenticated<
        { technicalCreateOrder: { order: { id: number } } },
        {
            input: {
              existingCompanyId?: number;
              company?: {
                companyTypeId: number;
                isActive: boolean;
              memberType?: CompanyMemberType;
              name: string;
              serviceTypeId: number;
              stateId: number;
            };
              user?: {
                firstName: string;
                lastName: string;
                email: string;
                password?: string;
                phone: string;
                address?: string;
              };
              users?: Array<{
                firstName: string;
                lastName: string;
                email: string;
                password?: string;
                phone: string;
                address?: string;
              }>;
            documents?: Array<{
              attachment: string;
              documentName: string;
              serviceId: number;
            }>;
            endDate: string;
            packageId?: number;
            payment: {
              amount: number;
              status: PaymentStatus;
            };
            serviceIds?: number[];
            startDate: string;
          };
        }
      >(CREATE_TECHNICAL_ORDER_MUTATION, {
        input: {
          ...(isExistingCompanySelected
            ? {
                existingCompanyId: Number(selectedExistingCompanyId),
              }
            : {
                user: preparedUsers[0],
                ...(preparedUsers.length > 1 ? { users: preparedUsers.slice(1) } : {}),
              }),
          company: {
            companyTypeId: Number(
              companyTypeId || existingCompanyProfile?.companyTypeId || existingCompany?.companyTypeId,
            ),
            isActive: true,
            ...(resolvedMemberType ? { memberType: resolvedMemberType } : {}),
            name: normalizeText(companyName),
            serviceTypeId: Number(
              companyServiceTypeId ||
                existingCompanyProfile?.serviceTypeId ||
                existingCompany?.serviceTypeId,
            ),
            stateId: Number(stateId),
          },
          ...(orderMode === "package" && packageId ? { packageId: Number(packageId) } : {}),
          ...(selectedServiceIds.length ? { serviceIds: selectedServiceIds } : {}),
          ...(initialDocuments.filter((row) => row.serviceId && row.attachmentUrl.trim()).length
            ? {
                documents: initialDocuments
                  .filter((row) => row.serviceId && row.attachmentUrl.trim())
                  .map((row) => ({
                    attachment: row.attachmentUrl.trim(),
                    documentName: normalizeText(row.documentName),
                    serviceId: Number(row.serviceId),
                  })),
              }
            : {}),
          endDate: orderDates.endDate,
          payment: {
            amount: paymentAmount,
            status: paymentStatus === "paid" ? "PAID" : "PARTIALLY_PAID",
          },
          startDate: orderDates.startDate,
        },
      });

      Alert.alert("Success", "Order created successfully.");
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        "Creation failed",
        error instanceof Error ? error.message : "Could not create order.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (resource.loading && !formData) {
    return <LoadingState label="Loading order form..." />;
  }

  if (resource.error && !formData) {
    return <EmptyState title="Could not load order form" description={resource.error} />;
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <View style={styles.hero}>
          <Text style={[styles.heroEyebrow, { color: colors.accent }]}>Create order</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Technical order flow</Text>
          <Text style={[styles.heroCopy, { color: colors.textSoft }]}>
            Create a new package or service order, attach initial documents, and record manual payment in one transaction.
          </Text>
        </View>

        <Surface style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Company</Text>
          <TextField
            label="Company"
            placeholder="Search or type company name"
            value={companyName}
            onChangeText={handleCompanyNameChange}
          />

          {companySuggestions.length ? (
            <View style={[styles.suggestionPanel, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
              {companySuggestions.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => applyExistingCompany(String(item.id))}
                  style={({ pressed }) => [
                    styles.suggestionRow,
                    pressed ? styles.suggestionPressed : null,
                  ]}
                >
                  <Text style={[styles.suggestionTitle, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.suggestionMeta, { color: colors.textSoft }]}>
                    {[
                      item.state?.country?.name,
                      item.state?.name,
                      item.user?.email,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Existing company"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.row, stackedFields && styles.rowStack]}>
            <PickerField
              containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
              label="Country"
              selectedValue={countryId}
              options={[
                { label: "Choose country", value: "" },
                ...activeCountries.map((item) => ({ label: item.name, value: String(item.id) })),
              ]}
              onValueChange={(value) => {
                setCountryId(value);
                setStateId("");
                setPackageId("");
                setSelectedServiceIds([]);
              }}
            />
            <PickerField
              containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
              label="State"
              selectedValue={stateId}
              options={[
                { label: "Choose state", value: "" },
                ...stateOptions.map((item) => ({
                  label: `${item.name}${item.fee ? ` (${formatCurrency(item.fee)})` : ""}`,
                  value: String(item.id),
                })),
              ]}
              onValueChange={setStateId}
            />
          </View>

          <View style={[styles.row, stackedFields && styles.rowStack]}>
            <PickerField
              containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
              label="Company type"
              selectedValue={companyTypeId}
              options={[
                { label: "Choose type", value: "" },
                ...(formData?.companyTypes.map((item) => ({
                  label: item.name,
                  value: String(item.id),
                })) ?? []),
              ]}
              onValueChange={setCompanyTypeId}
            />
            <PickerField
              containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
              label="Service type"
              selectedValue={companyServiceTypeId}
              options={[
                { label: "Choose service type", value: "" },
                ...(formData?.companyServiceTypes.map((item) => ({
                  label: item.name,
                  value: String(item.id),
                })) ?? []),
              ]}
              onValueChange={setCompanyServiceTypeId}
            />
          </View>

          {!isExistingCompanySelected ? (
            <PickerField
              label="Member type"
              selectedValue={companyMemberType}
              options={memberTypeOptions.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              onValueChange={(value) => setCompanyMemberType(value as CompanyMemberType)}
            />
          ) : null}
        </Surface>

        <Surface style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Users</Text>
            {!isExistingCompanySelected && resolvedMemberType === "MULTIPLE" ? (
              <Button label="Add User" tone="secondary" onPress={addUser} />
            ) : null}
          </View>

          {orderUsers.map((user, index) => (
            <View
              key={user.id}
              style={[styles.userCard, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.userTitle, { color: colors.text }]}>User {index + 1}</Text>
                {!isExistingCompanySelected && orderUsers.length > 1 ? (
                  <Button label="Remove" tone="ghost" onPress={() => removeUser(user.id)} />
                ) : null}
              </View>

              <View style={[styles.row, stackedFields && styles.rowStack]}>
                <TextField
                  containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
                  editable={!isExistingCompanySelected}
                  label="First name"
                  value={user.firstName}
                  onChangeText={(value) =>
                    setOrderUsers((current) =>
                      current.map((item) => (item.id === user.id ? { ...item, firstName: value } : item)),
                    )
                  }
                />
                <TextField
                  containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
                  editable={!isExistingCompanySelected}
                  label="Last name"
                  value={user.lastName}
                  onChangeText={(value) =>
                    setOrderUsers((current) =>
                      current.map((item) => (item.id === user.id ? { ...item, lastName: value } : item)),
                    )
                  }
                />
              </View>
              <View style={[styles.row, stackedFields && styles.rowStack]}>
                <TextField
                  containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
                  editable={!isExistingCompanySelected}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  label="Email"
                  value={user.email}
                  onChangeText={(value) =>
                    setOrderUsers((current) =>
                      current.map((item) => (item.id === user.id ? { ...item, email: value } : item)),
                    )
                  }
                />
                <TextField
                  containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
                  editable={!isExistingCompanySelected}
                  label="Password"
                  secureTextEntry
                  textContentType="password"
                  value={user.password}
                  onChangeText={(value) =>
                    setOrderUsers((current) =>
                      current.map((item) => (item.id === user.id ? { ...item, password: value } : item)),
                    )
                  }
                />
              </View>
              <View style={[styles.row, stackedFields && styles.rowStack]}>
                <TextField
                  containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
                  editable={!isExistingCompanySelected}
                  keyboardType="phone-pad"
                  label="Phone"
                  value={user.phone}
                  onChangeText={(value) =>
                    setOrderUsers((current) =>
                      current.map((item) => (item.id === user.id ? { ...item, phone: value } : item)),
                    )
                  }
                />
                <TextField
                  containerStyle={[styles.rowField, stackedFields && styles.rowFieldStack]}
                  editable={!isExistingCompanySelected}
                  label="Address"
                  value={user.address}
                  onChangeText={(value) =>
                    setOrderUsers((current) =>
                      current.map((item) => (item.id === user.id ? { ...item, address: value } : item)),
                    )
                  }
                />
              </View>
            </View>
          ))}
        </Surface>

        <SegmentedControl
          options={orderModeOptions}
          value={orderMode}
          onChange={(value) => setOrderMode(value as OrderMode)}
        />

        {hasExistingCompanyPackageOrder ? (
          <Surface muted style={styles.inlineNotice}>
            <Text style={[styles.noticeText, { color: colors.text }]}>
              This company already has a package order. It can only order services outside that package.
            </Text>
          </Surface>
        ) : null}

        <Surface style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Order setup</Text>

          {orderMode === "package" ? (
            <>
              <PickerField
                label="Package"
                selectedValue={packageId}
                options={[
                  { label: "Choose package", value: "" },
                  ...packageOptions.map((item) => ({
                    label: `${item.name} (${formatCurrency(item.currentPrice)})`,
                    value: String(item.id),
                  })),
                ]}
                onValueChange={setPackageId}
              />

              <View style={[styles.inlineNotice, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
                <Text style={[styles.noticeLabel, { color: colors.textSoft }]}>Included services</Text>
                <Text style={[styles.noticeText, { color: colors.text }]}>
                  {packageIncludedServices.length
                    ? packageIncludedServices.map((item) => item.name).join(", ")
                    : "Choose a package to see included services."}
                </Text>
              </View>
            </>
          ) : null}

          <View style={styles.selectionHeader}>
            <Text style={[styles.selectionTitle, { color: colors.text }]}>
              {orderMode === "package" ? "Add-on services" : "Services"}
            </Text>
            <Text style={[styles.selectionCopy, { color: colors.textSoft }]}>
              {orderMode === "package"
                ? "Only services outside the selected package can be added."
                : "Select one or more services for this order."}
            </Text>
          </View>

          <View style={styles.chipWrap}>
            {serviceOptions.map((service) => {
              const active = selectedServiceIds.includes(service.id);

              return (
                <Pressable
                  key={service.id}
                  onPress={() => toggleService(service.id)}
                  style={[
                    styles.serviceChip,
                    {
                      backgroundColor: active ? colors.accent : colors.cardMuted,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.serviceChipLabel,
                      { color: active ? "#042321" : colors.text },
                    ]}
                  >
                    {service.name}
                  </Text>
                  <Text
                    style={[
                      styles.serviceChipMeta,
                      { color: active ? "#063c38" : colors.textSoft },
                    ]}
                  >
                    {formatCurrency(service.currentPrice)}
                    {service.requiresStateFee ? " · State fee" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Surface>

        <Surface style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment</Text>
          <SegmentedControl
            options={paymentStatusOptions}
            value={paymentStatus}
            onChange={(value) => setPaymentStatus(value as PaymentCollectionStatus)}
          />
          {paymentStatus === "partial_paid" ? (
            <TextField
              keyboardType="decimal-pad"
              label="Paid amount"
              value={paidAmount}
              onChangeText={setPaidAmount}
            />
          ) : null}
          <View style={[styles.summaryCard, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
            <Text style={[styles.summaryLine, { color: colors.text }]}>
              State fee: {formatCurrency(shouldApplyStateFee ? stateFee : 0)}
            </Text>
            <Text style={[styles.summaryLine, { color: colors.text }]}>
              Package: {formatCurrency(orderMode === "package" ? packagePrice : 0)}
            </Text>
            <Text style={[styles.summaryLine, { color: colors.text }]}>
              Services: {formatCurrency(selectedServicesPrice)}
            </Text>
            <Text style={[styles.totalLine, { color: colors.text }]}>
              Total: {formatCurrency(totalAmount)}
            </Text>
          </View>
        </Surface>

        <Surface style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Initial documents</Text>
            <Button
              label="Add Row"
              tone="secondary"
              disabled={documentServiceOptions.length === 0 || submitting}
              onPress={addDocumentRow}
            />
          </View>
          {initialDocuments.length === 0 ? (
            <Text style={[styles.helper, { color: colors.textSoft }]}>
              Optional. Add starting documents for selected services before creating the order.
            </Text>
          ) : null}

          {initialDocuments.map((row) => (
            <View
              key={row.id}
              style={[styles.documentRow, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}
            >
              <PickerField
                label="Service"
                selectedValue={row.serviceId}
                options={[
                  { label: "Choose service", value: "" },
                  ...documentServiceOptions.map((item) => ({
                    label: item.name,
                    value: String(item.id),
                  })),
                ]}
                onValueChange={(value) =>
                  setInitialDocuments((current) =>
                    current.map((item) => (item.id === row.id ? { ...item, serviceId: value } : item)),
                  )
                }
              />
              <TextField
                label="Document name"
                value={row.documentName}
                onChangeText={(value) =>
                  setInitialDocuments((current) =>
                    current.map((item) => (item.id === row.id ? { ...item, documentName: value } : item)),
                  )
                }
              />
              <View style={[styles.rowBetween, compact && styles.rowBetweenStack]}>
                <Text style={[styles.helper, { color: colors.textSoft, flex: 1 }]}>
                  {row.uploadedFileName || "No file selected"}
                </Text>
                <View style={styles.inlineActions}>
                  <Button
                    label={row.isUploading ? "Uploading..." : "Choose File"}
                    tone="secondary"
                    disabled={row.isUploading}
                    onPress={() => void pickDocumentForRow(row.id)}
                  />
                  <Button label="Remove" tone="ghost" onPress={() => removeDocumentRow(row.id)} />
                </View>
              </View>
            </View>
          ))}
        </Surface>

        <Button label="Create Order" loading={submitting} onPress={() => void handleSubmit()} />
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
  card: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  rowStack: {
    flexDirection: "column",
  },
  rowField: {
    flex: 1,
  },
  rowFieldStack: {
    flex: 0,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  rowBetweenStack: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  suggestionPanel: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
    padding: 6,
  },
  suggestionRow: {
    borderRadius: 16,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  suggestionPressed: {
    opacity: 0.82,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  suggestionMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  userCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  userTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  inlineNotice: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  noticeLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  selectionHeader: {
    gap: 4,
  },
  selectionTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  selectionCopy: {
    fontSize: 13,
    lineHeight: 19,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  serviceChip: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    minWidth: "48%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  serviceChipLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  serviceChipMeta: {
    fontSize: 11,
    fontWeight: "600",
  },
  summaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryLine: {
    fontSize: 14,
    fontWeight: "700",
  },
  totalLine: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
  },
  documentRow: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
