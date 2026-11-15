-- CreateTable
CREATE TABLE `shops` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `timezone` VARCHAR(40) NOT NULL DEFAULT 'America/Sao_Paulo',
    `slotStepMin` SMALLINT NOT NULL DEFAULT 15,
    `bookingWindowDays` SMALLINT NOT NULL DEFAULT 30,
    `cancelNoticeMin` SMALLINT NOT NULL DEFAULT 120,
    `reminderLeadMin` SMALLINT NOT NULL DEFAULT 180,
    `policyVersion` VARCHAR(20) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shops_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_hours` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` CHAR(36) NOT NULL,
    `weekday` TINYINT NOT NULL,
    `openMin` SMALLINT NOT NULL,
    `closeMin` SMALLINT NOT NULL,

    UNIQUE INDEX `business_hours_shopId_weekday_openMin_key`(`shopId`, `weekday`, `openMin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `title` VARCHAR(60) NULL,
    `email` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'BARBER', 'FINANCE') NOT NULL DEFAULT 'BARBER',
    `commissionBps` SMALLINT NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `mfaSecretEnc` VARBINARY(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `staff_shopId_email_key`(`shopId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffId` CHAR(36) NOT NULL,
    `weekday` TINYINT NOT NULL,
    `startMin` SMALLINT NOT NULL,
    `endMin` SMALLINT NOT NULL,

    UNIQUE INDEX `staff_schedules_staffId_weekday_startMin_key`(`staffId`, `weekday`, `startMin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_blocks` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `staffId` CHAR(36) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `reason` VARCHAR(60) NULL,

    INDEX `schedule_blocks_staffId_startsAt_idx`(`staffId`, `startsAt`),
    INDEX `schedule_blocks_shopId_startsAt_idx`(`shopId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_sessions` (
    `id` CHAR(36) NOT NULL,
    `staffId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `staff_sessions_tokenHash_key`(`tokenHash`),
    INDEX `staff_sessions_staffId_idx`(`staffId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `services` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `priceCents` INTEGER NOT NULL,
    `durationMin` SMALLINT NOT NULL,
    `bufferMin` SMALLINT NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` SMALLINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `services_shopId_active_idx`(`shopId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_services` (
    `staffId` CHAR(36) NOT NULL,
    `serviceId` CHAR(36) NOT NULL,
    `priceCents` INTEGER NULL,
    `durationMin` SMALLINT NULL,

    INDEX `staff_services_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`staffId`, `serviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `phoneEnc` VARBINARY(255) NOT NULL,
    `phoneHash` CHAR(64) NOT NULL,
    `consentAt` DATETIME(3) NULL,
    `remindersOptIn` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_shopId_phoneHash_key`(`shopId`, `phoneHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointments` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `clientId` CHAR(36) NULL,
    `staffId` CHAR(36) NOT NULL,
    `serviceId` CHAR(36) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'CONFIRMED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
    `channel` ENUM('WEB', 'WHATSAPP', 'ADMIN') NOT NULL,
    `priceCents` INTEGER NOT NULL,
    `commissionCents` INTEGER NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `appointments_staffId_startsAt_idx`(`staffId`, `startsAt`),
    INDEX `appointments_shopId_startsAt_idx`(`shopId`, `startsAt`),
    INDEX `appointments_shopId_status_startsAt_idx`(`shopId`, `status`, `startsAt`),
    INDEX `appointments_clientId_idx`(`clientId`),
    INDEX `appointments_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `privacy_logs` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `clientId` CHAR(36) NULL,
    `subjectHash` CHAR(64) NOT NULL,
    `action` ENUM('CONSENT_GRANTED', 'CONSENT_REVOKED', 'DATA_VIEWED', 'DATA_EXPORTED', 'ERASURE_COMPLETED') NOT NULL,
    `channel` ENUM('WEB', 'WHATSAPP', 'ADMIN') NOT NULL,
    `policyVersion` VARCHAR(20) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `privacy_logs_shopId_subjectHash_idx`(`shopId`, `subjectHash`),
    INDEX `privacy_logs_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_tokens` (
    `id` CHAR(36) NOT NULL,
    `clientId` CHAR(36) NOT NULL,
    `purpose` ENUM('MAGIC_LINK', 'OTP') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `attempts` SMALLINT NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_tokens_tokenHash_key`(`tokenHash`),
    INDEX `auth_tokens_clientId_purpose_idx`(`clientId`, `purpose`),
    INDEX `auth_tokens_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_channels` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `phoneNumberId` VARCHAR(40) NOT NULL,
    `wabaId` VARCHAR(40) NOT NULL,
    `accessTokenEnc` VARBINARY(1024) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `whatsapp_channels_shopId_key`(`shopId`),
    UNIQUE INDEX `whatsapp_channels_phoneNumberId_key`(`phoneNumberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_inbound` (
    `wamid` VARCHAR(128) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `whatsapp_inbound_shopId_idx`(`shopId`),
    INDEX `whatsapp_inbound_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`wamid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_sessions` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `phoneHash` CHAR(64) NOT NULL,
    `state` VARCHAR(30) NOT NULL,
    `context` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `whatsapp_sessions_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `whatsapp_sessions_shopId_phoneHash_key`(`shopId`, `phoneHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_jobs` (
    `id` CHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `payload` JSON NOT NULL,
    `dedupeKey` VARCHAR(120) NULL,
    `runAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` SMALLINT NOT NULL DEFAULT 0,
    `lockedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `outbox_jobs_dedupeKey_key`(`dedupeKey`),
    INDEX `outbox_jobs_status_runAt_idx`(`status`, `runAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `business_hours` ADD CONSTRAINT `business_hours_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_schedules` ADD CONSTRAINT `staff_schedules_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_blocks` ADD CONSTRAINT `schedule_blocks_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_blocks` ADD CONSTRAINT `schedule_blocks_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_sessions` ADD CONSTRAINT `staff_sessions_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_services` ADD CONSTRAINT `staff_services_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_services` ADD CONSTRAINT `staff_services_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `privacy_logs` ADD CONSTRAINT `privacy_logs_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `privacy_logs` ADD CONSTRAINT `privacy_logs_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_channels` ADD CONSTRAINT `whatsapp_channels_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_inbound` ADD CONSTRAINT `whatsapp_inbound_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_sessions` ADD CONSTRAINT `whatsapp_sessions_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
