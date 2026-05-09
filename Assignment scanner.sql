-- --------------------------------------------------------
-- Create and Select Database
-- --------------------------------------------------------
CREATE DATABASE IF NOT EXISTS portal_db;
USE portal_db;

-- --------------------------------------------------------
-- Table structure for WhatsApp Notification Settings
-- This table stores the sender and receiver numbers 
-- for the n8n automation webhook.
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `whatsapp_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sender_number` varchar(15) NOT NULL,
  `receiver_number` varchar(15) NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Table structure for Assignment Notifications Log
-- This keeps track of all assignments that have already
-- been sent to prevent duplicate WhatsApp messages.
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `assignment_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subject_name` varchar(255) NOT NULL,
  `assignment_name` varchar(255) NOT NULL,
  `due_date` varchar(50) DEFAULT NULL,
  `receiver_number` varchar(15) NOT NULL,
  `notified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_assignment` (`subject_name`, `assignment_name`, `receiver_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Table structure for Stored Credentials (Optional)
-- If you want your backend/n8n to fetch portal logins.
-- NOTE: Passwords should ideally be encrypted.
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS `portal_credentials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `encoded_password` varchar(255) NOT NULL,
  `last_login` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
