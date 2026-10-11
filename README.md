# BarberSuite: Barbershop Queue and Appointment System

**CCS110 Final Project | Group AI | Section 2CS-B**

A web-based system for a barbershop. It manages customers, barbers, services, appointments, the daily walk-in queue, payments, and sales reports. Staff and admins sign in with their own accounts, and what they can open depends on their role.

**Members (alphabetical):**
Acosta, Kyle Christian S. | Amando, Jerick Simon P. | Sison, Kate Claui D. | Tabor, Diane Flordelein G. | Trinidad, Clark Lois O. | Zamudio, Mickey Angeline V.

---

## 1. Tech stack

| Part | Technology |
|---|---|
| Backend | Node.js, Express 5 |
| Views | EJS templates, plain CSS |
| Database | MySQL 8.0.16+ (or MariaDB 10.2.1+) |
| Login | express-session, bcrypt password hashing |
| Queries | mysql2 with prepared statements |

---

## 2. What you need first

1. **Node.js** (LTS version, 18 or newer): https://nodejs.org
2. **MySQL**, from any one of these:
   - XAMPP (start MySQL in the XAMPP Control Panel), or
   - MySQL Server with MySQL Workbench
3. **Git** (only if you clone the repo instead of downloading the zip)

---

## 3. Setup, step by step

### Step 1: Get the code
```
git clone https://github.com/Whiffcream7/Barbershop-system.git
cd Barbershop-system
```
Or click **Code, then Download ZIP** on GitHub, extract it, and open a terminal inside the folder.

### Step 2: Install the packages
```
npm install
```
A yellow warning about bcrypt install scripts is normal. To check that bcrypt works:
```
node -e "require('bcrypt'); console.log('bcrypt OK')"
```

### Step 3: Create the database
Make sure MySQL is running, then import `database/barbershop.sql`. It creates the database `barbershop_db`, all 8 tables, and sample data. Pick one way:

- **phpMyAdmin (XAMPP):** click **Admin** next to MySQL, open the **Import** tab, choose `database/barbershop.sql`, and click **Import**.
- **MySQL Workbench:** open a connection, go to **File, then Open SQL Script**, choose `database/barbershop.sql`, and click the lightning bolt.
- **Command line:**
  ```
  mysql -u root -p < database/barbershop.sql
  ```

> **Warning:** the script starts with `DROP DATABASE IF EXISTS barbershop_db;`. Running it again deletes everything you added and brings the sample data back. Use this to reset the system before a demo.

### Step 4: Set the database login
Open `config/db.js` and make sure it matches your own MySQL login:
```js
host: 'localhost',
user: 'root',       // your MySQL user
password: '',       // your MySQL password (XAMPP default is empty)
database: 'barbershop_db',
```
Don't commit your personal password to GitHub.

### Step 5: Start the app
```
npm start
```
The terminal should print `Server running at http://localhost:3000`.

### Step 6: Open it
Go to **http://localhost:3000** in your browser and sign in.

---

## 4. Sample accounts

All sample accounts use the password **`password123`**.

| Username | Name | Role |
|---|---|---|
| `admin` | Maria Santos | Admin |
| `staff1` | Juan Dela Cruz | Staff |
| `staff2` | Ana Reyes | Staff |
| `staff3` | Pedro Lim | Staff |
| `staff4` | Liza Garcia | Staff |

---

## 5. Who can open what

| Module | Admin | Staff |
|---|---|---|
| Dashboard | Yes | Yes |
| Customers | Yes | Yes |
| Appointments | Yes | Yes |
| Queue | Yes | Yes |
| Payments | Yes | Yes |
| Barbers | Yes | No |
| Services | Yes | No |
| User accounts | Yes | No |
| Reports | Yes | No |

Every page requires login. A staff member who types an admin-only address is blocked.

---

## 6. How to use it

A normal day at the shop follows this order.

