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
// GET /payment/add
router.get('/add', async (req, res) => {
    try {
        // Get booked and completed appointments that can have a payment
        const [appointments] = await pool.execute(
            `SELECT
                a.appointment_id,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                a.appointment_date,
                a.start_time,
                    (
                        SELECT SUM(aps.price_at_booking)
                        FROM appointment_services aps
                        WHERE aps.appointment_id = a.appointment_id
                    ) AS total_amount
            FROM appointments a
            JOIN customers c
                ON a.customer_id = c.customer_id
            WHERE a.status IN ('booked', 'completed')
            ORDER BY a.appointment_date DESC, a.start_time DESC`, []
        );

        res.render('payments/form', {
            appointments
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong');
    }
});

// Record a payment
// POST /paymenmt/add
router.post('/add', async (req, res) => {
    try {
        const {appointment_id, amount, payment_method} = req.body;

        // Basic validation\
        if (!appointment_id || !amount || !payment_method) {
            return res.status(400).send('All payment fields are required.');
        }

        // Makes sure the payment amount is a valid postive integer
        const paymentAmount = Number(amount);

        if(isNaN(paymentAmount) || paymentAmount <= 0) {
            return res.status(400).send('Payment amount must be greater than zero.');
        }

        // Validate payment method
        if (!['cash', 'gcash'].includes(payment_method)) {
            return res.status(400).send('Invalid payment method.');
        }

        // Get the appointment
        const [appointments] = await pool.execute(
            `SELECT appointment_id, status
            FROM appointments
            WHERE appointment_id = ?`,
            [appointment_id]
        );

        if (appointments.length === 0) {
            return res.status(400).send('Appointment not found.');
        }

        // Payments are not allowed for cancelled or no-show appointments
        if (appointments[0].status === 'cancelled' || appointments[0].status === 'no_show') {
            return res.status(400).send('Payments cannot be recorded for cancelled or no-show appointments.');
        }

        // Checks if this appointment already has a payment
        const [existingPayments] = await pool.execute(
            `SELECT payment_id
            FROM payments
            WHERE appointment_id = ?`,
            [appointment_id]
        );

        if (existingPayments.length > 0) {
            return res.status(400).send('A payment has already been recorded for this appointment.');
        }

        // Get the total price of the services for this appointment
        const [services] = await pool.execute(
            `SELECT SUM(price_at_booking) AS total_amount
            FROM appointment_services
            WHERE appointment_id = ?`,
            [appointment_id]
        );

        const totalAmount = Number(services[0].total_amount || 0);

        // Makes sure the payment amount matches the appointment total
        if (paymentAmount !== totalAmount) {
            return res.status(400).send(`Payment amount must match the appointment total of ₱${totalAmount.toFixed(2)}.`);
        }

        // Record the payment
        await pool.execute(
                `INSERT INTO payments
                    (appointment_id, received_by, amount, payment_method)
                VALUES (?, ?, ?, ?)`,
                [appointment_id, req.session.user.user_id, paymentAmount, payment_method]
        );

        // Return to the payments page
        res.redirect('/payments?success=1');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

module.exports = router;