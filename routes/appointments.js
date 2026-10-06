const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// List appointments
// GET /appointments
router.get('/', async (req, res) => {
    try {
        // Get filter values from the URL
        const date = req.query.date || 'all';
        const status = req.query.status || 'all';
        const bookingType = req.query.booking_type || 'all';
        const sort = req.query.sort || 'date';
        const order = req.query.order || 'asc';

        // Store WHERE conditions and their values
        const conditions = [];
        const params = [];

        // Date filter
        if (date === 'today') {
            conditions.push('a.appointment_date = CURDATE()');
        } else if (date === 'week') {
            conditions.push(
                'YEARWEEK(a.appointment_date, 1) = YEARWEEK(CURDATE(), 1)'
            );
        } else if (date === 'month') {
            conditions.push(
                'YEAR(a.appointment_date) = YEAR(CURDATE()) AND MONTH(a.appointment_date) = MONTH(CURDATE())'
            );
        } else if (date === 'older') {
            conditions.push('a.appointment_date < CURDATE()');
        }

        // Status filter
        if (status !== 'all') {
            conditions.push('a.status = ?');
            params.push(status);
        }

        // Booking type filter
        if (bookingType !== 'all') {
            conditions.push('a.booking_type = ?');
            params.push(bookingType);
        }

        // Whitelist allowed sorting columns
        const sortOptions = {
            date: 'a.appointment_date',
            start: 'a.start_time',
            end: 'a.end_time',
            customer: 'c.last_name',
            barber: 'b.last_name'
        };

        const sortColumn = sortOptions[sort] || sortOptions.date;

        // Only allow ASC or DESC
        const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

        // Start the SQL query
        let query = `
            SELECT
                a.appointment_id,
                a.appointment_date,
                a.start_time,
                a.end_time,
                a.status,
                a.booking_type,
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
        `;

        // Add WHERE only when filters are being used
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += `
            GROUP BY
                a.appointment_id,
                a.appointment_date,
                a.start_time,
                a.end_time,
                a.status,
                a.booking_type,
                c.first_name,
                c.last_name,
                b.first_name,
                b.last_name
        `;

        // Add sorting
        if (sort === 'customer') {
            query += `ORDER BY c.first_name ${sortOrder}`;
        } else if (sort === 'barber') {
            query += `ORDER BY b.first_name ${sortOrder}`;
        } else if (sort === 'start') {
            query += `ORDER BY a.start_time ${sortOrder}`;
        } else if (sort === 'end') {
            query += `ORDER BY a.end_time ${sortOrder}`;
        } else {
            query += `ORDER BY a.appointment_date ${sortOrder}`;
        }

        const [rows] = await pool.execute(query, params);

        res.render('appointments/index', {
            appointments: rows,
            error: null,
            selectedDate: date,
            selectedStatus: status,
            selectedBookingType: bookingType,
            selectedSort: sort,
            selectedOrder: order
        });

    } catch (error) {
        console.error(error);

        res.status(500).send('Error loading appointments.');
    }
});

