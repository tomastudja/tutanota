//@flow
const map: {[string]: () => mixed} = {
    KeyPair: () => import('./KeyPair'),
    Group: () => import('./Group'),
    GroupInfo: () => import('./GroupInfo'),
    GroupMembership: () => import('./GroupMembership'),
    Customer: () => import('./Customer'),
    AuthenticatedDevice: () => import('./AuthenticatedDevice'),
    Login: () => import('./Login'),
    SecondFactorAuthentication: () => import('./SecondFactorAuthentication'),
    PhoneNumber: () => import('./PhoneNumber'),
    VariableExternalAuthInfo: () => import('./VariableExternalAuthInfo'),
    UserExternalAuthInfo: () => import('./UserExternalAuthInfo'),
    User: () => import('./User'),
    ExternalUserReference: () => import('./ExternalUserReference'),
    GroupRoot: () => import('./GroupRoot'),
    BucketPermission: () => import('./BucketPermission'),
    Bucket: () => import('./Bucket'),
    Permission: () => import('./Permission'),
    AccountingInfo: () => import('./AccountingInfo'),
    CustomerInfo: () => import('./CustomerInfo'),
    SentGroupInvitation: () => import('./SentGroupInvitation'),
    MailAddressToGroup: () => import('./MailAddressToGroup'),
    GroupMember: () => import('./GroupMember'),
    RootInstance: () => import('./RootInstance'),
    VersionInfo: () => import('./VersionInfo'),
    SystemKeysReturn: () => import('./SystemKeysReturn'),
    MailAddressAvailabilityData: () => import('./MailAddressAvailabilityData'),
    MailAddressAvailabilityReturn: () => import('./MailAddressAvailabilityReturn'),
    RegistrationServiceData: () => import('./RegistrationServiceData'),
    RegistrationReturn: () => import('./RegistrationReturn'),
    SendRegistrationCodeData: () => import('./SendRegistrationCodeData'),
    SendRegistrationCodeReturn: () => import('./SendRegistrationCodeReturn'),
    VerifyRegistrationCodeData: () => import('./VerifyRegistrationCodeData'),
    CreateGroupData: () => import('./CreateGroupData'),
    CreateGroupListData: () => import('./CreateGroupListData'),
    CustomerReturn: () => import('./CustomerReturn'),
    CustomerData: () => import('./CustomerData'),
    UserReturn: () => import('./UserReturn'),
    UserData: () => import('./UserData'),
    UserDataDelete: () => import('./UserDataDelete'),
    PublicKeyData: () => import('./PublicKeyData'),
    PublicKeyReturn: () => import('./PublicKeyReturn'),
    SaltData: () => import('./SaltData'),
    SaltReturn: () => import('./SaltReturn'),
    UserIdData: () => import('./UserIdData'),
    UserIdReturn: () => import('./UserIdReturn'),
    AutoLoginDataGet: () => import('./AutoLoginDataGet'),
    AutoLoginDataDelete: () => import('./AutoLoginDataDelete'),
    AutoLoginDataReturn: () => import('./AutoLoginDataReturn'),
    AutoLoginPostReturn: () => import('./AutoLoginPostReturn'),
    UpdatePermissionKeyData: () => import('./UpdatePermissionKeyData'),
    Authentication: () => import('./Authentication'),
    Chat: () => import('./Chat'),
    EntityUpdate: () => import('./EntityUpdate'),
    Exception: () => import('./Exception'),
    Version: () => import('./Version'),
    VersionData: () => import('./VersionData'),
    VersionReturn: () => import('./VersionReturn'),
    MembershipAddData: () => import('./MembershipAddData'),
    StringConfigValue: () => import('./StringConfigValue'),
    ChangePasswordData: () => import('./ChangePasswordData'),
    SecondFactorAuthData: () => import('./SecondFactorAuthData'),
    SecondFactorAuthAllowedReturn: () => import('./SecondFactorAuthAllowedReturn'),
    CustomerInfoReturn: () => import('./CustomerInfoReturn'),
    ResetPasswordData: () => import('./ResetPasswordData'),
    DomainMailAddressAvailabilityData: () => import('./DomainMailAddressAvailabilityData'),
    DomainMailAddressAvailabilityReturn: () => import('./DomainMailAddressAvailabilityReturn'),
    RegistrationConfigReturn: () => import('./RegistrationConfigReturn'),
    PushIdentifier: () => import('./PushIdentifier'),
    PushIdentifierList: () => import('./PushIdentifierList'),
    DeleteCustomerData: () => import('./DeleteCustomerData'),
    PremiumFeatureData: () => import('./PremiumFeatureData'),
    CustomerProperties: () => import('./CustomerProperties'),
    ExternalPropertiesReturn: () => import('./ExternalPropertiesReturn'),
    RegistrationCaptchaServiceData: () => import('./RegistrationCaptchaServiceData'),
    RegistrationCaptchaServiceReturn: () => import('./RegistrationCaptchaServiceReturn'),
    MailAddressAlias: () => import('./MailAddressAlias'),
    MailAddressAliasServiceData: () => import('./MailAddressAliasServiceData'),
    MailAddressAliasServiceReturn: () => import('./MailAddressAliasServiceReturn'),
    DomainInfo: () => import('./DomainInfo'),
    BookingItem: () => import('./BookingItem'),
    Booking: () => import('./Booking'),
    BookingsRef: () => import('./BookingsRef'),
    StringWrapper: () => import('./StringWrapper'),
    CustomDomainReturn: () => import('./CustomDomainReturn'),
    CustomDomainData: () => import('./CustomDomainData'),
    InvoiceInfo: () => import('./InvoiceInfo'),
    SwitchAccountTypeData: () => import('./SwitchAccountTypeData'),
    PdfInvoiceServiceData: () => import('./PdfInvoiceServiceData'),
    PdfInvoiceServiceReturn: () => import('./PdfInvoiceServiceReturn'),
    MailAddressAliasServiceDataDelete: () => import('./MailAddressAliasServiceDataDelete'),
    PaymentDataServiceGetReturn: () => import('./PaymentDataServiceGetReturn'),
    PaymentDataServicePutData: () => import('./PaymentDataServicePutData'),
    PaymentDataServicePutReturn: () => import('./PaymentDataServicePutReturn'),
    PriceRequestData: () => import('./PriceRequestData'),
    PriceServiceData: () => import('./PriceServiceData'),
    PriceItemData: () => import('./PriceItemData'),
    PriceData: () => import('./PriceData'),
    PriceServiceReturn: () => import('./PriceServiceReturn'),
    MembershipRemoveData: () => import('./MembershipRemoveData'),
    File: () => import('./File'),
    EmailSenderListElement: () => import('./EmailSenderListElement'),
    CustomerServerProperties: () => import('./CustomerServerProperties'),
    CreateCustomerServerPropertiesData: () => import('./CreateCustomerServerPropertiesData'),
    CreateCustomerServerPropertiesReturn: () => import('./CreateCustomerServerPropertiesReturn'),
    PremiumFeatureReturn: () => import('./PremiumFeatureReturn'),
    UserAreaGroups: () => import('./UserAreaGroups'),
    DebitServicePutData: () => import('./DebitServicePutData'),
    BookingServiceData: () => import('./BookingServiceData'),
    EntityEventBatch: () => import('./EntityEventBatch'),
    DomainsRef: () => import('./DomainsRef'),
    AuditLogEntry: () => import('./AuditLogEntry'),
    AuditLogRef: () => import('./AuditLogRef'),
    WhitelabelConfig: () => import('./WhitelabelConfig'),
    BrandingDomainData: () => import('./BrandingDomainData'),
    BrandingDomainDeleteData: () => import('./BrandingDomainDeleteData'),
    U2fRegisteredDevice: () => import('./U2fRegisteredDevice'),
    SecondFactor: () => import('./SecondFactor'),
    U2fKey: () => import('./U2fKey'),
    U2fChallenge: () => import('./U2fChallenge'),
    Challenge: () => import('./Challenge'),
    Session: () => import('./Session'),
    UserAuthentication: () => import('./UserAuthentication'),
    CreateSessionData: () => import('./CreateSessionData'),
    CreateSessionReturn: () => import('./CreateSessionReturn'),
    U2fResponseData: () => import('./U2fResponseData'),
    SecondFactorAuthGetData: () => import('./SecondFactorAuthGetData'),
    SecondFactorAuthGetReturn: () => import('./SecondFactorAuthGetReturn'),
    OtpChallenge: () => import('./OtpChallenge'),
    BootstrapFeature: () => import('./BootstrapFeature'),
    Feature: () => import('./Feature'),
    WhitelabelChild: () => import('./WhitelabelChild'),
    WhitelabelChildrenRef: () => import('./WhitelabelChildrenRef'),
    WhitelabelParent: () => import('./WhitelabelParent'),
    UpdateAdminshipData: () => import('./UpdateAdminshipData'),
    AdministratedGroup: () => import('./AdministratedGroup'),
    AdministratedGroupsRef: () => import('./AdministratedGroupsRef'),
    CreditCard: () => import('./CreditCard'),
    LocationServiceGetReturn: () => import('./LocationServiceGetReturn'),
    OrderProcessingAgreement: () => import('./OrderProcessingAgreement'),
    SignOrderProcessingAgreementData: () => import('./SignOrderProcessingAgreementData'),
    GeneratedIdWrapper: () => import('./GeneratedIdWrapper'),
    SseConnectData: () => import('./SseConnectData'),
    NotificationInfo: () => import('./NotificationInfo'),
    RecoverCode: () => import('./RecoverCode'),
    ResetFactorsDeleteData: () => import('./ResetFactorsDeleteData'),
    UpgradePriceServiceData: () => import('./UpgradePriceServiceData'),
    PlanPrices: () => import('./PlanPrices'),
    UpgradePriceServiceReturn: () => import('./UpgradePriceServiceReturn'),
    RegistrationCaptchaServiceGetData: () => import('./RegistrationCaptchaServiceGetData'),
    WebsocketEntityData: () => import('./WebsocketEntityData'),
    WebsocketCounterValue: () => import('./WebsocketCounterValue'),
    WebsocketCounterData: () => import('./WebsocketCounterData'),
    CertificateInfo: () => import('./CertificateInfo'),
    NotificationMailTemplate: () => import('./NotificationMailTemplate'),
    CalendarEventRef: () => import('./CalendarEventRef'),
    AlarmInfo: () => import('./AlarmInfo'),
    UserAlarmInfo: () => import('./UserAlarmInfo'),
    UserAlarmInfoListType: () => import('./UserAlarmInfoListType'),
    NotificationSessionKey: () => import('./NotificationSessionKey'),
    RepeatRule: () => import('./RepeatRule'),
    AlarmNotification: () => import('./AlarmNotification'),
    AlarmServicePost: () => import('./AlarmServicePost'),
    DnsRecord: () => import('./DnsRecord'),
    CustomDomainCheckData: () => import('./CustomDomainCheckData'),
    CustomDomainCheckReturn: () => import('./CustomDomainCheckReturn'),
    CloseSessionServicePost: () => import('./CloseSessionServicePost'),
    ReceivedGroupInvitation: () => import('./ReceivedGroupInvitation'),
    UserGroupRoot: () => import('./UserGroupRoot'),
    PaymentErrorInfo: () => import('./PaymentErrorInfo'),
    InvoiceItem: () => import('./InvoiceItem'),
    Invoice: () => import('./Invoice'),
    MissedNotification: () => import('./MissedNotification'),
    BrandingDomainGetReturn: () => import('./BrandingDomainGetReturn'),
    RejectedSender: () => import('./RejectedSender'),
    RejectedSendersRef: () => import('./RejectedSendersRef'),
    SecondFactorAuthDeleteData: () => import('./SecondFactorAuthDeleteData'),
    TakeOverDeletedAddressData: () => import('./TakeOverDeletedAddressData'),
    WebsocketLeaderStatus: () => import('./WebsocketLeaderStatus'),
    GiftCard: () => import('./GiftCard'),
    GiftCardsRef: () => import('./GiftCardsRef'),
    GiftCardOption: () => import('./GiftCardOption'),
    GiftCardGetReturn: () => import('./GiftCardGetReturn'),
    GiftCardCreateData: () => import('./GiftCardCreateData'),
    GiftCardDeleteData: () => import('./GiftCardDeleteData'),
    GiftCardCreateReturn: () => import('./GiftCardCreateReturn'),
    GiftCardRedeemData: () => import('./GiftCardRedeemData'),
    GiftCardRedeemGetReturn: () => import('./GiftCardRedeemGetReturn'),
    Braintree3ds2Request: () => import('./Braintree3ds2Request'),
    Braintree3ds2Response: () => import('./Braintree3ds2Response'),
    PaymentDataServicePostData: () => import('./PaymentDataServicePostData'),
    PaymentDataServiceGetData: () => import('./PaymentDataServiceGetData'),
    TypeInfo: () => import('./TypeInfo'),
    ArchiveRef: () => import('./ArchiveRef'),
    ArchiveType: () => import('./ArchiveType'),
    Blob: () => import('./Blob'),
    BlobId: () => import('./BlobId'),
    TargetServer: () => import('./TargetServer'),
    BlobAccessInfo: () => import('./BlobAccessInfo'),
    WebauthnResponseData: () => import('./WebauthnResponseData')
}
export default map