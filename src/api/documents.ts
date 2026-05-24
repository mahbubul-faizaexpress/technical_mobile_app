export const LOGIN_MUTATION = `
  mutation LoginDashboard($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      userId
    }
  }
`;

export const REFRESH_SESSION_MUTATION = `
  mutation RefreshDashboardSession($input: RefreshTokenInput!) {
    refreshToken(input: $input) {
      accessToken
      refreshToken
      userId
    }
  }
`;

export const LOGOUT_SESSION_MUTATION = `
  mutation LogoutDashboardSession($input: RefreshTokenInput!) {
    logout(input: $input)
  }
`;

export const DASHBOARD_PROFILE_QUERY = `
  query DashboardProfile($userId: ID!) {
    profile(userId: $userId) {
      id
      email
      firstName
      lastName
      phone
      address
      role
      status
      isDeleted
    }
  }
`;

export const COMPANY_PROFILE_DETAILS_QUERY = `
  query CompanyProfileDetails($companyId: Int!) {
    company(companyId: $companyId) {
      id
      name
      user {
        id
        firstName
        lastName
        email
        phone
        address
        role
        status
      }
      companyDetails {
        id
        ein
        address
        notificationEmail
      }
    }
  }
`;

export const OVERVIEW_STATS_QUERY = `
  query OverviewStats($input: OverviewStatsInput) {
    technicalOverviewStats(input: $input) {
      totalCompanies
      pendingOrders
      processingOrders
      completedOrders
      totalPayments
      totalPartialPayment
      totalDue
    }
  }
`;

export const OVERVIEW_ORDERS_BY_MONTH_QUERY = `
  query OverviewOrdersByMonth($input: OverviewOrdersByMonthInput!) {
    technicalOverviewOrdersByMonth(input: $input) {
      availableYears
      selectedYear
      selectedMonth
      items {
        month
        monthLabel
        count
      }
    }
  }
`;

export const OVERVIEW_PACKAGE_DISTRIBUTION_QUERY = `
  query OverviewPackageDistribution($input: OverviewPackageDistributionInput!) {
    technicalOverviewPackageDistribution(input: $input) {
      availableYears
      selectedYear
      selectedMonth
      totalOrders
      items {
        label
        count
      }
    }
  }
`;

export const DASHBOARD_ORDERS_QUERY = `
  query DashboardOrders($input: OrdersPageInput) {
    ordersPage(input: $input) {
      items {
        id
        companyId
        companyInfo {
          name
          user {
            firstName
            lastName
            email
            phone
          }
          state {
            name
          }
        }
        price
        status
        createdAt
        llcSubmittedAt
        llcReceivedAt
        boiSubmittedAt
        boiReceivedAt
        itinSubmittedAt
        itinReceivedAt
        einSubmittedAt
        einReceivedAt
        orderServices {
          service {
            name
          }
        }
        orderPackages {
          package {
            name
            packageServices {
              service {
                name
              }
            }
          }
        }
        paymentOrders {
          payment {
            amount
            status
          }
        }
      }
      totalCount
      page
      pageSize
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`;

export const STATUS_BOARD_ORDERS_QUERY = `
  query StatusBoardOrders($input: StatusBoardOrdersInput) {
    technicalStatusBoardCategories {
      serviceCategoryId
      name
    }
    technicalStatusBoardOrders(input: $input) {
      items {
        id
        orderId
        status
        serviceId
        serviceName
        packageName
        serviceCategoryId
        serviceCategoryName
        matchedServiceNames
        retryAvailableAt
        lastRejectedAt
        lastRejectedDays
        rejectionCount
        allowsRejection
        isRetryBlocked
        availableServiceCategories {
          serviceCategoryId
          name
        }
        createdAt
        updatedAt
        companyInfo {
          name
        }
        serviceDocuments {
          id
          description
          attachment
          documentType
          createdAt
          uploadedBy
          uploadedByUser {
            firstName
            lastName
            email
          }
          documentNotes {
            id
            message
            createdAt
            notedBy
            notedByUser {
              firstName
              lastName
              email
            }
          }
        }
        orderServices {
          service {
            id
            name
          }
        }
        orderPackages {
          package {
            id
            name
            packageServices {
              service {
                id
                name
              }
            }
          }
        }
      }
      totalCount
      page
      pageSize
      totalPages
      hasNextPage
      hasPreviousPage
      statusCounts {
        status
        count
      }
      categoryCounts {
        serviceCategoryId
        name
        count
      }
    }
  }
`;

