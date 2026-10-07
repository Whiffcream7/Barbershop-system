const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// View today's queue
// GET /queue
router.get('/', async (req, res) => {
    try {
        const [queueRows] = await pool.execute(
            `SELECT
                q.queue_id,
                q.queue_number,
                q.queue_date,
                q.status,
                q.time_in,
                q.time_started,
                q.time_done,
                q.appointment_id,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                CONCAT(b.first_name, ' ', b.last_name) AS barber_name,
                GROUP_CONCAT(s.service_name SEPARATOR ', ') AS services
            FROM queue_entries q
            JOIN appointments a
                ON q.appointment_id = a.appointment_id
            JOIN customers c
                ON a.customer_id = c.customer_id
            JOIN barbers b
                ON a.barber_id = b.barber_id
            JOIN appointment_services aps
                ON a.appointment_id = aps.appointment_id
            JOIN services s
                ON aps.service_id = s.service_id
            WHERE q.queue_date = CURDATE()
            GROUP BY
                q.queue_id,
                q.queue_number,
                q.queue_date,
                q.status,
                q.time_in,
                q.time_started,
                q.time_done,
                q.appointment_id,
                c.first_name,
                c.last_name,
                b.first_name,
                b.last_name
            ORDER BY q.queue_number`
        );

        //Get today's appointments that are not yet in the queue
        const [appointmentRows] = await pool.execute(
            `SELECT
                a.appointment_id,
                a.start_time,
                a.end_time,
                a.status,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                CONCAT(b.first_name, ' ', b.last_name) AS barber_name,
                GROUP_CONCAT(s.service_name SEPARATOR ', ') AS services
            FROM appointments a
            JOIN customers c
                ON a.customer_id = c.customer_id
            JOIN barbers b
                ON a.barber_id = b.barber_id
            JOIN appointment_services aps
                ON a.appointment_id = aps.appointment_id
            JOIN services s
                ON aps.service_id = s.service_id
            LEFT JOIN queue_entries q
                ON a.appointment_id = q.appointment_id
            WHERE a.appointment_date = CURDATE()
                AND a.status = 'booked'
                AND q.appointment_id IS NULL
            GROUP BY
                a.appointment_id,
                a.start_time,
                a.end_time,
                a.status,
                c.first_name,
                c.last_name,
                b.first_name,
                b.last_name
            ORDER BY a.start_time`
        );

        res.render('queue/index', {
            queue: queueRows,
            appointments: appointmentRows,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// Add an appointment to today's queue
// POST /queue/add/:id
router.post('/add/:id',  async (req, res) => {
    const appointmentId = req.params.id;
    try {
        // Check that the appointment exists and is for today
        const [appointments] = await pool.execute(
            `SELECT appointment_id
            FROM appointments
            WHERE appointment_id = ?
                AND appointment_date = CURDATE()
                AND status = 'booked'`,
            [appointmentId]
        );

        if (appointments.length === 0) {
            return res.redirect('/queue?error=' + encodeURIComponent('Invalid appointment.'));
        }

        // Check if the appointment is already in the queue
        const [existing] = await pool.execute(
            `SELECT queue_id
            FROM queue_entries
            WHERE appointment_id = ?`,
            [appointmentId]
        );

        if (existing.length > 0) {
            return res.redirect('/queue?error=' + encodeURIComponent('This appointment is already in the queue.'));
        }

        // Find today's highest queue number
        const [rows] = await pool.execute(
            `SELECT COALESCE(MAX(queue_number), 0) AS max_queue_number
            FROM queue_entries
            WHERE queue_date = CURDATE()`
        );

        const nextQueueNumber = rows[0].max_queue_number + 1;

        // Add the appointment to today's queue
        await pool.execute(
            `INSERT INTO queue_entries
                (appointment_id, queue_number, queue_date, status)
            VALUES (?, ?, CURDATE(), 'waiting')`,
            [appointmentId, nextQueueNumber]
        );

        res.redirect('/queue');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// Start serving a queue entry
// POST /queue/serve/:id
router.post('/serve/:id', async (req, res) => {
    const queueId = req.params.id;

    try {
        // Find the queue entry and its barber
        const [queueRows] = await pool.execute(
            `SELECT
                q.queue_id,
                q.status,
                a.barber_id
            FROM queue_entries q
            JOIN appointments a
                ON q.appointment_id = a.appointment_id
            WHERE q.queue_id = ?`,
            [queueId]
        );

        if(queueRows.length === 0) {
            return res.redirect('/queue?error=' + encodeURIComponent('Queue entry not found.'));
        }

        const queueEntry = queueRows[0];

        // Makes sure the queue entry is waiting
        if (queueEntry.status !== 'waiting') {
            return res.redirect('/queue?error=' + encodeURIComponent('This queue entry is not waiting.'));
        }

        // Checks if this barber is already serving someone
        const [servingRows] = await pool.execute(
            `SELECT q.queue_id
            FROM queue_entries q
            JOIN appointments a
                ON q.appointment_id = a.appointment_id
            WHERE a.barber_id = ?
                AND q.queue_date = CURDATE()
                AND q.status = 'serving'`,
                [queueEntry.barber_id]
        );

        if(servingRows.length > 0) {
            return res.redirect('/queue?error=' + encodeURIComponent('This barber is already serving another customer.'));
        }

        // Change the queue entry to serving
        await pool.execute(
            `UPDATE queue_entries
            SET status = 'serving',
                time_started = CURRENT_TIMESTAMP
            WHERE queue_id = ?`,
            [queueId]
        );

        res.redirect('/queue');
     } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.')
     }
})

// Mark a queue entry as done
// POST /queue/done/:id
router.post('/done/:id', async (req, res) => {
    const queueId = req.params.id;

    try {
        // Finds the queue entry, its status, and linked appointment
        const [queueRows] = await pool.execute(
            `SELECT queue_id, appointment_id, status
            FROM queue_entries
            WHERE queue_id = ?`,
            [queueId]
        );

        if (queueRows.length === 0) {
            return res.redirect('/queue?error=' + encodeURIComponent('Queue entry not found.'));
        }

        const queueEntry = queueRows[0];

        if (queueEntry.status !== 'serving') {
            return res.redirect('/queue?error=' + encodeURIComponent('This queue entry is not currently being served.'));
        }

        // Change the queue entry to done
        await pool.execute(
            `UPDATE queue_entries
            SET status = 'done',
                time_done = CURRENT_TIMESTAMP
            WHERE queue_id = ?`,
            [queueId]
        );

        // Mark the linked appointment as completed
        await pool.execute(
            `UPDATE appointments
            SET status = 'completed'
            WHERE appointment_id = ?`,
            [queueEntry.appointment_id]
        )

        res.redirect('/queue');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// Cancels a queue entry
// POST /queue/cancel/:id
router.post('/cancel/:id', async (req, res) => {
    const queueId = req.params.id;
   
    try {
        // Find the queue entry, status, and linked appointment
        const [queueRows] = await pool.execute(
            `SELECT queue_id, appointment_id, status
            FROM queue_entries
            WHERE queue_id = ?`,
            [queueId]
        );

        // Checks if the queue entry exists
        if (queueRows.length === 0) {
            return res.redirect('/queue?error=' + encodeURIComponent('Queue entry not found.'));
        }

        const queueEntry = queueRows[0];

        // Only waiting customers can be cancelled
        // Customers who are already serving or done cannot be cancelled
        if (queueEntry.status !== 'waiting') {
            return res.redirect('/queue?error=' + encodeURIComponent('Only waiting queue entries can be cancelled.'));
        }

        // Change the queue status to cancelled
        await pool.execute(
            `UPDATE queue_entries
            SET status = 'cancelled'
            WHERE queue_id = ?`,
            [queueId]
        );

        //Mark the linked appointment as cancelled
        await pool.execute(
            `UPDATE appointments
            SET status = 'cancelled'
            WHERE appointment_id = ?`,
            [queueEntry.appointment_id]
        )

        // Return to the queue page after cancelling
        res.redirect('/queue');
    } catch (err) {
        // Log the error in the server console
        console.error(err);

        // Send an error respone to the browser
        res.status(500).send('Something went wrong.')
    }
});

module.exports = router;