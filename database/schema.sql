-- Schema Database: Mbakul Bagian Gaul (Express + MySQL) - 3 Roles (Admin, Seller, Pembeli)
CREATE DATABASE IF NOT EXISTS `mbakul_part` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `mbakul_part`;

DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `users`;

-- 1. Table Users (3 Role: admin, seller, pembeli)
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'seller', 'pembeli') NOT NULL DEFAULT 'pembeli',
  `phone` VARCHAR(30) NULL,
  `store_name` VARCHAR(100) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Table Settings (Nomor WhatsApp Pusat & Info)
CREATE TABLE `settings` (
  `key_name` VARCHAR(50) PRIMARY KEY,
  `key_value` TEXT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Table Products (Dikelola oleh Seller dan Admin)
CREATE TABLE `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `seller_id` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `kategori` VARCHAR(60) NOT NULL,
  `harga` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `stok` INT NOT NULL DEFAULT 0,
  `kondisi` ENUM('Bekas Bagus', 'Copotan Original', 'Restorasi', 'Perlu Servis Ringan') NOT NULL DEFAULT 'Copotan Original',
  `deskripsi` TEXT NULL,
  `image_url` LONGTEXT NULL,
  `unggulan` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_product_seller` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Table Orders (Pemesanan Langsung & Konfirmasi Pembayaran oleh Seller)
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `seller_id` INT NOT NULL,
  `buyer_id` INT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(50) NOT NULL,
  `address` TEXT NULL,
  `payment_method` VARCHAR(100) NOT NULL,
  `total_price` DECIMAL(12, 2) NOT NULL,
  `proof_image` LONGTEXT NULL,
  `status` ENUM('pending', 'confirmed', 'rejected', 'completed') DEFAULT 'pending',
  `items` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_order_seller` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