export const COMPANY_ACCOUNTS_QUERY = `
  query CompanyAccounts($input: CompanyAccountsInput) {
    companyAccounts(input: $input) {
      items {
        id
        companyName
        ownerName
        email
        phone
        country
        createdAt
        updatedAt
        totalServicesCount
        pendingServicesCount
        processingServicesCount
        completedServicesCount
        totalOrdersCount
        pendingOrdersCount
        processingOrdersCount
        completedOrdersCount
        services {
          id
          serviceName
          status
          submitDate
        }
      payments {
        id
        referenceLabel
        description
        totalAmount
        paidAmount
        dueAmount
        currency
        canCollectDue
        collectDueOrderId
        status
        latestPaymentMethod
        latestTransactionStatus
        latestActivityAt
        transactionCount
          transactions {
            id
            transactionId
            amount
            currency
            paymentMethod
            status
            createdAt
          }
        }
        documents {
          id
          description
          attachment
          documentType
          orderId
          createdAt
          uploadedByName
          note
        }
      }
      totalCount
      page
      pageSize
      totalPages
      hasNextPage
      hasPreviousPage
      availableCountries
    }
  }
`;

export const RECENT_ACTIVITIES_QUERY = `
  query RecentActivities($input: RecentActivitiesInput) {
    recentActivities(input: $input) {
      items {
        id
        activityType
        badgeLabel
        title
        description
        laneLabel
        companyName
        actorName
        orderNumber
        occurredAt
        chips
      }
      totalCount
      page
      pageSize
      totalPages
      hasNextPage
      hasPreviousPage
      counts {
        all
        documents
        orders
        company
      }
    }
  }
`;

export const TECHNICAL_REFUND_REQUESTS_QUERY = `
  query TechnicalRefundRequests($input: RefundRequestsInput) {
    technicalRefundRequestsPage(input: $input) {
      items {
        id
        status
        requestedAmount
        approvedAmount
        refundedAmount
        currency
        isManual
        isFullyRefunded
        reason
        details
        adminNote
        orderId
        paymentId
        originalPaidAmountLabel
        remainingPaidAmountLabel
        totalRefundedAmountLabel
        createdAt
        updatedAt
        reviewedAt
        refundedAt
        userInfo {
          id
          firstName
          lastName
          email
          phone
        }
        reviewedByUserInfo {
          id
          firstName
          lastName
          email
          phone
        }
        orderInfo {
          id
          status
          price
          companyInfo {
            name
          }
        }
        paymentInfo {
          id
          transactionId
          paymentMethod
          status
          amount
          currency
        }
      }
      totalCount
      page
      pageSize
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`;

export const TECHNICAL_REFUND_REQUEST_QUERY = `
  query TechnicalRefundRequest($refundRequestId: Int!) {
    technicalRefundRequest(refundRequestId: $refundRequestId) {
      id
      status
      requestedAmount
      approvedAmount
      refundedAmount
      currency
      isManual
      isFullyRefunded
      reason
      details
      adminNote
      orderId
      paymentId
      originalPaidAmountLabel
      remainingPaidAmountLabel
      totalRefundedAmountLabel
      createdAt
      updatedAt
      reviewedAt
      refundedAt
      userInfo {
        id
        firstName
        lastName
        email
        phone
      }
      reviewedByUserInfo {
        id
        firstName
        lastName
        email
        phone
      }
      orderInfo {
        id
        status
        price
        companyInfo {
          name
        }
      }
      paymentInfo {
        id
        transactionId
        paymentMethod
        status
        amount
        currency
      }
    }
  }
`;

