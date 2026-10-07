const express = require('express');
const router = express.Router();

const pool = require('../config/db');

// Payments page
//GET /payments
router.get('/', async (req, res) => {
    try {
        // Get all recorded payments
        const [payments] = await pool.execute(
            `SELECT
                p.payment_id,
                p.appointment_id,
                p.amount,
                p.payment_method,
                p.payment_date,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                CONCAT(b.first_name, ' ', b.last_name) AS barber_name,
                u.full_name AS received_by
            FROM payments p
            JOIN appointments a
                ON p.appointment_id = a.appointment_id
            JOIN customers c
                ON a.customer_id = c.customer_id
            JOIN barbers b
                ON a.barber_id = b.barber_id
            JOIN users u
                ON p.received_by = u.user_id
            ORDER BY p.payment_date DESC`
        );

        res.render('payments/index', {
            payments,
            success: req.query.success === '1'
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
})

// Show the record payment form
// GET /payments/add
router.get('/add', async (req, res) => {
    try {
        // Get booked and completed appointments that still have a balance to pay
        const [appointments] = await pool.execute(
            `SELECT
                a.appointment_id,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                a.appointment_date,
                a.start_time,
                COALESCE(t.total_amount, 0) AS total_amount,
                COALESCE(p.paid_amount, 0) AS paid_amount,
                COALESCE(t.total_amount, 0) - COALESCE(p.paid_amount, 0) AS balance
            FROM appointments a
            JOIN customers c
                ON a.customer_id = c.customer_id
            LEFT JOIN (
                SELECT appointment_id, SUM(price_at_booking) AS total_amount
                FROM appointment_services
                GROUP BY appointment_id
            ) t ON t.appointment_id = a.appointment_id
            LEFT JOIN (
                SELECT appointment_id, SUM(amount) AS paid_amount
                FROM payments
                GROUP BY appointment_id
            ) p ON p.appointment_id = a.appointment_id
            WHERE a.status IN ('booked', 'completed')
                AND COALESCE(t.total_amount, 0) - COALESCE(p.paid_amount, 0) > 0
            ORDER BY a.appointment_date DESC, a.start_time DESC`
        );

        res.render('payments/form', {
            appointments,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong');
    }
});

// Record a payment (full or partial)
// POST /payments/add
router.post('/add', async (req, res) => {
    // Show the error on the form page instead of a blank text page
    const fail = (message) =>
        res.redirect('/payments/add?error=' + encodeURIComponent(message));

    try {
        const { appointment_id, amount, payment_method } = req.body;

        // Basic validation
        if (!appointment_id || !amount || !payment_method) {
            return fail('All payment fields are required.');
        }

        // Makes sure the payment amount is a valid positive number
        const paymentAmount = Number(amount);

        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return fail('Payment amount must be greater than zero.');
        }

        // Validate payment method
        if (!['cash', 'gcash'].includes(payment_method)) {
            return fail('Invalid payment method.');
        }

        // Get the appointment
        const [appointments] = await pool.execute(
            `SELECT appointment_id, status
            FROM appointments
            WHERE appointment_id = ?`,
            [appointment_id]
        );

        if (appointments.length === 0) {
            return fail('Appointment not found.');
        }

        // Payments are not allowed for cancelled or no-show appointments
        if (appointments[0].status === 'cancelled' || appointments[0].status === 'no_show') {
            return fail('Payments cannot be recorded for cancelled or no-show appointments.');
        }

        // Total price of the services for this appointment
        const [services] = await pool.execute(
            `SELECT COALESCE(SUM(price_at_booking), 0) AS total_amount
            FROM appointment_services
            WHERE appointment_id = ?`,
            [appointment_id]
        );

        // Total already paid for this appointment
        const [paid] = await pool.execute(
            `SELECT COALESCE(SUM(amount), 0) AS paid_amount
            FROM payments
            WHERE appointment_id = ?`,
            [appointment_id]
        );

        // Work in centavos to avoid decimal rounding problems
        const totalCents = Math.round(Number(services[0].total_amount) * 100);
        const paidCents = Math.round(Number(paid[0].paid_amount) * 100);
        const balanceCents = totalCents - paidCents;
        const amountCents = Math.round(paymentAmount * 100);

        if (balanceCents <= 0) {
            return fail('This appointment is already fully paid.');
        }

        // Partial payments are allowed, but not more than the remaining balance
        if (amountCents > balanceCents) {
            return fail(`Payment cannot be more than the remaining balance of ₱${(balanceCents / 100).toFixed(2)}.`);
        }

        // Record the payment
        await pool.execute(
            `INSERT INTO payments
                (appointment_id, received_by, amount, payment_method)
            VALUES (?, ?, ?, ?)`,
            [appointment_id, req.session.user.user_id, amountCents / 100, payment_method]
        );

        // Return to the payments page
        res.redirect('/payments?success=1');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

module.exports = router;