1. **Sign in** with an admin or staff account.
2. **Customers:** add a new customer (first name, last name, and phone are required). Search by name or phone.
3. **Appointments:** click **+ Add Appointment**.
   - Choose a customer and a barber.
   - Choose **Scheduled** (pick a date and start time) or **Walk-in** (today's date and the current time fill in automatically).
   - Tick one or more services. The end time is calculated from their durations.
   - Use the filters on the list (date, status, booking type) to find appointments. Mark an appointment **Completed**, **Cancelled**, or **No-show** from its row.
4. **Queue:** when a customer arrives, open **Queue** and click **Add to queue** on their appointment. Then:
   - **Serve** starts the service.
   - **Done** finishes it.
   - **Cancel** removes a waiting customer.
5. **Payments:** open **Payments, then Record payment**. Choose the appointment, enter the amount (partial payments are allowed), and choose Cash or GCash. The list shows every payment.
6. **Reports (admin):** pick a date to see the total appointments, total sales, appointments per barber, and the most popular services.
7. **Admin only:** manage **Barbers** (active or inactive), **Services** (price, duration, active or inactive), and **User accounts** (admin or staff).

---

## 7. Rules the system enforces

- A barber can't have two overlapping appointments, and a customer can't be booked twice at the same time.
- Appointments can't be booked in the past.
- Only active barbers and active services can be selected.
- Queue numbers start at 1 each day and go up by one.
- Queue flow is waiting, then serving, then done (or cancelled). A barber can serve only one customer at a time.
- Only **booked** appointments can be edited. Walk-in appointments can't be edited.
- A payment can't be more than the remaining balance of the appointment. Partial payments are allowed until the balance is paid.
- A record linked to others can't be deleted. The system shows an error message instead of crashing. For example, a customer with appointments, or a user with appointments or payments, can't be deleted. An admin can't delete their own account.
- Passwords are stored as bcrypt hashes. All queries use prepared statements.

---

## 8. Project structure

```
Barbershop-system/
├── app.js                 Starts the server, sessions, and routes
├── package.json
├── config/
│   └── db.js              MySQL connection
├── database/
│   └── barbershop.sql     Schema, sample data, and demo queries
├── middleware/
│   └── auth.js            Login and role checks
├── routes/                One file per module
│   ├── auth.js            Login and logout
│   ├── customers.js
│   ├── appointments.js
│   ├── queue.js
│   ├── payments.js
│   ├── reports.js
│   ├── barbers.js
│   ├── services.js
│   └── users.js
├── utils/
│   └── sort.js
├── views/                 EJS pages (one folder per module)
│   └── partials/          Shared header, footer, and modal
└── public/
    └── css/style.css      Styling
```

---

## 9. Database

The database is **`barbershop_db`**, with 8 tables.

| Table | Purpose |
|---|---|
| `users` | System accounts (admin or staff) |
| `customers` | Customer records |
| `barbers` | Barber records and status |
| `services` | Services with price and duration |
| `appointments` | Bookings (scheduled or walk-in) with date, start time, and end time |
| `appointment_services` | Which services belong to which appointment (many-to-many) |
| `queue_entries` | The daily queue, with number and status |
| `payments` | Payments received for appointments |

`database/barbershop.sql` also contains demo queries at the bottom (search, filter, reports, the double-booking check, unpaid balances, and a ranking with a window function).

**About the sample data:** the sample appointments are dated September 28 to 30, 2026. To see data in the reports, choose one of those dates, such as `2026-09-28`.

---

## 10. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `node` or `npm` is not recognized | Node.js isn't installed, or the terminal was opened before installing. Install Node.js, then open a new terminal. |
| `Database error: Access denied for user` | The user or password in `config/db.js` doesn't match your MySQL login. Update it and restart. |
| `Unknown database 'barbershop_db'` | The SQL file wasn't imported on this MySQL server. Import `database/barbershop.sql` (Step 3). |
| `ECONNREFUSED` | MySQL isn't running. Start it in XAMPP or as a service. |
| "Something went wrong" when logging in | Usually a database connection problem. Check the terminal for the real error message. |
| "Invalid username or password" | Use the sample accounts above with `password123`. If you re-created the database, import the SQL file again. |
| Port 3000 is already in use | Close the other program using it, or stop the old server with Ctrl+C. |
| Page has no styling | Check that `public/css/style.css` exists, then refresh with Ctrl+F5. |
| Changes don't appear | Stop the server with Ctrl+C and run `npm start` again. |

---

## 11. Notes

- This system is built to **run locally** (`localhost:3000`). It isn't set up for deployment on the internet.
- The sample accounts and the session key in `app.js` are for demonstration only.
- To reset the system to its starting data, import `database/barbershop.sql` again.