export const UPDATE_REFUND_REQUEST_MUTATION = `
  mutation UpdateRefundRequest($refundRequestId: Int!, $input: UpdateRefundRequestInput!) {
    updateRefundRequest(refundRequestId: $refundRequestId, input: $input) {
      id
      status
      requestedAmount
      approvedAmount
      refundedAmount
      adminNote
      reviewedAt
      refundedAt
      updatedAt
    }
  }
`;

export const ADD_ORDER_FORM_DATA_QUERY = `
  query AddOrderFormData {
    technicalOrderFormData {
      companies {
        id
        name
        hasPackageOrder
        orderedPackageIds
        orderedServiceIds
        countryProfiles {
          id
          countryId
          stateId
          companyTypeId
          serviceTypeId
          state {
            id
            name
            countryId
            country {
              id
              name
            }
          }
          companyType {
            id
            name
            memberType
          }
          serviceType {
            id
            name
          }
        }
        stateId
        state {
          id
          name
          countryId
          country {
            id
            name
          }
        }
        companyTypeId
        companyType {
          id
          name
          memberType
        }
        serviceTypeId
        serviceType {
          id
          name
        }
        userId
        user {
          id
          firstName
          lastName
          email
          phone
          address
        }
        users {
          id
          firstName
          lastName
          email
          phone
          address
        }
      }
      companyTypes {
        id
        name
        memberType
        isActive
      }
      companyServiceTypes {
        id
        name
        isActive
      }
      countries {
        id
        name
        isActive
        states {
          id
          name
          fee
          countryId
          isActive
        }
      }
      packages {
        id
        name
        countryId
        currentPrice
        prevPrice
        isActive
        packageServices {
          serviceId
          service {
            id
            name
          }
        }
      }
      services {
        id
        name
        countryId
        currentPrice
        prevPrice
        deliveryDaysMin
        deliveryDaysMax
        requiresStateFee
        isActive
        isAddOn
      }
    }
  }
`;

export const TECHNICAL_ORDER_RESTRICTIONS_QUERY = `
  query TechnicalOrderRestrictions($input: TechnicalOrderRestrictionsInput!) {
    technicalOrderRestrictions(input: $input) {
      companyId
      countryId
      stateId
      scopeType
      hasPackageOrderInScope
      blockedPackageIds
      blockedServiceIds
    }
  }
`;

export const CREATE_TECHNICAL_ORDER_MUTATION = `
  mutation TechnicalCreateOrder($input: CreateTechnicalOrderInput!) {
    technicalCreateOrder(input: $input) {
      user {
        id
        firstName
        lastName
        email
        phone
        address
      }
      company {
        id
        name
        userId
        companyTypeId
        serviceTypeId
        stateId
      }
      order {
        id
        companyId
        price
        status
        startDate
        endDate
        orderServices {
          serviceId
        }
        orderPackages {
          packageId
        }
      }
      payment {
        id
        amount
        status
        paymentMethod
        currency
        transactionId
      }
      initialDocumentCount
    }
  }
`;

export const CREATE_TECHNICAL_PAYMENT_MUTATION = `
  mutation CreateTechnicalDashboardPayment($input: CreatePaymentInput!) {
    createTechnicalPayment(input: $input) {
      id
      amount
      currency
      paymentMethod
      status
      transactionId
    }
  }
`;

export const SUBMIT_ORDER_DOCUMENTS_MUTATION = `
  mutation SubmitOrderDocuments($input: SubmitOrderDocumentsInput!) {
    submitTechnicalOrderDocuments(input: $input) {
      orderId
      orderStatus
      submittedDocumentCount
      submittedServiceCount
      createdServiceDocumentCount
      createdDocumentNoteCount
      serviceDocuments {
        id
        description
        attachment
        documentType
        serviceId
        orderId
        uploadedBy
      }
      documentNotes {
        id
        message
        serviceDocumentId
        notedBy
        noteType
        isSeen
      }
    }
  }
`;
