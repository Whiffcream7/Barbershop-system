-- Barbershop Database  |  Milestone M2
-- Run with:  mysql -u root -p < barbershop.sql
-- Requires: MySQL 8.0.16+ or MariaDB 10.2.1+ (CHECK constraints, CTE, window functions)

-- WARNING: the next line deletes ALL existing data every time this script runs.
DROP DATABASE IF EXISTS barbershop_db;
CREATE DATABASE IF NOT EXISTS barbershop_db;
USE barbershop_db;



-- MAIN ENTITY: system accounts (admin / staff)
CREATE TABLE users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,          -- bcrypt hash, never plain text
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('admin','staff') NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MAIN ENTITY
CREATE TABLE customers (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name  VARCHAR(50) NOT NULL,
  last_name   VARCHAR(50) NOT NULL,
  phone       VARCHAR(20) NOT NULL,
  email       VARCHAR(100) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MAIN ENTITY
CREATE TABLE barbers (
  barber_id  INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name  VARCHAR(50) NOT NULL,
  specialty  VARCHAR(100) NULL,
  phone      VARCHAR(20) NULL,
  status     ENUM('active','inactive') NOT NULL DEFAULT 'active'
);


-- MAIN ENTITY
CREATE TABLE services (
  service_id       INT AUTO_INCREMENT PRIMARY KEY,
  service_name     VARCHAR(100) NOT NULL,
  description      VARCHAR(255) NULL,
  price            DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (price >= 0),
  CHECK (duration_minutes > 0)
);

-- TRANSACTION TABLE
-- end_time = start_time + total duration of the chosen services.
-- Stored so the double-booking check is a simple time-overlap query.
CREATE TABLE appointments (
  appointment_id   INT AUTO_INCREMENT PRIMARY KEY,
  customer_id      INT NOT NULL,
  barber_id        INT NOT NULL,
  created_by       INT NOT NULL,
  booking_type     ENUM('scheduled','walk_in') NOT NULL DEFAULT 'scheduled',
  appointment_date DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  status           ENUM('booked','completed','cancelled','no_show')
                   NOT NULL DEFAULT 'booked',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  CONSTRAINT fk_appt_barber   FOREIGN KEY (barber_id)   REFERENCES barbers(barber_id),
  CONSTRAINT fk_appt_user     FOREIGN KEY (created_by)  REFERENCES users(user_id),
  CHECK (end_time > start_time)
);

-- JUNCTION TABLE: appointments <-> services (many-to-many)
CREATE TABLE appointment_services (
  appt_service_id  INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id   INT NOT NULL,
  service_id       INT NOT NULL,
  price_at_booking DECIMAL(10,2) NOT NULL,      -- snapshot so old records keep old prices
  CONSTRAINT fk_as_appt    FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
                           ON DELETE CASCADE,
  CONSTRAINT fk_as_service FOREIGN KEY (service_id)     REFERENCES services(service_id),
  UNIQUE (appointment_id, service_id)           -- same service can't be added twice
);

-- LOG TABLE: the daily walk-in / arrival queue
CREATE TABLE queue_entries (
  queue_id       INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL UNIQUE,           -- UNIQUE => appointment has 0..1 queue entry
  queue_number   INT NOT NULL,
  queue_date     DATE NOT NULL,
  status         ENUM('waiting','serving','done','cancelled') NOT NULL DEFAULT 'waiting',
  time_in        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  time_started   TIMESTAMP NULL DEFAULT NULL,
  time_done      TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_queue_appt FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  UNIQUE (queue_date, queue_number)             -- numbers reset each day
);

-- TRANSACTION TABLE
CREATE TABLE payments (
  payment_id     INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  received_by    INT NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  payment_method ENUM('cash','gcash') NOT NULL,
  payment_date   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_appt FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  CONSTRAINT fk_pay_user FOREIGN KEY (received_by)    REFERENCES users(user_id),
  CHECK (amount > 0)
);

-- Helpful indexes for the searches/reports below
CREATE INDEX idx_appt_date_barber ON appointments (appointment_date, barber_id);
CREATE INDEX idx_customer_name    ON customers (last_name, first_name);



-- All sample users have the password: password123  (bcrypt, cost 10)
INSERT INTO users (username, password_hash, full_name, role) VALUES
('admin',   '$2b$10$EYDW3vni54UNmZyjcnzVv.xw/d./TbakItSEMdQDJn2t/xW088whS', 'Maria Santos',  'admin'),
('staff1',  '$2b$10$EYDW3vni54UNmZyjcnzVv.xw/d./TbakItSEMdQDJn2t/xW088whS', 'Juan Dela Cruz','staff'),
('staff2',  '$2b$10$EYDW3vni54UNmZyjcnzVv.xw/d./TbakItSEMdQDJn2t/xW088whS', 'Ana Reyes',     'staff'),
('staff3',  '$2b$10$EYDW3vni54UNmZyjcnzVv.xw/d./TbakItSEMdQDJn2t/xW088whS', 'Pedro Lim',     'staff'),
('staff4',  '$2b$10$EYDW3vni54UNmZyjcnzVv.xw/d./TbakItSEMdQDJn2t/xW088whS', 'Liza Garcia',   'staff');
 
INSERT INTO customers (first_name, last_name, phone, email) VALUES
('Carlo',  'Mendoza',  '09171234567', 'carlo@example.com'),
('Miguel', 'Torres',   '09181234567', NULL),
('Paolo',  'Villanueva','09191234567','paolo@example.com'),
('Renz',   'Aquino',   '09201234567', NULL),
('Jomar',  'Bautista', '09211234567', 'jomar@example.com'),
('Ken',    'Ramos',    '09221234567', NULL);
 
INSERT INTO barbers (first_name, last_name, specialty, phone, status) VALUES
('Rico',  'Manalo',  'Fades',        '09301111111', 'active'),
('Tonton','Cabrera', 'Classic cuts', '09302222222', 'active'),
('Jay',   'Salazar', 'Beard styling','09303333333', 'active'),
('Nico',  'Estrada', 'Hair color',   '09304444444', 'active'),
('Bong',  'Ignacio', 'Kids cuts',    '09305555555', 'inactive');
 
INSERT INTO services (service_name, description, price, duration_minutes, is_active) VALUES
('Haircut',        'Standard haircut',            150.00, 30, TRUE),
('Fade Cut',       'Skin or taper fade',          200.00, 40, TRUE),
('Beard Trim',     'Shape and trim beard',        100.00, 20, TRUE),
('Shave',          'Hot towel shave',             120.00, 25, TRUE),
('Hair Color',     'Single-color hair dye',       500.00, 90, TRUE),
('Hot Towel Massage','Relaxing head massage',      80.00, 15, FALSE);
 
-- Appointments (end_time = start_time + total service minutes)
INSERT INTO appointments
  (customer_id, barber_id, created_by, booking_type, appointment_date, start_time, end_time, status) VALUES
(1, 1, 2, 'scheduled', '2026-09-28', '09:00:00', '09:40:00', 'completed'),  -- 1 Fade
(2, 2, 2, 'scheduled', '2026-09-28', '10:00:00', '10:50:00', 'completed'),  -- 2 Haircut + Beard
(3, 1, 3, 'walk_in',   '2026-09-28', '10:15:00', '10:55:00', 'completed'),  -- 3 Fade
(4, 3, 3, 'scheduled', '2026-09-29', '13:00:00', '13:45:00', 'completed'),  -- 4 Beard + Shave
(5, 4, 2, 'scheduled', '2026-09-29', '14:00:00', '15:30:00', 'no_show'),    -- 5 Hair Color
(1, 2, 4, 'walk_in',   '2026-09-30', '09:30:00', '10:00:00', 'completed'),  -- 6 Haircut
(6, 1, 4, 'scheduled', '2026-09-30', '11:00:00', '11:40:00', 'cancelled'),  -- 7 Fade
(2, 3, 2, 'scheduled', '2026-09-30', '15:00:00', '15:50:00', 'booked'),     -- 8 Haircut + Beard
(3, 1, 3, 'walk_in',   '2026-09-30', '16:00:00', '16:40:00', 'booked');     -- 9 Fade
 
INSERT INTO appointment_services (appointment_id, service_id, price_at_booking) VALUES
(1, 2, 200.00),
(2, 1, 150.00), (2, 3, 100.00),
(3, 2, 200.00),
(4, 3, 100.00), (4, 4, 120.00),
(5, 5, 500.00),
(6, 1, 150.00),
(7, 2, 200.00),
(8, 1, 150.00), (8, 3, 100.00),
(9, 2, 200.00);
 
INSERT INTO queue_entries
  (appointment_id, queue_number, queue_date, status, time_in, time_started, time_done) VALUES
(3, 1, '2026-09-28', 'done',    '2026-09-28 10:10:00', '2026-09-28 10:15:00', '2026-09-28 10:52:00'),
(6, 1, '2026-09-30', 'done',    '2026-09-30 09:25:00', '2026-09-30 09:30:00', '2026-09-30 09:58:00'),
(9, 2, '2026-09-30', 'waiting', '2026-09-30 15:55:00', NULL, NULL);
 
INSERT INTO payments (appointment_id, received_by, amount, payment_method, payment_date) VALUES
(1, 2, 200.00, 'cash',  '2026-09-28 09:45:00'),
(2, 2, 250.00, 'gcash', '2026-09-28 10:55:00'),
(3, 3, 200.00, 'cash',  '2026-09-28 10:58:00'),
(4, 3, 120.00, 'cash',  '2026-09-29 13:50:00'),   -- partial payment: 100.00 still owed
(6, 4, 150.00, 'gcash', '2026-09-30 10:05:00');


-- Q1 SEARCH: find customers by partial name or phone
SELECT customer_id, first_name, last_name, phone
FROM customers
WHERE first_name LIKE '%car%' OR last_name LIKE '%car%' OR phone LIKE '%0917%';
 
-- Q2 FILTER: today's appointments for one barber, in time order
-- (Sample date is hardcoded so the demo output stays the same. In the app: barber_id = ?, date = ?)
SELECT a.appointment_id, a.start_time, a.end_time, a.status,
       CONCAT(c.first_name, ' ', c.last_name) AS customer
FROM appointments a
JOIN customers c ON c.customer_id = a.customer_id
WHERE a.barber_id = 1
  AND a.appointment_date = '2026-09-30'
ORDER BY a.start_time;
 
-- Q3 FILTER: active services in a price range, cheapest first
SELECT service_name, price, duration_minutes
FROM services
WHERE is_active = TRUE AND price BETWEEN 100 AND 250
ORDER BY price;
 
-- Q4 REPORT: daily sales by payment method
SELECT DATE(payment_date) AS day,
       payment_method,
       COUNT(*)    AS payments,
       SUM(amount) AS total_sales
FROM payments
GROUP BY DATE(payment_date), payment_method
ORDER BY day, payment_method;
 
-- Q5 REPORT: appointments handled and revenue per barber
SELECT CONCAT(b.first_name, ' ', b.last_name) AS barber,
       COUNT(DISTINCT a.appointment_id) AS completed_appointments,
       SUM(s.price_at_booking)          AS service_revenue
FROM barbers b
JOIN appointments a          ON a.barber_id = b.barber_id AND a.status = 'completed'
JOIN appointment_services s  ON s.appointment_id = a.appointment_id
GROUP BY b.barber_id, barber
ORDER BY service_revenue DESC;
 
-- Q6 REPORT: most popular services
SELECT sv.service_name,
       COUNT(*)                 AS times_booked,
       SUM(aps.price_at_booking) AS revenue
FROM appointment_services aps
JOIN services sv ON sv.service_id = aps.service_id
GROUP BY sv.service_id, sv.service_name
ORDER BY times_booked DESC, revenue DESC;
 
-- Q7 REPORT: today's live queue
-- (Sample date is hardcoded so the demo output stays the same. In the app: q.queue_date = ?)
SELECT q.queue_number, q.status,
       CONCAT(c.first_name, ' ', c.last_name) AS customer,
       CONCAT(b.first_name, ' ', b.last_name) AS barber
FROM queue_entries q
JOIN appointments a ON a.appointment_id = q.appointment_id
JOIN customers c    ON c.customer_id    = a.customer_id
JOIN barbers b      ON b.barber_id      = a.barber_id
WHERE q.queue_date = '2026-09-30'
ORDER BY q.queue_number;

-- A1 DOUBLE-BOOKING CHECK (time-overlap test)
-- (Values are hardcoded for the demo. In the app: barber_id = ?, appointment_date = ?, new end = ?, new start = ?)
-- Would a new booking for barber 1 on 2026-09-30, 15:45-16:20 clash?
-- Two ranges overlap when: existing.start < new.end AND existing.end > new.start
-- A row returned means there IS a conflict (cancelled/no-show ignored).
SELECT appointment_id, start_time, end_time
FROM appointments
WHERE barber_id = 1
  AND appointment_date = '2026-09-30'
  AND status IN ('booked','completed')
  AND start_time < '16:20:00'
  AND end_time   > '15:45:00';
 
-- A2 UNPAID APPOINTMENTS: completed but the payments don't cover the total
-- (LEFT JOIN + GROUP BY + HAVING + derived subquery)
SELECT a.appointment_id,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       tot.total_due,
       COALESCE(SUM(p.amount), 0)                  AS total_paid,
       tot.total_due - COALESCE(SUM(p.amount), 0)  AS balance
FROM appointments a
JOIN (SELECT appointment_id, SUM(price_at_booking) AS total_due
      FROM appointment_services
      GROUP BY appointment_id) tot ON tot.appointment_id = a.appointment_id
LEFT JOIN payments p ON p.appointment_id = a.appointment_id
WHERE a.status = 'completed'
GROUP BY a.appointment_id, a.appointment_date, tot.total_due
HAVING balance > 0;
 
-- A3 CUSTOMERS WHO NEVER MISSED: subquery with NOT IN
SELECT customer_id, first_name, last_name
FROM customers
WHERE customer_id NOT IN (
  SELECT customer_id FROM appointments
  WHERE status IN ('no_show','cancelled')
);
 
-- A4 RANK BARBERS BY REVENUE PER DAY (CTE + window function, MySQL 8+)
WITH daily AS (
  SELECT a.appointment_date AS day, a.barber_id,
         SUM(aps.price_at_booking) AS revenue
  FROM appointments a
  JOIN appointment_services aps ON aps.appointment_id = a.appointment_id
  WHERE a.status = 'completed'
  GROUP BY a.appointment_date, a.barber_id
)
SELECT day,
       CONCAT(b.first_name, ' ', b.last_name) AS barber,
       revenue,
       RANK() OVER (PARTITION BY day ORDER BY revenue DESC) AS rank_of_day
FROM daily d
JOIN barbers b ON b.barber_id = d.barber_id
ORDER BY day, rank_of_day;
 
-- A5 NEXT QUEUE NUMBER FOR TODAY (safe pattern: run inside a transaction)
-- FOR UPDATE locks today's queue rows until COMMIT so two staff can't grab the same number.
-- Safety net: UNIQUE (queue_date, queue_number) rejects a duplicate with error 1062;
-- the backend should catch that error and retry once.
START TRANSACTION;
SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_queue_number
FROM queue_entries
WHERE queue_date = CURDATE()
FOR UPDATE;
-- (the backend INSERTs the new queue_entries row here, using next_queue_number)
COMMIT;