// Add appointment form
// GET /appointments/add
router.get('/add', async (req, res) => {
    try {
        const [customers] = await pool.execute(
            `SELECT customer_id, first_name, last_name
            FROM customers
            ORDER BY last_name, first_name`
        );

        const [barbers] = await pool.execute(
            `SELECT barber_id, first_name, last_name
            FROM barbers
            WHERE status = 'active'
            ORDER BY last_name, first_name`
        );

        const [services] = await pool.execute(
            `SELECT service_id, service_name, price, duration_minutes
            FROM services
            WHERE is_active = 1
            ORDER BY service_name`
        );

        res.render('appointments/form', {
            appointment: {},
            customers,
            barbers,
            services,
            error: null,
            action: '/appointments/add'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

// Edit appointment form
// GET /appointments/edit/:id
router.get('/edit/:id', async (req, res) => {
    try {
        const appointmentId = req.params.id;

        // Get the appointment
        const [appointments] = await pool.execute(
            `SELECT *
            FROM appointments
            WHERE appointment_id = ?`,
            [appointmentId]
        );

        if (appointments.length === 0) {
            return res.redirect('/appointments');
        }

        const appointment = appointments[0];

        // Only booked appointments can be edited
        if (appointment.status !== 'booked') {
            return res.status(400).send('Only booked appointmetns can be edited.');
        }

        //Walk-in appointments cannot be edited
        if (appointment.booking_type === 'walk_in') {
            return res.status(400).send('Walk-in appointments cannot be edited.');
        }

        // Get customers
        const [customers] = await pool.execute(
            `SELECT customer_id, first_name, last_name
            FROM customers
            ORDER BY last_name, first_name`
        );

        // Get active barbers
        const [barbers] = await pool.execute(
                `SELECT barber_id, first_name, last_name
                FROM barbers
                ORDER BY last_name, first_name`
        );

        // Get active services
        const [services] = await pool.execute(
            `SELECT service_id, service_name, price, duration_minutes
            FROM services
            WHERE is_active = 1
            ORDER BY service_name`
        );

        // Get services already selected for this appointment
        const [appointmentServices] = await pool.execute(
            `SELECT service_id
            FROM appointment_services
            WHERE appointment_id = ?`,
            [appointmentId]
        );

        const selectedServiceIds = appointmentServices.map(
            service => service.service_id
        );

        res.render('appointments/edit', {
            appointment,
            customers,
            barbers,
            services,
            selectedServiceIds,
            error: null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Add appointment
// POST /appointments/add
router.post('/add', async (req, res) => {
    let {
        customer_id,
        barber_id,
        booking_type,
        appointment_date,
        start_time,
        service_ids
    } = req.body;

    try {
        // Makes sure the booking type is valid
        if (!['scheduled', 'walk_in'].includes(booking_type)) {
            return res.status(400).send('Invalid booking type.');
        }

        // Walk-ins use the current date and time
        if (booking_type === 'walk_in') {
            const now = new Date();

            appointment_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            start_time = now.toTimeString().slice(0, 8);
        }
 
        //  1. Basic Validation
        if (
            !customer_id ||
            !barber_id ||
            !booking_type ||
            !appointment_date ||
            !start_time
        ) {
            return res.status(400).send('All appointment fields are required.');
        }

        // Makes sure at least one service is selected
        const selectedServices = Array.isArray(service_ids)
            ? service_ids
            : service_ids
                ? [service_ids]
                : [];
        
        if (selectedServices.length === 0) {
            return res.status(400).send('Please select at least one service.');
        }

        // 2. Checks date or time
        if (booking_type === 'scheduled') {
            const now =  new Date();

            const appointmentDateTime = new Date(
                `${appointment_date}T${start_time}`
            );
            
            if (appointmentDateTime < now) {
                return res.status(400).send('Appointment date and time cannot be in the past.');
            }
        }

        // 3. Check customer

        const [customers] = await pool.execute(
            `SELECT customer_id FROM customers WHERE customer_id = ?`, [customer_id]
        );

        if (customers.length === 0) {
            return res.status(400).send('Customer dose not exist.');
        }

        // 4. Check barber

        const [barbers] = await pool.execute(
            `SELECT barber_id
            FROM barbers
            WHERE barber_id = ?
            AND status = 'active'`,
            [barber_id]
        );
        
        if (barbers.length === 0) {
            return res.status(400).send('Selected barber is not available.');
        }

        // 5. Check services

        const placeholders = selectedServices.map(() => '?').join(',');

        const [services] = await pool.execute(
            `SELECT service_id, service_name, price, duration_minutes
            FROM services
            WHERE service_id IN (${placeholders})
            AND is_active = 1`,
            selectedServices
        );

        // Makes sure every selected service was found and active
        if (services.length !== selectedServices.length) {
            return res.status(400).send('One or more selected services are unavailable.');
        }

        // Add the duration of all selected services
        const totalDuration = services.reduce(
            (total, service) => total + Number(service.duration_minutes), 0
        );

        // Convert the start time into total minutes
        const [hours, minutes] = start_time.split(':').map(Number);
        const startMinutes = hours * 60 + minutes;

        // Add the total service duration
        const endMinutes = startMinutes + totalDuration;

        // Prevent an appointment from extending into the next day
        if (endMinutes >= 24 * 60) {
            return res.status(400).send('Appointment cannot extend into the next day.');
        }

        // Convert the calculated minutes back into HH:MM:SS format
        const endHours = Math.floor(endMinutes / 60);
        const endMinutesPart = endMinutes % 60;

        const end_time = `${String(endHours).padStart(2, '0')}:` + `${String(endMinutesPart).padStart(2, '0')}:00`;

        // 6. Check double booking
        const [conflicts] = await pool.execute(
            `SELECT appointment_id
            FROM appointments
            WHERE barber_id = ?
            AND appointment_date = ?
            AND status = 'booked'
            AND start_time < ?
            AND end_time > ?`,
            [
                barber_id,
                appointment_date,
                end_time,
                start_time
            ]
        );

        if (conflicts.length > 0) {
            return res.status(400).send('The barber already has an appointment during that time.');
        }

        // 7. Create appointment
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [appointmentResult] = await connection.execute(
                `INSERT INTO appointments
                (customer_id, barber_id, created_by, booking_type, appointment_date, start_time, end_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    customer_id,
                    barber_id,
                    req.session.user.user_id,
                    booking_type,
                    appointment_date,
                    start_time,
                    end_time,
                    'booked'
                ]
            );

            const appointment_id = appointmentResult.insertId;
            
            // 8. Save appointment services
            for (const service of services) {
                await connection.execute(
                    `INSERT INTO appointment_services
                    (appointment_id, service_id, price_at_booking)
                    VALUES (?, ?, ?)`,
                    [
                        appointment_id,
                        service.service_id,
                        service.price
                    ]
                );
            }

            // 9. Automatically add walk-in appointments to today's queue
            if (booking_type === 'walk_in') {
                // Find today's higheset queue number
                const [queueRows] = await connection.execute(
                    `SELECT COALESCE(MAX(queue_number), 0) AS max_queue_number
                    FROM queue_entries
                    WHERE queue_date = CURDATE()`
                );

                const nextQueueNumber = queueRows[0].max_queue_number + 1;

                // Add the walk-in appointment to today's queue
                await connection.execute(
                    `INSERT INTO queue_entries (appointment_id, queue_number, queue_date, status)
                    VALUES (?, ?, CURDATE(), 'waiting')`,
                    [appointment_id, nextQueueNumber]
                );
            }

            // Everything succeeded
            await connection.commit();

            res.redirect('/appointments');

        } catch (err) {

            // Something failed during the appointment and service inserts
            await connection.rollback();

            console.error(err);
            res.status(500).send('Could not create appointment.');

        } finally {
            connection.release();
        }          


    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

router.post('/status/:id', async (req, res) => {
    const { status } = req.body;

    const allowedStatuses = ['completed', 'cancelled', 'no_show'];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).send('Invalid appointment status.');
    }

    try {
        const [result] = await pool.execute(
            `UPDATE appointments
            SET status = ?
            WHERE appointment_id = ?`,
            [status, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send('Appointment not found.');
        }

        res.redirect('/appointments');
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not update appointment status.');
    }
});

// Update appointment
// POST /appointments/edit/:id
router.post('/edit/:id', async (req, res) => {
    const appointmentId = req.params.id;

    const {
        customer_id,
        barber_id,
        appointment_date,
        start_time,
        service_ids
    } = req.body;

    try {
        // Get the existing appointment
        const [appointments] = await pool.execute(
            `SELECT booking_type, status
            FROM appointments
            WHERE appointment_id = ?`,
            [appointmentId]
        );

        // Makes sure the appointment exists
        if (appointments.length === 0) {
            return res.status(400).send('Appointment not found.');
        }
        
        const appointment = appointments[0];

        // Only booked appointments can be edited
        if (appointment.status !== 'booked') {
            return res.status(400).send('Only booked appointments can be edited.');
        }

        // Walk-in appointments cannot be edited
        if (appointment.booking_type === 'walk_in') {
            return res.status(400).send('Walk-in appointments cannot be edited.');
        }
        
        //  1. Basic Validation
        if (
            !customer_id ||
            !barber_id ||
            !appointment_date ||
            !start_time
        ) {
            return res.status(400).send('All appointment fields are required.');
        }

        // Makes sure at least one service is selected
        const selectedServices = Array.isArray(service_ids)
            ? service_ids
            : service_ids
                ? [service_ids]
                : [];
        
        if (selectedServices.length === 0) {
            return res.status(400).send('Please select at least one service.');
        }

        // 2. Checks date or time

        const now =  new Date();

        const appointmentDateTime = new Date(
            `${appointment_date}T${start_time}`
        );
        
        if (appointmentDateTime < now) {
            return res.status(400).send('Appointment date and time cannot be in the past.');
        }

        // 3. Check customer

        const [customers] = await pool.execute(
            `SELECT customer_id FROM customers WHERE customer_id = ?`, [customer_id]
        );

        if (customers.length === 0) {
            return res.status(400).send('Customer dose not exist.');
        }

        // 4. Check barber

        const [barbers] = await pool.execute(
            `SELECT barber_id
            FROM barbers
            WHERE barber_id = ?
            AND status = 'active'`,
            [barber_id]
        );
        
        if (barbers.length === 0) {
            return res.status(400).send('Selected barber is not available.');
        }

        // 5. Check services

        const placeholders = selectedServices.map(() => '?').join(',');

        const [services] = await pool.execute(
            `SELECT service_id, service_name, price, duration_minutes
            FROM services
            WHERE service_id IN (${placeholders})
            AND is_active = 1`,
            selectedServices
        );

        // Makes sure every selected service was found and active
        if (services.length !== selectedServices.length) {
            return res.status(400).send('One or more selected services are unavailable.');
        }

        // Calculate the total duration of all selected services
        const totalDuration = services.reduce(
            (total, service) => total + Number(service.duration_minutes), 0
        );

        // Convert the start time into total minutes
        const [hours, minutes] = start_time.split(':').map(Number);
        const startMinutes = hours * 60 + minutes;

        // Add the service duration
        const endMinutes = startMinutes + totalDuration;

        // Prevent the appointment from going into the next day
        if (endMinutes >= 24 * 60) {
            return res.status(400).send('Appointment cannot extend into the next day.');
        }

        // Convert the calculated minutes back into HH:MM:SS
        const endHours = Math.floor(endMinutes / 60);
        const endMinutesPart = endMinutes % 60;

        const end_time = `${String(endHours).padStart(2, '0')}:` + `${String(endMinutesPart).padStart(2, '0')}:00`;

        // 6. Check double booking
        const [conflicts] = await pool.execute(
            `SELECT appointment_id
            FROM appointments
            WHERE barber_id = ?
            AND appointment_date = ?
            AND status = 'booked'
            AND appointment_id != ?
            AND start_time < ?
            AND end_time > ?`,
            [
                barber_id,
                appointment_date,
                appointmentId,
                end_time,
                start_time
            ]
        );

        if (conflicts.length > 0) {
            return res.status(400).send('The barber already has an appointment during that time.');
        }

        // 7. Start transaction
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();
            await connection.execute(
                `UPDATE appointments
                SET customer_id = ?,
                    barber_id = ?,
                    appointment_date = ?,
                    start_time = ?,
                    end_time = ?
                WHERE appointment_id = ?`,
                [
                    customer_id,
                    barber_id,
                    appointment_date,
                    start_time,
                    end_time,
                    appointmentId
                ]
            );

            // Remove old services
            await connection.execute(
                `DELETE FROM appointment_services
                WHERE appointment_id = ?`,
                [appointmentId]
            );

            // Add new services
            for (const service of services) {
                await connection.execute(
                    `INSERT INTO appointment_services
                    (appointment_id, service_id, price_at_booking)
                    VALUES (?, ?, ?)`,
                    [
                        appointmentId,
                        service.service_id,
                        service.price
                    ]
                );
            }

            await connection.commit();

            res.redirect('/appointments');
        } catch (err) {
            await connection.rollback();
            console.error(err);
            res.status(500).send('Could not update appointment.');
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong.');
    }
});

module.exports = router;