const express = require('express');
const router = express.Router();

const pool = require('../config/db');

// Reports page
// GET /reports
router.get('/', async (req, res) => {
    try {
        const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
        // Get today's total sales
        const [sales] = await pool.execute(
            `SELECT
                COALESCE(SUM(amount), 0) AS total_sales
            FROM payments
            WHERE DATE(payment_date) = ?`,
            [selectedDate]
        );

        const [barberAppointments] = await pool.execute(
            `SELECT
                CONCAT(b.first_name, ' ', b.last_name) AS barber_name,
                COUNT(a.appointment_id) AS appointment_count
            FROM appointments a
            JOIN barbers b
                ON a.barber_id = b.barber_id
            WHERE a.appointment_date = ?
            GROUP BY a.barber_id, b.first_name, b.last_name
            ORDER BY appointment_count DESC`,
            [selectedDate]
        );

        const [appointmentTotal] = await pool.execute(
            `SELECT COUNT(*) AS total_appointments
            FROM appointments
            WHERE appointment_date = ?`,
            [selectedDate]
        );

        // Get the most popular services for the selected date
        const [popularServices] = await pool.execute(
            `SELECT
                s.service_name,
                COUNT(aps.appt_service_id) AS times_selected
            FROM appointment_services aps
            JOIN services s
                ON aps.service_id = s.service_id
            JOIN appointments a
                ON aps.appointment_id = a.appointment_id
            WHERE a.appointment_date = ?
            GROUP BY s.service_id, s.service_name
            ORDER BY times_selected DESC`,
            [selectedDate]
        );

        res.render('reports/index', {
            totalSales: sales[0].total_sales,
            selectedDate,
            barberAppointments,
            popularServices,
            totalAppointments: appointmentTotal[0].total_appointments
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

module.exports = router;